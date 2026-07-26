// src/modules/pki/types.ts
export interface Certificate {
  id: string;
  userId: string;
  cnpj: string;
  subjectDN: string;
  issuerDN: string;
  notBefore: Date;
  notAfter: Date;
  serialNumber: string;
  keyType: 'A1' | 'A3';
  fingerprintSha256: string;
  status: 'VALID' | 'EXPIRED' | 'REVOKED' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
}

export interface CertificateValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  trustedByBrazilianICPBrasil: boolean;
  chainVerified: boolean;
}

export interface SignatureRequest {
  documentId: string;
  documentHash: string;
  hashAlgorithm: 'SHA256' | 'SHA384' | 'SHA512';
  signatureFormat: 'CMS' | 'CAdES' | 'XAdES';
  timestamp?: boolean;
  reason?: string;
  location?: string;
}

export interface SignatureResponse {
  signatureId: string;
  documentId: string;
  certificateId: string;
  signedAt: Date;
  signatureFormat: string;
  signatureValue: string;
  timestamp?: {
    value: string;
    authority: string;
    timestamp: Date;
  };
  verificationResult: {
    isValid: boolean;
    issuer: string;
    subject: string;
    signedAt: Date;
  };
}

export interface CertificateUploadRequest {
  pkcs12Buffer: Buffer;
  password: string;
  keyType: 'A1' | 'A3';
}

export interface CertificateListResponse {
  id: string;
  cnpj: string;
  fingerprint: string;
  status: string;
  notAfter: Date;
  createdAt: Date;
  lastUsedAt?: Date;
}
