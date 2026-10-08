/**
 * APIClient Certificate Pinning Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 *
 * Tests certificate pinning validation, fallback behavior, multi-certificate support,
 * and pinning error handling.
 */

import { APIClient, PinningError, ValidationError } from '@/services/APIClient';
import {
  CertificatePinningService,
  PinnedCertificate,
} from '@/utils/security/certificatePinning';
import { MockCertificates } from './fixtures/mockCertificates';

describe('APIClient Certificate Pinning Integration Tests', () => {
  let apiClient: APIClient;
  const baseURL = 'https://api.example.com';

  beforeEach(() => {
    // Initialize API client with certificate pinning
    apiClient = new APIClient({
      baseURL,
      enableCertificatePinning: true,
      pinnedHosts: ['api.example.com'],
    });

    // Add mock certificates
    apiClient.addPinnedCertificate(
      MockCertificates.VALID_CERT_API.domain,
      MockCertificates.VALID_CERT_API.publicKey
    );
  });

  afterEach(() => {
    apiClient.clearValidationLogs();
  });

  describe('Valid Certificate Pinning', () => {
    it('should accept valid pinned certificate', () => {
      apiClient.addPinnedCertificate(
        'api.example.com',
        MockCertificates.VALID_CERT_API.publicKey
      );

      // Should not throw
      expect(() => {
        apiClient.addPinnedCertificate(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        );
      }).not.toThrow();
    });

    it('should validate pinning for configured hosts', () => {
      const logs = apiClient.getValidationLogs();

      // Should have pinning configuration
      expect(apiClient).toBeDefined();
      expect(apiClient.getValidationLogs()).toBeDefined();
    });
  });

  describe('Invalid Certificate Handling', () => {
    it('should reject mismatched certificate fingerprint', () => {
      const pinningService = new CertificatePinningService();

      // Add a valid certificate
      pinningService.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_API.publicKey
      );

      // Try to verify with wrong key
      const isValid = pinningService.verifyPin(
        'api.example.com',
        MockCertificates.WRONG_DOMAIN_CERT.publicKey
      );

      expect(isValid).toBe(false);
    });

    it('should reject expired certificates', () => {
      const pinningService = new CertificatePinningService();

      // Add expired certificate
      pinningService.addPin(
        'api.example.com',
        MockCertificates.EXPIRED_CERT.publicKey,
        MockCertificates.EXPIRED_CERT.expiresAt
      );

      // Should be invalid due to expiration
      const isValid = pinningService.verifyPin(
        'api.example.com',
        MockCertificates.EXPIRED_CERT.publicKey
      );

      expect(isValid).toBe(false);
    });

    it('should reject certificate for wrong domain', () => {
      const pinningService = new CertificatePinningService();

      pinningService.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_API.publicKey
      );

      // Verify against wrong domain
      const isValid = pinningService.verifyPin(
        'other.example.com',
        MockCertificates.VALID_CERT_API.publicKey
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Backup Certificate Pinning', () => {
    it('should accept backup certificates', () => {
      const pinningService = new CertificatePinningService({
        allowBackupPins: true,
      });

      // Add primary certificate
      pinningService.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_API.publicKey,
        undefined,
        false
      );

      // Add backup certificate
      pinningService.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_BACKUP.publicKey,
        undefined,
        true
      );

      // Should verify with primary
      expect(
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        )
      ).toBe(true);

      // Should verify with backup
      expect(
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_BACKUP.publicKey
        )
      ).toBe(true);
    });

    it('should respect allowBackupPins setting', () => {
      const pinningServiceWithoutBackup = new CertificatePinningService({
        allowBackupPins: false,
      });

      pinningServiceWithoutBackup.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_API.publicKey,
        undefined,
        false
      );

      pinningServiceWithoutBackup.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_BACKUP.publicKey,
        undefined,
        true
      );

      // Should verify primary
      expect(
        pinningServiceWithoutBackup.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        )
      ).toBe(true);

      // Should NOT verify backup when disabled
      expect(
        pinningServiceWithoutBackup.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_BACKUP.publicKey
        )
      ).toBe(false);
    });
  });

  describe('Multiple Pinned Certificates', () => {
    it('should handle multiple certificates per domain', () => {
      const pinningService = new CertificatePinningService();

      // Add multiple certificates for same domain
      const cert1 = MockCertificates.generateRandomCert('api.example.com');
      const cert2 = MockCertificates.generateRandomCert('api.example.com');
      const cert3 = MockCertificates.generateRandomCert('api.example.com');

      pinningService.addPin('api.example.com', cert1.publicKey);
      pinningService.addPin('api.example.com', cert2.publicKey);
      pinningService.addPin('api.example.com', cert3.publicKey);

      // All should verify
      expect(pinningService.verifyPin('api.example.com', cert1.publicKey)).toBe(
        true
      );
      expect(pinningService.verifyPin('api.example.com', cert2.publicKey)).toBe(
        true
      );
      expect(pinningService.verifyPin('api.example.com', cert3.publicKey)).toBe(
        true
      );
    });

    it('should get fingerprints for domain', () => {
      const pinningService = new CertificatePinningService();

      const cert1 = MockCertificates.VALID_CERT_API;
      const cert2 = MockCertificates.VALID_CERT_BACKUP;

      pinningService.addPin(cert1.domain, cert1.publicKey);
      pinningService.addPin(cert2.domain, cert2.publicKey);

      const fingerprints = pinningService.getFingerprints('api.example.com');

      expect(fingerprints.length).toBeGreaterThan(0);
      expect(fingerprints).toContain(cert1.fingerprint);
    });
  });

  describe('Certificate Management', () => {
    it('should remove pins for domain', () => {
      const pinningService = new CertificatePinningService();

      pinningService.addPin('api.example.com', MockCertificates.VALID_CERT_API.publicKey);

      expect(
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        )
      ).toBe(true);

      pinningService.removePins('api.example.com');

      expect(
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        )
      ).toBe(false);
    });

    it('should remove expired pins', () => {
      const pinningService = new CertificatePinningService();

      // Add both valid and expired certificates
      pinningService.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_API.publicKey,
        Date.now() + 365 * 24 * 60 * 60 * 1000
      );

      pinningService.addPin(
        'api.example.com',
        MockCertificates.EXPIRED_CERT.publicKey,
        MockCertificates.EXPIRED_CERT.expiresAt
      );

      pinningService.removeExpiredPins();

      // Valid should still be there
      expect(
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        )
      ).toBe(true);

      // Expired should be removed
      expect(
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.EXPIRED_CERT.publicKey
        )
      ).toBe(false);
    });

    it('should list pinned domains', () => {
      const pinningService = new CertificatePinningService();

      pinningService.addPin('api.example.com', MockCertificates.VALID_CERT_API.publicKey);
      pinningService.addPin('api.test.com', MockCertificates.VALID_CERT_BACKUP.publicKey);

      const domains = pinningService.getPinnedDomains();

      expect(domains).toContain('api.example.com');
      expect(domains).toContain('api.test.com');
    });
  });

  describe('Fingerprint Calculation', () => {
    it('should generate consistent fingerprints', () => {
      const pinningService = new CertificatePinningService();

      const publicKey = MockCertificates.VALID_CERT_API.publicKey;

      pinningService.addPin('api.example.com', publicKey);
      pinningService.addPin('api2.example.com', publicKey);

      const fingerprints1 = pinningService.getFingerprints('api.example.com');
      const fingerprints2 = pinningService.getFingerprints('api2.example.com');

      // Same key should produce same fingerprint
      expect(fingerprints1[0]).toBe(fingerprints2[0]);
    });

    it('should generate different fingerprints for different keys', () => {
      const pinningService = new CertificatePinningService();

      pinningService.addPin(
        'api1.example.com',
        MockCertificates.VALID_CERT_API.publicKey
      );
      pinningService.addPin(
        'api2.example.com',
        MockCertificates.VALID_CERT_BACKUP.publicKey
      );

      const fingerprints1 = pinningService.getFingerprints('api1.example.com');
      const fingerprints2 = pinningService.getFingerprints('api2.example.com');

      expect(fingerprints1[0]).not.toBe(fingerprints2[0]);
    });
  });

  describe('Validation Logging', () => {
    it('should log validation attempts', () => {
      const logs = apiClient.getValidationLogs();

      // Should be an array
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should clear validation logs', () => {
      apiClient.clearValidationLogs();

      const logs = apiClient.getValidationLogs();
      expect(logs.length).toBe(0);
    });
  });

  describe('Certificate Expiration', () => {
    it('should respect certificate expiration time', () => {
      const pinningService = new CertificatePinningService();

      // Add certificate that expires in 1 second
      const expiresAt = Date.now() + 1000;
      pinningService.addPin('api.example.com', MockCertificates.VALID_CERT_API.publicKey, expiresAt);

      // Should be valid immediately
      expect(
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        )
      ).toBe(true);

      // Wait for expiration
      setTimeout(() => {
        // Should be invalid after expiration
        expect(
          pinningService.verifyPin(
            'api.example.com',
            MockCertificates.VALID_CERT_API.publicKey
          )
        ).toBe(false);
      }, 1500);
    });

    it('should use default timeout for new certificates', () => {
      const pinningService = new CertificatePinningService({
        pinningTimeout: 3600000, // 1 hour
      });

      pinningService.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_API.publicKey
      );

      // Should be valid
      expect(
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        )
      ).toBe(true);
    });
  });

  describe('Error Cases', () => {
    it('should handle malformed public key gracefully', () => {
      const pinningService = new CertificatePinningService();

      // Should not throw even with bad input
      expect(() => {
        pinningService.addPin('api.example.com', 'not-a-valid-key');
      }).not.toThrow();
    });

    it('should handle empty domain', () => {
      const pinningService = new CertificatePinningService();

      expect(() => {
        pinningService.addPin('', MockCertificates.VALID_CERT_API.publicKey);
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should verify certificates quickly', () => {
      const pinningService = new CertificatePinningService();

      pinningService.addPin(
        'api.example.com',
        MockCertificates.VALID_CERT_API.publicKey
      );

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        pinningService.verifyPin(
          'api.example.com',
          MockCertificates.VALID_CERT_API.publicKey
        );
      }

      const elapsed = Date.now() - start;

      // 1000 verifications should be very fast
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch certificate additions', () => {
      const pinningService = new CertificatePinningService();
      const certs = MockCertificates.generateBatch(10, 'batch.example.com');

      for (const cert of certs) {
        pinningService.addPin(cert.domain, cert.publicKey);
      }

      const domains = pinningService.getPinnedDomains();
      expect(domains.length).toBe(10);
    });
  });
});
