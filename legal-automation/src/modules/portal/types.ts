// src/modules/portal/types.ts

export type PortalUserRole = 'client' | 'guest';
export type DocumentAccessLevel = 'view' | 'download' | 'none';

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: PortalUserRole;
  phone?: string;
  profilePicture?: string;
  registeredAt: Date;
  lastLogin?: Date;
}

export interface PortalCaseView {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  summary: string;
  progress: number;
  lastUpdate: Date;
  nextDeadline?: Date;
  lawyers: {
    id: string;
    name: string;
    email: string;
    role: string;
  }[];
  documents: PortalDocumentPreview[];
  timeline: TimelineEntry[];
}

export interface PortalDocumentPreview {
  id: string;
  name: string;
  type: string;
  uploadedAt: Date;
  size: number;
  viewable: boolean;
  downloadable: boolean;
  isSignatureRequired?: boolean;
  signedAt?: Date;
}

export interface TimelineEntry {
  date: Date;
  title: string;
  description: string;
  type: string;
}

export interface BillingStatement {
  id: string;
  caseId: string;
  invoiceNumber: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  issuedDate: Date;
  dueDate: Date;
  items: BillingItem[];
  notes?: string;
}

export interface BillingItem {
  description: string;
  hours?: number;
  hourlyRate?: number;
  amount: number;
}

export interface ClientNotification {
  id: string;
  caseId?: string;
  type: 'update' | 'deadline' | 'document' | 'billing' | 'message';
  title: string;
  message: string;
  read: boolean;
  receivedAt: Date;
  readAt?: Date;
  actionUrl?: string;
}

export interface ClientMessage {
  id: string;
  caseId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  subject: string;
  content: string;
  attachments?: string[];
  sentAt: Date;
  read: boolean;
  readAt?: Date;
}

export interface PortalAccess {
  id: string;
  clientId: string;
  caseId: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
  documentAccess: DocumentAccessLevel;
  timelineAccess: boolean;
  billingAccess: boolean;
}

export interface PortalInvitation {
  id: string;
  caseId: string;
  invitedEmail: string;
  invitedBy: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: Date;
  acceptedAt?: Date;
  expiresAt: Date;
}

export interface ClientActivityLog {
  id: string;
  userId: string;
  caseId: string;
  action: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}
