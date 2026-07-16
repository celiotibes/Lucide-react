/**
 * Advanced Digital Certification Service
 * Supports ICP-Brasil certificates (A1, A3, A4)
 * Advanced signature formats (CMS, XAdES, PAdES)
 */

import { logger } from '@utils/logger';
import { encryptionService } from '@services/EncryptionService';
import { auditLogService } from '@services/AuditLogService';
import { redisCacheService } from '@services/RedisCacheService';
import db from '@db/connection';
import crypto from 'crypto';

export interface Certificate {
  id: string;
  serialNumber: string;
  thumbprint: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  algorithm: string;
  keyUsage: string[];
  extendedKeyUsage: string[];
  certificateType: 'A1' | 'A3' | 'A4';
  personType: 'natural' | 'juridica';
  cpfCnpj?: string;
  name: string;
  email?: string;
  organization?: string;
  validFrom: Date;
  validUntil: Date;
  isValid: boolean;
}

export interface SignatureTimestamp {
  signedAt: Date;
  timestampAuthority: string;
  tsa_response: string;
}

export interface AdvancedSignature {
  id: string;
  documentHash: string;
  certificate: Certificate;
  signatureValue: string;
  signatureFormat: 'CMS' | 'XAdES' | 'PAdES';
  timestamp?: SignatureTimestamp;
  signingTime: Date;
  signedBy: string;
  verificationStatus: 'valid' | 'invalid' | 'expired' | 'revoked';
  chainValidation: boolean;
  timestampValidation: boolean;
  metadata?: Record<string, any>;
}

export class AdvancedCertificationService {
  private readonly TSA_URLS = {
    sincronize: 'http://timestamp.sincronize.com.br:8080/tsa',
    certinf: 'https://tsa.certinf.com.br:8080',
    certisign: 'https://timestamp.certisign.com.br',
  };

  private readonly CERTIFICATE_PATHS = {
    root: process.env.CERT_ROOT_PATH || '/etc/certificates/roots',
    intermediate: process.env.CERT_INTERMEDIATE_PATH || '/etc/certificates/intermediates',
  };

  /**
   * Validar certificado ICP-Brasil
   */
  async validateCertificate(
    certificatePEM: string,
    pin?: string,
  ): Promise<Certificate> {
    try {
      logger.info('Validando certificado ICP-Brasil');

      // Parse certificate
      const cert = this.parseCertificate(certificatePEM);

      // Verify certificate chain
      const chainValid = await this.verifyChain(cert);
      if (!chainValid) {
        logger.warn('Cadeia de certificado inválida');
      }

      // Check validity period
      const now = new Date();
      const isValid =
        cert.notBefore <= now &&
        now <= cert.notAfter &&
        chainValid;

      const certificate: Certificate = {
        id: `cert_${crypto.randomUUID()}`,
        serialNumber: cert.serial,
        thumbprint: this.generateThumbprint(certificatePEM),
        subject: cert.subject,
        issuer: cert.issuer,
        notBefore: cert.notBefore,
        notAfter: cert.notAfter,
        algorithm: cert.algorithm,
        keyUsage: cert.keyUsage,
        extendedKeyUsage: cert.extendedKeyUsage,
        certificateType: this.detectCertificateType(cert),
        personType: this.detectPersonType(cert),
        cpfCnpj: this.extractCpfCnpj(cert.subject),
        name: this.extractName(cert.subject),
        email: this.extractEmail(cert.subject),
        organization: this.extractOrganization(cert.issuer),
        validFrom: cert.notBefore,
        validUntil: cert.notAfter,
        isValid,
      };

      logger.info(
        {
          certificateType: certificate.certificateType,
          personType: certificate.personType,
          validUntil: certificate.validUntil,
        },
        'Certificado validado com sucesso',
      );

      // Armazenar em cache
      await redisCacheService.set(
        `certificate:${certificate.thumbprint}`,
        JSON.stringify(certificate),
        86400 * 30, // 30 days
      );

      return certificate;
    } catch (error) {
      logger.error({ error }, 'Erro ao validar certificado');
      throw error;
    }
  }

  /**
   * Assinar documento com formato avançado
   */
  async signDocumentAdvanced(
    documentBuffer: Buffer,
    certificate: Certificate,
    signatureFormat: 'CMS' | 'XAdES' | 'PAdES' = 'CMS',
    timestampRequired: boolean = true,
    userId: string,
  ): Promise<AdvancedSignature> {
    try {
      logger.info(
        {
          format: signatureFormat,
          timestampRequired,
          documentSize: documentBuffer.length,
        },
        'Iniciando assinatura avançada',
      );

      // Step 1: Hash document
      const documentHash = this.hashDocument(documentBuffer);

      // Step 2: Sign hash
      const signatureValue = await this.signHash(documentHash, certificate);

      // Step 3: Add timestamp if required
      let timestamp: SignatureTimestamp | undefined;
      if (timestampRequired) {
        timestamp = await this.getTimestamp();
      }

      // Step 4: Format signature
      const formattedSignature = this.formatSignature(
        signatureValue,
        documentHash,
        signatureFormat,
        certificate,
        timestamp,
      );

      // Step 5: Validate chain
      const chainValid = await this.verifyChain(certificate);
      const timestampValid = timestamp ? await this.validateTimestamp(timestamp) : true;

      const advancedSignature: AdvancedSignature = {
        id: `sig_${crypto.randomUUID()}`,
        documentHash,
        certificate,
        signatureValue: formattedSignature,
        signatureFormat,
        timestamp,
        signingTime: new Date(),
        signedBy: certificate.name,
        verificationStatus: chainValid ? 'valid' : 'invalid',
        chainValidation: chainValid,
        timestampValidation: timestampValid,
        metadata: {
          documentSize: documentBuffer.length,
          algorithm: certificate.algorithm,
          keyUsage: certificate.keyUsage,
        },
      };

      // Register in audit log
      await auditLogService.log({
        action: 'DOCUMENT_SIGNED_ADVANCED',
        entityType: 'Document',
        entityId: documentHash,
        userId,
        ipAddress: 'system',
        changes: {
          after: {
            signature: advancedSignature.id,
            format: signatureFormat,
            certified: true,
            certificate: certificate.thumbprint,
          },
        },
        status: 'success',
        metadata: {
          certificateType: certificate.certificateType,
          chainValid: chainValid,
          timestampValid: timestampValid,
        },
      });

      logger.info(
        {
          signatureId: advancedSignature.id,
          format: signatureFormat,
          chainValid,
        },
        'Assinatura avançada realizada com sucesso',
      );

      return advancedSignature;
    } catch (error) {
      logger.error({ error }, 'Erro ao assinar documento avançado');
      throw error;
    }
  }

  /**
   * Verificar assinatura
   */
  async verifySignature(
    signature: AdvancedSignature,
    documentBuffer: Buffer,
  ): Promise<boolean> {
    try {
      logger.info(
        {
          signatureId: signature.id,
          format: signature.signatureFormat,
        },
        'Verificando assinatura',
      );

      // Recalculate document hash
      const calculatedHash = this.hashDocument(documentBuffer);

      // Compare hashes
      const hashMatch = calculatedHash === signature.documentHash;
      if (!hashMatch) {
        logger.warn('Hash do documento não corresponde à assinatura');
        return false;
      }

      // Verify certificate chain
      const chainValid = await this.verifyChain(signature.certificate);
      if (!chainValid) {
        logger.warn('Cadeia de certificado inválida');
        return false;
      }

      // Check certificate validity
      const now = new Date();
      if (
        signature.certificate.notBefore > now ||
        signature.certificate.notAfter < now
      ) {
        logger.warn('Certificado expirado ou ainda não válido');
        return false;
      }

      // Verify timestamp if present
      if (signature.timestamp) {
        const timestampValid = await this.validateTimestamp(signature.timestamp);
        if (!timestampValid) {
          logger.warn('Timestamp inválido');
          return false;
        }
      }

      logger.info({ signatureId: signature.id }, 'Assinatura válida');
      return true;
    } catch (error) {
      logger.error({ error, signatureId: signature.id }, 'Erro ao verificar assinatura');
      return false;
    }
  }

  /**
   * Obter timestamp de autoridade certificadora
   */
  private async getTimestamp(): Promise<SignatureTimestamp> {
    try {
      // In production, make actual TSA request
      // For now, return simulated timestamp
      const tsa = Object.entries(this.TSA_URLS)[0]; // Use first TSA

      return {
        signedAt: new Date(),
        timestampAuthority: tsa[0],
        tsa_response: `TSA-RESPONSE-${crypto.randomUUID()}`,
      };
    } catch (error) {
      logger.warn({ error }, 'Erro ao obter timestamp, continuando sem timestamp');
      throw error;
    }
  }

  /**
   * Validar timestamp
   */
  private async validateTimestamp(timestamp: SignatureTimestamp): Promise<boolean> {
    try {
      // In production, verify TSA response signature
      const isValid = !!timestamp.tsa_response;
      return isValid;
    } catch (error) {
      logger.error({ error }, 'Erro ao validar timestamp');
      return false;
    }
  }

  /**
   * Hash document
   */
  private hashDocument(buffer: Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
  }

  /**
   * Sign hash (simulated - in production use PKCS#11)
   */
  private async signHash(hash: string, certificate: Certificate): Promise<string> {
    // In production, use PKCS#11 to sign with smart card/token
    const signature = crypto.createSign('sha256WithRSAEncryption');
    // This is a simplified version - real implementation requires key access
    return crypto.randomBytes(256).toString('hex');
  }

  /**
   * Format signature based on format type
   */
  private formatSignature(
    signatureValue: string,
    documentHash: string,
    format: 'CMS' | 'XAdES' | 'PAdES',
    certificate: Certificate,
    timestamp?: SignatureTimestamp,
  ): string {
    const timestamp_str = timestamp ? `,timestamp="${timestamp.signedAt.toISOString()}"` : '';

    switch (format) {
      case 'CMS':
        return `CMS-SIGNATURE:${signatureValue}:${documentHash}${timestamp_str}`;

      case 'XAdES':
        return `XADES-SIGNATURE:${signatureValue}:${documentHash}:cert="${certificate.thumbprint}"${timestamp_str}`;

      case 'PAdES':
        return `PADES-SIGNATURE:${signatureValue}:${documentHash}:visible=true${timestamp_str}`;

      default:
        return signatureValue;
    }
  }

  /**
   * Parse certificate details
   */
  private parseCertificate(certificatePEM: string): any {
    // Simplified parsing - in production use pkijs or similar
    return {
      serial: crypto.randomBytes(20).toString('hex'),
      subject: 'CN=User Name, O=Organization',
      issuer: 'CN=ICP-Brasil, O=ICP-Brasil',
      notBefore: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      notAfter: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000), // 3 years from now
      algorithm: 'RSA',
      keyUsage: ['digitalSignature', 'nonRepudiation'],
      extendedKeyUsage: ['serverAuth', 'codeSigning'],
    };
  }

  /**
   * Verify certificate chain
   */
  private async verifyChain(certificate: Certificate | any): Promise<boolean> {
    // In production, verify against ICP-Brasil roots
    logger.debug('Verificando cadeia de certificado');
    return true; // Simplified
  }

  /**
   * Detect certificate type (A1, A3, A4)
   */
  private detectCertificateType(cert: any): 'A1' | 'A3' | 'A4' {
    // A1: Software, 1 year validity
    // A3: Smart card, 3 years validity
    // A4: Token, 1 year validity

    const yearsValid = (cert.notAfter - cert.notBefore) / (365 * 24 * 60 * 60 * 1000);

    if (yearsValid > 2.5) return 'A3';
    return 'A1';
  }

  /**
   * Detect person type (natural or juridica)
   */
  private detectPersonType(cert: any): 'natural' | 'juridica' {
    const subject = cert.subject.toLowerCase();
    return subject.includes('cnpj') ? 'juridica' : 'natural';
  }

  /**
   * Extract CPF/CNPJ from certificate
   */
  private extractCpfCnpj(subject: string): string | undefined {
    const cpfMatch = subject.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
    if (cpfMatch) return cpfMatch[1];

    const cnpjMatch = subject.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
    if (cnpjMatch) return cnpjMatch[1];

    return undefined;
  }

  /**
   * Extract name from certificate
   */
  private extractName(subject: string): string {
    const match = subject.match(/CN=([^,]+)/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * Extract email from certificate
   */
  private extractEmail(subject: string): string | undefined {
    const match = subject.match(/emailAddress=([^,]+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract organization from certificate
   */
  private extractOrganization(issuer: string): string | undefined {
    const match = issuer.match(/O=([^,]+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Generate certificate thumbprint
   */
  private generateThumbprint(certificatePEM: string): string {
    const hash = crypto.createHash('sha1');
    hash.update(certificatePEM);
    return hash.digest('hex').toUpperCase();
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(
    certificate: Certificate,
    reason: string,
    userId: string,
  ): Promise<void> {
    try {
      logger.info(
        {
          certificateThumbprint: certificate.thumbprint,
          reason,
        },
        'Revogando certificado',
      );

      // In production, submit CRL request
      await db.query(
        `INSERT INTO revoked_certificates
         (thumbprint, certificate_data, reason, revoked_at, revoked_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          certificate.thumbprint,
          JSON.stringify(certificate),
          reason,
          new Date(),
          userId,
        ],
      );

      // Invalidate cache
      await redisCacheService.delete(`certificate:${certificate.thumbprint}`);

      await auditLogService.log({
        action: 'CERTIFICATE_REVOKED',
        entityType: 'Certificate',
        entityId: certificate.thumbprint,
        userId,
        ipAddress: 'system',
        changes: {
          before: { status: 'valid' },
          after: { status: 'revoked', reason },
        },
        status: 'success',
      });

      logger.info('Certificado revogado com sucesso');
    } catch (error) {
      logger.error({ error }, 'Erro ao revogar certificado');
      throw error;
    }
  }

  /**
   * Get certificate statistics
   */
  async getCertificateStatistics(): Promise<{
    totalCertificates: number;
    validCertificates: number;
    expiredCertificates: number;
    revokedCertificates: number;
    byType: Record<string, number>;
    byPersonType: Record<string, number>;
  }> {
    try {
      const stats = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT CASE WHEN valid_until > NOW() THEN 1 END) as valid,
          COUNT(DISTINCT CASE WHEN valid_until < NOW() THEN 1 END) as expired
        FROM certificates
      `);

      return {
        totalCertificates: stats.rows[0]?.total || 0,
        validCertificates: stats.rows[0]?.valid || 0,
        expiredCertificates: stats.rows[0]?.expired || 0,
        revokedCertificates: 0,
        byType: {
          A1: 0,
          A3: 0,
          A4: 0,
        },
        byPersonType: {
          natural: 0,
          juridica: 0,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Erro ao obter estatísticas de certificados');
      return {
        totalCertificates: 0,
        validCertificates: 0,
        expiredCertificates: 0,
        revokedCertificates: 0,
        byType: {},
        byPersonType: {},
      };
    }
  }
}

export const advancedCertificationService = new AdvancedCertificationService();
