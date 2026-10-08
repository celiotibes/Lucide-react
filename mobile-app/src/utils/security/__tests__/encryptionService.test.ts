import { EncryptionService } from '../encryptionService';

describe('EncryptionService', () => {
  const testKey = 'test-encryption-key';
  const plaintext = 'Sensitive data that needs encryption';

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const encrypted = EncryptionService.encrypt(plaintext, testKey);

      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      const decrypted = EncryptionService.decrypt(encrypted, testKey);
      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const encrypted1 = EncryptionService.encrypt(plaintext, testKey);
      const encrypted2 = EncryptionService.encrypt(plaintext, testKey);

      expect(encrypted1.encrypted).not.toEqual(encrypted2.encrypted);
      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
      expect(encrypted1.salt).not.toEqual(encrypted2.salt);
    });

    it('should fail to decrypt with wrong key', () => {
      const encrypted = EncryptionService.encrypt(plaintext, testKey);

      expect(() => {
        EncryptionService.decrypt(encrypted, 'wrong-key');
      }).toThrow();
    });

    it('should handle custom encryption options', () => {
      const customOptions = {
        iterations: 50000,
        saltLength: 16,
        keyLength: 32,
      };

      const encrypted = EncryptionService.encrypt(plaintext, testKey, customOptions);
      const decrypted = EncryptionService.decrypt(encrypted, testKey, customOptions);

      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('hashData', () => {
    it('should hash data consistently', () => {
      const hash1 = EncryptionService.hashData(plaintext);
      const hash2 = EncryptionService.hashData(plaintext);

      expect(hash1).toEqual(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = EncryptionService.hashData(plaintext);
      const hash2 = EncryptionService.hashData('Different data');

      expect(hash1).not.toEqual(hash2);
    });

    it('should support different algorithms', () => {
      const sha256 = EncryptionService.hashData(plaintext, 'sha256');
      const sha512 = EncryptionService.hashData(plaintext, 'sha512');

      expect(sha256).not.toEqual(sha512);
      expect(sha256.length).toBe(64);
      expect(sha512.length).toBe(128);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate secure tokens', () => {
      const token = EncryptionService.generateSecureToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate tokens of specified length', () => {
      const token = EncryptionService.generateSecureToken(64);
      expect(token.length).toBe(128); // hex string is double the byte length
    });

    it('should generate unique tokens', () => {
      const token1 = EncryptionService.generateSecureToken();
      const token2 = EncryptionService.generateSecureToken();

      expect(token1).not.toEqual(token2);
    });
  });

  describe('isDataModified', () => {
    it('should detect unmodified data', () => {
      const hash = EncryptionService.hashData(plaintext);
      const isModified = EncryptionService.isDataModified(plaintext, hash);

      expect(isModified).toBe(false);
    });

    it('should detect modified data', () => {
      const hash = EncryptionService.hashData(plaintext);
      const isModified = EncryptionService.isDataModified('Modified data', hash);

      expect(isModified).toBe(true);
    });
  });
});
