export interface User {
  id: string;
  email: string;
  oabNumber: string;
  oabState: string;
  firstName: string;
  lastName: string;
  certificateFingerprint?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  certificateFingerprint?: string;
  issuedAt: Date;
  expiresAt: Date;
  lastActivity: Date;
}

export interface Certificate {
  fingerprint: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  encryptedData: string;
  algorithm: string;
  keySize: number;
  uploadedAt: Date;
}

export interface TwoFactorChallenge {
  id: string;
  userId: string;
  method: 'totp' | 'sms' | 'email';
  secret?: string;
  qrCode?: string;
  issuedAt: Date;
  expiresAt: Date;
  attempts: number;
  verified: boolean;
}

export interface Process {
  number: string;
  cnj: string;
  tribunal: string;
  forum: string;
  status: string;
  subject: string;
  parties: Party[];
  plaintiff?: string;
  defendant?: string;
  lastUpdate: Date;
  lastMovement?: Movement;
  filingDate: Date;
  openDate?: Date;
  decisionDate?: Date;
}

export interface Movement {
  date: Date;
  description: string;
  status?: string;
  complement?: string;
}

export interface Party {
  name: string;
  role: 'plaintiff' | 'defendant' | 'other';
  attorney?: Attorney;
  document?: string;
}

export interface Attorney {
  name: string;
  oabNumber: string;
  email?: string;
  phone?: string;
}

export interface Document {
  id: string;
  processNumber: string;
  title: string;
  type: string;
  uploadedBy: string;
  uploadedAt: Date;
  size: number;
  mimeType: string;
  url?: string;
  restricted: boolean;
}

export interface Petition {
  id: string;
  userId: string;
  processNumber: string;
  title: string;
  subject?: string;
  type: 'initial' | 'intermediate' | 'final' | 'other';
  content: string;
  attachments: Document[];
  tribunal: 'projudi' | 'eproc';
  status: 'draft' | 'validating' | 'validated' | 'signing' | 'signed' | 'pending' | 'submitted' | 'rejected' | 'error' | 'submission_failed';
  submittedAt?: Date;
  result?: PetitionResult;
  oabNumber?: string;
  oab_number?: string;
  lawyerName?: string;
  plaintiff?: string;
  defendant?: string;
  parts?: Party[];
  causeValue?: number;
  cause_value?: number;
  deadline?: Date;
  validation_errors?: string[];
  last_error?: string;
  submission_attempts?: number;
  signedDocument?: string | Buffer;
  originalPetition?: Petition;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface PetitionResult {
  protocolNumber?: string;
  protocolDate?: Date;
  status: string;
  message: string;
  errorCode?: string;
  errorDetails?: string;
}

export interface SearchCriteria {
  processNumber?: string;
  parties?: string[];
  tribunal?: string;
  status?: string[];
  startDate?: Date;
  endDate?: Date;
  subject?: string;
  limit?: number;
  offset?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CertificateUploadRequest {
  file: Express.Multer.File;
  password: string;
}

export interface TwoFactorVerifyRequest {
  challengeId: string;
  code: string;
}
