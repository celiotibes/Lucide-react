/**
 * Encryption Service
 * Encriptação de dados sensíveis (CPF, CNPJ, dados bancários)
 */

import crypto from 'crypto';
import { logger } from '@utils/logger';
import { config } from '@utils/config';

interface EncryptedData {
  encrypted: string;
  iv: string;
  algorithm: string;
}

class EncryptionService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly SALT_LENGTH = 16;
  private masterKey: Buffer;

  constructor() {
    this.masterKey = this.deriveMasterKey();
  }

  /**
   * Deriva chave mestra do config
   */
  private deriveMasterKey(): Buffer {
    const secret = config.cert_encryption_key || 'default_encryption_key';
    return crypto.scryptSync(secret, config.database_url || 'salt', 32);
  }

  /**
   * Encripta dados sensíveis
   */
  encrypt(data: string): EncryptedData {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.ALGORITHM, this.masterKey, iv);

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = (cipher as any).getAuthTag();

      return {
        encrypted: `${encrypted}:${authTag.toString('hex')}`,
        iv: iv.toString('hex'),
        algorithm: this.ALGORITHM,
      };
    } catch (error) {
      logger.error({ error }, 'Erro ao encriptar dados');
      throw error;
    }
  }

  /**
   * Decripta dados
   */
  decrypt(encryptedData: EncryptedData): string {
    try {
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const [encrypted, authTag] = encryptedData.encrypted.split(':');

      const decipher = crypto.createDecipheriv(this.ALGORITHM, this.masterKey, iv);
      (decipher as any).setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error({ error }, 'Erro ao decriptar dados');
      throw error;
    }
  }

  /**
   * Encripta CPF
   */
  encryptCPF(cpf: string): EncryptedData {
    const cleaned = cpf.replace(/[^\d]/g, '');
    return this.encrypt(cleaned);
  }

  /**
   * Decripta CPF
   */
  decryptCPF(encryptedData: EncryptedData): string {
    const decrypted = this.decrypt(encryptedData);
    return `${decrypted.slice(0, 3)}.${decrypted.slice(3, 6)}.${decrypted.slice(6, 9)}-${decrypted.slice(9)}`;
  }

  /**
   * Encripta CNPJ
   */
  encryptCNPJ(cnpj: string): EncryptedData {
    const cleaned = cnpj.replace(/[^\d]/g, '');
    return this.encrypt(cleaned);
  }

  /**
   * Decripta CNPJ
   */
  decryptCNPJ(encryptedData: EncryptedData): string {
    const decrypted = this.decrypt(encryptedData);
    return `${decrypted.slice(0, 2)}.${decrypted.slice(2, 5)}.${decrypted.slice(5, 8)}/${decrypted.slice(8, 12)}-${decrypted.slice(12)}`;
  }

  /**
   * Encripta dados bancários
   */
  encryptBankData(bankData: any): any {
    const encrypted: any = {};

    for (const [key, value] of Object.entries(bankData)) {
      if (value && typeof value === 'string') {
        encrypted[key] = this.encrypt(value);
      } else {
        encrypted[key] = value;
      }
    }

    return encrypted;
  }

  /**
   * Decripta dados bancários
   */
  decryptBankData(encryptedData: any): any {
    const decrypted: any = {};

    for (const [key, value] of Object.entries(encryptedData)) {
      if (value && typeof value === 'object' && 'encrypted' in value) {
        decrypted[key] = this.decrypt(value as EncryptedData);
      } else {
        decrypted[key] = value;
      }
    }

    return decrypted;
  }

  /**
   * Gera hash para verificação de integridade
   */
  generateHash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  /**
   * Verifica integridade de dados
   */
  verifyIntegrity(data: string, hash: string): boolean {
    return this.generateHash(data) === hash;
  }
}

export const encryptionService = new EncryptionService();
