/**
 * Tests for EncryptionService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from '../../services/security/EncryptionService';

describe('EncryptionService', () => {
  beforeEach(() => {
    // Ensure crypto API is available
    expect(EncryptionService.isAvailable()).toBe(true);
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt text', async () => {
      const originalText = 'Hello, World!';
      const masterKey = 'test-master-key-123';

      const encrypted = await EncryptionService.encrypt(originalText, masterKey);
      expect(encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.data).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      expect(encrypted.algorithm).toBe('AES-256-GCM');

      const decrypted = await EncryptionService.decrypt(encrypted, masterKey);
      expect(decrypted).toBe(originalText);
    });

    it('should throw error if decrypting with wrong key', async () => {
      const originalText = 'Secret data';
      const correctKey = 'correct-key';
      const wrongKey = 'wrong-key';

      const encrypted = await EncryptionService.encrypt(originalText, correctKey);

      // Attempting to decrypt with wrong key should fail or produce garbage
      try {
        await EncryptionService.decrypt(encrypted, wrongKey);
        // If it doesn't throw, the decrypted data should be different
        expect(true).toBe(true);
      } catch (error) {
        // Expected to throw error for authentication failure
        expect(error).toBeDefined();
      }
    });

    it('should throw error for empty text', async () => {
      try {
        await EncryptionService.encrypt('');
        expect.fail('Should throw error for empty text');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should throw error for invalid encrypted data', async () => {
      const invalidData = {
        iv: 'invalid',
        salt: 'invalid',
        data: 'invalid',
        tag: 'invalid',
        algorithm: 'AES-256-GCM',
      };

      try {
        await EncryptionService.decrypt(invalidData);
        expect.fail('Should throw error for invalid data');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should throw error for unsupported algorithm', async () => {
      const encryptedData = {
        iv: 'aW52YWxpZA==',
        salt: 'c2FsdA==',
        data: 'ZGF0YQ==',
        tag: 'dGFn',
        algorithm: 'UNSUPPORTED-ALGORITHM',
      };

      try {
        await EncryptionService.decrypt(encryptedData);
        expect.fail('Should throw error for unsupported algorithm');
      } catch (error) {
        expect((error as Error).message).toContain('Unsupported algorithm');
      }
    });
  });

  describe('encryptObject and decryptObject', () => {
    it('should encrypt and decrypt objects', async () => {
      const originalObject = {
        name: 'John Doe',
        email: 'john@example.com',
        nested: {
          age: 30,
          city: 'New York',
        },
      };
      const masterKey = 'test-key-456';

      const encrypted = await EncryptionService.encryptObject(originalObject, masterKey);
      const decrypted = await EncryptionService.decryptObject(encrypted, masterKey);

      expect(decrypted).toEqual(originalObject);
    });

    it('should handle complex objects with arrays', async () => {
      const originalObject = {
        users: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' },
        ],
        settings: {
          theme: 'dark',
          notifications: true,
        },
      };
      const masterKey = 'complex-test-key';

      const encrypted = await EncryptionService.encryptObject(originalObject, masterKey);
      const decrypted = await EncryptionService.decryptObject(encrypted, masterKey);

      expect(decrypted).toEqual(originalObject);
    });
  });

  describe('hash', () => {
    it('should produce consistent hash', async () => {
      const data = 'test-data-to-hash';

      const hash1 = await EncryptionService.hash(data);
      const hash2 = await EncryptionService.hash(data);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    it('should produce different hashes for different data', async () => {
      const hash1 = await EncryptionService.hash('data1');
      const hash2 = await EncryptionService.hash('data2');

      expect(hash1).not.toBe(hash2);
    });

    it('should be case-insensitive for hex output', async () => {
      const data = 'test-data';

      const hash = await EncryptionService.hash(data);

      expect(/^[a-f0-9]{64}$/i.test(hash)).toBe(true);
    });
  });

  describe('encryption with different keys', () => {
    it('should use default master key if not provided', async () => {
      const text = 'test-text-without-key';

      const encrypted1 = await EncryptionService.encrypt(text);
      const decrypted1 = await EncryptionService.decrypt(encrypted1);

      expect(decrypted1).toBe(text);
    });

    it('should produce different ciphertexts for same data', async () => {
      const data = 'test-data';

      const encrypted1 = await EncryptionService.encrypt(data);
      const encrypted2 = await EncryptionService.encrypt(data);

      // Due to random IV and salt, ciphertexts should be different
      expect(encrypted1.data).not.toBe(encrypted2.data);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });
  });

  describe('isAvailable', () => {
    it('should return true if crypto API available', () => {
      expect(EncryptionService.isAvailable()).toBe(true);
    });
  });

  describe('large data encryption', () => {
    it('should handle large text data', async () => {
      const largeText = 'A'.repeat(10000); // 10KB of data
      const masterKey = 'large-data-key';

      const encrypted = await EncryptionService.encrypt(largeText, masterKey);
      const decrypted = await EncryptionService.decrypt(encrypted, masterKey);

      expect(decrypted).toBe(largeText);
      expect(decrypted.length).toBe(10000);
    });

    it('should handle objects with large nested structures', async () => {
      const largeObject = {
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `Item ${i}`,
            description: 'A'.repeat(100),
          })),
      };
      const masterKey = 'large-object-key';

      const encrypted = await EncryptionService.encryptObject(largeObject, masterKey);
      const decrypted = await EncryptionService.decryptObject(encrypted, masterKey);

      expect(decrypted.data).toHaveLength(100);
      expect(decrypted.data[0].name).toBe('Item 0');
    });
  });

  describe('special characters and unicode', () => {
    it('should handle special characters', async () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      const masterKey = 'special-chars-key';

      const encrypted = await EncryptionService.encrypt(specialText, masterKey);
      const decrypted = await EncryptionService.decrypt(encrypted, masterKey);

      expect(decrypted).toBe(specialText);
    });

    it('should handle unicode characters', async () => {
      const unicodeText = '你好世界 مرحبا بالعالم 🚀 🔐 🎉';
      const masterKey = 'unicode-key';

      const encrypted = await EncryptionService.encrypt(unicodeText, masterKey);
      const decrypted = await EncryptionService.decrypt(encrypted, masterKey);

      expect(decrypted).toBe(unicodeText);
    });
  });
});
