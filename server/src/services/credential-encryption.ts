import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * CredentialEncryptionService
 *
 * Handles AES-256-GCM encryption/decryption of sensitive credentials (API keys, passwords).
 * Uses a master encryption key derived from a shared secret.
 */
export class CredentialEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly tagLength = 16;
  private masterKey: Buffer;

  constructor(masterSecret: string) {
    // Derive a 256-bit key from the master secret using scrypt
    this.masterKey = scryptSync(masterSecret, 'salt', 32);
  }

  /**
   * Encrypts a credential string
   * Returns: iv.hex:authTag.hex:ciphertext.hex (concatenated for storage)
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all as hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts a credential string
   * Expects format: iv.hex:authTag.hex:ciphertext.hex
   */
  decrypt(encrypted: string): string {
    try {
      const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');

      if (!ivHex || !authTagHex || !ciphertextHex) {
        throw new Error('Invalid encrypted credential format');
      }

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const ciphertext = Buffer.from(ciphertextHex, 'hex');

      const decipher = createDecipheriv(this.algorithm, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt credential: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validates that an encrypted credential can be decrypted (without returning the value)
   */
  validateEncrypted(encrypted: string): boolean {
    try {
      this.decrypt(encrypted);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance for application use
// Master secret should come from environment variable or secure vault
let encryptionService: CredentialEncryptionService | null = null;

export function getEncryptionService(): CredentialEncryptionService {
  if (!encryptionService) {
    const masterSecret = process.env.ENCRYPTION_MASTER_SECRET;
    if (!masterSecret) {
      throw new Error('ENCRYPTION_MASTER_SECRET environment variable is required');
    }
    encryptionService = new CredentialEncryptionService(masterSecret);
  }
  return encryptionService;
}

export function initializeEncryptionService(masterSecret: string): void {
  encryptionService = new CredentialEncryptionService(masterSecret);
}
