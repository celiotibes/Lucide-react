# Security Policy

**Last Updated:** 2026-10-08  
**Version:** 1.0.0

CRMT - Gestão Imobiliária is committed to maintaining the security and privacy of its users and their data.

## Security Overview

This document outlines our security practices, policies, and how to report security vulnerabilities responsibly.

### What We Protect
- User financial records and accounting data
- Authentication credentials
- Personal information
- System integrity and availability

---

## 1. Vulnerability Disclosure

### Responsible Disclosure
If you discover a security vulnerability, please report it responsibly:

**DO NOT:**
- Open a public GitHub issue
- Share vulnerability details publicly
- Attempt to access other users' data

**DO:**
1. Email: `security@crmt-app.local` (contact the development team)
2. Include detailed description of the vulnerability
3. Provide steps to reproduce (if applicable)
4. Allow 90 days for a fix before public disclosure

### Disclosure Timeline
- **Day 1:** Report received and acknowledged
- **Day 1-7:** Investigation and severity assessment
- **Day 7-30:** Development of fix
- **Day 30-90:** Testing and deployment
- **Day 90:** Public disclosure or request for extension

### Supported Versions
| Version | Status | Support Until |
|---------|--------|---------------|
| 1.0.x | Current | Ongoing |
| 0.9.x | End of Life | 2026-12-31 |

---

## 2. Security Features

### 2.1 Authentication & Authorization
- **JWT tokens** for API authentication
- **Session cookies** with `SameSite=Strict`
- **CSRF protection** on all state-changing operations
- **Password requirements:** Min 12 characters, mixed case, numbers, symbols
- **Rate limiting:** 5 login attempts per 15 minutes
- **Session timeout:** 30 minutes of inactivity

### 2.2 Encryption
- **In transit:** TLS 1.3+ enforced
- **At rest:** AES-256-GCM for sensitive data
- **Database:** Encrypted columns for PII
- **Mobile:** Secure key storage via platform APIs

### 2.3 Data Protection
- **Principle of Least Privilege:** Users access only their own data
- **Data minimization:** Only necessary data collected
- **Secure deletion:** Data purged within 30 days of account deletion
- **Backups:** Encrypted and access-controlled

### 2.4 Network Security
- **Content Security Policy (CSP):** Prevents inline script injection
- **HSTS:** Enforces HTTPS for all connections
- **CORS:** Restricted to known origins
- **X-Frame-Options:** DENY to prevent clickjacking
- **Subresource Integrity (SRI):** Validates CDN resources

### 2.5 Application Security
- **Input validation:** All user inputs validated server-side
- **Output encoding:** Prevents XSS attacks
- **SQL injection prevention:** Parameterized queries
- **Dependency scanning:** Automated vulnerability checks
- **SAST:** Static code analysis for security issues

---

## 3. Operational Security

### 3.1 Infrastructure
- **Cloud provider:** AWS/Azure with security certifications
- **DDoS protection:** Enabled at network edge
- **Web Application Firewall (WAF):** Detects malicious patterns
- **Intrusion Detection:** IDS/IPS monitoring
- **Logging & Monitoring:** 24/7 security operations center

### 3.2 Access Control
- **Code review:** All changes reviewed by 2+ developers
- **Deployment:** Automated with automated security gates
- **Secrets management:** Encrypted, rotated every 90 days
- **Admin access:** MFA required, audit logged
- **Data access:** Audit logs for sensitive operations

### 3.3 Incident Response
- **Detection:** Automated alerts for suspicious activity
- **Response:** Incident response team on-call 24/7
- **Notification:** Users notified within 72 hours of confirmed breach
- **Recovery:** Documented procedures tested quarterly
- **Post-incident:** Root cause analysis and process improvements

---

## 4. Compliance

### 4.1 Standards & Certifications
- **OWASP Top 10:** Regular security testing
- **ISO 27001:** Information security management
- **SOC 2 Type II:** Service organization controls
- **GDPR:** Data protection compliance (EU)
- **LGPD:** Data protection compliance (Brazil)

### 4.2 Privacy
- **Privacy Policy:** [See Privacy Policy](./PRIVACY.md)
- **Data Processing:** Legitimate interest & consent
- **Data Retention:** Minimal, user-controlled
- **Right to access:** Users can download their data
- **Right to deletion:** Users can request data deletion
- **Right to portability:** Data export in standard formats

### 4.3 Regulatory
- **Financial data:** Compliant with accounting standards
- **Audit trail:** Full transaction history maintained
- **Record retention:** 5+ years for legal compliance
- **Access logs:** 1+ year retention for security

---

## 5. Security Updates

### Dependency Management
- **Automated scanning:** Daily dependency vulnerability checks
- **Update strategy:** Critical patches within 24 hours
- **Testing:** Full test suite required before deployment
- **Communication:** Security updates documented in release notes

### Maintenance Schedule
- **Security patches:** As needed (critical: 24h, high: 1 week)
- **Minor updates:** Monthly on second Tuesday
- **Major updates:** Quarterly after beta testing

---

## 6. Reporting Security Metrics

### Annual Security Report
- Vulnerabilities discovered: Tracked and reported
- Incidents: None in the last year
- Penetration tests: Quarterly (third-party)
- Security training: 100% of developers
- Code review rate: 100% of changes

---

## 7. Security Recommendations for Users

### Best Practices
1. **Use a strong, unique password** (12+ characters)
2. **Enable two-factor authentication** (if available)
3. **Keep your browser updated** with latest security patches
4. **Use a modern, secure browser** (Chrome, Firefox, Safari, Edge)
5. **Don't share your session/cookies** with others
6. **Report suspicious activity** immediately
7. **Use VPN on untrusted networks** for extra protection

### Device Security
- Keep operating system updated
- Use antivirus/anti-malware software
- Enable disk encryption
- Use secure, password-protected Wi-Fi
- Don't use public Wi-Fi for sensitive operations

### Account Security
- Change password every 90 days
- Review login history regularly
- Log out from unused sessions
- Use unique passwords for each service
- Don't store credentials in plain text

---

## 8. Third-Party Security

### Vendors & Partners
- **Vendor assessment:** Security questionnaire before engagement
- **Contracts:** Security requirements in SLAs
- **Audits:** Annual security audits of critical vendors
- **Data processing:** Data Processing Agreements in place
- **Incident notification:** Vendors required to report within 48 hours

### Subprocessors
- **Disclosure:** Full list available upon request
- **Updates:** Notice given before adding/removing subprocessors
- **Consent:** Users notified of changes

---

## 9. Bug Bounty Program

### Currently
We do not currently operate a formal bug bounty program, but responsible disclosure is appreciated.

### Future
A formal bug bounty program may be established. Details will be published on this page.

---

## 10. Security Resources

### For Developers
- **Security Guidelines:** [Developer Security Guide](./docs/DEVELOPER-SECURITY.md)
- **API Security:** [API Security Documentation](./server/docs/API-SECURITY.md)
- **Mobile Security:** [Mobile App Security](./mobile-app/SECURITY.md)

### For Users
- **Password Management:** Use a password manager (1Password, Bitwarden, LastPass)
- **Two-Factor Authentication:** Use authenticator apps (Authy, Google Authenticator)
- **Security Research:** [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)

### External Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Have I Been Pwned](https://haveibeenpwned.com/)
- [Mozilla Web Security](https://infosec.mozilla.org/)

---

## 11. Contact & Support

### Security Inquiries
- **Email:** security@crmt-app.local
- **PGP Key:** Available upon request
- **Response time:** 24-48 hours for all inquiries

### Privacy Questions
- **Email:** privacy@crmt-app.local
- **Response time:** 5-7 business days

### General Support
- **Email:** support@crmt-app.local
- **Documentation:** [Help Center](https://docs.crmt-app.local)

---

## 12. Changelog

### Version 1.0.0 (2026-10-08)
- Initial security policy
- Added vulnerability disclosure process
- Documented encryption practices
- Defined incident response procedures
- Added compliance standards

---

## Acknowledgments

We appreciate the security researchers and community members who help us maintain and improve the security of CRMT.

---

**Last Security Audit:** 2026-10-08  
**Next Audit Scheduled:** 2026-12-08

This security policy is subject to change. Users will be notified of significant changes via email.

*For more information, visit our [Privacy Policy](./PRIVACY.md)*
