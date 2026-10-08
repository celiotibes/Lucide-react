import crypto from 'crypto';

export interface EncryptionOptions {
  algorithm?: string;
  iterations?: number;
  saltLength?: number;
  keyLength?: number;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  authTag: string;
}

const DEFAULT_OPTIONS: Required<EncryptionOptions> = {
  algorithm: 'aes-256-gcm',
  iterations: 100000,
  saltLength: 32,
  keyLength: 32,
};

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';

  static encrypt(
    plaintext: string,
    encryptionKey: string,
    options: EncryptionOptions = {}
  ): EncryptedData {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const salt = crypto.randomBytes(opts.saltLength);
    const key = crypto.pbkdf2Sync(encryptionKey, salt, opts.iterations, opts.keyLength, 'sha256');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  static decrypt(
    encryptedData: EncryptedData,
    encryptionKey: string,
    options: EncryptionOptions = {}
  ): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const salt = Buffer.from(encryptedData.salt, 'hex');
    const key = crypto.pbkdf2Sync(encryptionKey, salt, opts.iterations, opts.keyLength, 'sha256');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  static hashData(data: string, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  static isDataModified(original: string, hash: string, algorithm: string = 'sha256'): boolean {
    return this.hashData(original, algorithm) !== hash;
  }
}
