import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import db from '@db/connection';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import {
  Certificate,
  CertificateUploadRequest,
  CertificateValidationResult,
  SigningKey,
  InvalidCertificateError,
  ExpiredCertificateError,
  CertificateError,
  CertificateExpirationWarning,
} from '@types/digitalSignature';

export class CertificateService {
  private certificateDir = path.join(
    config.dataDir || './data',
    'certificates',
  );
  private masterKey = config.encryptionKey || 'default-insecure-key';

  constructor() {
    if (!fs.existsSync(this.certificateDir)) {
      fs.mkdirSync(this.certificateDir, { recursive: true });
    }
  }

  async uploadCertificate(
    userId: string,
    uploadRequest: CertificateUploadRequest,
  ): Promise<Certificate> {
    try {
      logger.info(`Processando upload de certificado para usuário ${userId}`);

      // Validate certificate format and content
      const validation = await this.validateCertificate(
        uploadRequest.certificate,
        uploadRequest.password,
      );

      if (!validation.isValid) {
        throw new InvalidCertificateError(
          `Certificado inválido: ${validation.errors.join(', ')}`,
        );
      }

      // Check if certificate is expired
      if (validation.metadata.validUntil < new Date()) {
        throw new ExpiredCertificateError(validation.metadata.validUntil);
      }

      // Extract certificate metadata
      const thumbprint = this.generateThumbprint(uploadRequest.certificate);
      const existingCert = this.getCertificateByThumbprint(thumbprint);

      if (existingCert) {
        throw new CertificateError(
          `Certificado com thumbprint ${thumbprint} já existe no sistema`,
        );
      }

      // Generate certificate ID
      const certificateId = crypto.randomUUID();

      // Store certificate file securely
      const certFileName = `${certificateId}.pem`;
      const certFilePath = path.join(this.certificateDir, certFileName);

      fs.writeFileSync(certFilePath, uploadRequest.certificate, {
        mode: 0o600,
      });

      // Extract owner information (CPF or CNPJ)
      const ownerInfo = this.extractOwnerInfo(validation.metadata.commonName);

      // Create certificate record
      const certificate: Certificate = {
        id: certificateId,
        userId,
        commonName: validation.metadata.commonName,
        issuerName: validation.metadata.issuerName,
        serialNumber: validation.metadata.serialNumber,
        thumbprint,
        publicKey: uploadRequest.certificate.toString('base64'),
        keyType: validation.metadata.keyType,
        keySize: validation.metadata.keySize,
        validFrom: validation.metadata.validFrom,
        validUntil: validation.metadata.validUntil,
        isValid: true,
        isPinned: uploadRequest.isPinned || false,
        certificateType: this.detectCertificateType(validation.metadata.issuerName),
        issuerType: this.detectIssuerType(validation.metadata.issuerName),
        owner: ownerInfo,
        uploadedAt: new Date(),
        usageCount: 0,
      };

      // Store in database
      this.storeCertificate(certificate);

      logger.info(`✓ Certificado ${certificateId} armazenado com sucesso`);
      return certificate;
    } catch (error) {
      logger.error(
        { err: error },
        `Erro ao fazer upload do certificado para ${userId}`,
      );
      throw error;
    }
  }

  async validateCertificate(
    certificateData: Buffer,
    password?: string,
  ): Promise<CertificateValidationResult> {
    try {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Write temporary file for openssl inspection
      const tempFile = path.join(
        this.certificateDir,
        `temp-${Date.now()}.pem`,
      );
      fs.writeFileSync(tempFile, certificateData);

      try {
        // Extract certificate information using openssl
        const certInfo = execSync(
          `openssl x509 -in ${tempFile} -noout -text`,
          {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          },
        );

        // Parse certificate details
        const subject = this.extractField(certInfo, 'Subject:');
        const issuer = this.extractField(certInfo, 'Issuer:');
        const serialNumber = this.extractField(
          certInfo,
          'Serial Number:',
        )?.replace(/[:\s]/g, '');
        const notBefore = this.extractDateField(certInfo, 'Not Before:');
        const notAfter = this.extractDateField(certInfo, 'Not After :');
        const publicKeyBits = this.extractPublicKeyBits(certInfo);

        // Extract CN from subject
        const cnMatch = subject?.match(/CN\s*=\s*([^,]+)/);
        const commonName = cnMatch ? cnMatch[1].trim() : 'Unknown';

        // Validate date range
        const now = new Date();
        if (notBefore && notBefore > now) {
          errors.push('Certificado ainda não é válido');
        }
        if (notAfter && notAfter < now) {
          errors.push('Certificado expirado');
        }

        // Check certificate chain (basic validation)
        const chainValidation = await this.validateCertificateChain(tempFile);
        if (!chainValidation.isValid) {
          warnings.push(
            'Cadeia de certificados não pode ser totalmente validada',
          );
        }

        // Check key algorithm
        const keyType = this.extractKeyType(certInfo);
        const keySize = publicKeyBits || 2048;

        // Validate key strength
        if (keySize < 2048) {
          warnings.push(
            `Chave RSA fraca (${keySize} bits). Recomenda-se 2048 bits ou superior`,
          );
        }

        const isValid = errors.length === 0;

        return {
          isValid,
          isExpired: notAfter ? notAfter < now : false,
          hasValidChain: chainValidation.isValid,
          errors,
          warnings,
          metadata: {
            commonName,
            issuerName: issuer || 'Unknown',
            serialNumber: serialNumber || 'Unknown',
            validFrom: notBefore || new Date(),
            validUntil: notAfter || new Date(),
            keyType,
            keySize,
          },
        };
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao validar certificado');
      throw new CertificateError(
        `Falha ao validar certificado: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getCertificate(certificateId: string, userId?: string): Promise<Certificate | null> {
    try {
      const stmt = db.prepare(
        userId
          ? `
          SELECT * FROM certificates
          WHERE id = ? AND user_id = ?
        `
          : `
          SELECT * FROM certificates
          WHERE id = ?
        `,
      );

      const params = userId ? [certificateId, userId] : [certificateId];
      const result = stmt.get(...params) as any;

      if (!result) {
        return null;
      }

      return this.rowToCertificate(result);
    } catch (error) {
      logger.error({ err: error }, `Erro ao recuperar certificado ${certificateId}`);
      throw error;
    }
  }

  async getCertificatesByUser(userId: string): Promise<Certificate[]> {
    try {
      const stmt = db.prepare(`
        SELECT * FROM certificates
        WHERE user_id = ?
        ORDER BY uploaded_at DESC
      `);

      const results = stmt.all(userId) as any[];
      return results.map((row) => this.rowToCertificate(row));
    } catch (error) {
      logger.error({ err: error }, `Erro ao recuperar certificados do usuário ${userId}`);
      throw error;
    }
  }

  async getCertificateByThumbprint(
    thumbprint: string,
  ): Promise<Certificate | null> {
    try {
      const stmt = db.prepare(`
        SELECT * FROM certificates
        WHERE thumbprint = ?
      `);

      const result = stmt.get(thumbprint) as any;
      return result ? this.rowToCertificate(result) : null;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao buscar certificado por thumbprint');
      throw error;
    }
  }

  async validateCertificateExpiration(): Promise<CertificateExpirationWarning[]> {
    try {
      const warnings: CertificateExpirationWarning[] = [];
      const now = new Date();
      const criticalDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const warningDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const stmt = db.prepare(`
        SELECT id, common_name, valid_until
        FROM certificates
        WHERE is_valid = 1
        ORDER BY valid_until ASC
      `);

      const certificates = stmt.all() as any[];

      for (const cert of certificates) {
        const expiresAt = new Date(cert.valid_until);
        const daysUntilExpiration = Math.floor(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (expiresAt < criticalDate) {
          warnings.push({
            certificateId: cert.id,
            commonName: cert.common_name,
            expiresAt,
            daysUntilExpiration,
            severity: expiresAt < now ? 'critical' : 'critical',
          });
        } else if (expiresAt < warningDate) {
          warnings.push({
            certificateId: cert.id,
            commonName: cert.common_name,
            expiresAt,
            daysUntilExpiration,
            severity: 'warning',
          });
        }
      }

      return warnings;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao validar expiração de certificados');
      throw error;
    }
  }

  async deleteCertificate(certificateId: string, userId: string): Promise<boolean> {
    try {
      // Verify ownership
      const cert = await this.getCertificate(certificateId, userId);
      if (!cert) {
        return false;
      }

      // Delete from database
      const stmt = db.prepare(`
        DELETE FROM certificates
        WHERE id = ? AND user_id = ?
      `);

      const result = stmt.run(certificateId, userId);

      // Delete certificate file
      const certFile = path.join(this.certificateDir, `${certificateId}.pem`);
      if (fs.existsSync(certFile)) {
        fs.unlinkSync(certFile);
      }

      logger.info(`Certificado ${certificateId} deletado com sucesso`);
      return (result.changes || 0) > 0;
    } catch (error) {
      logger.error({ err: error }, `Erro ao deletar certificado ${certificateId}`);
      throw error;
    }
  }

  async refreshCertificateValidation(certificateId: string): Promise<void> {
    try {
      const cert = await this.getCertificate(certificateId);
      if (!cert) {
        throw new Error(`Certificado ${certificateId} não encontrado`);
      }

      const certFile = path.join(this.certificateDir, `${certificateId}.pem`);
      if (!fs.existsSync(certFile)) {
        throw new Error(`Arquivo de certificado não encontrado`);
      }

      const certificateData = fs.readFileSync(certFile);
      const validation = await this.validateCertificate(certificateData);

      const stmt = db.prepare(`
        UPDATE certificates
        SET is_valid = ?, valid_until = ?
        WHERE id = ?
      `);

      stmt.run(
        validation.isValid ? 1 : 0,
        validation.metadata.validUntil.toISOString(),
        certificateId,
      );

      logger.info(`Validação do certificado ${certificateId} atualizada`);
    } catch (error) {
      logger.error(
        { err: error },
        `Erro ao atualizar validação do certificado`,
      );
      throw error;
    }
  }

  // Private helper methods

  private storeCertificate(certificate: Certificate): void {
    const stmt = db.prepare(`
      INSERT INTO certificates (
        id, user_id, common_name, issuer_name, serial_number, thumbprint,
        public_key, key_type, key_size, valid_from, valid_until, is_valid,
        is_pinned, certificate_type, issuer_type, owner_type, owner_name,
        owner_identifier, uploaded_at, usage_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      certificate.id,
      certificate.userId,
      certificate.commonName,
      certificate.issuerName,
      certificate.serialNumber,
      certificate.thumbprint,
      certificate.publicKey,
      certificate.keyType,
      certificate.keySize,
      certificate.validFrom.toISOString(),
      certificate.validUntil.toISOString(),
      certificate.isValid ? 1 : 0,
      certificate.isPinned ? 1 : 0,
      certificate.certificateType,
      certificate.issuerType,
      certificate.owner.type,
      certificate.owner.name,
      certificate.owner.identifier,
      certificate.uploadedAt.toISOString(),
      certificate.usageCount,
    );
  }

  private rowToCertificate(row: any): Certificate {
    return {
      id: row.id,
      userId: row.user_id,
      commonName: row.common_name,
      issuerName: row.issuer_name,
      serialNumber: row.serial_number,
      thumbprint: row.thumbprint,
      publicKey: row.public_key,
      keyType: row.key_type,
      keySize: row.key_size,
      validFrom: new Date(row.valid_from),
      validUntil: new Date(row.valid_until),
      isValid: row.is_valid === 1,
      isPinned: row.is_pinned === 1,
      certificateType: row.certificate_type,
      issuerType: row.issuer_type,
      owner: {
        type: row.owner_type,
        name: row.owner_name,
        identifier: row.owner_identifier,
      },
      uploadedAt: new Date(row.uploaded_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      usageCount: row.usage_count || 0,
    };
  }

  private generateThumbprint(certificateData: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(certificateData)
      .digest('hex')
      .toUpperCase();
  }

  private extractField(text: string, fieldName: string): string | null {
    const regex = new RegExp(`${fieldName}\\s+(.+?)(?:\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  private extractDateField(text: string, fieldName: string): Date | null {
    const dateStr = this.extractField(text, fieldName);
    if (!dateStr) return null;

    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  private extractPublicKeyBits(certText: string): number {
    const match = certText.match(/Public-Key:\s+\((\d+)\s+bit/);
    return match ? parseInt(match[1], 10) : 2048;
  }

  private extractKeyType(certText: string): 'RSA' | 'ECDSA' {
    if (certText.includes('EC PRIVATE KEY') || certText.includes('ECDSA')) {
      return 'ECDSA';
    }
    return 'RSA';
  }

  private detectCertificateType(
    issuerName: string,
  ): 'A1' | 'A3' | 'A4' {
    // A1: Certificate with private key in software
    // A3: Certificate in hardware or smartcard
    // A4: Remote certificate
    if (issuerName.includes('A3')) return 'A3';
    if (issuerName.includes('A4')) return 'A4';
    return 'A1';
  }

  private detectIssuerType(issuerName: string): 'AC' | 'AR' {
    // AC: Autoridade Certificadora
    // AR: Autoridade de Registro
    return issuerName.includes('AR') ? 'AR' : 'AC';
  }

  private extractOwnerInfo(commonName: string): {
    type: 'person' | 'company';
    name: string;
    identifier: string;
  } {
    // Extract CPF/CNPJ from CN
    // Format typically: "Name:CPF" or "Company Name:CNPJ"
    const parts = commonName.split(':');

    if (parts.length >= 2) {
      const identifier = parts[1].replace(/[^0-9]/g, '');
      const isCompany = identifier.length === 14;

      return {
        type: isCompany ? 'company' : 'person',
        name: parts[0].trim(),
        identifier,
      };
    }

    return {
      type: 'person',
      name: commonName,
      identifier: '',
    };
  }

  private async validateCertificateChain(
    certFilePath: string,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    try {
      // Basic chain validation using openssl
      const chainValidation = execSync(
        `openssl verify ${certFilePath} 2>&1 || true`,
        { encoding: 'utf-8' },
      );

      const isValid = chainValidation.includes('OK');
      const errors = isValid
        ? []
        : [chainValidation.split('\n')[0] || 'Cadeia inválida'];

      return { isValid, errors };
    } catch (error) {
      logger.warn('Não foi possível validar cadeia de certificados completa');
      return { isValid: false, errors: ['Validação de cadeia indisponível'] };
    }
  }
}

export default new CertificateService();
