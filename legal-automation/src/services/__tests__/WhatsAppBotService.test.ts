import { whatsAppBotService, WhatsAppMessage, ConversationState } from '@services/WhatsAppBotService';
import { crmService } from '@services/CRMService';

describe('WhatsAppBotService', () => {
  beforeEach(() => {
    crmService.reset();
  });

  describe('processMessage', () => {
    test('should process greeting message and move to qualification', async () => {
      const message: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      const response = await whatsAppBotService.processMessage(message);

      expect(response.responseText).toContain('Bem-vindo');
      expect(response.nextStage).toBe('qualification');
    });

    test('should create client if not exists', async () => {
      const message: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João Silva',
        messageText: 'Preciso de ajuda com um caso trabalhista',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(message);

      const client = await crmService.findClientByContact('11999999999');

      expect(client).not.toBeNull();
      expect(client?.source).toBe('whatsapp');
    });

    test('should use existing client if found', async () => {
      const existingClient = await crmService.createOrUpdateClient({
        name: 'Cliente Existente',
        email: 'cliente@example.com',
        phone: '11999999999',
        source: 'whatsapp',
      });

      const message: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'Cliente Existente',
        messageText: 'Olá novamente',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(message);

      const client = await crmService.findClientByContact('11999999999');

      expect(client?.id).toBe(existingClient.id);
    });

    test('should log interaction', async () => {
      const message: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Mensagem de teste',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(message);

      const client = await crmService.findClientByContact('11999999999');
      const history = await crmService.getClientHistory(client!.id);

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].content).toContain('Mensagem de teste');
    });
  });

  describe('handleGreeting', () => {
    test('should transition from greeting to qualification stage', async () => {
      const message: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      const response = await whatsAppBotService.processMessage(message);

      expect(response.nextStage).toBe('qualification');
      expect(response.responseText).toContain('descrever brevemente');
    });

    test('should provide case type suggestions', async () => {
      const message: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      const response = await whatsAppBotService.processMessage(message);

      expect(response.responseText).toContain('Trabalhista');
      expect(response.responseText).toContain('Familiar');
      expect(response.responseText).toContain('Cível');
    });
  });

  describe('handleQualification', () => {
    test('should classify case type and move to document collection', async () => {
      const greeting: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      // First: greeting
      await whatsAppBotService.processMessage(greeting);

      // Second: qualification
      const qualification: WhatsAppMessage = {
        id: 'msg-2',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Fui demitido sem justa causa, preciso de ajuda urgente',
        messageType: 'text',
        timestamp: new Date(),
      };

      const response = await whatsAppBotService.processMessage(qualification);

      expect(response.responseText).toContain('trabalhista');
      expect(response.nextStage).toBe('document_collection');
    });

    test('should detect urgency keywords', async () => {
      const greeting: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(greeting);

      const urgentMsg: WhatsAppMessage = {
        id: 'msg-2',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Preciso urgente de ajuda, é prazo amanhã',
        messageType: 'text',
        timestamp: new Date(),
      };

      const response = await whatsAppBotService.processMessage(urgentMsg);

      expect(response.responseText).toContain('🔴');
    });

    test('should handle handoff request', async () => {
      const greeting: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(greeting);

      const handoffMsg: WhatsAppMessage = {
        id: 'msg-2',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Quero falar com um advogado agora',
        messageType: 'text',
        timestamp: new Date(),
      };

      const response = await whatsAppBotService.processMessage(handoffMsg);

      expect(response.requiresHumanReview).toBe(true);
      expect(response.nextStage).toBe('handoff');
    });
  });

  describe('handleDocumentCollection', () => {
    test('should acknowledge document receipt', async () => {
      const greeting: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(greeting);

      const qualification: WhatsAppMessage = {
        id: 'msg-2',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Preciso de ajuda com meu caso trabalhista',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(qualification);

      const document: WhatsAppMessage = {
        id: 'msg-3',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'RG',
        messageType: 'document',
        attachmentUrl: 'https://example.com/rg.pdf',
        attachmentType: 'pdf',
        timestamp: new Date(),
      };

      const response = await whatsAppBotService.processMessage(document);

      expect(response.responseText).toContain('sucesso');
    });

    test('should track document collection progress', async () => {
      // Complete greeting and qualification stages first
      const greeting: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(greeting);

      const qualification: WhatsAppMessage = {
        id: 'msg-2',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Preciso de ajuda com meu caso',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(qualification);

      const client = await crmService.findClientByContact('11999999999');
      const state = whatsAppBotService.getConversationState(client!.id);

      expect(state?.stage).toBe('document_collection');
    });
  });

  describe('handlePayment', () => {
    test('should generate payment link', async () => {
      // Complete all stages up to payment
      const msgs = [
        { text: 'Olá', type: 'text' },
        { text: 'Fui demitido, preciso de ajuda', type: 'text' },
        { text: 'RG', type: 'document', attachmentUrl: 'url' },
        { text: 'CPF', type: 'document', attachmentUrl: 'url' },
        { text: 'Comprovante', type: 'document', attachmentUrl: 'url' },
      ];

      for (let i = 0; i < msgs.length; i++) {
        const message: WhatsAppMessage = {
          id: `msg-${i}`,
          phoneNumber: '11999999999',
          senderName: 'João',
          messageText: msgs[i].text,
          messageType: msgs[i].type as any,
          attachmentUrl: (msgs[i] as any).attachmentUrl,
          timestamp: new Date(),
        };

        await whatsAppBotService.processMessage(message);
      }

      const response = await whatsAppBotService.processMessage({
        id: 'msg-final',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Pronto, vou pagar',
        messageType: 'text',
        timestamp: new Date(),
      });

      expect(response.responseText).toContain('pagamento');
      expect(response.responseText).toContain('http');
    });
  });

  describe('getConversationHistory', () => {
    test('should retrieve message history', async () => {
      const msgs = [
        { id: '1', text: 'Olá' },
        { id: '2', text: 'Preciso de ajuda' },
        { id: '3', text: 'Com um caso trabalhista' },
      ];

      for (const msg of msgs) {
        const message: WhatsAppMessage = {
          id: msg.id,
          phoneNumber: '11999999999',
          senderName: 'João',
          messageText: msg.text,
          messageType: 'text',
          timestamp: new Date(),
        };

        await whatsAppBotService.processMessage(message);
      }

      const client = await crmService.findClientByContact('11999999999');
      const history = await whatsAppBotService.getConversationHistory(client!.id);

      expect(history.length).toBe(3);
      expect(history[0].messageText).toBe('Olá');
      expect(history[2].messageText).toBe('Com um caso trabalhista');
    });
  });

  describe('getConversationState', () => {
    test('should retrieve current conversation state', async () => {
      const message: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(message);

      const client = await crmService.findClientByContact('11999999999');
      const state = whatsAppBotService.getConversationState(client!.id);

      expect(state).not.toBeUndefined();
      expect(state?.stage).toBe('qualification');
      expect(state?.phoneNumber).toBe('11999999999');
    });
  });

  describe('resetConversation', () => {
    test('should clear conversation state', async () => {
      const message: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(message);

      const client = await crmService.findClientByContact('11999999999');
      let state = whatsAppBotService.getConversationState(client!.id);
      expect(state).not.toBeUndefined();

      whatsAppBotService.resetConversation(client!.id);

      state = whatsAppBotService.getConversationState(client!.id);
      expect(state).toBeUndefined();
    });
  });

  describe('exportConversationStates', () => {
    test('should export all conversation states', async () => {
      const clients = [
        { phone: '11999999999', name: 'João' },
        { phone: '11988888888', name: 'Maria' },
        { phone: '11977777777', name: 'Paulo' },
      ];

      for (const client of clients) {
        const message: WhatsAppMessage = {
          id: `msg-${client.phone}`,
          phoneNumber: client.phone,
          senderName: client.name,
          messageText: 'Olá',
          messageType: 'text',
          timestamp: new Date(),
        };

        await whatsAppBotService.processMessage(message);
      }

      const exported = whatsAppBotService.exportConversationStates();

      expect(Object.keys(exported).length).toBe(3);
      expect(Object.values(exported).every((s) => s.stage === 'qualification')).toBe(true);
    });
  });

  describe('getStatistics', () => {
    test('should calculate statistics correctly', async () => {
      const clients = [
        { phone: '11999999999', name: 'João' },
        { phone: '11988888888', name: 'Maria' },
      ];

      for (const client of clients) {
        const message: WhatsAppMessage = {
          id: `msg-${client.phone}`,
          phoneNumber: client.phone,
          senderName: client.name,
          messageText: 'Olá',
          messageType: 'text',
          timestamp: new Date(),
        };

        await whatsAppBotService.processMessage(message);
      }

      const stats = whatsAppBotService.getStatistics();

      expect(stats.activeConversations).toBe(2);
      expect(stats.totalMessages).toBeGreaterThanOrEqual(2);
      expect(stats.averageDocumentsCollected).toBeGreaterThanOrEqual(0);
    });

    test('should track message count accurately', async () => {
      const phone = '11999999999';

      for (let i = 0; i < 5; i++) {
        const message: WhatsAppMessage = {
          id: `msg-${i}`,
          phoneNumber: phone,
          senderName: 'João',
          messageText: `Mensagem ${i}`,
          messageType: 'text',
          timestamp: new Date(),
        };

        await whatsAppBotService.processMessage(message);
      }

      const stats = whatsAppBotService.getStatistics();

      expect(stats.totalMessages).toBe(5);
      expect(stats.activeConversations).toBe(1);
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete customer journey', async () => {
      const scenarios = [
        { text: 'Olá', stage: 'qualification' },
        { text: 'Fui demitido, preciso de ajuda urgente', stage: 'document_collection' },
        {
          text: 'RG',
          type: 'document',
          attachmentUrl: 'url1',
          stage: 'document_collection',
        },
        {
          text: 'CPF',
          type: 'document',
          attachmentUrl: 'url2',
          stage: 'document_collection',
        },
        {
          text: 'Comprovante',
          type: 'document',
          attachmentUrl: 'url3',
          stage: 'payment',
        },
        { text: 'Entendi', stage: 'completed' },
      ];

      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i] as any;
        const message: WhatsAppMessage = {
          id: `msg-${i}`,
          phoneNumber: '11999999999',
          senderName: 'João',
          messageText: scenario.text,
          messageType: scenario.type || 'text',
          attachmentUrl: scenario.attachmentUrl,
          timestamp: new Date(),
        };

        const response = await whatsAppBotService.processMessage(message);

        if (i < scenarios.length - 1) {
          expect(response.nextStage).toBe(scenarios[i + 1].stage);
        }
      }

      const client = await crmService.findClientByContact('11999999999');
      expect(client?.status).toBe('customer');
    });

    test('should handle mid-flow handoff', async () => {
      const message1: WhatsAppMessage = {
        id: 'msg-1',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Olá',
        messageType: 'text',
        timestamp: new Date(),
      };

      await whatsAppBotService.processMessage(message1);

      const handoffMsg: WhatsAppMessage = {
        id: 'msg-2',
        phoneNumber: '11999999999',
        senderName: 'João',
        messageText: 'Preciso falar com um advogado humano',
        messageType: 'text',
        timestamp: new Date(),
      };

      const response = await whatsAppBotService.processMessage(handoffMsg);

      expect(response.requiresHumanReview).toBe(true);
      expect(response.nextStage).toBe('handoff');
    });
  });
});
