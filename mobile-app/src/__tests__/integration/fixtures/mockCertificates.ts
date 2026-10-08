/**
 * Mock Certificates for Certificate Pinning Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 */

import crypto from 'crypto';

export interface MockCertificateConfig {
  domain: string;
  publicKey: string;
  fingerprint: string;
  expiresAt: number;
  isExpired?: boolean;
  isBackup?: boolean;
}

export class MockCertificates {
  static generateFingerprint(publicKey: string): string {
    return crypto.createHash('sha256').update(publicKey).digest('hex');
  }

  static generatePublicKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Valid certificates
  static VALID_CERT_API: MockCertificateConfig = {
    domain: 'api.example.com',
    publicKey:
      '30820122300d06092a864886f70d01010105000481300818001c' +
      '4b3f7d5e8a9f2c1b8d0e5f2a3c8b0d7e9f2a8c3b1d9e4f5a2c8b0d7e',
    fingerprint: '',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
  };

  static VALID_CERT_BACKUP: MockCertificateConfig = {
    domain: 'api.example.com',
    publicKey:
      '30820122300d06092a864886f70d01010105000481300818001c' +
      '5c4e3f6d8a9f1c2b8d0e5f2a3c8b0d7e9f2a8c3b1d9e4f5a2c8b0d7e',
    fingerprint: '',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    isBackup: true,
  };

  static EXPIRED_CERT: MockCertificateConfig = {
    domain: 'api.example.com',
    publicKey:
      '30820122300d06092a864886f70d01010105000481300818001c' +
      '2b5f6e7d8a9c0b1f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c',
    fingerprint: '',
    expiresAt: Date.now() - 24 * 60 * 60 * 1000, // Expired 1 day ago
    isExpired: true,
  };

  static WRONG_DOMAIN_CERT: MockCertificateConfig = {
    domain: 'other.example.com',
    publicKey:
      '30820122300d06092a864886f70d01010105000481300818001c' +
      '7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d',
    fingerprint: '',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };

  static MALFORMED_CERT: MockCertificateConfig = {
    domain: 'api.example.com',
    publicKey: 'not-a-valid-public-key-string',
    fingerprint: '',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };

  // Initialize all certificates with fingerprints
  static initialize() {
    this.VALID_CERT_API.fingerprint = this.generateFingerprint(
      this.VALID_CERT_API.publicKey
    );
    this.VALID_CERT_BACKUP.fingerprint = this.generateFingerprint(
      this.VALID_CERT_BACKUP.publicKey
    );
    this.EXPIRED_CERT.fingerprint = this.generateFingerprint(
      this.EXPIRED_CERT.publicKey
    );
    this.WRONG_DOMAIN_CERT.fingerprint = this.generateFingerprint(
      this.WRONG_DOMAIN_CERT.publicKey
    );
    this.MALFORMED_CERT.fingerprint = this.generateFingerprint(
      this.MALFORMED_CERT.publicKey
    );
  }

  // Generate random certificate
  static generateRandomCert(
    domain: string = 'random.example.com'
  ): MockCertificateConfig {
    const publicKey = this.generatePublicKey();
    return {
      domain,
      publicKey,
      fingerprint: this.generateFingerprint(publicKey),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    };
  }

  // Generate batch of certificates
  static generateBatch(count: number, domain: string = 'batch.example.com') {
    const certs: MockCertificateConfig[] = [];
    for (let i = 0; i < count; i++) {
      certs.push(this.generateRandomCert(`${i}.${domain}`));
    }
    return certs;
  }
}

// Initialize on module load
MockCertificates.initialize();
