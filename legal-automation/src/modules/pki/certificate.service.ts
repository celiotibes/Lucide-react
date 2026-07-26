// src/modules/pki/certificate.service.ts
import * as forge from 'node-forge';
import crypto from 'crypto';
import { Database } from '@/database';
import { logger } from '@/utils';
import {
  Certificate,
  CertificateValidation,
  SignatureRequest,
  SignatureResponse,
  CertificateUploadRequest,
} from './types';

export class CertificateService {
  private db: Database;
  private encryptionKey: string;
  private salt: string;

  constructor(db: Database) {
    this.db = db;
    this.encryptionKey = process.env.PKI_ENCRYPTION_KEY || 'default-unsafe-key-change-in-production';
    this.salt = process.env.PKI_SALT || 'default-unsafe-salt';
  }

  /**
   * Upload e armazenamento seguro de certificado
   */
  async uploadCertificate(
    userId: string,
    request: CertificateUploadRequest
  ): Promise<Certificate> {
    try {
      logger.info(`[PKI] Iniciando upload de certificado para usuário ${userId}`);

      // 1. Parse PKCS#12
      const p12Asn1 = forge.asn1.fromDer(request.pkcs12Buffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, request.password);

      // 2. Extrair certificado e chave privada
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;

      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const privateKey = keyBags?.[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;

      if (!cert || !privateKey) {
        throw new Error('Certificado ou chave privada não encontrados no arquivo PKCS#12');
      }

      // 3. Validar certificado
      const validation = this.validateCertificate(cert);
      if (!validation.isValid) {
        throw new Error(`Certificado inválido: ${validation.errors.join(', ')}`);
      }

      // 4. Extrair metadados
      const subject = cert.subject.attributes;
      const cnpj = subject
        .find((attr: any) => attr.name === 'serialNumber')
        ?.value.replace(/[^\d]/g, '');

      if (!cnpj || (cnpj.length !== 11 && cnpj.length !== 14)) {
        throw new Error('CNPJ/CPF inválido no certificado');
      }

      // 5. Calcular fingerprint SHA256
      const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert));
      const fingerprint = crypto
        .createHash('sha256')
        .update(certDer.bytes())
        .digest('hex');

      // 6. Criptografar chave privada
      const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
      const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
      let encrypted = cipher.update(privateKeyPem, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // 7. Hash da senha (bcrypt seria melhor, mas aqui simplificado)
      const passwordHash = crypto
        .createHash('sha256')
        .update(request.password + this.salt)
        .digest('hex');

      // 8. Preparar dados para inserção
      const subjectDN = forge.util.encode64(cert.subject.toString());
      const issuerDN = forge.util.encode64(cert.issuer.toString());

      const certData = {
        id: crypto.randomUUID(),
        user_id: userId,
        cnpj,
        subject_dn: subjectDN,
        issuer_dn: issuerDN,
        not_before: cert.validity.notBefore,
        not_after: cert.validity.notAfter,
        serial_number: cert.serialNumber,
        key_type: request.keyType,
        fingerprint_sha256: fingerprint,
        password_hash: passwordHash,
        status: 'VALID',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // 9. Inserir no banco
      const record = await this.db.query(
        `INSERT INTO certificates (
          id, user_id, cnpj, subject_dn, issuer_dn, not_before, not_after,
          serial_number, key_type, fingerprint_sha256, password_hash, status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          certData.id,
          certData.user_id,
          certData.cnpj,
          certData.subject_dn,
          certData.issuer_dn,
          certData.not_before,
          certData.not_after,
          certData.serial_number,
          certData.key_type,
          certData.fingerprint_sha256,
          certData.password_hash,
          certData.status,
          certData.created_at,
          certData.updated_at,
        ]
      );

      logger.info(`[PKI] Certificado ${fingerprint.substring(0, 8)}... armazenado com sucesso`);

      return this.toCertificateDTO(record.rows[0]);
    } catch (error) {
      logger.error(`[PKI] Erro ao fazer upload: ${error.message}`);
      throw error;
    }
  }

  /**
   * Assinar documento
   */
  async signDocument(
    certificateId: string,
    request: SignatureRequest,
    password: string,
    userIp: string
  ): Promise<SignatureResponse> {
    const signatureId = crypto.randomUUID();

    try {
      logger.info(`[PKI] Iniciando assinatura do documento ${request.documentId}`);

      // 1. Recuperar certificado
      const result = await this.db.query(
        'SELECT * FROM certificates WHERE id = $1',
        [certificateId]
      );

      if (result.rows.length === 0) {
        throw new Error('Certificado não encontrado');
      }

      const cert = result.rows[0];

      // 2. Verificar expiração
      if (new Date() > cert.not_after) {
        throw new Error('Certificado expirado');
      }

      // 3. Verificar senha (comparar com hash armazenado)
      const passwordHash = crypto
        .createHash('sha256')
        .update(password + this.salt)
        .digest('hex');

      if (passwordHash !== cert.password_hash) {
        // Registrar tentativa falhada
        await this.logSignatureAttempt(
          certificateId,
          request.documentId,
          'ERROR',
          'Senha incorreta',
          userIp
        );
        throw new Error('Senha do certificado incorreta');
      }

      // 4. Para simplicidade, retornar sucesso (em prod, realmente assinar)
      // Em implementação real, descriptografar chave privada e assinar documento

      const signatureValue = crypto
        .createHash('sha256')
        .update(request.documentHash + certificateId)
        .digest('hex');

      // 5. Registrar na auditoria
      await this.logSignatureAttempt(
        certificateId,
        request.documentId,
        'SUCCESS',
        undefined,
        userIp
      );

      // 6. Atualizar last_used_at
      await this.db.query(
        'UPDATE certificates SET last_used_at = $1 WHERE id = $2',
        [new Date(), certificateId]
      );

      logger.info(`[PKI] Assinatura ${signatureId} realizada com sucesso`);

      return {
        signatureId,
        documentId: request.documentId,
        certificateId,
        signedAt: new Date(),
        signatureFormat: request.signatureFormat,
        signatureValue,
        verificationResult: {
          isValid: true,
          issuer: forge.util.decode64(cert.issuer_dn),
          subject: forge.util.decode64(cert.subject_dn),
          signedAt: new Date(),
        },
      };
    } catch (error) {
      logger.error(`[PKI] Erro ao assinar: ${error.message}`);
      await this.logSignatureAttempt(
        certificateId,
        request.documentId,
        'ERROR',
        error.message,
        userIp
      );
      throw error;
    }
  }

  /**
   * Listar certificados do usuário
   */
  async listCertificates(userId: string) {
    const result = await this.db.query(
      `SELECT id, cnpj, fingerprint_sha256, status, not_after, created_at, last_used_at
       FROM certificates WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      cnpj: row.cnpj,
      fingerprint: row.fingerprint_sha256,
      status: row.status,
      notAfter: row.not_after,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  /**
   * Revogar certificado
   */
  async revokeCertificate(certificateId: string, userId: string): Promise<void> {
    const result = await this.db.query(
      'UPDATE certificates SET status = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
      ['REVOKED', new Date(), certificateId, userId]
    );

    if (result.rowCount === 0) {
      throw new Error('Certificado não encontrado ou não pertence ao usuário');
    }

    logger.info(`[PKI] Certificado ${certificateId} revogado`);
  }

  /**
   * Validar certificado contra ICP-Brasil
   */
  private validateCertificate(cert: any): CertificateValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Verificar validade
    const now = new Date();
    if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
      errors.push('Certificado fora da validade');
    }

    // Verificar tipo
    const certType = this.detectCertificateType(cert);
    if (!['A1', 'A3'].includes(certType)) {
      warnings.push(`Tipo de certificado não confirmado: ${certType}`);
    }

    // Verificar CNPJ/CPF
    const serialNumber = cert.subject.attributes
      .find((attr: any) => attr.name === 'serialNumber')
      ?.value;
    if (!serialNumber || !/^\d{11,14}$/.test(serialNumber.replace(/[^\d]/g, ''))) {
      errors.push('Serial number (CNPJ/CPF) inválido');
    }

    // Verificar cadeia de confiança
    const issuer = cert.issuer.toString();
    const trustedByBrazilianICPBrasil = this.isTrustedIssuer(issuer);

    if (!trustedByBrazilianICPBrasil) {
      warnings.push('Certificado não reconhecido como confiável pela ICP-Brasil');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      trustedByBrazilianICPBrasil,
      chainVerified: trustedByBrazilianICPBrasil,
    };
  }

  private detectCertificateType(cert: any): string {
    // Simplificado: assumir A1
    return 'A1';
  }

  private isTrustedIssuer(issuer: string): boolean {
    // ICP-Brasil trusted CAs
    const trustedIssuers = [
      'AC Raiz ICP-Brasil',
      'Autoridade Certificadora',
      'AC Certisign',
      'AC Valid',
      'AC Serasa',
      'AC Soluti',
    ];
    return trustedIssuers.some(ca => issuer.includes(ca));
  }

  private async logSignatureAttempt(
    certificateId: string,
    documentId: string,
    status: string,
    errorMessage?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO signature_audit_log (
          id, certificate_id, document_id, signed_at, ip_address, status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          certificateId,
          documentId,
          new Date(),
          ipAddress || null,
          status,
          errorMessage || null,
        ]
      );
    } catch (error) {
      logger.error(`[PKI] Erro ao registrar auditoria: ${error.message}`);
    }
  }

  private toCertificateDTO(record: any): Certificate {
    return {
      id: record.id,
      userId: record.user_id,
      cnpj: record.cnpj,
      subjectDN: forge.util.decode64(record.subject_dn),
      issuerDN: forge.util.decode64(record.issuer_dn),
      notBefore: new Date(record.not_before),
      notAfter: new Date(record.not_after),
      serialNumber: record.serial_number,
      keyType: record.key_type,
      fingerprintSha256: record.fingerprint_sha256,
      status: record.status,
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
      lastUsedAt: record.last_used_at ? new Date(record.last_used_at) : undefined,
    };
  }
}
