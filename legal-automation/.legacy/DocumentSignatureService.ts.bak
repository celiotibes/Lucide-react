import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import db from '@db/connection';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import CertificateService from '@services/CertificateService';
import {
  DocumentSignature,
  SignDocumentRequest,
  SignDocumentResponse,
  VerifySignatureRequest,
  SignatureValidationResult,
  TimestampRequest,
  TimestampToken,
  PetitionSigningRequest,
  PetitionSigningResponse,
  SignatureAuditLog,
  SignatureError,
  SignatureVerificationError,
  ExpiredCertificateError,
  TimestampError,
} from '@/types/digitalSignature';

export class DocumentSignatureService {
  private signatureDir = path.join(config.dataDir || './data', 'signatures');
  private timestampAuthorityUrl =
    config.timestampAuthorityUrl ||
    'http://timestamp.digicert.com';

  constructor() {
    if (!fs.existsSync(this.signatureDir)) {
      fs.mkdirSync(this.signatureDir, { recursive: true });
    }
  }

  async signDocument(
    userId: string,
    request: SignDocumentRequest,
  ): Promise<SignDocumentResponse> {
    const startTime = Date.now();

    try {
      logger.info(`Iniciando assinatura de documento para usuário ${userId}`);

      // Validate certificate
      const certificate = await CertificateService.getCertificate(
        request.certificateId,
        userId,
      );
      if (!certificate) {
        return {
          success: false,
          timestamp: new Date(),
          message: 'Certificado não encontrado',
          error: 'CERTIFICATE_NOT_FOUND',
        };
      }

      // Check certificate validity
      if (!certificate.isValid) {
        return {
          success: false,
          timestamp: new Date(),
          message: 'Certificado inválido',
          error: 'INVALID_CERTIFICATE',
        };
      }

      if (certificate.validUntil < new Date()) {
        return {
          success: false,
          timestamp: new Date(),
          message: 'Certificado expirado',
          error: 'EXPIRED_CERTIFICATE',
        };
      }

      // Get document content
      let documentContent: Buffer;
      if (request.documentContent) {
        documentContent = request.documentContent;
      } else if (request.documentId) {
        documentContent = await this.getStoredDocument(request.documentId);
      } else {
        return {
          success: false,
          timestamp: new Date(),
          message: 'Conteúdo do documento não fornecido',
          error: 'NO_DOCUMENT_CONTENT',
        };
      }

      // Calculate content hash
      const contentHash = crypto
        .createHash('sha256')
        .update(documentContent)
        .digest('hex');

      // Create signature
      const signatureFormat = request.format || 'CMS';
      const signatureValue = await this.createSignature(
        documentContent,
        certificate,
        request.password,
      );

      // Generate signature ID
      const signatureId = crypto.randomUUID();
      const timestamp = new Date();

      // Add RFC 3161 timestamp if requested
      let timestampToken: TimestampToken | undefined;
      if (request.timestamps) {
        try {
          timestampToken = await this.addTimestamp(
            Buffer.from(signatureValue, 'base64'),
          );
        } catch (error) {
          logger.warn({ err: error }, 'Falha ao adicionar timestamp');
          // Continue without timestamp
        }
      }

      // Create signature record
      const signature: DocumentSignature = {
        id: signatureId,
        documentId: request.documentId || contentHash,
        signerId: userId,
        certificateId: request.certificateId,
        signatureValue,
        signatureAlgorithm: 'SHA256withRSA',
        signingTime: timestamp,
        location: request.signatureLocation,
        reason: request.signatureReason,
        contentType: 'application/octet-stream',
        contentHash,
        signatureFormat: signatureFormat as 'CMS' | 'XAdES' | 'PAdES',
        trustLevel: 'unknown',
      };

      // Store signature record
      this.storeSignature(signature);

      // Create signed document
      const signedDocument = await this.createSignedDocument(
        documentContent,
        signature,
        signatureFormat,
      );

      // Log signature audit
      await this.auditLog(userId, request.certificateId, 'document_signed', {
        documentName: request.documentName,
        signatureFormat,
        documentHash: contentHash,
      });

      logger.info(
        `✓ Documento assinado com sucesso: ${signatureId} (${Date.now() - startTime}ms)`,
      );

      return {
        success: true,
        signatureId,
        signedDocument,
        signedDocumentBase64: signedDocument.toString('base64'),
        timestamp,
        message: 'Documento assinado com sucesso',
        certificateInfo: {
          subject: certificate.commonName,
          issuer: certificate.issuerName,
          serialNumber: certificate.serialNumber,
        },
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao assinar documento');

      await this.auditLog(userId, request.certificateId, 'document_signed', {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });

      return {
        success: false,
        timestamp: new Date(),
        message: 'Falha ao assinar documento',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  async verifySignature(
    request: VerifySignatureRequest,
  ): Promise<SignatureValidationResult> {
    try {
      logger.info('Verificando assinatura de documento');

      // Get signed document
      const signedDocument =
        typeof request.signedDocument === 'string'
          ? Buffer.from(request.signedDocument, 'base64')
          : request.signedDocument;

      // Verify signature using openssl
      const tempSignedFile = path.join(
        this.signatureDir,
        `temp-signed-${Date.now()}.p7m`,
      );
      const tempOriginalFile = path.join(
        this.signatureDir,
        `temp-original-${Date.now()}.bin`,
      );

      fs.writeFileSync(tempSignedFile, signedDocument);

      try {
        // Extract signer information
        const signerInfo = execSync(
          `openssl cms -in ${tempSignedFile} -inform DER -noout -print 2>/dev/null || openssl cms -in ${tempSignedFile} -inform PEM -noout -print`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        );

        // Extract certificate information
        const certInfo = execSync(
          `openssl cms -in ${tempSignedFile} -inform DER -noout -signer /dev/null 2>/dev/null || true`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        );

        // Verify signature authenticity
        const isValid = await this.verifySignatureAuthenticity(tempSignedFile);

        return {
          isValid,
          signatureTimestamp: new Date(),
          signerCertificate: {
            subject: this.extractCertField(signerInfo, 'Subject:'),
            issuer: this.extractCertField(signerInfo, 'Issuer:'),
            serialNumber: this.extractCertField(
              signerInfo,
              'Serial Number:',
            ),
            validFrom: new Date(),
            validUntil: new Date(),
          },
          contentHash: this.calculateDocumentHash(
            request.originalDocument || signedDocument,
          ),
          hashAlgorithm: 'SHA256',
          signatureAlgorithm: 'RSA-SHA256',
          errors: isValid
            ? []
            : ['Falha na verificação de assinatura'],
          warnings: [],
        };
      } finally {
        // Clean up temporary files
        [tempSignedFile, tempOriginalFile].forEach((file) => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao verificar assinatura');
      throw new SignatureVerificationError(
        `Falha na verificação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
    }
  }

  async addTimestamp(content: Buffer): Promise<TimestampToken> {
    try {
      logger.info('Solicitando timestamp de Autoridade de Timestamp');

      // Create timestamp request
      const tsRequest = this.createTimestampRequest(content);

      // Request timestamp from authority
      const response = await this.requestTimestamp(tsRequest);

      return {
        timestamp: new Date(),
        tsa: this.timestampAuthorityUrl,
        token: response.toString('base64'),
        serialNumber: crypto.randomBytes(16).toString('hex'),
        hashAlgorithm: 'SHA256',
        isValid: true,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter timestamp');
      throw new TimestampError(
        `Falha ao obter timestamp: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
    }
  }

  async signPetition(
    userId: string,
    request: PetitionSigningRequest,
  ): Promise<PetitionSigningResponse> {
    try {
      logger.info(`Assinando petição ${request.petitionId}`);

      // Get certificate
      const certificate = await CertificateService.getCertificate(
        request.certificateId,
        userId,
      );
      if (!certificate) {
        throw new Error('Certificado não encontrado');
      }

      // Check expiration
      if (certificate.validUntil < new Date()) {
        throw new ExpiredCertificateError(certificate.validUntil);
      }

      // Sign petition content
      const signatureValue = await this.createSignature(
        request.petitionContent,
        certificate,
        request.password,
      );

      // Add attachments if present
      let signedContent = request.petitionContent;
      if (request.attachments && request.attachments.length > 0) {
        signedContent = await this.bundleWithAttachments(
          request.petitionContent,
          request.attachments,
        );
      }

      // Create signed document
      const signedPetition = await this.createSignedDocument(
        signedContent,
        {
          id: request.petitionId,
          documentId: request.petitionId,
          signerId: userId,
          certificateId: request.certificateId,
          signatureValue,
          signatureAlgorithm: 'SHA256withRSA',
          signingTime: new Date(),
          contentType: 'application/octet-stream',
          contentHash: crypto
            .createHash('sha256')
            .update(signedContent)
            .digest('hex'),
          signatureFormat: request.signatureFormat || 'PAdES',
          trustLevel: 'unknown',
        },
        request.signatureFormat || 'PAdES',
      );

      // Add timestamp if requested
      let timestamp: TimestampToken | undefined;
      if (request.includeTimestamp) {
        try {
          timestamp = await this.addTimestamp(signedPetition);
        } catch (error) {
          logger.warn({ err: error }, 'Falha ao adicionar timestamp à petição');
        }
      }

      // Log audit
      await this.auditLog(userId, request.certificateId, 'document_signed', {
        petitionId: request.petitionId,
        signerName: request.signerName,
        signerCPF: request.signerCPF,
      });

      logger.info(`✓ Petição ${request.petitionId} assinada com sucesso`);

      return {
        success: true,
        petitionId: request.petitionId,
        signatureId: crypto.randomUUID(),
        signedPetition,
        signatureMetadata: {
          signerName: request.signerName,
          signerCPF: request.signerCPF,
          signingTime: new Date(),
          certificateSubject: certificate.commonName,
          certificateIssuer: certificate.issuerName,
        },
        timestamp,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao assinar petição');

      return {
        success: false,
        petitionId: request.petitionId,
        signatureId: '',
        signedPetition: Buffer.from(''),
        signatureMetadata: {
          signerName: request.signerName,
          signerCPF: request.signerCPF,
          signingTime: new Date(),
          certificateSubject: '',
          certificateIssuer: '',
        },
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  async getSignature(signatureId: string): Promise<DocumentSignature | null> {
    try {
      const stmt = db.prepare(`
        SELECT * FROM document_signatures
        WHERE id = ?
      `);

      const result = stmt.get(signatureId) as any;
      return result ? this.rowToSignature(result) : null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao recuperar assinatura ${signatureId}`);
      throw error;
    }
  }

  async auditLog(
    userId: string,
    certificateId: string,
    action: string,
    details: Record<string, any>,
  ): Promise<void> {
    try {
      const stmt = db.prepare(`
        INSERT INTO signature_audit_logs
        (id, user_id, certificate_id, action, status, details, timestamp, lgpd_compliant)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        crypto.randomUUID(),
        userId,
        certificateId,
        action,
        details.status || 'success',
        JSON.stringify(details),
        new Date().toISOString(),
        1, // LGPD compliant
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao registrar auditoria de assinatura');
    }
  }

  // Private helper methods

  private async createSignature(
    content: Buffer,
    certificate: any,
    password?: string,
  ): Promise<string> {
    // Create digital signature using certificate
    // This would use OpenSSL or a library like node-forge

    const hash = crypto.createHash('sha256').update(content).digest();

    // In production, this would use the actual private key
    // For now, simulate with HMAC
    const signature = crypto
      .createHmac('sha256', Buffer.from(certificate.thumbprint))
      .update(content)
      .digest();

    return signature.toString('base64');
  }

  private async createSignedDocument(
    documentContent: Buffer,
    signature: DocumentSignature,
    format: 'CMS' | 'XAdES' | 'PAdES',
  ): Promise<Buffer> {
    // Create signed document based on format
    // CMS: PKCS#7 format
    // XAdES: XML Advanced Electronic Signatures
    // PAdES: PDF Advanced Electronic Signatures

    if (format === 'PAdES') {
      return await this.createPAdESSignature(documentContent, signature);
    } else if (format === 'XAdES') {
      return await this.createXAdESSignature(documentContent, signature);
    } else {
      return await this.createCMSSignature(documentContent, signature);
    }
  }

  private async createCMSSignature(
    content: Buffer,
    signature: DocumentSignature,
  ): Promise<Buffer> {
    // Create CMS/PKCS#7 signed data
    const signatureData = {
      contentType: signature.contentType,
      content: content.toString('base64'),
      signature: signature.signatureValue,
      signatureAlgorithm: signature.signatureAlgorithm,
      signingTime: signature.signingTime,
    };

    return Buffer.from(JSON.stringify(signatureData));
  }

  private async createXAdESSignature(
    content: Buffer,
    signature: DocumentSignature,
  ): Promise<Buffer> {
    // Create XAdES signed data (XML format)
    const xadesXml = `<?xml version="1.0" encoding="UTF-8"?>
<XAdESSignatures xmlns="http://uri.etsi.org/01903/v1.3.2#">
  <Signature>
    <SigningTime>${signature.signingTime.toISOString()}</SigningTime>
    <SignatureAlgorithm>${signature.signatureAlgorithm}</SignatureAlgorithm>
    <SignatureValue>${signature.signatureValue}</SignatureValue>
    <ContentHash>${signature.contentHash}</ContentHash>
  </Signature>
</XAdESSignatures>`;

    return Buffer.from(xadesXml, 'utf-8');
  }

  private async createPAdESSignature(
    content: Buffer,
    signature: DocumentSignature,
  ): Promise<Buffer> {
    // Create PAdES signed PDF
    // This would require a PDF library to embed signature
    // For now, return wrapped content

    const padesWrapper = `PDF_SIGNATURE_ENVELOPE
Content-Type: application/pdf
Signature-Value: ${signature.signatureValue}
Signing-Time: ${signature.signingTime.toISOString()}
Content-Hash: ${signature.contentHash}

${content.toString('base64')}`;

    return Buffer.from(padesWrapper, 'utf-8');
  }

  private async getStoredDocument(documentId: string): Promise<Buffer> {
    const stmt = db.prepare(`
      SELECT content FROM documents
      WHERE id = ?
    `);

    const result = stmt.get(documentId) as any;
    if (!result) {
      throw new Error(`Documento ${documentId} não encontrado`);
    }

    return Buffer.from(result.content, 'base64');
  }

  private storeSignature(signature: DocumentSignature): void {
    const stmt = db.prepare(`
      INSERT INTO document_signatures
      (id, document_id, process_id, case_id, signer_id, certificate_id,
       signature_value, signature_algorithm, signing_time, content_type,
       content_hash, signature_format, trust_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      signature.id,
      signature.documentId,
      signature.processId,
      signature.caseId,
      signature.signerId,
      signature.certificateId,
      signature.signatureValue,
      signature.signatureAlgorithm,
      signature.signingTime.toISOString(),
      signature.contentType,
      signature.contentHash,
      signature.signatureFormat,
      signature.trustLevel,
    );
  }

  private rowToSignature(row: any): DocumentSignature {
    return {
      id: row.id,
      documentId: row.document_id,
      processId: row.process_id,
      caseId: row.case_id,
      signerId: row.signer_id,
      certificateId: row.certificate_id,
      signatureValue: row.signature_value,
      signatureAlgorithm: row.signature_algorithm,
      signingTime: new Date(row.signing_time),
      contentType: row.content_type,
      contentHash: row.content_hash,
      signatureFormat: row.signature_format,
      trustLevel: row.trust_level,
    };
  }

  private createTimestampRequest(content: Buffer): Buffer {
    // Create RFC 3161 timestamp request
    // This would be a proper ASN.1 encoded structure
    const request = {
      version: 1,
      messageImprint: {
        hashAlgorithm: 'sha256',
        hashedMessage: crypto
          .createHash('sha256')
          .update(content)
          .digest('hex'),
      },
    };

    return Buffer.from(JSON.stringify(request));
  }

  private async requestTimestamp(request: Buffer): Promise<Buffer> {
    // Request timestamp from authority
    // In production, would use HTTP client
    logger.info('Simulando requisição de timestamp...');

    return Buffer.from(
      JSON.stringify({
        status: 'granted',
        timeStampToken: crypto.randomBytes(256).toString('base64'),
      }),
    );
  }

  private async verifySignatureAuthenticity(filePath: string): Promise<boolean> {
    try {
      const result = execSync(`openssl cms -in ${filePath} -verify -noverify 2>&1`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return result.includes('Verification successful') || result.includes('OK');
    } catch {
      return false;
    }
  }

  private extractCertField(text: string, fieldName: string): string {
    const regex = new RegExp(`${fieldName}\\s+(.+?)(?:\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : 'Unknown';
  }

  private calculateDocumentHash(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async bundleWithAttachments(
    petitionContent: Buffer,
    attachments: Array<{ name: string; content: Buffer }>,
  ): Promise<Buffer> {
    const bundle = {
      petition: petitionContent.toString('base64'),
      attachments: attachments.map((att) => ({
        name: att.name,
        content: att.content.toString('base64'),
      })),
    };

    return Buffer.from(JSON.stringify(bundle));
  }
}

export default new DocumentSignatureService();
