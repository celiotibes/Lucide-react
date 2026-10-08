# Data Retention Policy
## Lucide React Mobile Application

**Version:** 1.0.0  
**Last Updated:** October 8, 2026  
**Effective Date:** October 8, 2026  
**Document Classification:** Legal - Compliance

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Retention Principles](#retention-principles)
3. [Retention Schedules by Data Type](#retention-schedules-by-data-type)
4. [Brazilian Fiscal Requirements](#brazilian-fiscal-requirements)
5. [GDPR/LGPD Retention Limits](#gdprlgpd-retention-limits)
6. [Deletion Procedures](#deletion-procedures)
7. [Archive and Backup Policies](#archive-and-backup-policies)
8. [Special Cases and Exceptions](#special-cases-and-exceptions)
9. [Retention Schedule Table Summary](#retention-schedule-table-summary)

---

## Executive Summary

This Data Retention Policy establishes how long the Lucide React application retains different types of personal data, financial records, and analytics information. The policy balances user privacy rights with legal obligations to maintain financial and tax records.

**Key Principles:**
- **Minimize Retention**: Data retained only as long as necessary
- **Respect Rights**: User deletion requests honored except where law requires retention
- **Fiscal Compliance**: Brazilian tax records retained per Código Tributário Nacional (CTN)
- **GDPR/LGPD Compliance**: Retention periods comply with both EU and Brazilian requirements
- **Clear Schedule**: Users can review exactly how long their data is kept

---

## Retention Principles

### 1. Purpose Limitation for Retention

Data is retained only for the purpose it was collected for:

| Data Type | Purpose | Retention Basis |
|-----------|---------|-----------------|
| Financial records | Tax compliance, audit, dispute resolution | Legal obligation (CTN) |
| Analytics events | System improvement, debugging, usage optimization | Legitimate interest + user consent |
| Crash reports | Application stability, bug fixing, security | User consent + legitimate interest |
| Account information | User account management, authentication | Contractual necessity |
| Audit logs | Legal compliance, security investigation | Legal obligation + legitimate interest |

### 2. Necessity Test

Before retaining data, we apply the necessity test:

**Question**: Is this data still necessary for its original purpose?

**Retention Only If**:
- Purpose still exists (e.g., tax period not yet completed)
- No less intrusive alternative exists (e.g., cannot use aggregate data instead of individual records)
- Legal obligation requires it (e.g., fiscal law mandates 5-year retention)
- User consent not withdrawn (for consent-based processing)

**Consequences of NOT Meeting Test**: Data is deleted per Deletion Procedures (section 6)

### 3. Distinction Between Different Retention Periods

Lucide React maintains different retention periods for different data:

```
┌─ FINANCIAL RECORDS (5-10 years)
│  └─ Legal obligation to maintain for tax compliance
│     └─ User cannot request deletion during retention period
│        └─ Exception: Anonymization possible if truly anonymous
│
├─ ANALYTICS DATA (30 days default, configurable)
│  └─ User consent basis
│  └─ User can withdraw consent and request deletion
│  └─ Automatic deletion after retention period expires
│
├─ CRASH REPORTS (6 months default)
│  └─ Legitimate interest + user consent
│  └─ User can disable crash reporting
│  └─ Old reports automatically deleted
│
└─ ACCOUNT/PROFILE DATA (Account lifetime + 2 years)
   └─ Contractual necessity during account active
   └─ 2-year retention after deletion for dispute resolution
   └─ User can request deletion (subject to legal holds)
```

### 4. Storage Optimization

To minimize storage requirements while maintaining compliance:

- **Compression**: Data compressed in storage where possible
- **Archival**: Old financial records archived to cold storage
- **Anonymization**: Analytics data anonymized when possible
- **Aggregation**: Replace individual records with aggregate statistics when appropriate
- **Deletion**: Once retention period expires, data cryptographically deleted (not just marked as deleted)

---

## Retention Schedules by Data Type

### 1. Financial Records Retention

#### 1.1 Transaction Records
- **Data Included**:
  - Transaction date, amount, parties (vendor, description)
  - Category, tags, notes
  - Supporting documents (PDFs, images of receipts)
  - Original receipt/invoice content (text extracted by OCR)
- **Retention Period**: 5 years from date of transaction
- **Basis**: 
  - Código Tributário Nacional (CTN) Article 105: 5-year retention requirement
  - Statute of limitations for tax disputes: 5 years (general), up to 10 years (fraud)
  - Accounting standards (Lei 11.638/2007)
- **Start Date**: Transaction date (not date recorded in system)
- **End Date**: 5 years after transaction date
- **Example**:
  - Transaction: January 15, 2022
  - Retention ends: January 15, 2027
  - Deletion effective: January 16, 2027 (automatic)
- **Exception**: If transaction is subject to dispute or audit, retained until dispute/audit resolved + 5 years

#### 1.2 Bank Account Records
- **Data Included**:
  - Account number (masked: last 4 digits visible only)
  - Account holder name
  - Bank statements
  - Account balance history
  - Reconciliation status
- **Retention Period**: 5 years from account closure
- **Basis**: Tax authorities may request account records during audit
- **Special Case - Active Account**: While account is active, records retained indefinitely (contractual necessity)
- **Special Case - Disputed Account**: If account is involved in legal dispute, retained until dispute resolved + 5 years

#### 1.3 Rental Agreement Records
- **Data Included**:
  - Property address and description
  - Tenant name (but NOT full tenant personal data—only contract-relevant info)
  - Rental amount, payment schedule
  - Contract start and end dates
  - Lease terms and conditions
- **Retention Period**: 5 years from contract end date
- **Basis**: Proof of income, rental income reporting to tax authorities
- **Example**:
  - Lease period: Jan 1, 2021 - Dec 31, 2022
  - Contract ends: December 31, 2022
  - Retention ends: December 31, 2027
  - Deletion effective: January 1, 2028
- **Exception**: If property dispute or tenant dispute ongoing, retained until resolved + 5 years

#### 1.4 Tax and Fiscal Documents
- **Data Included**:
  - NF-e (Electronic Invoices) and NFS-e (Service Invoices)
  - Receipt images and PDFs
  - Tax filings and returns
  - SEFAZ communication records
  - Proof of payment for taxes
- **Retention Period**: 
  - **Standard**: 5 years from issuance or filing date
  - **Extended**: During statute of limitations period (3-10 years depending on type of tax)
  - **Audit**: During audit period + 5 years after audit completion
- **Basis**: SEFAZ regulations, CTN requirements, ICMS requirements
- **Deletion Rule**: Not deleted until:
  1. Fiscal year 5 years in the past, AND
  2. No dispute or audit pending, AND
  3. Statute of limitations expired

---

### 2. User Account and Profile Data Retention

#### 2.1 Account Credentials
- **Data Included**:
  - Email address
  - Password hash (never plain-text password)
  - Biometric authentication data (if enabled, stored securely)
  - Authentication tokens and refresh tokens
- **Retention Period**: 
  - **Active Account**: Retained for account lifetime
  - **After Deletion**: 2 years (for account recovery if user changes mind; after 2 years, deletion permanent)
- **Basis**: Contractual necessity (account authentication) + legitimate interest (account recovery)
- **Early Deletion**: User can request immediate permanent deletion after 30-day notice

#### 2.2 Profile Information
- **Data Included**:
  - Name, email address, phone number
  - Avatar/profile picture
  - Timezone, language preference
  - Account creation date
- **Retention Period**: 
  - **Active Account**: Retained for account lifetime
  - **After Deletion**: 2 years (for support/dispute resolution)
  - **After 2 Years**: Permanently deleted
- **Basis**: Contractual necessity + legitimate interest (customer service)
- **User Right**: Can request deletion per GDPR/LGPD right to erasure

#### 2.3 Communication History
- **Data Included**:
  - Support emails and support chat messages
  - Bug reports submitted by user
  - Feature requests and feedback
  - Contact form submissions
- **Retention Period**: 3 years after account deletion
- **Basis**: Legal obligation (support documentation), legitimate interest (service improvement)
- **User Right**: User can delete individual messages before account deletion; support team retains messages after deletion for legal/service improvement purposes

---

### 3. Analytics and Usage Data Retention

#### 3.1 Event Analytics
- **Data Included**:
  - Event type (screen_view, transaction_create, feature_used, etc.)
  - Event timestamp
  - Session ID
  - User ID (if logged in)
  - Event properties (screen name, feature name, etc.)
  - Device information (OS, app version, locale)
- **Default Retention Period**: 30 days
- **Configurable Retention**: User can adjust in Settings (7, 14, 30, 90 days)
- **Basis**: User consent (explicitly requested at onboarding)
- **Automatic Deletion**:
  - System automatically deletes events older than configured retention period
  - Deletion runs daily at 2:00 AM UTC
  - No recovery possible after deletion
- **Opt-Out Effect**: If user disables analytics consent, events are NOT deleted retroactively; existing events deleted per configured period

#### 3.2 Session Analytics
- **Data Included**:
  - Session ID
  - Session start time
  - Session duration
  - Number of events in session
  - Device/OS information
- **Retention Period**: 30 days from session end
- **Basis**: User consent
- **Automatic Deletion**: Sessions automatically deleted after 30 days (not recoverable)
- **Not Linked**: Session ID not linked to user identity (anonymous)

#### 3.3 Crash Reports and Error Logs
- **Data Included**:
  - Error message and stack trace
  - Breadcrumbs (user actions prior to crash)
  - Device/app information at time of crash
  - Timestamp and session ID
  - User ID (if logged in)
- **Retention Period**: 6 months
- **Basis**: 
  - User consent (crash reporting must be enabled)
  - Legitimate interest (application stability, bug fixing)
- **User Control**: User can disable crash reporting; existing reports deleted per schedule
- **Third-Party**: If Sentry integration enabled, Sentry retains per its own policy (typically 90 days)
- **Deletion**: Automatically deleted after 6 months; no recovery possible

#### 3.4 Performance Metrics
- **Data Included**:
  - App load time
  - Screen render time
  - Network latency
  - Battery usage
  - Memory consumption
  - Crash frequency
- **Retention Period**: 
  - **Detailed Metrics**: 7 days
  - **Aggregated Metrics**: 90 days
- **Basis**: Legitimate interest (system optimization, performance monitoring)
- **User Consent**: Performance collection does NOT require explicit consent (technical necessity)
- **Automatic Deletion**: Automatically deleted per schedule (not user-controllable)

---

### 4. Backup and Archive Data Retention

#### 4.1 User-Initiated Cloud Backup
- **Data Included**: Complete encrypted copy of local database
- **Retention Period**: 
  - **Active Backup**: User determines (manual delete or automatic expiration setting)
  - **After Account Deletion**: 30 days (to allow account recovery)
  - **After 30 Days**: Automatically deleted
- **Basis**: User consent (explicit backup action)
- **Encryption**: Encrypted with user's password; backup provider cannot access data
- **User Control**: User can delete backup at any time

#### 4.2 System Backups (For Disaster Recovery)
- **Data Included**: System database backups (multiple user accounts)
- **Retention Period**: 
  - **Hourly backups**: 24 hours
  - **Daily backups**: 7 days
  - **Weekly backups**: 30 days
  - **Monthly backups**: 90 days
- **Basis**: Legitimate interest (disaster recovery, system integrity)
- **User Right**: Users cannot directly delete system backups (backup is for system protection)
- **User Deletion Effect**: When user requests deletion:
  1. Data immediately removed from active database
  2. Data remains in backups until backup itself is deleted per schedule
  3. Data never recovered from backups (backups are deleted as scheduled, never restored)

#### 4.3 Archived Financial Records (Cold Storage)
- **Data Included**: Financial records older than 2 years
- **Retention Period**: Per financial record retention schedule (5-10 years total)
- **Purpose**: Long-term archival for fiscal compliance
- **Storage Method**:
  - Separate encrypted storage (separate from active database)
  - Minimal access (read-only, audit-logged)
  - Annual integrity verification
- **User Access**: User can request access to archived records; will be retrieved from archive if requested

---

### 5. Audit Logs and Compliance Records Retention

#### 5.1 User Activity Audit Logs
- **Data Included**:
  - User ID who took action
  - Action taken (create, edit, delete)
  - Timestamp of action
  - IP address (anonymized: last octet removed)
  - Change description (what was changed)
  - Result (success or failure)
- **Retention Period**: 2 years
- **Basis**: Legal obligation (audit trail for tax authorities), legitimate interest (security)
- **User Right**: User cannot delete own audit logs (violates audit trail integrity)
- **Exception**: Deletion requests may exclude audit logs from deletion (to maintain record of deletion request itself)

#### 5.2 System Admin Logs
- **Data Included**:
  - Admin action (user creation, permission change, etc.)
  - Admin ID
  - Timestamp
  - Object affected
  - Change made
  - Authorization level
- **Retention Period**: 3 years
- **Basis**: Legal obligation (system governance), legitimate interest (security investigation)
- **User Right**: Not accessible to users; only to administrators

#### 5.3 Data Breach and Incident Records
- **Data Included**:
  - Date of incident
  - Type of incident
  - Data affected
  - Users affected
  - Root cause
  - Remediation taken
  - Outcome
- **Retention Period**: 3 years minimum (longer if lawsuit pending)
- **Basis**: Legal obligation (regulatory compliance), legitimate interest (ongoing security)
- **Access**: Restricted to compliance and security personnel

#### 5.4 Consent Records
- **Data Included**:
  - User ID
  - Consent given/withdrawn
  - Policy version consented to
  - Timestamp
  - IP address (anonymized)
- **Retention Period**: 
  - **Active**: Retained while consent active
  - **Withdrawn**: 2 years after withdrawal (proof of withdrawal)
- **Basis**: Legal obligation (GDPR/LGPD requires proof of consent)
- **Immutable**: Consent records cannot be modified once created (only new records created)

---

## Brazilian Fiscal Requirements

### 1. Código Tributário Nacional (CTN) Compliance

#### 1.1 Article 105 - Record Retention
Brazilian Tax Code requires:
- **Minimum Retention**: 5 years from date of transaction
- **Start Point**: The year the transaction occurred (not when recorded)
- **Example**:
  - Transaction in any date during 2022
  - Retention period: Full years 2022, 2023, 2024, 2025, 2026, 2027
  - Final day of retention: December 31, 2027
  - Deletion effective: January 1, 2028

#### 1.2 Article 108 - Statute of Limitations
Tax disputes have different statute of limitations:
- **General Rule**: 5 years from end of calendar year in which payment due
- **Fraud/Concealment**: 10 years
- **Tax Assessment Appeal**: 5 years from assessment date
- **During Dispute**: Records retained until dispute resolved + 5 years

#### 1.3 Burden of Proof
- **Taxpayer Responsibility**: User is responsible for maintaining records to prove fiscal claims
- **Our Responsibility**: We provide secure storage and audit trail
- **Admissibility**: Records stored in Lucide React are admissible as evidence if:
  - Original documents preserved
  - Audit trail intact
  - System integrity verified
  - Digital signature/hash present (for NF-e)

### 2. SEFAZ (Sistema de Comunicação da Administração Tributária) Compliance

#### 2.1 NF-e (Nota Fiscal Eletrônica) Retention
- **Retention Period**: 5 years from issuance
- **Format**: XML must be retained in original format
- **Hash/Signature**: Digital signature must be verified and retained
- **Access**: Must be retrievable within 5 business days upon SEFAZ request
- **Implementation in Lucide React**:
  - Original NF-e XML stored encrypted
  - PDF version generated (non-canonical, for user convenience)
  - Hash verified on import, stored with record
  - Automatic retrieval function available

#### 2.2 NFS-e (Nota Fiscal de Serviço Eletrônica) Retention
- **Retention Period**: Per municipal rules (typically 5 years)
- **Format**: Per municipal requirement (varies by municipality)
- **Complexity**: No national standard; each municipality has different rules
- **Implementation in Lucide React**:
  - Original NFS-e file retained
  - OCR text extracted (for searchability only)
  - Municipality and state recorded with NFS-e
  - User responsible for complying with municipal requirements

#### 2.3 RPS (Recibo Provisório de Serviços) Retention
- **Retention Period**: 5 years from issuance
- **Usage**: Used when NFS-e not yet issued or cancelled NFS-e requires proof of service
- **Implementation**: Stored same as NFS-e records

### 3. Accounting Standards Compliance

#### 3.1 Lei 11.638/2007 Requirements
- **Requirement**: Accounting records must be maintained in good order
- **Retention**: Documents supporting transactions retained
- **Format**: Electronic format acceptable if meets legal standards
- **Integrity**: Ability to produce reports and statements from records

#### 3.2 Central Bank Regulations
If business involves financial services:
- **Retention**: Varies by service type
- **Typical**: 5-10 years
- **Implementation**: Ensure records can be provided to Central Bank upon request

### 4. Special Circumstances - Extended Retention

#### 4.1 Contested Transactions
- **Trigger**: Tax authority questions transaction legitimacy
- **Extension**: Retained until dispute resolved + 5 years
- **User Responsibility**: User must notify us of pending disputes
- **Effect**: Automatic deletion algorithms will not apply; records held indefinitely if dispute flagged

#### 4.2 Under Audit
- **Trigger**: Business under tax audit
- **Extension**: All records related to audit retained until audit concludes
- **Cooperation**: We provide records to tax authorities as requested
- **Duration**: Typically 1-2 years for audit completion, then additional 5 years after

#### 4.3 Fraud Investigation
- **Trigger**: Suspected fraud or evasion (by tax authorities)
- **Extension**: 10 years from date of discovery (fraud limitation period)
- **User Responsibility**: Federal police may request records directly; we cooperate with law enforcement

---

## GDPR/LGPD Retention Limits

### 1. Storage Limitation Principle (GDPR Article 5(1)(e), LGPD Article 6)

**Principle**: Data kept only as long as necessary for its purpose.

**Application**:
- Cannot retain data indefinitely "just in case"
- Must delete or anonymize when purpose no longer exists
- Must balance against legal obligations

### 2. Minimum Retention (Cannot Delete Before)

Lucide React complies with all minimum retention requirements:

| Data Type | Minimum Retention | Basis | Cannot Delete Before |
|-----------|-------------------|-------|---------------------|
| Financial records | 5 years | CTN Article 105 | CTN minimum expires |
| Tax records | 5 years (general), 10 years (fraud) | Statute of limitations | Limitations period expires |
| Audit logs | 2 years | Best practice, potential audits | 2-year period expires |
| Breach records | 3 years | Regulatory requirement | Regulatory period expires |

### 3. Maximum Retention (Cannot Delete After)

LGPD and GDPR also limit how LONG data can be retained:

#### 3.1 LGPD Article 15 - Right to Erasure
Users can request deletion when:
- Data no longer necessary for purpose
- Retention period has expired
- Purpose has been fulfilled
- User withdraws consent

**Exception**: Legal obligations (fiscal requirements) override user request.

**Balance**: 
- We cannot retain data longer than necessary
- Financial records must be retained per fiscal law
- Deletion request during fiscal retention period: Data flagged as "requested for deletion" but retained per legal obligation

#### 3.2 GDPR Article 17(1)(a) - "Right to be Forgotten"
Users can request erasure when data:
- No longer necessary for original purpose
- Consent withdrawn
- User exercises right to object
- Processed unlawfully

**GDPR Limitation (Article 17(3))**:
Data CAN be retained if necessary for:
- Exercise or defense of legal claims (fiscal claims, disputes)
- Compliance with legal obligation (fiscal retention)
- Archive, research, or statistical purposes (anonymized)

**Application in Lucide React**:
- User requests deletion: Data marked for deletion
- If data is financial/fiscal: Retained per CTN, deletion delayed
- If data is analytics: Deleted per schedule
- User informed of legal hold and reason

### 4. Retention Schedule Compliance Framework

```
Data Lifecycle under GDPR/LGPD

1. COLLECTION
   └─ Consent obtained (if required)
   └─ Legal basis verified
   └─ User informed of retention period

2. PROCESSING
   └─ Used for stated purpose only
   └─ Access limited to authorized persons
   └─ Security measures applied

3. RETENTION
   ├─ Minimum Period (cannot delete earlier)
   │  └─ Legal obligation (fiscal law)
   │  └─ Or: Consent-based retention period
   │
   └─ Maximum Period (cannot keep longer)
      └─ User can request deletion
      └─ Except where legal obligation applies
      └─ Data anonymized if possible

4. DELETION
   ├─ Automatic deletion when period expires
   │  ├─ Cryptographic deletion (unrecoverable)
   │  ├─ Legal holds removed
   │  └─ Verification performed
   │
   ├─ User-requested deletion
   │  ├─ Processed within 30 days
   │  ├─ Exceptions honored (fiscal retention)
   │  └─ Confirmation provided
   │
   └─ OPTIONAL: Anonymization
      └─ If not deletable, anonymize if possible
      └─ Remove identifiers
      └─ Aggregate data
      └─ Make unrecoverable to identity
```

---

## Deletion Procedures

### 1. Automatic Deletion

#### 1.1 Analytics Data Auto-Deletion
```
Analytics Events
│
├─ Event generated → timestamp recorded
├─ Retention period set (default: 30 days)
├─ Daily deletion check (2:00 AM UTC)
├─ Events older than retention period → marked for deletion
├─ Cryptographic deletion (data unrecoverable)
└─ Deletion log created (for audit)
```

**Implementation**:
- Database query identifies events older than retention date
- Secure deletion algorithm applied (data overwritten multiple times before deletion)
- Backup copies also deleted per backup retention schedule
- Deletion is irreversible

#### 1.2 Crash Reports Auto-Deletion
```
Crash Report
│
├─ Report generated → timestamp recorded
├─ Retention: 6 months
├─ Weekly deletion check (Sunday 2:00 AM UTC)
├─ Reports older than 6 months → marked for deletion
├─ Sentry records deleted via API (if Sentry enabled)
├─ Local records cryptographically deleted
└─ Deletion log recorded
```

#### 1.3 Session Data Auto-Deletion
```
Session Records
│
├─ Session ends → end timestamp recorded
├─ Retention: 30 days from session end
├─ Daily check identifies expired sessions
├─ Records deleted from database
├─ Backup sessions deleted per backup schedule
└─ Anonymized aggregate statistics retained
```

### 2. User-Requested Deletion

#### 2.1 User Initiates Deletion Request
```
User Action: Settings → Privacy & Compliance → Delete My Data
│
├─ System displays warning:
│  "This will permanently delete all your data.
│   This action cannot be undone.
│   Financial records required by law will be retained."
│
├─ User confirms understanding
├─ Deletion request created with:
│  ├─ Request ID (unique identifier)
│  ├─ User ID
│  ├─ Timestamp
│  ├─ IP address (anonymized)
│  └─ Reason (optional)
│
└─ 30-Day Notice Period Begins
   ├─ Data marked as "pending deletion"
   ├─ Account functions normally during notice period
   ├─ User receives confirmation email
   ├─ User can cancel deletion during this period
   └─ Final reminder sent on day 29
```

#### 2.2 What Happens During 30-Day Notice Period
- **Account Access**: User can still login and use account
- **Data Accessibility**: Data may still be backed up but not accessible via regular interface
- **Recovery**: User can cancel deletion request until day 30
- **Communication**: Email reminders sent on days 7, 14, 29
- **Cancellation**: User can cancel by clicking link in reminder email

#### 2.3 Automatic Deletion After 30 Days
```
Day 31 - Automatic Deletion Triggered
│
├─ All user personal data deleted:
│  ├─ Account credentials and profile
│  ├─ Analytics events and session data
│  ├─ Crash reports
│  ├─ Preferences and settings
│  └─ Communication history
│
├─ Financial records handled per fiscal requirements:
│  ├─ If within fiscal retention period:
│  │  └─ Records retained (not deleted)
│  │  └─ Access removed from account
│  │  └─ Stored in encrypted archive
│  │  └─ Tax authorities can still request
│  │
│  └─ If past fiscal retention period:
│     └─ Records cryptographically deleted
│     └─ No recovery possible
│
├─ Backup deletion:
│  ├─ User-initiated backups deleted
│  ├─ System backups deleted per backup schedule
│  └─ No data recoverable from backups
│
├─ Third-party processor notification:
│  ├─ If Sentry integrated: Sentry API deletion request sent
│  ├─ If cloud backup provider: Backup deletion requested
│  └─ Deletion confirmation received from third parties
│
├─ Deletion verification:
│  ├─ Spot-check of deleted data (cannot be accessed)
│  ├─ Audit log entry created
│  └─ User receives confirmation email
│
└─ Final Status: User account and associated data fully deleted
   (Except financial records retained per legal requirement)
```

#### 2.4 User Notification of Deletion
```
Deletion Confirmation Email Template

Subject: Your Account Has Been Successfully Deleted

Dear [Former User Name],

Your account with Lucide React has been successfully deleted as of [DATE].

WHAT WAS DELETED:
- Account credentials and profile information
- Analytics events and usage data
- Crash reports
- Settings and preferences
- Communication history

WHAT WAS RETAINED (if applicable):
- Financial records (if required by law for tax compliance)
  These records are retained in encrypted archive and will be 
  automatically deleted per Brazilian fiscal requirements.

NEXT STEPS:
- No further action needed
- You will not receive any further communications
- If you change your mind, create a new account

If you have questions, contact: privacy@lucidereact.app

Sincerely,
Lucide React Privacy Team
```

### 3. Right to Erasure Exceptions

#### 3.1 Data That Cannot Be Deleted
Certain data cannot be deleted even upon user request:

| Data | Cannot Delete Because | Duration |
|------|----------------------|----------|
| Financial records | Fiscal law requirement | 5-10 years from transaction |
| Audit logs | Legal obligation, evidence | 2-3 years minimum |
| Dispute records | Legal claim underway | Until dispute resolved + 5 years |
| Breach records | Regulatory requirement | 3 years minimum |
| Consent records | Proof of consent required | 2 years after withdrawal |

#### 3.2 User Communication of Exceptions
When user requests deletion:
- User informed of exceptions upfront
- Specific reasons explained for each exception
- Retention period specified for each exception
- User can see reason in Privacy → Data Deletion Status

#### 3.3 Partial Deletion
If some data can be deleted but not all:
- Deletable data deleted immediately
- Non-deletable data retained and flagged
- User receives mixed response:
  ```
  ✓ Deleted: Profile information, analytics, crash reports
  ✗ Retained: Financial records (fiscal requirement until [DATE])
  ```

### 4. Anonymization As Alternative to Deletion

Where deletion is not possible, anonymization is preferred:

#### 4.1 What Is Anonymization?
Data is **anonymized** when:
- Identifiers are removed (user ID, name, email, IP address)
- Cannot be linked back to individual (even with additional information)
- No longer personal data under GDPR/LGPD
- Can be retained indefinitely without consent

#### 4.2 Examples of Anonymization
```
BEFORE (Identifiable):
{
  "user_id": "12345",
  "email": "john@example.com",
  "screen_name": "Dashboard",
  "timestamp": "2024-01-15T10:30:00Z",
  "duration_ms": 5000
}

AFTER (Anonymized):
{
  "aggregation_week": "2024-W03",
  "screen_category": "dashboard",
  "duration_bucket": "5000-10000ms",
  "event_count": 150
}
```

#### 4.3 Anonymization in Lucide React
- **Financial Records**: Cannot be anonymized (must identify vendor, amount, account)
- **Analytics**: Aggregated data maintained (weekly summaries, no individual identification)
- **Crash Reports**: Anonymized stack traces retained (error patterns without user identity)
- **Session Data**: Aggregate session statistics retained (total duration, feature usage)

---

## Archive and Backup Policies

### 1. Long-Term Archive Strategy

#### 1.1 Why Archival?
- **Performance**: Active database kept lean, fast queries
- **Compliance**: Old financial data archived per fiscal requirements
- **Accessibility**: Important records stay accessible but organized
- **Cost**: Archived data stored in cheaper cold storage

#### 1.2 Archive Tiers

**Tier 1: Hot Storage (Active)**
- **Content**: Data < 2 years old, current fiscal year + previous year
- **Location**: Primary database server(s)
- **Access**: Instant (milliseconds)
- **Encryption**: AES-256 at rest, TLS in transit
- **Backup**: Hourly snapshots
- **Cost**: Standard storage (most expensive)

**Tier 2: Warm Storage (Recent Archive)**
- **Content**: Data 2-5 years old (still in active fiscal/legal retention)
- **Location**: Archive database or encrypted file storage
- **Access**: Minutes (manual retrieval required)
- **Encryption**: AES-256 at rest
- **Backup**: Daily snapshots
- **Cost**: Moderate storage

**Tier 3: Cold Storage (Long-Term Archive)**
- **Content**: Data > 5 years old (for extended fiscal retention or disputes)
- **Location**: Offline encrypted archive, geographic backup
- **Access**: Hours to days (manual process, IT approval required)
- **Encryption**: AES-256 at rest, offline copies encrypted
- **Backup**: Annual verification, geographic redundancy
- **Cost**: Lowest storage cost
- **Recovery**: Restoration possible but infrequent

#### 1.3 Archive Movement Schedule
```
Data Timeline:
│
├─ 0-2 years: Tier 1 (Hot)
│  └─ Full access in app
│  └─ Hourly backups
│  └─ Real-time queries
│
├─ 2-5 years: Tier 2 (Warm)
│  └─ Accessible via "Request Archive" feature
│  └─ Requires ~5 min to retrieve
│  └─ Audit logged
│  └─ Daily backups
│
├─ 5-10 years: Tier 3 (Cold)
│  └─ Accessible only by IT team (for legal requests)
│  └─ Requires ~24 hours to retrieve
│  └─ Formal request process
│  └─ Annual integrity check
│
└─ > 10 years: Permanent deletion
   └─ Unless extended retention required
   └─ Deletion logged and certified
```

### 2. Backup Procedures

#### 2.1 Automated System Backups (For Disaster Recovery)

**Hourly Backups**:
- **Schedule**: Every hour on the hour
- **Content**: Entire database snapshot
- **Retention**: 24 hours (24 most recent hourly backups kept)
- **Purpose**: Recover from system failures within previous 24 hours
- **Encryption**: Encrypted with master key
- **Purpose**: NOT for compliance; for system recovery only
- **Location**: Primary data center
- **Recovery**: Automatic failover if primary fails

**Daily Backups**:
- **Schedule**: 2:00 AM UTC daily
- **Content**: Complete database snapshot
- **Retention**: 7 most recent daily backups kept
- **Encryption**: Encrypted with backup encryption key
- **Location**: Secondary data center (geographic backup)
- **Verification**: Integrity check performed weekly
- **Recovery**: Manual restoration possible if needed

**Weekly Backups**:
- **Schedule**: Sunday at 3:00 AM UTC
- **Content**: Complete database snapshot
- **Retention**: 4 most recent weekly backups kept
- **Purpose**: Longer-term recovery point
- **Location**: Off-site encrypted storage
- **Encryption**: Triple-encrypted (database key + backup key + storage key)
- **Verification**: Monthly integrity verification

**Monthly Backups**:
- **Schedule**: First day of month at 4:00 AM UTC
- **Content**: Complete database snapshot
- **Retention**: 12 most recent monthly backups kept
- **Purpose**: Year-long recovery point, long-term archival
- **Location**: Off-site encrypted archive
- **Encryption**: Offline encrypted storage
- **Verification**: Quarterly integrity check
- **Recovery**: Slow recovery time (may take several hours)

#### 2.2 User-Initiated Backups (User's Own Copy)

**Cloud Backup Feature**:
- **Triggering**: User chooses "Backup to Cloud" in Settings
- **Content**: Entire encrypted database copy
- **Frequency**: User determines (can backup daily, weekly, etc.)
- **Retention**: 
  - User can set expiration date (default: never expires unless user sets)
  - Account deletion: 30-day retention then auto-delete
  - User can manually delete at any time
- **Encryption**: Database encrypted with user's password before backup
- **Location**: Cloud storage provider (AWS S3 or similar)
- **Access**: Only user can decrypt and restore
- **User Control**: User can delete backup at any time

**Local Backup**:
- **Triggering**: User exports data in Settings → Export Data
- **Format**: JSON, CSV, PDF (user selects)
- **Frequency**: User-determined
- **Retention**: User responsible (stored on user's device/computer)
- **Encryption**: Optional (user can choose encrypted or plain export)
- **No Server Retention**: Once exported, data not retained by Lucide React

#### 2.3 Backup Deletion

**User Account Deletion → Backup Deletion**:
```
User Requests Account Deletion
│
├─ System backups:
│  ├─ User data removed from active database (Day 1)
│  ├─ Data still present in hourly backups (until replaced)
│  ├─ Data still present in daily/weekly/monthly backups (per schedule)
│  ├─ NO action taken to restore from backup (backup is for system recovery only)
│  └─ As old backups are deleted per schedule, user data naturally purged
│
├─ User-initiated cloud backups:
│  ├─ Delete initiated on Day 1
│  ├─ Data encrypted and flagged for deletion
│  └─ Actual deletion on Day 30 (after 30-day recovery period)
│
└─ RESULT: After backup retention periods expire, user data completely unrecoverable
```

**Disaster Recovery NOT A Deletion Exception**:
- System backups exist for system disaster recovery
- Cannot use "backup still exists" as reason to retain deleted data
- Backups are automatic/unavoidable; deletion requests honored despite backup existence
- Backups deleted per normal schedule; deletion requests do not affect backup schedule

### 3. Backup Verification and Integrity

#### 3.1 Regular Integrity Checks
- **Frequency**: Weekly for daily/weekly backups, monthly for monthly backups
- **Check Method**: Hash verification, partial restoration test
- **Alerts**: Alert if integrity check fails
- **Action**: Bad backup immediately replaced/deleted
- **Report**: Quarterly report on backup integrity

#### 3.2 Restoration Testing
- **Frequency**: Quarterly (at least 4 times per year)
- **Method**: Restore backup to test environment, verify completeness and integrityIntegrity
- **Scope**: Monthly and weekly backups tested
- **Documentation**: Test results recorded and kept for 1 year
- **Failure**: If backup cannot be restored, marked as failed and discarded

#### 3.3 Backup Audit Trail
- **Logging**: All backup operations logged with:
  - Date and time of backup
  - Size of backup
  - Verification result
  - Restoration tests performed
  - Any issues encountered
- **Retention**: Backup audit logs retained for 3 years
- **Transparency**: Backup summary available to authorized users/admins

---

## Special Cases and Exceptions

### 1. Legal Holds

#### 1.1 What Is A Legal Hold?
When data must be retained beyond normal retention period due to:
- Pending legal action/lawsuit
- Tax audit or investigation
- Government investigation or subpoena
- Regulatory enforcement proceeding

#### 1.2 Legal Hold Procedure
```
Legal Issue Arises
│
├─ Legal department notified
├─ Legal hold determination made
├─ User data flagged as "LEGAL HOLD"
├─ Normal deletion algorithms skip flagged data
├─ Data retained indefinitely (as long as hold in place)
├─ User informed if hold is user-specific
│  └─ Does not prevent user deletion request
│  └─ Data deletion request honored, but
│  └─ If legal hold required, data retained anyway
│
└─ When legal hold lifted
   ├─ Data flag removed
   ├─ Retention clock reset to when hold lifted
   ├─ User data now eligible for deletion per normal schedule
   └─ Deletion occurs automatically per retention period
```

#### 1.3 User Notification of Legal Holds
- **Notice**: If legal hold applies to specific user, user is informed
- **Timeline**: Notice provided within 30 days of hold placement
- **Explanation**: User told why data is being retained
- **Duration**: User told how long hold expected to last
- **Appeal**: User can request review of hold necessity (if applicable)

### 2. Law Enforcement Requests

#### 2.1 When Data Is Subpoenaed
- **Authority**: Law enforcement or government agency issues subpoena
- **Scope**: Specific data requested (not entire user database)
- **Retention**: Data retained per subpoena period + 5 years
- **User Notification**: User notified of subpoena (unless law enforcement requests non-disclosure)
- **Cooperation**: Full cooperation with law enforcement
- **Preservation**: Data marked to prevent deletion during legal process

#### 2.2 Data Preservation Order
- **Trigger**: Legal case or investigation requires data preservation
- **Duration**: Until case closes
- **Scope**: Specified data types or user data
- **Effect**: Automatic deletion algorithms suspended
- **Documentation**: Preservation order logged with date and case number

#### 2.3 Tax Authority Requests
- **Authority**: Federal or state tax authorities
- **Scope**: Often requests financial records for specific taxpayer
- **Retention**: Per fiscal retention schedule (5-10 years)
- **User Notification**: Not required for routine tax authority request
- **Cooperation**: Full cooperation with SEFAZ, IRS, state tax authorities
- **Confidentiality**: Tax authority requests handled confidentially

### 3. Regulatory Compliance Holds

#### 3.1 Regulatory Investigation
- **Trigger**: Regulatory body opens investigation (financial crimes, fraud, etc.)
- **Duration**: During investigation + 5 years after completion
- **Scope**: All data related to investigation
- **User Notification**: User may be notified (depends on regulation)
- **Cooperation**: Full cooperation with regulatory authority

#### 3.2 PCI-DSS or Payment Card Data
- **Applicability**: If payment card data processed
- **Retention**: PCI-DSS requires specific retention (typically 1 year)
- **Encryption**: Payment card data must be encrypted or masked
- **Deletion**: Securely deleted after retention period per PCI standards
- **Audit**: Annual audit of payment card handling
- **Note**: Lucide React does NOT handle payment cards directly (payments via third-party)

---

## Retention Schedule Table Summary

This table summarizes retention periods for all data types:

| Data Category | Data Type | Default Retention | Minimum | Maximum | Legal Basis | Notes |
|---------------|-----------|-------------------|---------|---------|-------------|-------|
| **FINANCIAL** | Transactions | 5 years | 5 years | Indefinite (legal hold) | CTN Article 105 | From transaction date |
| | Bank accounts | 5 years | 5 years | Indefinite (legal hold) | CTN | From account closure |
| | Rental agreements | 5 years | 5 years | Indefinite (dispute) | Fiscal | From contract end |
| | Tax documents | 5-10 years | 5 years | Indefinite (fraud) | Statute of limitations | Varies by type |
| | NF-e/NFS-e | 5 years | 5 years | 10 years (fraud) | SEFAZ | From issuance |
| **ACCOUNT** | Credentials | Account lifetime | 2 years | Account lifetime | Contractual | 2 years after deletion |
| | Profile | Account lifetime | 2 years | Account lifetime | Contractual | 2 years after deletion |
| | Communication | 3 years | 3 years | 3 years | Legitimate interest | From message date |
| **ANALYTICS** | Events | 30 days | 0 days | 90 days (user config) | User consent | Automatic deletion |
| | Sessions | 30 days | 0 days | 30 days | User consent | From session end |
| | Crashes | 6 months | 0 days | 6 months | User consent | From crash date |
| | Performance | 7-90 days | 0 days | 90 days | Legitimate interest | Aggregated after 7 days |
| **AUDIT** | Activity logs | 2 years | 2 years | 3 years | Legal obligation | From action date |
| | Admin logs | 3 years | 3 years | 3 years | Legal obligation | From action date |
| | Breach records | 3 years | 3 years | 3 years | Regulatory | From incident date |
| | Consent records | Until withdrawal + 2 years | During consent | 2 years after withdrawal | GDPR/LGPD | From consent date |
| **BACKUP** | Cloud backup | User-determined | 30 days (account deletion) | Indefinite | User consent | User-initiated |
| | System backup | Per schedule | 24 hours | 1 year | Legitimate interest | Automatic |

---

## Compliance Checklist

Before deploying this policy, verify:

- [ ] All financial records retention meets Brazilian CTN requirements (5-10 years)
- [ ] Analytics retention periods user-configurable (7-90 days)
- [ ] Automatic deletion processes implemented and tested
- [ ] Legal holds process documented and accessible to legal team
- [ ] Data deletion requests processed within 30 days (except exceptions)
- [ ] User notifications provided for deletion requests
- [ ] Archive procedures documented and tested
- [ ] Backup procedures documented and tested
- [ ] Backup integrity checks performed regularly
- [ ] Data retention policy available to users
- [ ] Regular audits conducted (at least annually)
- [ ] Incident response procedures align with breach notifications
- [ ] Third-party processor agreements address data retention
- [ ] Compliance officer appointed and trained
- [ ] Regulatory authority contact information current

---

**Document Version**: 1.0  
**Last Updated**: October 8, 2026  
**Next Review Date**: October 8, 2027  
**Classification**: Legal - Compliance  
**Status**: DRAFT - PENDING LEGAL REVIEW AND APPROVAL

---

