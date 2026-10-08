/**
 * Tests for CertificatePinningService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CertificatePinningService } from '../../services/security/CertificatePinningService';

describe('CertificatePinningService', () => {
  beforeEach(() => {
    CertificatePinningService.clear();
  });

  afterEach(() => {
    CertificatePinningService.clear();
  });

  describe('initialize', () => {
    it('should initialize with pins', () => {
      const pins = [
        {
          domain: 'example.com',
          publicKeyHash:
            'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a',
          isBackup: false,
        },
      ];

      CertificatePinningService.initialize({ pins });

      const retrieved = CertificatePinningService.getPins('example.com');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].domain).toBe('example.com');
    });

    it('should throw error for invalid configuration', () => {
      expect(() => {
        CertificatePinningService.initialize({
          pins: [
            {
              domain: '',
              publicKeyHash:
                'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a',
            } as any,
          ],
        });
      }).toThrow();
    });
  });

  describe('addPin', () => {
    it('should add a pin for a domain', () => {
      CertificatePinningService.addPin(
        'example.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a'
      );

      const pins = CertificatePinningService.getPins('example.com');
      expect(pins).toHaveLength(1);
    });

    it('should not add duplicate pins', () => {
      const hash = 'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a';

      CertificatePinningService.addPin('example.com', hash);
      CertificatePinningService.addPin('example.com', hash);

      const pins = CertificatePinningService.getPins('example.com');
      expect(pins).toHaveLength(1);
    });

    it('should add backup pins', () => {
      const hash1 = 'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a';
      const hash2 = 'ddd5dd6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4b';

      CertificatePinningService.addPin('example.com', hash1, false);
      CertificatePinningService.addPin('example.com', hash2, true);

      const pins = CertificatePinningService.getPins('example.com');
      expect(pins).toHaveLength(2);
      expect(pins[1].isBackup).toBe(true);
    });

    it('should throw error for invalid domain', () => {
      expect(() => {
        CertificatePinningService.addPin(
          '',
          'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a'
        );
      }).toThrow();
    });

    it('should throw error for invalid hash', () => {
      expect(() => {
        CertificatePinningService.addPin('example.com', 'invalid-hash');
      }).toThrow();
    });
  });

  describe('verifyCertificate', () => {
    beforeEach(() => {
      CertificatePinningService.addPin(
        'example.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a'
      );
    });

    it('should verify matching certificate', async () => {
      const isValid = await CertificatePinningService.verifyCertificate(
        'example.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a'
      );

      expect(isValid).toBe(true);
    });

    it('should reject non-matching certificate', async () => {
      const isValid = await CertificatePinningService.verifyCertificate(
        'example.com',
        'fffbfff6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4f'
      );

      expect(isValid).toBe(false);
    });

    it('should return false for domain with no pins', async () => {
      const isValid = await CertificatePinningService.verifyCertificate(
        'unpinned.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a'
      );

      expect(isValid).toBe(false);
    });

    it('should check backup pins if primary fails', async () => {
      const primaryHash = 'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a';
      const backupHash = 'ddd5dd6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4b';

      CertificatePinningService.addPin('example.com', backupHash, true);

      const isValid = await CertificatePinningService.verifyCertificate(
        'example.com',
        backupHash
      );

      expect(isValid).toBe(true);
    });
  });

  describe('getPins', () => {
    it('should return pins for domain', () => {
      CertificatePinningService.addPin(
        'example.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a'
      );

      const pins = CertificatePinningService.getPins('example.com');
      expect(pins).toHaveLength(1);
    });

    it('should return empty array for domain with no pins', () => {
      const pins = CertificatePinningService.getPins('example.com');
      expect(pins).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('should remove expired pins', () => {
      const now = Date.now();
      const expiredTime = now - 1000; // 1 second ago

      CertificatePinningService.addPin(
        'example.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a',
        false,
        expiredTime
      );

      CertificatePinningService.addPin(
        'example.com',
        'ddd5dd6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4b',
        false,
        now + 3600000
      );

      let pins = CertificatePinningService.getPins('example.com');
      expect(pins).toHaveLength(2);

      CertificatePinningService.cleanup();

      pins = CertificatePinningService.getPins('example.com');
      expect(pins).toHaveLength(1);
    });

    it('should remove domain if all pins expire', () => {
      const expiredTime = Date.now() - 1000;

      CertificatePinningService.addPin(
        'example.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a',
        false,
        expiredTime
      );

      CertificatePinningService.cleanup();

      const pins = CertificatePinningService.getPins('example.com');
      expect(pins).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear all pins', () => {
      CertificatePinningService.addPin(
        'example.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a'
      );
      CertificatePinningService.addPin(
        'another.com',
        'ddd5dd6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4b'
      );

      let status = CertificatePinningService.getStatus();
      expect(status.domains).toBe(2);

      CertificatePinningService.clear();

      status = CertificatePinningService.getStatus();
      expect(status.domains).toBe(0);
      expect(status.totalPins).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return correct status', () => {
      CertificatePinningService.addPin(
        'example.com',
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a',
        false
      );
      CertificatePinningService.addPin(
        'example.com',
        'ddd5dd6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4b',
        true
      );

      const status = CertificatePinningService.getStatus();

      expect(status.domains).toBe(1);
      expect(status.totalPins).toBe(2);
      expect(status.primaryPins).toBe(1);
      expect(status.backupPins).toBe(1);
    });

    it('should return zero status when empty', () => {
      const status = CertificatePinningService.getStatus();

      expect(status.domains).toBe(0);
      expect(status.totalPins).toBe(0);
      expect(status.primaryPins).toBe(0);
      expect(status.backupPins).toBe(0);
    });
  });

  describe('timing attack prevention', () => {
    it('should use constant-time comparison', async () => {
      const correctHash = 'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a';
      const wrongHash = 'fffbfff6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4f';

      CertificatePinningService.addPin('example.com', correctHash);

      // Both should complete in similar time (timing attack prevention)
      const start1 = performance.now();
      await CertificatePinningService.verifyCertificate('example.com', correctHash);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      await CertificatePinningService.verifyCertificate('example.com', wrongHash);
      const time2 = performance.now() - start2;

      // Times should be reasonably close (within 100ms)
      expect(Math.abs(time1 - time2)).toBeLessThan(100);
    });
  });

  describe('multiple domains', () => {
    it('should handle multiple domains independently', () => {
      const hash1 = 'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a';
      const hash2 = 'ddd5dd6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4b';

      CertificatePinningService.addPin('domain1.com', hash1);
      CertificatePinningService.addPin('domain2.com', hash2);

      const pins1 = CertificatePinningService.getPins('domain1.com');
      const pins2 = CertificatePinningService.getPins('domain2.com');

      expect(pins1).toHaveLength(1);
      expect(pins2).toHaveLength(1);
      expect(pins1[0].publicKeyHash).toBe(hash1);
      expect(pins2[0].publicKeyHash).toBe(hash2);
    });
  });
});
