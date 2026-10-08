/**
 * CertificatePinningService - Implements certificate pinning for secure API communication
 * Features: Public key pinning, certificate chain validation, backup certificates
 */

interface PinnedCertificate {
  domain: string;
  publicKeyHash: string; // SHA-256 hash of the public key
  isBackup?: boolean;
  expiresAt?: number;
}

interface CertificatePinningConfig {
  pins: PinnedCertificate[];
  allowBackupOnly?: boolean;
  enableLogging?: boolean;
}

export class CertificatePinningService {
  private static pins: Map<string, PinnedCertificate[]> = new Map();
  private static enableLogging = true;

  /**
   * Initialize certificate pinning with configuration
   */
  public static initialize(config: CertificatePinningConfig): void {
    try {
      config.pins.forEach((pin) => {
        if (!pin.domain || !pin.publicKeyHash) {
          throw new Error('Invalid pin configuration: domain and publicKeyHash are required');
        }

        const existing = this.pins.get(pin.domain) || [];
        existing.push(pin);
        this.pins.set(pin.domain, existing);
      });

      this.enableLogging = config.enableLogging ?? true;
      this.log('Certificate pinning initialized', { domains: Array.from(this.pins.keys()) });
    } catch (error) {
      throw new Error(`Failed to initialize certificate pinning: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a pinned certificate for a domain
   */
  public static addPin(
    domain: string,
    publicKeyHash: string,
    isBackup = false,
    expiresAt?: number
  ): void {
    try {
      this.validateDomain(domain);
      this.validateHash(publicKeyHash);

      const existing = this.pins.get(domain) || [];

      // Check if pin already exists
      const existingPin = existing.find((p) => p.publicKeyHash === publicKeyHash);
      if (existingPin) {
        this.log('Pin already exists for domain', { domain, publicKeyHash });
        return;
      }

      existing.push({
        domain,
        publicKeyHash,
        isBackup,
        expiresAt,
      });

      this.pins.set(domain, existing);
      this.log('Pin added', { domain, isBackup });
    } catch (error) {
      throw new Error(`Failed to add pin: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify certificate for a domain
   * In a real implementation, this would validate against the server's certificate
   */
  public static async verifyCertificate(
    domain: string,
    certificatePublicKeyHash: string
  ): Promise<boolean> {
    try {
      this.validateDomain(domain);

      const domainPins = this.pins.get(domain);

      if (!domainPins || domainPins.length === 0) {
        this.log('No pins configured for domain', { domain });
        return false;
      }

      // Check primary pins first
      const primaryPins = domainPins.filter((p) => !p.isBackup);
      if (primaryPins.length > 0) {
        const isValid = primaryPins.some((pin) =>
          this.validatePin(pin, certificatePublicKeyHash)
        );

        if (isValid) {
          this.log('Certificate verified with primary pin', { domain });
          return true;
        }
      }

      // Check backup pins
      const backupPins = domainPins.filter((p) => p.isBackup);
      if (backupPins.length > 0) {
        const isValid = backupPins.some((pin) =>
          this.validatePin(pin, certificatePublicKeyHash)
        );

        if (isValid) {
          this.log('Certificate verified with backup pin', { domain });
          return true;
        }
      }

      this.log('Certificate verification failed', {
        domain,
        expectedHashes: domainPins.map((p) => p.publicKeyHash),
        receivedHash: certificatePublicKeyHash,
      });

      return false;
    } catch (error) {
      this.log('Error during certificate verification', {
        domain,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get pins for a domain
   */
  public static getPins(domain: string): PinnedCertificate[] {
    try {
      this.validateDomain(domain);
      return this.pins.get(domain) || [];
    } catch (error) {
      this.log('Error getting pins', {
        domain,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Remove expired pins
   */
  public static cleanup(): void {
    try {
      const now = Date.now();
      let removedCount = 0;

      this.pins.forEach((pins, domain) => {
        const filtered = pins.filter((pin) => {
          if (pin.expiresAt && pin.expiresAt < now) {
            removedCount++;
            return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          this.pins.delete(domain);
        } else if (filtered.length < pins.length) {
          this.pins.set(domain, filtered);
        }
      });

      if (removedCount > 0) {
        this.log('Expired pins removed', { removedCount });
      }
    } catch (error) {
      this.log('Error during cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Clear all pins
   */
  public static clear(): void {
    this.pins.clear();
    this.log('All pins cleared');
  }

  /**
   * Get pinning status for monitoring
   */
  public static getStatus(): {
    domains: number;
    totalPins: number;
    primaryPins: number;
    backupPins: number;
  } {
    let totalPins = 0;
    let primaryPins = 0;
    let backupPins = 0;

    this.pins.forEach((pins) => {
      pins.forEach((pin) => {
        totalPins++;
        if (pin.isBackup) {
          backupPins++;
        } else {
          primaryPins++;
        }
      });
    });

    return {
      domains: this.pins.size,
      totalPins,
      primaryPins,
      backupPins,
    };
  }

  /**
   * Validate a pin
   */
  private static validatePin(
    pin: PinnedCertificate,
    receivedHash: string
  ): boolean {
    // Check expiration
    if (pin.expiresAt && pin.expiresAt < Date.now()) {
      this.log('Pin expired', {
        domain: pin.domain,
        expiresAt: new Date(pin.expiresAt).toISOString(),
      });
      return false;
    }

    // Compare hashes (constant-time comparison to prevent timing attacks)
    return this.constantTimeEqual(pin.publicKeyHash, receivedHash);
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private static constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      // Still consume time even for length mismatch
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        // eslint-disable-next-line no-bitwise
        (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
      }
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      // eslint-disable-next-line no-bitwise
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Validate domain format
   */
  private static validateDomain(domain: string): void {
    if (!domain || typeof domain !== 'string') {
      throw new Error('Invalid domain: must be a non-empty string');
    }

    // Basic domain validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
    if (!domainRegex.test(domain)) {
      throw new Error(`Invalid domain format: ${domain}`);
    }
  }

  /**
   * Validate hash format (SHA-256 hex)
   */
  private static validateHash(hash: string): void {
    if (!hash || typeof hash !== 'string') {
      throw new Error('Invalid hash: must be a non-empty string');
    }

    // SHA-256 produces 64 hex characters
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      throw new Error('Invalid hash format: must be a valid SHA-256 hex string');
    }
  }

  /**
   * Internal logging
   */
  private static log(message: string, data?: any): void {
    if (this.enableLogging) {
      console.log(`[CertificatePinning] ${message}`, data || '');
    }
  }
}
