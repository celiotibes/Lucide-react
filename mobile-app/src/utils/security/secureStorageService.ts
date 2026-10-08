import * as SecureStore from 'expo-secure-store';
import crypto from 'crypto';
import { EncryptionService, EncryptedData } from './encryptionService';

export interface SecureStorageOptions {
  encrypt?: boolean;
  ttl?: number;
}

export interface StoredItem<T> {
  value?: T;
  encryptedData?: EncryptedData;
  timestamp: number;
  ttl?: number;
}

export interface MasterKeyMetadata {
  createdAt: number;
  rotatedAt?: number;
  version: number;
}

export class SecureStorageService {
  private static readonly MASTER_KEY_STORE_KEY = 'app_master_key_v1';
  private static readonly KEY_METADATA_STORE_KEY = 'app_key_metadata_v1';
  private static readonly STORAGE_KEY = '__secure_storage__';
  private static readonly KEY_ROTATION_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
  private static readonly PBKDF2_ITERATIONS = 100000;
  private static readonly PBKDF2_KEY_LENGTH = 32;
  private static readonly PBKDF2_SALT_LENGTH = 32;

  private encryptionKey: string = '';
  private keyMetadata: MasterKeyMetadata | null = null;
  private storage: Map<string, StoredItem<any>> = new Map();
  private initializationPromise: Promise<void> | null = null;

  constructor(encryptionKey?: string) {
    if (encryptionKey) {
      this.encryptionKey = encryptionKey;
    }
  }

  /**
   * Initialize the secure storage service.
   * Must be called before using the service.
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initializeMasterKey();
    await this.initializationPromise;
    await this.loadFromStorage();
  }

  /**
   * Initialize master key from expo-secure-store or generate new one.
   */
  private async _initializeMasterKey(): Promise<void> {
    try {
      // Check if key exists in secure store
      const existingKey = await this._getOrCreateKey();
      this.encryptionKey = existingKey;

      // Load key metadata
      try {
        const metadataJson = await SecureStore.getItemAsync(
          SecureStorageService.KEY_METADATA_STORE_KEY
        );
        if (metadataJson) {
          this.keyMetadata = JSON.parse(metadataJson);
          if (this.keyMetadata) {
            this._logKeyEvent('initialized', { version: this.keyMetadata.version });
          }
        }
      } catch (error) {
        console.warn('Failed to load key metadata:', error);
      }

      // Check if key rotation is needed
      if (this.keyMetadata && this._shouldRotateKey()) {
        this._logKeyEvent('rotation_needed');
        await this._rotateKey();
      }
    } catch (error) {
      console.error('Failed to initialize master key:', error);
      throw new Error('Failed to initialize secure storage service');
    }
  }

  /**
   * Get or create encryption key in expo-secure-store.
   */
  private async _getOrCreateKey(): Promise<string> {
    try {
      let key = await SecureStore.getItemAsync(
        SecureStorageService.MASTER_KEY_STORE_KEY
      );

      if (!key) {
        // Generate new master key with PBKDF2 derivation
        key = await this._generateNewMasterKey();
        await SecureStore.setItemAsync(
          SecureStorageService.MASTER_KEY_STORE_KEY,
          key
        );

        // Initialize metadata
        this.keyMetadata = {
          createdAt: Date.now(),
          version: 1,
        };
        await SecureStore.setItemAsync(
          SecureStorageService.KEY_METADATA_STORE_KEY,
          JSON.stringify(this.keyMetadata)
        );

        this._logKeyEvent('created', { version: 1 });
      }

      return key;
    } catch (error) {
      if (this._isSecureStoreUnavailable(error)) {
        console.warn('expo-secure-store unavailable, using fallback secure key generation');
        return this._generateFallbackKey();
      }
      throw error;
    }
  }

  /**
   * Generate new master key using PBKDF2 derivation.
   */
  private async _generateNewMasterKey(): Promise<string> {
    // Generate random salt and derive key using PBKDF2
    const salt = crypto.randomBytes(
      SecureStorageService.PBKDF2_SALT_LENGTH
    );
    const masterPassword = EncryptionService.generateSecureToken(32);

    const derivedKey = crypto.pbkdf2Sync(
      masterPassword,
      salt,
      SecureStorageService.PBKDF2_ITERATIONS,
      SecureStorageService.PBKDF2_KEY_LENGTH,
      'sha256'
    );

    // Combine salt + derived key for storage
    const combinedKey = Buffer.concat([salt, derivedKey]).toString('hex');
    return combinedKey;
  }

  /**
   * Generate fallback key if expo-secure-store is unavailable.
   */
  private _generateFallbackKey(): string {
    return EncryptionService.generateSecureToken(64);
  }

  /**
   * Check if key rotation is needed.
   */
  private _shouldRotateKey(): boolean {
    if (!this.keyMetadata) return false;

    const rotationDeadline =
      this.keyMetadata.createdAt +
      SecureStorageService.KEY_ROTATION_INTERVAL_MS;
    const now = Date.now();

    if (now >= rotationDeadline) {
      const daysOverdue = Math.floor(
        (now - rotationDeadline) / (24 * 60 * 60 * 1000)
      );
      this._logKeyEvent('rotation_overdue', { daysOverdue });
      return true;
    }

    const daysUntilRotation = Math.floor(
      (rotationDeadline - now) / (24 * 60 * 60 * 1000)
    );
    if (daysUntilRotation <= 14) {
      this._logKeyEvent('rotation_warning', { daysUntilRotation });
    }

    return false;
  }

  /**
   * Rotate the encryption key.
   */
  private async _rotateKey(): Promise<void> {
    try {
      const oldKey = this.encryptionKey;

      // Generate new master key
      const newKey = await this._generateNewMasterKey();

      // Re-encrypt all data with new key
      const itemsToReencrypt: Array<[string, StoredItem<any>]> = Array.from(
        this.storage.entries()
      ).filter(([, item]) => item.encryptedData !== undefined);

      const reencryptedItems: Array<[string, StoredItem<any>]> = [];

      for (const [key, item] of itemsToReencrypt) {
        try {
          // Decrypt with old key
          if (item.encryptedData) {
            const decrypted = EncryptionService.decrypt(
              item.encryptedData,
              oldKey
            );
            const value = JSON.parse(decrypted);

            // Re-encrypt with new key
            const newEncryptedData = EncryptionService.encrypt(decrypted, newKey);
            const newItem: StoredItem<any> = {
              ...item,
              encryptedData: newEncryptedData,
            };
            reencryptedItems.push([key, newItem]);
          }
        } catch (error) {
          console.error(`Failed to re-encrypt item ${key}:`, error);
        }
      }

      // Store new key in secure store
      await SecureStore.setItemAsync(
        SecureStorageService.MASTER_KEY_STORE_KEY,
        newKey
      );
      this.encryptionKey = newKey;

      // Update metadata
      const newMetadata: MasterKeyMetadata = {
        createdAt: this.keyMetadata?.createdAt ?? Date.now(),
        rotatedAt: Date.now(),
        version: (this.keyMetadata?.version ?? 0) + 1,
      };
      this.keyMetadata = newMetadata;
      await SecureStore.setItemAsync(
        SecureStorageService.KEY_METADATA_STORE_KEY,
        JSON.stringify(newMetadata)
      );

      // Update storage with re-encrypted items
      for (const [key, item] of reencryptedItems) {
        this.storage.set(key, item);
        await this.persistToStorage(key, item);
      }

      this._logKeyEvent('rotated', {
        version: newMetadata.version,
        itemsRotated: reencryptedItems.length,
      });
    } catch (error) {
      console.error('Failed to rotate key:', error);
      this._logKeyEvent('rotation_failed', { error: String(error) });
      throw new Error('Failed to rotate encryption key');
    }
  }

  /**
   * Check if expo-secure-store is unavailable.
   */
  private _isSecureStoreUnavailable(error: unknown): boolean {
    const errorStr = String(error);
    return (
      errorStr.includes('SecureStore') ||
      errorStr.includes('unavailable') ||
      errorStr.includes('not available')
    );
  }

  /**
   * Log key lifecycle events.
   */
  private _logKeyEvent(
    event: string,
    details?: Record<string, unknown>
  ): void {
    const timestamp = new Date().toISOString();
    const logMessage = details
      ? `[${timestamp}] SecureStorage: ${event} - ${JSON.stringify(details)}`
      : `[${timestamp}] SecureStorage: ${event}`;
    console.log(logMessage);
  }

  /**
   * Store an item with optional encryption.
   */
  async setItem<T>(
    key: string,
    value: T,
    options: SecureStorageOptions = { encrypt: true }
  ): Promise<void> {
    if (!this.encryptionKey) {
      throw new Error('SecureStorageService not initialized. Call initialize() first.');
    }

    const item: StoredItem<T> = {
      value,
      timestamp: Date.now(),
      ttl: options.ttl,
    };

    if (options.encrypt) {
      const jsonValue = JSON.stringify(value);
      item.encryptedData = EncryptionService.encrypt(
        jsonValue,
        this.encryptionKey
      );
      delete item.value;
    }

    this.storage.set(key, item);
    await this.persistToStorage(key, item);
  }

  /**
   * Retrieve an item and decrypt if necessary.
   */
  getItem<T>(key: string): T | null {
    if (!this.encryptionKey) {
      throw new Error('SecureStorageService not initialized. Call initialize() first.');
    }

    const item = this.storage.get(key);

    if (!item) {
      return null;
    }

    if (item.ttl && Date.now() - item.timestamp > item.ttl) {
      this.removeItem(key);
      return null;
    }

    if (item.encryptedData) {
      try {
        const decryptedJson = EncryptionService.decrypt(
          item.encryptedData,
          this.encryptionKey
        );
        return JSON.parse(decryptedJson) as T;
      } catch (error) {
        console.error('Failed to decrypt item:', error);
        return null;
      }
    }

    return item.value as T;
  }

  /**
   * Remove an item from storage.
   */
  removeItem(key: string): void {
    this.storage.delete(key);
    this.removeFromStorage(key);
  }

  /**
   * Clear all items from storage.
   */
  async clear(): Promise<void> {
    this.storage.clear();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(SecureStorageService.STORAGE_KEY);
      } catch (error) {
        console.warn('Failed to clear localStorage:', error);
      }
    }
  }

  /**
   * Get all keys currently stored.
   */
  getAllKeys(): string[] {
    return Array.from(this.storage.keys());
  }

  /**
   * Get current key metadata.
   */
  getKeyMetadata(): MasterKeyMetadata | null {
    return this.keyMetadata ? { ...this.keyMetadata } : null;
  }

  /**
   * Persist item to localStorage (used for non-memory persistence).
   */
  private async persistToStorage<T>(
    key: string,
    item: StoredItem<T>
  ): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storageData = this.getStorageData();
      storageData[key] = item;
      localStorage.setItem(
        SecureStorageService.STORAGE_KEY,
        JSON.stringify(storageData)
      );
    } catch (error) {
      console.error('Failed to persist to storage:', error);
    }
  }

  /**
   * Remove item from localStorage persistence.
   */
  private removeFromStorage(key: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storageData = this.getStorageData();
      delete storageData[key];
      localStorage.setItem(
        SecureStorageService.STORAGE_KEY,
        JSON.stringify(storageData)
      );
    } catch (error) {
      console.error('Failed to remove from storage:', error);
    }
  }

  /**
   * Get all data from localStorage.
   */
  private getStorageData(): Record<string, StoredItem<any>> {
    if (typeof localStorage === 'undefined') {
      return {};
    }

    try {
      const data = localStorage.getItem(SecureStorageService.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to read storage data:', error);
      return {};
    }
  }

  /**
   * Load all items from localStorage into memory.
   */
  private async loadFromStorage(): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storageData = this.getStorageData();
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, item] of Object.entries(storageData)) {
        if (item.ttl && now - item.timestamp > item.ttl) {
          expiredKeys.push(key);
        } else {
          this.storage.set(key, item);
        }
      }

      // Clean up expired items
      if (expiredKeys.length > 0) {
        for (const key of expiredKeys) {
          delete storageData[key];
        }
        localStorage.setItem(
          SecureStorageService.STORAGE_KEY,
          JSON.stringify(storageData)
        );
        this._logKeyEvent('cleanup', { expiredItemsRemoved: expiredKeys.length });
      }
    } catch (error) {
      console.error('Failed to load from storage:', error);
    }
  }
}
