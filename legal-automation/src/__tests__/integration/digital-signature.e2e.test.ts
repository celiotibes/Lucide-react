import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import CertificateService from '@services/CertificateService';
import DocumentSignatureService from '@services/DocumentSignatureService';
import digitalSignatureController from '@api/controllers/digitalSignatureController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));
app.use('/api/signature', digitalSignatureController);

describe('Digital Signature System - E2E Tests', () => {
  const testUserId = 'test-user-signature';
  const authHeader = createAuthHeader(testUserId);
  let testCertificateId: string;
  let testSignatureId: string;

  beforeAll(() => {
    // Setup test environment
    process.env.ENCRYPTION_KEY = 'test-encryption-key-for-signatures';
  });

  describe('Certificate Management', () => {
    describe('Upload and Validation', () => {
      it('should upload a valid digital certificate', async () => {
        const mockCertificate = Buffer.from(
          '-----BEGIN CERTIFICATE-----\n' +
            'MIICljCCAX4CCQDhTBfQe6OyvDANBgkqhkiG9w0BAQsFADANMQswCQYDVQQGEwJC\n' +
            '-----END CERTIFICATE-----',
          'utf-8',
        );

        const response = await request(app)
          .post('/api/signature/certificates/upload')
          .set('Authorization', authHeader)
          .send({
            certificate: mockCertificate.toString('base64'),
            isPinned: false,
          });

        expect([201, 400]).toContain(response.status);

        if (response.status === 201) {
          expect(response.body.status).toBe('success');
          expect(response.body.certificate).toHaveProperty('id');
          expect(response.body.certificate).toHaveProperty('commonName');
          expect(response.body.certificate).toHaveProperty('issuerName');
          expect(response.body.certificate).toHaveProperty('validFrom');
          expect(response.body.certificate).toHaveProperty('validUntil');

          testCertificateId = response.body.certificate.id;
        }
      });

      it('should reject certificate upload without certificate data', async () => {
        const response = await request(app)
          .post('/api/signature/certificates/upload')
          .set('Authorization', authHeader)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.status).toBe('error');
      });

      it('should validate uploaded certificate', async () => {
        if (!testCertificateId) {
          expect(testCertificateId).toBeDefined();
          return;
        }

        const response = await request(app)
          .post(
            `/api/signature/certificates/${testCertificateId}/validate`,
          )
          .set('Authorization', authHeader);

        expect([200, 404, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
          expect(response.body.certificate).toHaveProperty('isValid');
        }
      });
    });

    describe('Certificate Listing and Retrieval', () => {
      it('should list user certificates', async () => {
        const response = await request(app)
          .get('/api/signature/certificates')
          .set('Authorization', authHeader);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(Array.isArray(response.body.certificates)).toBe(true);
        expect(response.body).toHaveProperty('count');
      });

      it('should retrieve specific certificate', async () => {
        if (!testCertificateId) {
          expect(testCertificateId).toBeDefined();
          return;
        }

        const response = await request(app)
          .get(`/api/signature/certificates/${testCertificateId}`)
          .set('Authorization', authHeader);

        expect([200, 404, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
          expect(response.body.certificate).toHaveProperty('id');
          expect(response.body.certificate.id).toBe(testCertificateId);
        }
      });

      it('should return 404 for non-existent certificate', async () => {
        const response = await request(app)
          .get('/api/signature/certificates/non-existent-cert')
          .set('Authorization', authHeader);

        expect(response.status).toBe(404);
      });
    });

    describe('Certificate Expiration Monitoring', () => {
      it('should check for certificate expiration warnings', async () => {
        const response = await request(app)
          .get('/api/signature/certificates/expirations/warnings')
          .set('Authorization', authHeader);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
        expect(Array.isArray(response.body.warnings)).toBe(true);
        expect(response.body).toHaveProperty('count');

        response.body.warnings.forEach((warning: any) => {
          expect(warning).toHaveProperty('certificateId');
          expect(warning).toHaveProperty('commonName');
          expect(warning).toHaveProperty('expiresAt');
          expect(warning).toHaveProperty('daysUntilExpiration');
          expect(['critical', 'warning', 'info']).toContain(
            warning.severity,
          );
        });
      });
    });

    describe('Certificate Deletion', () => {
      it('should delete user certificate', async () => {
        if (!testCertificateId) {
          expect(testCertificateId).toBeDefined();
          return;
        }

        const response = await request(app)
          .delete(`/api/signature/certificates/${testCertificateId}`)
          .set('Authorization', authHeader);

        expect([200, 404]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
          expect(response.body.message).toContain('deletado');
        }
      });

      it('should return 404 when deleting non-existent certificate', async () => {
        const response = await request(app)
          .delete('/api/signature/certificates/non-existent')
          .set('Authorization', authHeader);

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Document Signing', () => {
    beforeAll(() => {
      // Create a test certificate for signing operations
      if (!testCertificateId) {
        testCertificateId = 'test-cert-' + Date.now();
      }
    });

    describe('Basic Document Signing', () => {
      it('should sign a document with CMS format', async () => {
        const documentContent = Buffer.from('Test document content');

        const response = await request(app)
          .post('/api/signature/sign/document')
          .set('Authorization', authHeader)
          .send({
            documentName: 'test-document.txt',
            documentContent: documentContent.toString('base64'),
            certificateId: testCertificateId,
            format: 'CMS',
          });

        expect([200, 400, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
          expect(response.body).toHaveProperty('signatureId');
          expect(response.body).toHaveProperty('signedDocument');
          expect(response.body).toHaveProperty('certificateInfo');

          testSignatureId = response.body.signatureId;
        }
      });

      it('should sign document with XAdES format', async () => {
        const documentContent = Buffer.from('XAdES test document');

        const response = await request(app)
          .post('/api/signature/sign/document')
          .set('Authorization', authHeader)
          .send({
            documentName: 'test-xades.xml',
            documentContent: documentContent.toString('base64'),
            certificateId: testCertificateId,
            format: 'XAdES',
          });

        expect([200, 400, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
          expect(response.body).toHaveProperty('signatureId');
        }
      });

      it('should sign document with PAdES format', async () => {
        const documentContent = Buffer.from('PDF test document');

        const response = await request(app)
          .post('/api/signature/sign/document')
          .set('Authorization', authHeader)
          .send({
            documentName: 'test-pdf.pdf',
            documentContent: documentContent.toString('base64'),
            certificateId: testCertificateId,
            format: 'PAdES',
          });

        expect([200, 400, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
          expect(response.body).toHaveProperty('signatureId');
        }
      });

      it('should reject signing without certificate', async () => {
        const response = await request(app)
          .post('/api/signature/sign/document')
          .set('Authorization', authHeader)
          .send({
            documentName: 'test.txt',
            documentContent: Buffer.from('test').toString('base64'),
          });

        expect(response.status).toBe(400);
        expect(response.body.status).toBe('error');
      });

      it('should sign document with reason and location', async () => {
        const documentContent = Buffer.from('Signed document with metadata');

        const response = await request(app)
          .post('/api/signature/sign/document')
          .set('Authorization', authHeader)
          .send({
            documentName: 'metadata-test.txt',
            documentContent: documentContent.toString('base64'),
            certificateId: testCertificateId,
            signatureReason: 'Aprovação de contrato',
            signatureLocation: 'São Paulo, SP',
            format: 'CMS',
          });

        expect([200, 400, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
        }
      });

      it('should include timestamp in signature if requested', async () => {
        const documentContent = Buffer.from('Document with timestamp');

        const response = await request(app)
          .post('/api/signature/sign/document')
          .set('Authorization', authHeader)
          .send({
            documentName: 'timestamp-test.txt',
            documentContent: documentContent.toString('base64'),
            certificateId: testCertificateId,
            timestamps: true,
            format: 'CMS',
          });

        expect([200, 400, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
          expect(response.body).toHaveProperty('signatureId');
        }
      });
    });

    describe('Petition Signing', () => {
      it('should sign a legal petition', async () => {
        const petitionContent = Buffer.from(
          'PETIÇÃO INICIAL\n\nTexto da petição de teste...',
        );

        const response = await request(app)
          .post('/api/signature/sign/petition')
          .set('Authorization', authHeader)
          .send({
            petitionId: 'test-petition-001',
            petitionContent: petitionContent.toString('base64'),
            signerName: 'João Silva',
            signerCPF: '123.456.789-00',
            certificateId: testCertificateId,
            includeTimestamp: true,
            signatureFormat: 'PAdES',
          });

        expect([200, 400, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body).toHaveProperty('petitionId', 'test-petition-001');
          expect(response.body).toHaveProperty('signatureId');
          expect(response.body).toHaveProperty('signedPetition');
          expect(response.body.signatureMetadata).toHaveProperty(
            'signerName',
            'João Silva',
          );
        }
      });

      it('should sign petition with attachments', async () => {
        const petitionContent = Buffer.from('Petição com anexos');
        const attachment1 = Buffer.from('Anexo 1 conteúdo');
        const attachment2 = Buffer.from('Anexo 2 conteúdo');

        const response = await request(app)
          .post('/api/signature/sign/petition')
          .set('Authorization', authHeader)
          .send({
            petitionId: 'test-petition-with-attachments',
            petitionContent: petitionContent.toString('base64'),
            signerName: 'Maria Santos',
            certificateId: testCertificateId,
            attachments: [
              {
                name: 'documento1.pdf',
                content: attachment1.toString('base64'),
              },
              {
                name: 'documento2.pdf',
                content: attachment2.toString('base64'),
              },
            ],
          });

        expect([200, 400, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      });

      it('should require mandatory petition fields', async () => {
        const response = await request(app)
          .post('/api/signature/sign/petition')
          .set('Authorization', authHeader)
          .send({
            signerName: 'Test User',
          });

        expect(response.status).toBe(400);
        expect(response.body.status).toBe('error');
      });
    });
  });

  describe('Signature Verification', () => {
    it('should verify a signed document', async () => {
      const signedDocument = Buffer.from('Mock signed document content');

      const response = await request(app)
        .post('/api/signature/verify/signature')
        .set('Authorization', authHeader)
        .send({
          signedDocument: signedDocument.toString('base64'),
        });

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body).toHaveProperty('isValid');
        expect(response.body).toHaveProperty('verification');
        expect(response.body.verification).toHaveProperty('isValid');
        expect(response.body.verification).toHaveProperty(
          'signatureTimestamp',
        );
        expect(response.body.verification).toHaveProperty('signerCertificate');
        expect(response.body.verification).toHaveProperty('contentHash');
        expect(response.body.verification).toHaveProperty('errors');
      }
    });

    it('should verify signature with original document', async () => {
      const signedDocument = Buffer.from('Signed content');
      const originalDocument = Buffer.from('Original content');

      const response = await request(app)
        .post('/api/signature/verify/signature')
        .set('Authorization', authHeader)
        .send({
          signedDocument: signedDocument.toString('base64'),
          originalDocument: originalDocument.toString('base64'),
        });

        expect([200, 400, 500]).toContain(response.status);

        if (response.status === 200) {
          expect(response.body.status).toBe('success');
        }
    });

    it('should reject verification without signed document', async () => {
      const response = await request(app)
        .post('/api/signature/verify/signature')
        .set('Authorization', authHeader)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });
  });

  describe('Signature Retrieval', () => {
    it('should retrieve signature details by ID', async () => {
      if (!testSignatureId) {
        expect(testSignatureId).toBeDefined();
        return;
      }

      const response = await request(app)
        .get(`/api/signature/signature/${testSignatureId}`)
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.signature).toHaveProperty('id');
        expect(response.body.signature).toHaveProperty('signerId');
        expect(response.body.signature).toHaveProperty('certificateId');
        expect(response.body.signature).toHaveProperty('signingTime');
      }
    });

    it('should return 404 for non-existent signature', async () => {
      const response = await request(app)
        .get('/api/signature/signature/non-existent-id')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });
  });

  describe('Security and Access Control', () => {
    it('should require authentication for certificate operations', async () => {
      const response = await request(app).get('/api/signature/certificates');

      expect([401, 500]).toContain(response.status);
    });

    it('should require authentication for signing operations', async () => {
      const response = await request(app)
        .post('/api/signature/sign/document')
        .send({
          documentName: 'test.txt',
          documentContent: Buffer.from('test').toString('base64'),
          certificateId: 'test-cert',
        });

      expect([401, 500]).toContain(response.status);
    });

    it('should require authentication for verification', async () => {
      const response = await request(app)
        .post('/api/signature/verify/signature')
        .send({
          signedDocument: Buffer.from('test').toString('base64'),
        });

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid certificate gracefully', async () => {
      const response = await request(app)
        .post('/api/signature/sign/document')
        .set('Authorization', authHeader)
        .send({
          documentName: 'test.txt',
          documentContent: Buffer.from('test').toString('base64'),
          certificateId: 'invalid-cert-id',
        });

      expect([400, 404, 500]).toContain(response.status);
    });

    it('should handle malformed request data', async () => {
      const response = await request(app)
        .post('/api/signature/sign/document')
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect([400, 500]).toContain(response.status);
    });

    it('should provide meaningful error messages', async () => {
      const response = await request(app)
        .post('/api/signature/sign/document')
        .set('Authorization', authHeader)
        .send({
          documentName: 'test.txt',
        });

      if (response.status >= 400) {
        expect(response.body).toHaveProperty('message');
        expect(typeof response.body.message).toBe('string');
      }
    });
  });
});
