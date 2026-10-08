import { EncryptionService, EncryptedData } from './encryptionService';

export interface SecureStorageOptions {
  encrypt?: boolean;
  ttl?: number;
}

export interface StoredItem<T> {
  value: T;
  encryptedData?: EncryptedData;
  timestamp: number;
  ttl?: number;
}

export class SecureStorageService {
  private static readonly KEYCHAIN_PREFIX = 'app_keychain_';
  private static readonly STORAGE_KEY = '__secure_storage__';
  private encryptionKey: string;
  private storage: Map<string, StoredItem<any>> = new Map();

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || this.generateMasterKey();
  }

  private generateMasterKey(): string {
    if (typeof localStorage !== 'undefined') {
      let key = localStorage.getItem(this.KEYCHAIN_PREFIX + 'master_key');
      if (!key) {
        key = EncryptionService.generateSecureToken(32);
        localStorage.setItem(this.KEYCHAIN_PREFIX + 'master_key', key);
      }
      return key;
    }
    return EncryptionService.generateSecureToken(32);
  }

  setItem<T>(
    key: string,
    value: T,
    options: SecureStorageOptions = { encrypt: true }
  ): void {
    const item: StoredItem<T> = {
      value,
      timestamp: Date.now(),
      ttl: options.ttl,
    };

    if (options.encrypt) {
      const jsonValue = JSON.stringify(value);
      item.encryptedData = EncryptionService.encrypt(jsonValue, this.encryptionKey);
      delete item.value;
    }

    this.storage.set(key, item);
    this.persistToStorage(key, item);
  }

  getItem<T>(key: string): T | null {
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
        const decryptedJson = EncryptionService.decrypt(item.encryptedData, this.encryptionKey);
        return JSON.parse(decryptedJson) as T;
      } catch (error) {
        console.error('Failed to decrypt item:', error);
        return null;
      }
    }

    return item.value as T;
  }

  removeItem(key: string): void {
    this.storage.delete(key);
    this.removeFromStorage(key);
  }

  clear(): void {
    this.storage.clear();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  getAllKeys(): string[] {
    return Array.from(this.storage.keys());
  }

  private persistToStorage<T>(key: string, item: StoredItem<T>): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storageData = this.getStorageData();
      storageData[key] = item;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storageData));
    } catch (error) {
      console.error('Failed to persist to storage:', error);
    }
  }

  private removeFromStorage(key: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storageData = this.getStorageData();
      delete storageData[key];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storageData));
    } catch (error) {
      console.error('Failed to remove from storage:', error);
    }
  }

  private getStorageData(): Record<string, StoredItem<any>> {
    if (typeof localStorage === 'undefined') {
      return {};
    }

    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to read storage data:', error);
      return {};
    }
  }

  loadFromStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const storageData = this.getStorageData();
      for (const [key, item] of Object.entries(storageData)) {
        if (item.ttl && Date.now() - item.timestamp > item.ttl) {
          delete storageData[key];
        } else {
          this.storage.set(key, item);
        }
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storageData));
    } catch (error) {
      console.error('Failed to load from storage:', error);
    }
  }
}
