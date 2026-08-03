import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as forge from 'node-forge';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { CertificateError, CertificateNotFoundError } from '@utils/errors';
import { Certificate } from '@/types';

export class CertificateManager {
  private certStoragePath: string;
  private encryptionKey: Buffer;

  constructor() {
    this.certStoragePath = config.cert_storage_path;
    this.encryptionKey = crypto
      .createHash('sha256')
      .update(config.cert_encryption_key)
      .digest();

    this.ensureStoragePath();
  }

  private ensureStoragePath(): void {
    if (!fs.existsSync(this.certStoragePath)) {
      fs.mkdirSync(this.certStoragePath, { recursive: true });
      logger.info(`Diretório de certificados criado: ${this.certStoragePath}`);
    }
  }

  async uploadCertificate(pfxBuffer: Buffer, password: string, userId: string): Promise<Certificate> {
    try {
      const p12 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
      const pkcs12 = forge.pkcs12.pkcs12FromAsn1(p12, password);

      if (!pkcs12.getBags || !pkcs12.getBags({ bagType: forge.pki.oids.certBag })) {
        throw new CertificateError('Certificado inválido ou senha incorreta');
      }

      const certBags = pkcs12.getBags({ bagType: forge.pki.oids.certBag });
      if (!certBags || certBags.length === 0) {
        throw new CertificateError('Nenhum certificado encontrado no arquivo');
      }

      const cert = certBags[0].cert!;
      const fingerprint = this.calculateFingerprint(cert);

      const certData: Certificate = {
        fingerprint,
        subject: cert.subject.hash,
        issuer: cert.issuer.hash,
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
        encryptedData: this.encryptCertificate(pfxBuffer, password),
        algorithm: 'RSA',
        keySize: 2048,
        uploadedAt: new Date(),
      };

      this.saveCertificateFile(fingerprint, certData);
      logger.info(`Certificado instalado: ${fingerprint} para usuário ${userId}`);

      return certData;
    } catch (error) {
      if (error instanceof CertificateError) throw error;
      logger.error({ err: error }, 'Erro ao fazer upload do certificado');
      throw new CertificateError('Falha ao processar certificado');
    }
  }

  async getCertificate(fingerprint: string): Promise<Certificate> {
    const filePath = path.join(this.certStoragePath, `${fingerprint}.json`);

    if (!fs.existsSync(filePath)) {
      throw new CertificateNotFoundError(fingerprint);
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as Certificate;
  }

  async listCertificates(): Promise<Certificate[]> {
    const files = fs.readdirSync(this.certStoragePath).filter(f => f.endsWith('.json'));

    return files.map(file => {
      const data = fs.readFileSync(path.join(this.certStoragePath, file), 'utf-8');
      return JSON.parse(data) as Certificate;
    });
  }

  async deleteCertificate(fingerprint: string): Promise<void> {
    const filePath = path.join(this.certStoragePath, `${fingerprint}.json`);

    if (!fs.existsSync(filePath)) {
      throw new CertificateNotFoundError(fingerprint);
    }

    fs.unlinkSync(filePath);
    logger.info(`Certificado removido: ${fingerprint}`);
  }

  async isValidCertificate(certificate: Certificate): Promise<boolean> {
    const now = new Date();
    return certificate.validFrom <= now && now <= certificate.validTo;
  }

  async getCertificateForSigning(
    fingerprint: string,
    password: string,
  ): Promise<forge.pki.PrivateKey> {
    try {
      const cert = await this.getCertificate(fingerprint);
      const decrypted = this.decryptCertificate(cert.encryptedData, password);

      const p12 = forge.asn1.fromDer(Buffer.from(decrypted, 'base64').toString('binary'));
      const pkcs12 = forge.pkcs12.pkcs12FromAsn1(p12, password);

      const keyBags = pkcs12.getBags({ bagType: forge.pki.oids.keyBag });
      if (!keyBags || keyBags.length === 0) {
        throw new CertificateError('Chave privada não encontrada no certificado');
      }

      return keyBags[0].key as forge.pki.PrivateKey;
    } catch (error) {
      if (error instanceof CertificateError) throw error;
      logger.error({ err: error }, 'Erro ao obter certificado para assinatura');
      throw new CertificateError('Falha ao acessar certificado');
    }
  }

  private calculateFingerprint(cert: forge.pki.Certificate): string {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).bytes();
    const md = forge.md.sha256.create();
    md.update(der);
    return md.digest().toHex();
  }

  private encryptCertificate(pfxBuffer: Buffer, password: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

    let encrypted = cipher.update(pfxBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return Buffer.concat([iv, encrypted]).toString('base64');
  }

  private decryptCertificate(encryptedData: string, password: string): string {
    const buffer = Buffer.from(encryptedData, 'base64');
    const iv = buffer.slice(0, 16);
    const encrypted = buffer.slice(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('base64');
  }

  private saveCertificateFile(fingerprint: string, cert: Certificate): void {
    const filePath = path.join(this.certStoragePath, `${fingerprint}.json`);
    fs.writeFileSync(filePath, JSON.stringify(cert, null, 2));
  }
}

export const certificateManager = new CertificateManager();
