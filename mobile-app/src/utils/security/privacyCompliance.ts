export enum PrivacyRegulation {
  GDPR = 'gdpr',
  CCPA = 'ccpa',
  LGPD = 'lgpd',
}

export interface PrivacyPolicy {
  regulation: PrivacyRegulation;
  version: string;
  acceptedAt: number;
  expiresAt?: number;
}

export interface UserConsent {
  marketing: boolean;
  analytics: boolean;
  thirdParty: boolean;
  acceptedAt: number;
}

export interface DataDeletionRequest {
  userId: string;
  requestedAt: number;
  completedAt?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class PrivacyComplianceService {
  private userConsents: Map<string, UserConsent> = new Map();
  private privacyPolicies: Map<string, PrivacyPolicy> = new Map();
  private deletionRequests: Map<string, DataDeletionRequest> = new Map();

  acceptPrivacyPolicy(userId: string, regulation: PrivacyRegulation, version: string): void {
    const policy: PrivacyPolicy = {
      regulation,
      version,
      acceptedAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    };

    this.privacyPolicies.set(`${userId}_${regulation}`, policy);
  }

  hasAcceptedPolicy(userId: string, regulation: PrivacyRegulation): boolean {
    const policy = this.privacyPolicies.get(`${userId}_${regulation}`);
    if (!policy) return false;

    if (policy.expiresAt && Date.now() > policy.expiresAt) {
      this.privacyPolicies.delete(`${userId}_${regulation}`);
      return false;
    }

    return true;
  }

  updateUserConsent(userId: string, consent: Partial<UserConsent>): void {
    const existing = this.userConsents.get(userId) || {
      marketing: false,
      analytics: false,
      thirdParty: false,
      acceptedAt: Date.now(),
    };

    const updated: UserConsent = {
      ...existing,
      ...consent,
      acceptedAt: Date.now(),
    };

    this.userConsents.set(userId, updated);
  }

  getUserConsent(userId: string): UserConsent | null {
    return this.userConsents.get(userId) || null;
  }

  canCollectAnalytics(userId: string): boolean {
    const consent = this.getUserConsent(userId);
    return consent?.analytics || false;
  }

  canUseMarketing(userId: string): boolean {
    const consent = this.getUserConsent(userId);
    return consent?.marketing || false;
  }

  canShareWithThirdParty(userId: string): boolean {
    const consent = this.getUserConsent(userId);
    return consent?.thirdParty || false;
  }

  requestDataDeletion(userId: string): DataDeletionRequest {
    const request: DataDeletionRequest = {
      userId,
      requestedAt: Date.now(),
      status: 'pending',
    };

    this.deletionRequests.set(userId, request);
    return request;
  }

  getDataDeletionStatus(userId: string): DataDeletionRequest | null {
    return this.deletionRequests.get(userId) || null;
  }

  markDeletionComplete(userId: string): void {
    const request = this.deletionRequests.get(userId);
    if (request) {
      request.status = 'completed';
      request.completedAt = Date.now();
    }
  }

  getComplianceReport(userId: string): {
    acceptedPolicies: PrivacyPolicy[];
    consents: UserConsent | null;
    pendingRequests: DataDeletionRequest[];
  } {
    const policies = Array.from(this.privacyPolicies.values()).filter(p =>
      p.regulation === PrivacyRegulation.GDPR ||
      p.regulation === PrivacyRegulation.CCPA ||
      p.regulation === PrivacyRegulation.LGPD
    );

    const deletionRequest = this.deletionRequests.get(userId);
    const pendingRequests = deletionRequest?.status === 'pending' ? [deletionRequest] : [];

    return {
      acceptedPolicies: policies,
      consents: this.getUserConsent(userId),
      pendingRequests,
    };
  }

  exportUserData(userId: string): {
    profile: any;
    activities: any;
    consents: UserConsent | null;
  } {
    return {
      profile: {
        userId,
        exportedAt: Date.now(),
      },
      activities: [],
      consents: this.getUserConsent(userId),
    };
  }

  deleteAllUserData(userId: string): void {
    this.userConsents.delete(userId);

    for (const [key] of this.privacyPolicies.entries()) {
      if (key.startsWith(userId)) {
        this.privacyPolicies.delete(key);
      }
    }

    this.deletionRequests.delete(userId);
  }
}
