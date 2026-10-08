import crypto from 'crypto';

export interface PinnedCertificate {
  domain: string;
  fingerprint: string;
  algorithm: string;
  publicKey: string;
  expiresAt: number;
}

export interface CertificatePinningOptions {
  allowBackupPins?: boolean;
  pinningTimeout?: number;
}

export class CertificatePinningService {
  private pinnedCertificates: Map<string, PinnedCertificate[]> = new Map();
  private backupCertificates: Map<string, PinnedCertificate[]> = new Map();
  private options: Required<CertificatePinningOptions> = {
    allowBackupPins: true,
    pinningTimeout: 86400000, // 24 hours
  };

  constructor(options: CertificatePinningOptions = {}) {
    this.options = { ...this.options, ...options };
  }

  addPin(
    domain: string,
    publicKey: string,
    expiresAt?: number,
    isBackup: boolean = false
  ): void {
    const fingerprint = this.generateFingerprint(publicKey);
    const certificate: PinnedCertificate = {
      domain,
      fingerprint,
      algorithm: 'sha256',
      publicKey,
      expiresAt: expiresAt || Date.now() + this.options.pinningTimeout,
    };

    if (isBackup) {
      if (!this.backupCertificates.has(domain)) {
        this.backupCertificates.set(domain, []);
      }
      this.backupCertificates.get(domain)!.push(certificate);
    } else {
      if (!this.pinnedCertificates.has(domain)) {
        this.pinnedCertificates.set(domain, []);
      }
      this.pinnedCertificates.get(domain)!.push(certificate);
    }
  }

  verifyPin(domain: string, publicKey: string): boolean {
    const fingerprint = this.generateFingerprint(publicKey);
    const certificates = this.pinnedCertificates.get(domain) || [];

    for (const cert of certificates) {
      if (this.isCertificateValid(cert) && cert.fingerprint === fingerprint) {
        return true;
      }
    }

    if (this.options.allowBackupPins) {
      const backupCerts = this.backupCertificates.get(domain) || [];
      for (const cert of backupCerts) {
        if (this.isCertificateValid(cert) && cert.fingerprint === fingerprint) {
          return true;
        }
      }
    }

    return false;
  }

  removePins(domain: string): void {
    this.pinnedCertificates.delete(domain);
    this.backupCertificates.delete(domain);
  }

  removeExpiredPins(): void {
    for (const [domain, certs] of this.pinnedCertificates.entries()) {
      const validCerts = certs.filter(cert => this.isCertificateValid(cert));
      if (validCerts.length === 0) {
        this.pinnedCertificates.delete(domain);
      } else {
        this.pinnedCertificates.set(domain, validCerts);
      }
    }

    for (const [domain, certs] of this.backupCertificates.entries()) {
      const validCerts = certs.filter(cert => this.isCertificateValid(cert));
      if (validCerts.length === 0) {
        this.backupCertificates.delete(domain);
      } else {
        this.backupCertificates.set(domain, validCerts);
      }
    }
  }

  private isCertificateValid(cert: PinnedCertificate): boolean {
    return cert.expiresAt > Date.now();
  }

  private generateFingerprint(publicKey: string): string {
    return crypto
      .createHash('sha256')
      .update(publicKey)
      .digest('hex');
  }

  getPinnedDomains(): string[] {
    return Array.from(this.pinnedCertificates.keys());
  }

  getFingerprints(domain: string): string[] {
    const certs = this.pinnedCertificates.get(domain) || [];
    return certs.filter(cert => this.isCertificateValid(cert)).map(cert => cert.fingerprint);
  }
}
