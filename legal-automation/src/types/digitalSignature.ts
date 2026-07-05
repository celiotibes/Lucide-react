// ============ CERTIFICATE TYPES ============

export interface Certificate {
  id: string;
  userId: string;
  commonName: string; // CN from certificate
  issuerName: string;
  serialNumber: string;
  thumbprint: string;
  publicKey: string;
  keyType: 'RSA' | 'ECDSA';
  keySize: number;
  validFrom: Date;
  validUntil: Date;
  isValid: boolean;
  isPinned: boolean; // Certificate pinned to user account
  certificateType: 'A1' | 'A3' | 'A4'; // Brazilian ICP certificate types
  issuerType: 'AC' | 'AR'; // Autoridade Certificadora / Autoridade de Registro
  owner: {
    type: 'person' | 'company'; // CPF or CNPJ
    name: string;
    identifier: string; // CPF or CNPJ
  };
  uploadedAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
  metadata?: Record<string, any>;
}

export interface CertificateUploadRequest {
  certificate: Buffer; // X.509 certificate file (.cer, .crt, .pem)
  password?: string; // Password for encrypted certificates (.pfx, .p12)
  isPinned?: boolean;
}

export interface CertificateValidationResult {
  isValid: boolean;
  isExpired: boolean;
  hasValidChain: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    commonName: string;
    issuerName: string;
    serialNumber: string;
    validFrom: Date;
    validUntil: Date;
    keyType: 'RSA' | 'ECDSA';
    keySize: number;
  };
}

export interface SigningKey {
  id: string;
  certificateId: string;
  userId: string;
  privateKeyEncrypted: string; // Encrypted with user's master key
  algorithm: 'SHA256withRSA' | 'SHA512withRSA' | 'SHA256withECDSA';
  timestamp: Date;
}

// ============ SIGNATURE TYPES ============

export interface DocumentSignature {
  id: string;
  documentId: string;
  processId?: string;
  caseId?: string;
  signerId: string;
  certificateId: string;
  signatureValue: string; // Base64 encoded signature
  signatureAlgorithm: string;
  signingTime: Date;
  location?: string;
  reason?: string;
  contentType: string;
  contentHash: string; // SHA-256 hash of signed content
  signatureFormat: 'CMS' | 'XAdES' | 'PAdES'; // ICP-Brasil formats
  trustLevel: 'unknown' | 'valid' | 'questionable' | 'invalid';
  validationResult?: SignatureValidationResult;
  countersignatures?: DocumentSignature[]; // For multi-signature support
  metadata?: Record<string, any>;
}

export interface SignDocumentRequest {
  documentId?: string; // ID in database, if pre-stored
  documentContent?: Buffer; // Raw document content
  documentName: string;
  signatureReason?: string;
  signatureLocation?: string;
  certificateId: string;
  password?: string; // For certificate with encrypted key
  format?: 'CMS' | 'XAdES' | 'PAdES';
  timestamps?: boolean; // Include RFC 3161 timestamp
}

export interface SignDocumentResponse {
  success: boolean;
  signatureId?: string;
  signedDocument?: Buffer;
  signedDocumentBase64?: string;
  timestamp: Date;
  message: string;
  error?: string;
  certificateInfo?: {
    subject: string;
    issuer: string;
    serialNumber: string;
  };
}

export interface VerifySignatureRequest {
  signedDocument: Buffer | string; // Signed document or base64
  originalDocument?: Buffer; // Optional, for detached signature verification
  certificateChain?: Buffer[]; // Optional, for trust verification
}

export interface SignatureValidationResult {
  isValid: boolean;
  signatureTimestamp: Date;
  signerCertificate: {
    subject: string;
    issuer: string;
    serialNumber: string;
    validFrom: Date;
    validUntil: Date;
  };
  contentHash: string;
  hashAlgorithm: string;
  signatureAlgorithm: string;
  timestampInfo?: {
    timestamp: Date;
    tsa: string; // Time Stamp Authority
    isValid: boolean;
  };
  errors: string[];
  warnings: string[];
}

export interface TimestampRequest {
  data: Buffer;
  hashAlgorithm: 'SHA256' | 'SHA512';
  tsa?: string; // Time Stamp Authority URL
}

export interface TimestampToken {
  timestamp: Date;
  tsa: string;
  token: string; // Base64 encoded RFC 3161 timestamp token
  serialNumber: string;
  hashAlgorithm: string;
  isValid: boolean;
}

export interface PetitionSigningRequest {
  petitionId: string;
  petitionContent: Buffer;
  signerName: string;
  signerCPF?: string;
  certificateId: string;
  password?: string;
  includeTimestamp?: boolean;
  signatureFormat?: 'CMS' | 'PAdES';
  attachments?: Array<{
    name: string;
    content: Buffer;
  }>;
}

export interface PetitionSigningResponse {
  success: boolean;
  petitionId: string;
  signatureId: string;
  signedPetition: Buffer; // Complete signed document
  signatureMetadata: {
    signerName: string;
    signerCPF?: string;
    signingTime: Date;
    certificateSubject: string;
    certificateIssuer: string;
  };
  timestamp?: TimestampToken;
  error?: string;
}

export interface SignatureAuditLog {
  id: string;
  userId: string;
  certificateId: string;
  documentId?: string;
  signatureId?: string;
  action: 'certificate_uploaded' | 'certificate_deleted' | 'certificate_validated' | 'document_signed' | 'signature_verified';
  status: 'success' | 'failure';
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  lgpdCompliant: boolean; // LGPD audit compliance flag
}

export interface CertificateExpirationWarning {
  certificateId: string;
  commonName: string;
  expiresAt: Date;
  daysUntilExpiration: number;
  severity: 'critical' | 'warning' | 'info'; // critical: < 7 days, warning: < 30 days
  lastNotificationAt?: Date;
}

// ============ ERROR TYPES ============

export class DigitalSignatureError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'DigitalSignatureError';
  }
}

export class CertificateError extends DigitalSignatureError {
  constructor(message: string, originalError?: Error) {
    super('CERTIFICATE_ERROR', message, originalError);
    this.name = 'CertificateError';
  }
}

export class InvalidCertificateError extends CertificateError {
  constructor(message: string = 'Certificado inválido') {
    super(message);
    this.name = 'InvalidCertificateError';
  }
}

export class ExpiredCertificateError extends CertificateError {
  constructor(expiryDate: Date) {
    super(
      `Certificado expirado em ${expiryDate.toLocaleDateString('pt-BR')}`,
    );
    this.name = 'ExpiredCertificateError';
  }
}

export class SignatureError extends DigitalSignatureError {
  constructor(message: string, originalError?: Error) {
    super('SIGNATURE_ERROR', message, originalError);
    this.name = 'SignatureError';
  }
}

export class SignatureVerificationError extends SignatureError {
  constructor(message: string = 'Falha na verificação da assinatura') {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

export class TimestampError extends DigitalSignatureError {
  constructor(message: string = 'Erro ao obter timestamp') {
    super('TIMESTAMP_ERROR', message);
    this.name = 'TimestampError';
  }
}
