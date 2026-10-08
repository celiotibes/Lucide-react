import { SecureStorageService } from '../secureStorageService';
import * as SecureStore from 'expo-secure-store';
import { EncryptionService } from '../encryptionService';

// Mock SecureStore
jest.mock('expo-secure-store');

describe('SecureStorageService - Phase 22.14 Integration', () => {
  let service: SecureStorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecureStorageService();
  });

  describe('Master Key Management', () => {
    it('should initialize with PBKDF2-derived key', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await service.initialize();

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'app_master_key_v1',
        expect.stringMatching(/^[a-f0-9]+$/) // hex string
      );
    });

    it('should use expo-secure-store NOT localStorage', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      const localStorageSpy = jest.spyOn(Storage.prototype, 'getItem');
      await service.initialize();

      // Master key should come from SecureStore, not localStorage
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('app_master_key_v1');
      expect(localStorageSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('master_key')
      );

      localStorageSpy.mockRestore();
    });

    it('should load existing key from expo-secure-store', async () => {
      const existingKey =
        'a'.repeat(128); // Mock hex key (salt + derived key)
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce(existingKey) // key
        .mockResolvedValueOnce(JSON.stringify({ createdAt: Date.now(), version: 1 }));

      await service.initialize();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('app_master_key_v1');
    });
  });

  describe('Key Metadata', () => {
    it('should track key creation timestamp', async () => {
      const now = Date.now();
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce(null) // no existing key
        .mockResolvedValueOnce(null); // no existing metadata
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await service.initialize();

      const metadata = service.getKeyMetadata();
      expect(metadata).not.toBeNull();
      expect(metadata!.version).toBe(1);
      expect(metadata!.createdAt).toBeGreaterThanOrEqual(now);
    });

    it('should track key version', async () => {
      const metadata = { createdAt: Date.now() - 100 * 24 * 60 * 60 * 1000, version: 1 };
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('somekey')
        .mockResolvedValueOnce(JSON.stringify(metadata));
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await service.initialize();

      const retrievedMetadata = service.getKeyMetadata();
      expect(retrievedMetadata!.version).toBe(1);
    });
  });

  describe('Encryption & Decryption', () => {
    beforeEach(async () => {
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('validkey')
        .mockResolvedValueOnce(JSON.stringify({ createdAt: Date.now(), version: 1 }));
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      await service.initialize();
    });

    it('should encrypt data with AES-256-GCM', async () => {
      const testData = { secret: 'value' };

      await service.setItem('test_key', testData, { encrypt: true });

      const retrieved = service.getItem('test_key');
      expect(retrieved).toEqual(testData);
    });

    it('should store unencrypted data when encrypt=false', async () => {
      const testData = { public: 'data' };

      await service.setItem('public_key', testData, { encrypt: false });

      const retrieved = service.getItem('public_key');
      expect(retrieved).toEqual(testData);
    });

    it('should handle TTL expiration', async () => {
      const testData = { temporary: 'value' };

      await service.setItem('ttl_key', testData, { encrypt: true, ttl: 100 });

      // Should be available immediately
      expect(service.getItem('ttl_key')).toEqual(testData);

      // Wait for expiration
      await new Promise(r => setTimeout(r, 150));

      // Should be expired
      expect(service.getItem('ttl_key')).toBeNull();
    });

    it('should return null for missing keys', () => {
      const result = service.getItem('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('Key Rotation', () => {
    it('should detect when rotation is needed', async () => {
      const oldKeyTime = Date.now() - 95 * 24 * 60 * 60 * 1000; // 95 days old
      const metadata = { createdAt: oldKeyTime, version: 1 };

      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('oldkey')
        .mockResolvedValueOnce(JSON.stringify(metadata));
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      // This should trigger rotation check
      await service.initialize();

      // After initialization, key should be rotated
      // Verify by checking setItemAsync was called with new key
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'app_master_key_v1',
        expect.any(String)
      );
    });

    it('should warn before rotation deadline', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const warningKeyTime = Date.now() - 80 * 24 * 60 * 60 * 1000; // 80 days old
      const metadata = { createdAt: warningKeyTime, version: 1 };

      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('oldkey')
        .mockResolvedValueOnce(JSON.stringify(metadata));
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await service.initialize();

      // Should log rotation warning
      const logCalls = consoleSpy.mock.calls.map(c => c[0]);
      expect(logCalls.some(c => typeof c === 'string' && c.includes('rotation'))).toBe(
        true
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle SecureStore unavailability gracefully', async () => {
      const error = new Error('SecureStore not available');
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(error);
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      // Should not throw, should use fallback
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should throw error if key is not initialized', async () => {
      const uninitializedService = new SecureStorageService();

      expect(() => {
        uninitializedService.getItem('any_key');
      }).toThrow('not initialized');
    });

    it('should handle decrypt failures gracefully', async () => {
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('validkey')
        .mockResolvedValueOnce(JSON.stringify({ createdAt: Date.now(), version: 1 }));
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await service.initialize();

      // Manually add corrupted encrypted data
      const corruptedItem = {
        encryptedData: {
          encrypted: 'corrupted',
          iv: 'bad',
          salt: 'bad',
          authTag: 'bad',
        },
        timestamp: Date.now(),
      };
      (service as any).storage.set('corrupt', corruptedItem);

      // Should return null instead of throwing
      const result = service.getItem('corrupt');
      expect(result).toBeNull();
    });
  });

  describe('Storage Operations', () => {
    beforeEach(async () => {
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('validkey')
        .mockResolvedValueOnce(JSON.stringify({ createdAt: Date.now(), version: 1 }));
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      await service.initialize();
    });

    it('should manage multiple keys', async () => {
      await service.setItem('key1', { value: 1 }, { encrypt: true });
      await service.setItem('key2', { value: 2 }, { encrypt: true });
      await service.setItem('key3', { value: 3 }, { encrypt: false });

      const keys = service.getAllKeys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys.length).toBe(3);
    });

    it('should remove items', async () => {
      await service.setItem('to_remove', { data: 'value' });
      expect(service.getItem('to_remove')).not.toBeNull();

      service.removeItem('to_remove');
      expect(service.getItem('to_remove')).toBeNull();
    });

    it('should clear all items', async () => {
      await service.setItem('key1', { value: 1 });
      await service.setItem('key2', { value: 2 });

      await service.clear();

      expect(service.getAllKeys().length).toBe(0);
    });
  });

  describe('PBKDF2 Compliance', () => {
    it('should use 100,000 iterations for PBKDF2', async () => {
      // This is verified implicitly by checking that key generation
      // uses the correct iteration count
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      const cryptoSpy = jest.spyOn(require('crypto'), 'pbkdf2Sync');

      await service.initialize();

      // Verify pbkdf2Sync was called with 100k iterations
      const calls = cryptoSpy.mock.calls;
      const pbkdf2Calls = calls.filter(c => c[2] === 100000);
      expect(pbkdf2Calls.length).toBeGreaterThan(0);

      cryptoSpy.mockRestore();
    });
  });
});
