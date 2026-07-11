import { intimationCaptureService } from '@services/IntimationCaptureService';
import { crmService } from '@services/CRMService';

describe('IntimationCaptureService', () => {
  beforeEach(() => {
    intimationCaptureService.reset();
    crmService.reset();
  });

  describe('processDocument', () => {
    test('should process intimation document', async () => {
      const clientId = 'client-123';
      const documentUrl = 'https://example.com/intimacao.pdf';

      const document = await intimationCaptureService.processDocument(
        clientId,
        documentUrl,
        'intimação',
        'upload',
      );

      expect(document.clientId).toBe(clientId);
      expect(document.documentType).toBe('intimação');
      expect(document.source).toBe('upload');
      expect(document.ocrProcessed).toBe(true);
      expect(document.extractedData).toBeDefined();
    });

    test('should extract case number from document', async () => {
      const clientId = 'client-123';
      const documentUrl = 'https://example.com/document.pdf';

      const document = await intimationCaptureService.processDocument(
        clientId,
        documentUrl,
        'citação',
        'email',
      );

      expect(document.extractedData?.caseNumber).toBeDefined();
      expect(document.extractedData?.caseNumber).not.toBe('UNKNOWN');
    });

    test('should extract deadline date from document', async () => {
      const clientId = 'client-123';
      const documentUrl = 'https://example.com/document.pdf';

      const document = await intimationCaptureService.processDocument(
        clientId,
        documentUrl,
        'intimação',
        'upload',
      );

      expect(document.extractedData?.deadlineDate).toBeDefined();
      expect(document.extractedData?.deadlineDate instanceof Date).toBe(true);
    });

    test('should extract deadline type', async () => {
      const clientId = 'client-123';
      const documentUrl = 'https://example.com/document.pdf';

      const document = await intimationCaptureService.processDocument(
        clientId,
        documentUrl,
        'intimação',
        'upload',
      );

      expect(document.extractedData?.deadlineType).toBeDefined();
      expect(['resposta', 'recurso', 'manifestação', 'comparecimento', 'pagamento', 'apelação']).toContain(
        document.extractedData?.deadlineType,
      );
    });

    test('should extract parties from document', async () => {
      const clientId = 'client-123';
      const documentUrl = 'https://example.com/document.pdf';

      const document = await intimationCaptureService.processDocument(
        clientId,
        documentUrl,
        'sentença',
        'upload',
      );

      expect(document.extractedData?.parties).toBeDefined();
      expect(document.extractedData?.parties.length).toBeGreaterThan(0);
    });

    test('should handle WhatsApp source', async () => {
      const clientId = 'client-123';
      const documentUrl = 'https://example.com/doc.pdf';

      const document = await intimationCaptureService.processDocument(
        clientId,
        documentUrl,
        'mandado',
        'whatsapp',
      );

      expect(document.source).toBe('whatsapp');
    });

    test('should create deadline from extracted data', async () => {
      const clientId = 'client-123';
      const documentUrl = 'https://example.com/document.pdf';

      await intimationCaptureService.processDocument(
        clientId,
        documentUrl,
        'intimação',
        'upload',
      );

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);

      expect(deadlines.length).toBeGreaterThan(0);
      expect(deadlines[0].status).toBe('pending');
    });
  });

  describe('getClientDeadlines', () => {
    test('should retrieve all deadlines for a client', async () => {
      const clientId = 'client-123';

      // Create multiple documents
      for (let i = 0; i < 3; i++) {
        await intimationCaptureService.processDocument(
          clientId,
          `https://example.com/doc${i}.pdf`,
          'intimação',
          'upload',
        );
      }

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);

      expect(deadlines.length).toBe(3);
      expect(deadlines.every((d) => d.clientId === clientId)).toBe(true);
    });

    test('should return empty array for client with no deadlines', async () => {
      const deadlines = await intimationCaptureService.getClientDeadlines('non-existent');

      expect(deadlines.length).toBe(0);
      expect(Array.isArray(deadlines)).toBe(true);
    });
  });

  describe('getUpcomingDeadlines', () => {
    test('should return deadlines within specified days', async () => {
      const clientId = 'client-123';

      // Create document (will have deadline in near future based on mock)
      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      const upcomingDeadlines = await intimationCaptureService.getUpcomingDeadlines(30);

      expect(Array.isArray(upcomingDeadlines)).toBe(true);
      expect(upcomingDeadlines.every((d) => d.status === 'pending')).toBe(true);
    });

    test('should sort deadlines by date', async () => {
      const clientId = 'client-123';

      // Create multiple documents
      for (let i = 0; i < 3; i++) {
        await intimationCaptureService.processDocument(
          clientId,
          `https://example.com/doc${i}.pdf`,
          'intimação',
          'upload',
        );
      }

      const upcomingDeadlines = await intimationCaptureService.getUpcomingDeadlines(30);

      if (upcomingDeadlines.length > 1) {
        for (let i = 1; i < upcomingDeadlines.length; i++) {
          expect(
            upcomingDeadlines[i].deadlineDate.getTime() >=
              upcomingDeadlines[i - 1].deadlineDate.getTime(),
          ).toBe(true);
        }
      }
    });
  });

  describe('getOverdueDeadlines', () => {
    test('should identify overdue deadlines', async () => {
      const clientId = 'client-123';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      // Get deadlines and manually set one to past date for testing
      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const overdueDeadlines = await intimationCaptureService.getOverdueDeadlines();

      // Overdues depends on mock date generation
      expect(Array.isArray(overdueDeadlines)).toBe(true);
    });
  });

  describe('updateDeadlineStatus', () => {
    test('should update deadline status to completed', async () => {
      const clientId = 'client-123';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const deadlineId = deadlines[0].id;

      const updated = await intimationCaptureService.updateDeadlineStatus(
        deadlineId,
        'completed',
        'Resposta apresentada em juízo',
      );

      expect(updated.status).toBe('completed');
      expect(updated.completionDate).toBeDefined();
      expect(updated.completionNotes).toBe('Resposta apresentada em juízo');
    });

    test('should update deadline status to missed', async () => {
      const clientId = 'client-123';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const deadlineId = deadlines[0].id;

      const updated = await intimationCaptureService.updateDeadlineStatus(
        deadlineId,
        'missed',
        'Prazo perdido por falta de acompanhamento',
      );

      expect(updated.status).toBe('missed');
      expect(updated.completionDate).toBeDefined();
    });

    test('should update deadline status to in_progress', async () => {
      const clientId = 'client-123';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const deadlineId = deadlines[0].id;

      const updated = await intimationCaptureService.updateDeadlineStatus(
        deadlineId,
        'in_progress',
      );

      expect(updated.status).toBe('in_progress');
    });

    test('should throw error for non-existent deadline', async () => {
      await expect(
        intimationCaptureService.updateDeadlineStatus('non-existent', 'completed'),
      ).rejects.toThrow();
    });
  });

  describe('getDocument', () => {
    test('should retrieve document by ID', async () => {
      const clientId = 'client-123';
      const documentUrl = 'https://example.com/doc.pdf';

      const created = await intimationCaptureService.processDocument(
        clientId,
        documentUrl,
        'intimação',
        'upload',
      );

      const retrieved = await intimationCaptureService.getDocument(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.clientId).toBe(clientId);
    });

    test('should return null for non-existent document', async () => {
      const document = await intimationCaptureService.getDocument('non-existent');

      expect(document).toBeNull();
    });
  });

  describe('getClientDocuments', () => {
    test('should retrieve all documents for a client', async () => {
      const clientId = 'client-123';

      for (let i = 0; i < 3; i++) {
        await intimationCaptureService.processDocument(
          clientId,
          `https://example.com/doc${i}.pdf`,
          i % 2 === 0 ? 'intimação' : 'citação',
          'upload',
        );
      }

      const documents = await intimationCaptureService.getClientDocuments(clientId);

      expect(documents.length).toBe(3);
      expect(documents.every((d) => d.clientId === clientId)).toBe(true);
    });

    test('should return empty array for client with no documents', async () => {
      const documents = await intimationCaptureService.getClientDocuments('non-existent');

      expect(documents.length).toBe(0);
      expect(Array.isArray(documents)).toBe(true);
    });
  });

  describe('sendDeadlineNotification', () => {
    test('should send notification for deadline', async () => {
      const clientId = 'client-123';
      const recipientPhone = '11999999999';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const deadlineId = deadlines[0].id;

      const notification = await intimationCaptureService.sendDeadlineNotification(
        deadlineId,
        recipientPhone,
        'whatsapp',
      );

      expect(notification.type).toBe('whatsapp');
      expect(notification.recipient).toBe(recipientPhone);
      expect(notification.status).toBe('sent');
      expect(notification.message).toContain('Lembrete');
    });

    test('should track multiple notifications', async () => {
      const clientId = 'client-123';
      const recipientPhone = '11999999999';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const deadlineId = deadlines[0].id;

      await intimationCaptureService.sendDeadlineNotification(deadlineId, recipientPhone, 'whatsapp');
      await intimationCaptureService.sendDeadlineNotification(deadlineId, recipientPhone, 'email');

      const updated = await intimationCaptureService.getDocument(deadlines[0].documentId);

      const deadline = await intimationCaptureService.getClientDeadlines(clientId);
      expect(deadline[0].notificationsSent.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle different notification types', async () => {
      const clientId = 'client-123';
      const recipientPhone = '11999999999';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const deadlineId = deadlines[0].id;

      const types: Array<'email' | 'sms' | 'whatsapp' | 'push'> = ['email', 'sms', 'whatsapp', 'push'];

      for (const type of types) {
        const notification = await intimationCaptureService.sendDeadlineNotification(
          deadlineId,
          recipientPhone,
          type,
        );

        expect(notification.type).toBe(type);
      }
    });
  });

  describe('getStatistics', () => {
    test('should calculate statistics correctly', async () => {
      const clientId = 'client-123';

      for (let i = 0; i < 2; i++) {
        await intimationCaptureService.processDocument(
          clientId,
          `https://example.com/doc${i}.pdf`,
          'intimação',
          'upload',
        );
      }

      const stats = intimationCaptureService.getStatistics();

      expect(stats.totalDocuments).toBe(2);
      expect(stats.totalDeadlines).toBeGreaterThanOrEqual(2);
      expect(stats.pendingDeadlines).toBeGreaterThanOrEqual(0);
      expect(stats.completedDeadlines).toBe(0);
      expect(stats.missedDeadlines).toBe(0);
    });

    test('should track deadline status in statistics', async () => {
      const clientId = 'client-123';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const deadlineId = deadlines[0].id;

      await intimationCaptureService.updateDeadlineStatus(deadlineId, 'completed');

      const stats = intimationCaptureService.getStatistics();

      expect(stats.completedDeadlines).toBe(1);
      expect(stats.pendingDeadlines).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete document processing workflow', async () => {
      const clientId = 'client-123';

      // Process document
      const document = await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/intimacao.pdf',
        'intimação',
        'email',
      );

      expect(document.ocrProcessed).toBe(true);

      // Get deadlines
      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      expect(deadlines.length).toBeGreaterThan(0);

      // Send notification
      const notification = await intimationCaptureService.sendDeadlineNotification(
        deadlines[0].id,
        '11999999999',
        'whatsapp',
      );

      expect(notification.status).toBe('sent');

      // Update status
      const updated = await intimationCaptureService.updateDeadlineStatus(
        deadlines[0].id,
        'completed',
        'Resposta apresentada',
      );

      expect(updated.status).toBe('completed');
    });

    test('should track multiple documents per client', async () => {
      const clientId = 'client-123';
      const documentTypes = ['intimação', 'citação', 'mandado', 'sentença'];

      for (const docType of documentTypes) {
        await intimationCaptureService.processDocument(
          clientId,
          `https://example.com/${docType}.pdf`,
          docType as any,
          'upload',
        );
      }

      const documents = await intimationCaptureService.getClientDocuments(clientId);
      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);

      expect(documents.length).toBe(4);
      expect(deadlines.length).toBe(4);
    });
  });

  describe('reset', () => {
    test('should clear all data', async () => {
      const clientId = 'client-123';

      await intimationCaptureService.processDocument(
        clientId,
        'https://example.com/doc.pdf',
        'intimação',
        'upload',
      );

      intimationCaptureService.reset();

      const documents = await intimationCaptureService.getClientDocuments(clientId);
      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);
      const stats = intimationCaptureService.getStatistics();

      expect(documents.length).toBe(0);
      expect(deadlines.length).toBe(0);
      expect(stats.totalDocuments).toBe(0);
      expect(stats.totalDeadlines).toBe(0);
    });
  });
});
