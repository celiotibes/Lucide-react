/**
 * EncryptionService - Encrypts and decrypts sensitive payloads
 * Features: AES-256-GCM encryption, key derivation, secure random IVs
 */

interface EncryptedData {
  iv: string; // Initialization vector (base64)
  salt: string; // Salt for key derivation (base64)
  data: string; // Encrypted data (base64)
  tag: string; // Authentication tag (base64)
  algorithm: string; // Algorithm identifier
}

export class EncryptionService {
  private static algorithm = 'AES-256-GCM';
  private static keyLength = 32; // 256 bits
  private static ivLength = 12; // 96 bits (recommended for GCM)
  private static saltLength = 16; // 128 bits
  private static tagLength = 128; // bits
  private static iterations = 100000; // PBKDF2 iterations

  /**
   * Encrypt sensitive data with AES-256-GCM
   */
  public static async encrypt(data: string, masterKey?: string): Promise<EncryptedData> {
    try {
      // Validate input
      if (!data || typeof data !== 'string') {
        throw new Error('Data to encrypt must be a non-empty string');
      }

      // Generate random salt and IV
      const salt = this.generateRandomBytes(this.saltLength);
      const iv = this.generateRandomBytes(this.ivLength);

      // Derive encryption key from master key and salt
      const key = await this.deriveKey(masterKey || this.getDefaultMasterKey(), salt);

      // Encrypt data using Web Crypto API
      const encryptedBuffer = await this.performEncryption(
        data,
        key,
        iv
      );

      // Extract tag and ciphertext from encrypted buffer
      const tag = encryptedBuffer.slice(encryptedBuffer.byteLength - this.tagLength / 8);
      const ciphertext = encryptedBuffer.slice(0, encryptedBuffer.byteLength - this.tagLength / 8);

      return {
        iv: this.bytesToBase64(iv),
        salt: this.bytesToBase64(salt),
        data: this.bytesToBase64(ciphertext),
        tag: this.bytesToBase64(tag),
        algorithm: this.algorithm,
      };
    } catch (error) {
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Decrypt encrypted data
   */
  public static async decrypt(encryptedData: EncryptedData, masterKey?: string): Promise<string> {
    try {
      // Validate encrypted data structure
      if (!encryptedData.iv || !encryptedData.salt || !encryptedData.data || !encryptedData.tag) {
        throw new Error('Invalid encrypted data structure');
      }

      if (encryptedData.algorithm !== this.algorithm) {
        throw new Error(
          `Unsupported algorithm: ${encryptedData.algorithm}. Expected ${this.algorithm}`
        );
      }

      // Convert from base64
      const salt = this.base64ToBytes(encryptedData.salt);
      const iv = this.base64ToBytes(encryptedData.iv);
      const ciphertext = this.base64ToBytes(encryptedData.data);
      const tag = this.base64ToBytes(encryptedData.tag);

      // Derive decryption key
      const key = await this.deriveKey(masterKey || this.getDefaultMasterKey(), salt);

      // Combine ciphertext and tag for decryption
      const encryptedBuffer = this.concatBuffers(ciphertext, tag);

      // Decrypt
      const decryptedBuffer = await this.performDecryption(
        encryptedBuffer,
        key,
        iv
      );

      return this.bytesToString(decryptedBuffer);
    } catch (error) {
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Encrypt an object to JSON
   */
  public static async encryptObject<T>(obj: T, masterKey?: string): Promise<EncryptedData> {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString, masterKey);
  }

  /**
   * Decrypt to object
   */
  public static async decryptObject<T>(
    encryptedData: EncryptedData,
    masterKey?: string
  ): Promise<T> {
    const jsonString = await this.decrypt(encryptedData, masterKey);
    return JSON.parse(jsonString) as T;
  }

  /**
   * Hash sensitive data (one-way)
   */
  public static async hash(data: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      return this.bytesToHex(new Uint8Array(hashBuffer));
    } catch (error) {
      throw new Error(
        `Hash failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate random bytes for cryptographic operations
   */
  private static generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Derive encryption key using PBKDF2
   */
  private static async deriveKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    try {
      const encoder = new TextEncoder();
      const passwordData = encoder.encode(password);

      // Import password as PBKDF2 key
      const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordData,
        'PBKDF2',
        false,
        ['deriveBits']
      );

      // Derive bits using PBKDF2
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: salt,
          iterations: this.iterations,
        },
        baseKey,
        this.keyLength * 8
      );

      // Import derived key for AES-GCM
      return await crypto.subtle.importKey(
        'raw',
        derivedBits,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      throw new Error(
        `Key derivation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Perform encryption
   */
  private static async performEncryption(
    data: string,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      dataBuffer
    );

    return new Uint8Array(encryptedBuffer);
  }

  /**
   * Perform decryption
   */
  private static async performDecryption(
    encryptedBuffer: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      encryptedBuffer
    );

    return new Uint8Array(decryptedBuffer);
  }

  /**
   * Convert bytes to base64
   */
  private static bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 to bytes
   */
  private static base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Convert bytes to hex string
   */
  private static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert bytes to string
   */
  private static bytesToString(bytes: Uint8Array): string {
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }

  /**
   * Concatenate two Uint8Arrays
   */
  private static concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
  }

  /**
   * Get default master key (should be stored securely in production)
   */
  private static getDefaultMasterKey(): string {
    // In production, this should come from a secure key management service
    if (typeof window !== 'undefined' && (window as any).__ENCRYPTION_KEY__) {
      return (window as any).__ENCRYPTION_KEY__;
    }
    return 'default-master-key-change-in-production';
  }

  /**
   * Check if crypto API is available
   */
  public static isAvailable(): boolean {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  }
}
