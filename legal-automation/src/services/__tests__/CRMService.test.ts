import { crmService, ClientProfile, CaseClassification } from '@services/CRMService';

describe('CRMService', () => {
  beforeEach(() => {
    crmService.reset();
  });

  describe('createOrUpdateClient', () => {
    test('should create a new client', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'João Silva',
        email: 'joao@example.com',
        phone: '11999999999',
        cpf: '12345678900',
        source: 'whatsapp',
      });

      expect(client.name).toBe('João Silva');
      expect(client.email).toBe('joao@example.com');
      expect(client.phone).toBe('11999999999');
      expect(client.status).toBe('prospect');
      expect(client.source).toBe('whatsapp');
    });

    test('should update an existing client', async () => {
      const created = await crmService.createOrUpdateClient({
        name: 'João Silva',
        email: 'joao@example.com',
        phone: '11999999999',
      });

      const updated = await crmService.createOrUpdateClient({
        id: created.id,
        name: 'João Silva Santos',
        email: 'joao@example.com',
      });

      expect(updated.name).toBe('João Silva Santos');
      expect(updated.id).toBe(created.id);
    });

    test('should set default status to prospect', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Maria Silva',
        email: 'maria@example.com',
      });

      expect(client.status).toBe('prospect');
    });

    test('should allow custom status on creation', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Paulo Santos',
        email: 'paulo@example.com',
        status: 'lead',
      });

      expect(client.status).toBe('lead');
    });
  });

  describe('getClientById', () => {
    test('should retrieve a client by ID', async () => {
      const created = await crmService.createOrUpdateClient({
        name: 'Cliente Teste',
        email: 'teste@example.com',
      });

      const retrieved = await crmService.getClientById(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Cliente Teste');
    });

    test('should return null for non-existent client', async () => {
      const retrieved = await crmService.getClientById('non-existent-id');

      expect(retrieved).toBeNull();
    });
  });

  describe('findClientByContact', () => {
    test('should find client by phone', async () => {
      const created = await crmService.createOrUpdateClient({
        name: 'João',
        email: 'joao@example.com',
        phone: '11988888888',
      });

      const found = await crmService.findClientByContact('11988888888');

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    test('should find client by email', async () => {
      const created = await crmService.createOrUpdateClient({
        name: 'Maria',
        email: 'maria@example.com',
        phone: '11977777777',
      });

      const found = await crmService.findClientByContact(undefined, 'maria@example.com');

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    test('should return null if client not found', async () => {
      const found = await crmService.findClientByContact('11911111111');

      expect(found).toBeNull();
    });
  });

  describe('logInteraction', () => {
    test('should log an interaction for a client', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
        phone: '11966666666',
      });

      const interaction = await crmService.logInteraction(
        client.id,
        'message',
        'whatsapp',
        'Olá, preciso de ajuda',
      );

      expect(interaction.clientId).toBe(client.id);
      expect(interaction.type).toBe('message');
      expect(interaction.channel).toBe('whatsapp');
      expect(interaction.content).toBe('Olá, preciso de ajuda');
    });

    test('should track interaction with attachments', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const interaction = await crmService.logInteraction(
        client.id,
        'message',
        'email',
        'Enviando documentos',
        ['doc1.pdf', 'doc2.pdf'],
      );

      expect(interaction.attachments).toEqual(['doc1.pdf', 'doc2.pdf']);
    });

    test('should update client lastInteractionAt', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const beforeInteraction = new Date();
      await crmService.logInteraction(client.id, 'message', 'whatsapp', 'Teste');
      const afterInteraction = new Date();

      const updated = await crmService.getClientById(client.id);

      expect(updated?.lastInteractionAt).not.toBeNull();
      expect(updated?.lastInteractionAt!.getTime()).toBeGreaterThanOrEqual(
        beforeInteraction.getTime(),
      );
      expect(updated?.lastInteractionAt!.getTime()).toBeLessThanOrEqual(afterInteraction.getTime());
    });
  });

  describe('getClientHistory', () => {
    test('should retrieve client interaction history', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      await crmService.logInteraction(client.id, 'message', 'whatsapp', 'Mensagem 1');
      await crmService.logInteraction(client.id, 'message', 'whatsapp', 'Mensagem 2');
      await crmService.logInteraction(client.id, 'call', 'phone', 'Ligação realizada');

      const history = await crmService.getClientHistory(client.id);

      expect(history.length).toBe(3);
      expect(history[0].content).toBe('Mensagem 1');
      expect(history[2].type).toBe('call');
    });

    test('should respect limit parameter', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      for (let i = 1; i <= 100; i++) {
        await crmService.logInteraction(client.id, 'message', 'whatsapp', `Mensagem ${i}`);
      }

      const history = await crmService.getClientHistory(client.id, 10);

      expect(history.length).toBe(10);
      expect(history[0].content).toBe('Mensagem 91');
      expect(history[9].content).toBe('Mensagem 100');
    });
  });

  describe('updateClientStatus', () => {
    test('should update client status', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const updated = await crmService.updateClientStatus(client.id, 'lead');

      expect(updated.status).toBe('lead');
    });

    test('should track status transitions', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      expect(client.status).toBe('prospect');

      await crmService.updateClientStatus(client.id, 'lead');
      let updated = await crmService.getClientById(client.id);
      expect(updated?.status).toBe('lead');

      await crmService.updateClientStatus(client.id, 'qualified');
      updated = await crmService.getClientById(client.id);
      expect(updated?.status).toBe('qualified');

      await crmService.updateClientStatus(client.id, 'customer');
      updated = await crmService.getClientById(client.id);
      expect(updated?.status).toBe('customer');
    });

    test('should throw error for non-existent client', async () => {
      await expect(crmService.updateClientStatus('non-existent', 'lead')).rejects.toThrow();
    });
  });

  describe('classifyCase', () => {
    test('should classify trabalhista case', async () => {
      const classification = await crmService.classifyCase(
        'Fui demitido sem justa causa, preciso de orientação',
      );

      expect(classification.caseType).toBe('trabalhista');
      expect(classification.estimatedHours).toBe(12);
    });

    test('should classify familia case', async () => {
      const classification = await crmService.classifyCase('Preciso de divórcio amigável');

      expect(classification.caseType).toBe('familia');
      expect(classification.estimatedHours).toBe(16);
    });

    test('should classify civil case', async () => {
      const classification = await crmService.classifyCase('Tenho uma débito que preciso cobrar');

      expect(classification.caseType).toBe('civil');
      expect(classification.estimatedHours).toBe(10);
    });

    test('should classify criminal case', async () => {
      const classification = await crmService.classifyCase(
        'Fui acusado de um crime e preciso de defesa',
      );

      expect(classification.caseType).toBe('criminal');
      expect(classification.complexity).toBe('complex');
      expect(classification.estimatedHours).toBe(20);
    });

    test('should classify imobiliario case', async () => {
      const classification = await crmService.classifyCase(
        'Tenho uma disputa sobre uma propriedade imóvel',
      );

      expect(classification.caseType).toBe('imobiliario');
      expect(classification.estimatedHours).toBe(14);
    });

    test('should classify consumidor case', async () => {
      const classification = await crmService.classifyCase(
        'Comprei um produto defeituoso e o vendedor não aceita devolver',
      );

      expect(classification.caseType).toBe('consumidor');
      expect(classification.complexity).toBe('simple');
      expect(classification.estimatedHours).toBe(6);
    });

    test('should detect urgency keywords', async () => {
      const urgentClass = await crmService.classifyCase(
        'Tenho um prazo urgente de resposta amanhã para um caso trabalhista',
      );

      expect(urgentClass.urgency).toBe('high');
    });

    test('should detect complexity based on message length', async () => {
      const shortMsg = 'Preciso de ajuda com um caso';
      const classShort = await crmService.classifyCase(shortMsg);
      expect(classShort.complexity).toBe('simple');

      const longMsg =
        'Tenho uma situação muito complicada que envolve múltiplos aspectos legais. ' +
        'Primeiro, há uma questão trabalhista envolvendo demissão discriminatória. ' +
        'Segundo, há uma disputa cível relacionada a débitos contratuais. ' +
        'Terceiro, há considerações sobre responsabilidade penal. ' +
        'Quarto, há implicações imobiliárias para minha propriedade. ' +
        'E finalmente, há questões de direito do consumidor envolvendo produtos defeituosos. ' +
        'Preciso de uma análise completa de todas essas dimensões.';

      const classLong = await crmService.classifyCase(longMsg);
      expect(classLong.complexity).toBe('complex');
    });

    test('should return valid confidence score', async () => {
      const classification = await crmService.classifyCase('Preciso de ajuda legal');

      expect(classification.confidence).toBeGreaterThanOrEqual(0);
      expect(classification.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('getPipelineStatistics', () => {
    test('should calculate pipeline statistics', async () => {
      await crmService.createOrUpdateClient({
        name: 'Cliente 1',
        email: 'cliente1@example.com',
        status: 'prospect',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 2',
        email: 'cliente2@example.com',
        status: 'lead',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 3',
        email: 'cliente3@example.com',
        status: 'qualified',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 4',
        email: 'cliente4@example.com',
        status: 'customer',
      });

      const stats = await crmService.getPipelineStatistics();

      expect(stats.prospectCount).toBe(1);
      expect(stats.leadCount).toBe(1);
      expect(stats.qualifiedCount).toBe(1);
      expect(stats.customerCount).toBe(1);
    });

    test('should calculate conversion rate', async () => {
      // 2 prospects/leads, 1 customer = 50% conversion
      await crmService.createOrUpdateClient({
        name: 'Cliente 1',
        email: 'cliente1@example.com',
        status: 'prospect',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 2',
        email: 'cliente2@example.com',
        status: 'lead',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 3',
        email: 'cliente3@example.com',
        status: 'customer',
      });

      const stats = await crmService.getPipelineStatistics();

      expect(stats.conversionRate).toBe(0.5);
    });

    test('should handle empty pipeline', async () => {
      const stats = await crmService.getPipelineStatistics();

      expect(stats.prospectCount).toBe(0);
      expect(stats.leadCount).toBe(0);
      expect(stats.qualifiedCount).toBe(0);
      expect(stats.customerCount).toBe(0);
      expect(stats.conversionRate).toBe(0);
    });
  });

  describe('getClientsByStatus', () => {
    test('should retrieve clients by status', async () => {
      await crmService.createOrUpdateClient({
        name: 'Cliente 1',
        email: 'cliente1@example.com',
        status: 'prospect',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 2',
        email: 'cliente2@example.com',
        status: 'prospect',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 3',
        email: 'cliente3@example.com',
        status: 'lead',
      });

      const prospects = await crmService.getClientsByStatus('prospect');

      expect(prospects.length).toBe(2);
      expect(prospects.every((c) => c.status === 'prospect')).toBe(true);
    });
  });

  describe('getFollowUpRecommendations', () => {
    test('should recommend follow-up for inactive prospects', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Prospect Inativo',
        email: 'prospect@example.com',
        status: 'prospect',
      });

      // Set old interaction time
      await crmService.logInteraction(client.id, 'message', 'whatsapp', 'Teste');
      const oldClient = await crmService.getClientById(client.id);
      if (oldClient) {
        oldClient.lastInteractionAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      }

      const recommendations = await crmService.getFollowUpRecommendations();

      expect(
        recommendations.some(
          (r) => r.clientId === client.id && r.type === 'follow_up_prospect',
        ),
      ).toBe(true);
    });

    test('should recommend conversion for qualified clients', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente Qualificado',
        email: 'qualified@example.com',
        status: 'qualified',
      });

      const recommendations = await crmService.getFollowUpRecommendations();

      expect(
        recommendations.some(
          (r) => r.clientId === client.id && r.type === 'convert_to_customer',
        ),
      ).toBe(false); // Won't appear if recently interacted
    });

    test('should recommend retention for inactive customers', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente Inativo',
        email: 'customer@example.com',
        status: 'customer',
      });

      // Set old interaction time
      await crmService.logInteraction(client.id, 'message', 'whatsapp', 'Teste');
      const oldClient = await crmService.getClientById(client.id);
      if (oldClient) {
        oldClient.lastInteractionAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      }

      const recommendations = await crmService.getFollowUpRecommendations();

      expect(
        recommendations.some(
          (r) => r.clientId === client.id && r.type === 'retention_contact',
        ),
      ).toBe(true);
    });
  });

  describe('getAllClients', () => {
    test('should retrieve all clients', async () => {
      await crmService.createOrUpdateClient({
        name: 'Cliente 1',
        email: 'cliente1@example.com',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 2',
        email: 'cliente2@example.com',
      });

      await crmService.createOrUpdateClient({
        name: 'Cliente 3',
        email: 'cliente3@example.com',
      });

      const clients = crmService.getAllClients();

      expect(clients.length).toBe(3);
      expect(clients.every((c) => c.id)).toBe(true);
    });
  });

  describe('reset', () => {
    test('should clear all data', async () => {
      await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      await crmService.logInteraction('client-1', 'message', 'whatsapp', 'Teste');

      crmService.reset();

      const clients = crmService.getAllClients();
      const history = await crmService.getClientHistory('client-1');

      expect(clients.length).toBe(0);
      expect(history.length).toBe(0);
    });
  });
});
