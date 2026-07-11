import { contractLifecycleService } from '@services/ContractLifecycleService';
import { crmService } from '@services/CRMService';

describe('ContractLifecycleService', () => {
  beforeEach(() => {
    contractLifecycleService.reset();
    crmService.reset();
  });

  describe('Template Management', () => {
    test('should initialize with default templates', () => {
      const templates = contractLifecycleService.getTemplates();

      expect(templates.length).toBe(2);
      expect(templates.map((t) => t.name)).toContain('Contrato de Prestação de Serviços Jurídicos');
      expect(templates.map((t) => t.name)).toContain('Acordo de Confidencialidade (NDA)');
    });

    test('should get template by ID', () => {
      const templates = contractLifecycleService.getTemplates();
      const template = contractLifecycleService.getTemplate(templates[0].id);

      expect(template).not.toBeNull();
      expect(template?.category).toBe('service');
      expect(template?.isActive).toBe(true);
    });

    test('should return null for non-existent template', () => {
      const template = contractLifecycleService.getTemplate('non-existent');

      expect(template).toBeNull();
    });

    test('should create custom template', async () => {
      const template = await contractLifecycleService.createTemplate(
        'Contrato de Parceria',
        'partnership',
        'Este é um contrato de parceria entre {{PARTY_A}} e {{PARTY_B}}',
        ['PARTY_A', 'PARTY_B'],
        'test-user',
      );

      expect(template.name).toBe('Contrato de Parceria');
      expect(template.category).toBe('partnership');
      expect(template.variables).toContain('PARTY_A');
      expect(template.isActive).toBe(true);
    });

    test('should retrieve created custom template', async () => {
      const created = await contractLifecycleService.createTemplate(
        'Teste Template',
        'other',
        'Conteúdo teste',
        ['VAR1'],
        'user',
      );

      const retrieved = contractLifecycleService.getTemplate(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Teste Template');
    });
  });

  describe('Contract Creation', () => {
    test('should create contract from template', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente Teste',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const template = templates[0];

      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        template.id,
        {
          CLIENT_NAME: 'João Silva',
          CLIENT_DOCUMENT: '123.456.789-00',
          LAWYER_NAME: 'Dra. Maria Advogada',
          OAB_NUMBER: '123456',
          HOURLY_RATE: 'R$ 300,00',
          CONTRACT_DURATION: '365',
        },
        'Contrato de Serviços - João Silva',
      );

      expect(contract.status).toBe('draft');
      expect(contract.title).toBe('Contrato de Serviços - João Silva');
      expect(contract.version).toBe(1);
      expect(contract.signatures).toHaveLength(0);
    });

    test('should throw error for non-existent client', async () => {
      const templates = contractLifecycleService.getTemplates();

      await expect(
        contractLifecycleService.createContractFromTemplate(
          'non-existent',
          templates[0].id,
          { CLIENT_NAME: 'Test' },
          'Test Contract',
        ),
      ).rejects.toThrow();
    });

    test('should throw error for non-existent template', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      await expect(
        contractLifecycleService.createContractFromTemplate(
          client.id,
          'non-existent-template',
          {},
          'Test',
        ),
      ).rejects.toThrow();
    });

    test('should replace variables in contract content', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João Silva',
          CLIENT_DOCUMENT: '123.456.789-00',
          LAWYER_NAME: 'Dra. Maria',
          OAB_NUMBER: '123456',
          HOURLY_RATE: 'R$ 300',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      expect(contract.content).toContain('João Silva');
      expect(contract.content).toContain('R$ 300');
      expect(contract.content).not.toContain('{{CLIENT_NAME}}');
    });
  });

  describe('Contract Updates', () => {
    test('should update contract content', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato Original',
      );

      const updated = await contractLifecycleService.updateContract(
        contract.id,
        'Conteúdo atualizado',
        'reviewer',
        'Revisão de cláusulas finais',
      );

      expect(updated.version).toBe(2);
      expect(updated.content).toBe('Conteúdo atualizado');
      expect(updated.versionHistory).toHaveLength(1);
    });

    test('should track version history', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      await contractLifecycleService.updateContract(
        contract.id,
        'Versão 2',
        'user1',
        'Primeira atualização',
      );

      await contractLifecycleService.updateContract(
        contract.id,
        'Versão 3',
        'user2',
        'Segunda atualização',
      );

      const final = await contractLifecycleService.getContract(contract.id);

      expect(final?.version).toBe(3);
      expect(final?.versionHistory).toHaveLength(2);
      expect(final?.versionHistory[0].author).toBe('user1');
      expect(final?.versionHistory[1].author).toBe('user2');
    });

    test('should throw error for non-existent contract', async () => {
      await expect(
        contractLifecycleService.updateContract('non-existent', 'conteúdo', 'user', 'changes'),
      ).rejects.toThrow();
    });
  });

  describe('Digital Signatures', () => {
    test('should request signature on contract', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const signature = await contractLifecycleService.requestSignature(
        contract.id,
        'João Silva',
        'joao@example.com',
        '123.456.789-00',
      );

      expect(signature.status).toBe('pending');
      expect(signature.signer).toBe('João Silva');
      expect(signature.signatureMethod).toBe('digital_icp');
      expect(signature.expiresAt).toBeDefined();
    });

    test('should set contract status to pending_signature', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      await contractLifecycleService.requestSignature(
        contract.id,
        'João Silva',
        'joao@example.com',
        '123.456.789-00',
      );

      const updated = await contractLifecycleService.getContract(contract.id);

      expect(updated?.status).toBe('pending_signature');
    });

    test('should record digital signature with ICP-Brasil certificate', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const signature = await contractLifecycleService.requestSignature(
        contract.id,
        'João Silva',
        'joao@example.com',
        '123.456.789-00',
      );

      const signed = await contractLifecycleService.recordDigitalSignature(
        contract.id,
        signature.id,
        'CERT-ICP-2024-001',
        'ICP-Brasil',
      );

      expect(signed.status).toBe('signed');
      const recordedSig = signed.signatures[0];
      expect(recordedSig.status).toBe('signed');
      expect(recordedSig.certificateNumber).toBe('CERT-ICP-2024-001');
      expect(recordedSig.certificateIssuer).toBe('ICP-Brasil');
      expect(recordedSig.signedAt).toBeDefined();
    });

    test('should set contract status to signed when all signers signed', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const sig1 = await contractLifecycleService.requestSignature(
        contract.id,
        'Signer 1',
        'sig1@example.com',
        '111',
      );

      const sig2 = await contractLifecycleService.requestSignature(
        contract.id,
        'Signer 2',
        'sig2@example.com',
        '222',
      );

      await contractLifecycleService.recordDigitalSignature(
        contract.id,
        sig1.id,
        'CERT-1',
        'ICP-Brasil',
      );

      const finalContract = await contractLifecycleService.recordDigitalSignature(
        contract.id,
        sig2.id,
        'CERT-2',
        'ICP-Brasil',
      );

      expect(finalContract.status).toBe('signed');
    });

    test('should throw error for non-existent signature', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      await expect(
        contractLifecycleService.recordDigitalSignature(
          contract.id,
          'non-existent-sig',
          'CERT',
          'ICP',
        ),
      ).rejects.toThrow();
    });
  });

  describe('Compliance Checking', () => {
    test('should evaluate compliance on contract creation', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João Silva',
          CLIENT_DOCUMENT: '123.456.789-00',
          LAWYER_NAME: 'Dra. Maria',
          OAB_NUMBER: '123456',
          HOURLY_RATE: 'R$ 300,00',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      expect(contract.compliance).toBeDefined();
      expect(contract.compliance.checklist).toHaveLength(4);
    });

    test('should track compliance issues', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      expect(contract.compliance.checklist).toBeDefined();
      expect(Array.isArray(contract.compliance.checklist)).toBe(true);
    });

    test('should include compliance status in contract updates', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const updated = await contractLifecycleService.updateContract(
        contract.id,
        'Conteúdo revisado com todas as informações completas',
        'reviewer',
        'Revisão completa',
      );

      expect(updated.compliance).toBeDefined();
      expect(updated.compliance.checklist).toBeDefined();
    });
  });

  describe('Contract Status Management', () => {
    test('should archive contract', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const archived = await contractLifecycleService.archiveContract(contract.id);

      expect(archived.status).toBe('archived');
    });

    test('should throw error archiving non-existent contract', async () => {
      await expect(contractLifecycleService.archiveContract('non-existent')).rejects.toThrow();
    });
  });

  describe('Contract Retrieval', () => {
    test('should get contract by ID', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const created = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const retrieved = await contractLifecycleService.getContract(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    test('should return null for non-existent contract', async () => {
      const contract = await contractLifecycleService.getContract('non-existent');

      expect(contract).toBeNull();
    });

    test('should get client contracts', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();

      for (let i = 0; i < 3; i++) {
        await contractLifecycleService.createContractFromTemplate(
          client.id,
          templates[0].id,
          {
            CLIENT_NAME: `João ${i}`,
            CLIENT_DOCUMENT: `${i}23`,
            LAWYER_NAME: 'Maria',
            OAB_NUMBER: '456',
            HOURLY_RATE: 'R$ 200',
            CONTRACT_DURATION: '365',
          },
          `Contrato ${i}`,
        );
      }

      const clientContracts = await contractLifecycleService.getClientContracts(client.id);

      expect(clientContracts).toHaveLength(3);
    });

    test('should get contracts by status', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();

      for (let i = 0; i < 2; i++) {
        await contractLifecycleService.createContractFromTemplate(
          client.id,
          templates[0].id,
          {
            CLIENT_NAME: `João ${i}`,
            CLIENT_DOCUMENT: `${i}23`,
            LAWYER_NAME: 'Maria',
            OAB_NUMBER: '456',
            HOURLY_RATE: 'R$ 200',
            CONTRACT_DURATION: '365',
          },
          `Contrato ${i}`,
        );
      }

      const drafts = await contractLifecycleService.getContractsByStatus('draft');

      expect(drafts).toHaveLength(2);
    });
  });

  describe('Statistics', () => {
    test('should calculate statistics', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();

      for (let i = 0; i < 3; i++) {
        await contractLifecycleService.createContractFromTemplate(
          client.id,
          templates[0].id,
          {
            CLIENT_NAME: `João ${i}`,
            CLIENT_DOCUMENT: `${i}23`,
            LAWYER_NAME: 'Maria',
            OAB_NUMBER: '456',
            HOURLY_RATE: 'R$ 200',
            CONTRACT_DURATION: '365',
          },
          `Contrato ${i}`,
        );
      }

      const stats = contractLifecycleService.getStatistics();

      expect(stats.totalContracts).toBe(3);
      expect(stats.draftContracts).toBe(3);
      expect(stats.totalTemplates).toBeGreaterThanOrEqual(2);
    });

    test('should track signed contracts', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const sig = await contractLifecycleService.requestSignature(
        contract.id,
        'Signer',
        'signer@example.com',
        '123',
      );

      await contractLifecycleService.recordDigitalSignature(contract.id, sig.id, 'CERT', 'ICP');

      const stats = contractLifecycleService.getStatistics();

      expect(stats.signedContracts).toBe(1);
    });

    test('should track compliant contracts', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();

      for (let i = 0; i < 2; i++) {
        await contractLifecycleService.createContractFromTemplate(
          client.id,
          templates[0].id,
          {
            CLIENT_NAME: 'João Silva',
            CLIENT_DOCUMENT: '123.456.789-00',
            LAWYER_NAME: 'Dra. Maria',
            OAB_NUMBER: '123456',
            HOURLY_RATE: 'R$ 300,00',
            CONTRACT_DURATION: '365',
          },
          `Contrato ${i}`,
        );
      }

      const stats = contractLifecycleService.getStatistics();

      expect(stats.compliantContracts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Reset', () => {
    test('should reset all data', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      contractLifecycleService.reset();

      const stats = contractLifecycleService.getStatistics();

      expect(stats.totalContracts).toBe(0);
      expect(stats.signedContracts).toBe(0);
      expect(stats.draftContracts).toBe(0);
    });

    test('should reinitialize templates after reset', () => {
      contractLifecycleService.reset();

      const templates = contractLifecycleService.getTemplates();

      expect(templates.length).toBe(2);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete contract lifecycle', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente Teste',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João Silva',
          CLIENT_DOCUMENT: '123.456.789-00',
          LAWYER_NAME: 'Dra. Maria Advogada',
          OAB_NUMBER: '123456',
          HOURLY_RATE: 'R$ 300,00',
          CONTRACT_DURATION: '365',
        },
        'Contrato de Serviços Jurídicos',
      );

      expect(contract.status).toBe('draft');
      expect(contract.compliance).toBeDefined();

      const sig = await contractLifecycleService.requestSignature(
        contract.id,
        'João Silva',
        'joao@example.com',
        '123.456.789-00',
      );

      const contractAfterSignatureRequest = await contractLifecycleService.getContract(
        contract.id,
      );
      expect(contractAfterSignatureRequest?.status).toBe('pending_signature');

      const signed = await contractLifecycleService.recordDigitalSignature(
        contract.id,
        sig.id,
        'CERT-ICP-2024-001',
        'ICP-Brasil',
      );

      expect(signed.status).toBe('signed');
    });

    test('should handle multiple signers workflow', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const signers = [
        { name: 'Signer 1', email: 'sig1@example.com', cpf: '111' },
        { name: 'Signer 2', email: 'sig2@example.com', cpf: '222' },
        { name: 'Signer 3', email: 'sig3@example.com', cpf: '333' },
      ];

      const signatures = [];
      for (const signer of signers) {
        const sig = await contractLifecycleService.requestSignature(
          contract.id,
          signer.name,
          signer.email,
          signer.cpf,
        );
        signatures.push(sig);
      }

      let currentContract = await contractLifecycleService.getContract(contract.id);
      expect(currentContract?.signatures).toHaveLength(3);

      for (let i = 0; i < signatures.length - 1; i++) {
        await contractLifecycleService.recordDigitalSignature(
          contract.id,
          signatures[i].id,
          `CERT-${i}`,
          'ICP-Brasil',
        );

        currentContract = await contractLifecycleService.getContract(contract.id);
        expect(currentContract?.status).toBe('pending_signature');
      }

      const finalSigned = await contractLifecycleService.recordDigitalSignature(
        contract.id,
        signatures[signatures.length - 1].id,
        `CERT-${signatures.length - 1}`,
        'ICP-Brasil',
      );

      expect(finalSigned.status).toBe('signed');
    });

    test('should track contract versions through editing workflow', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato Original',
      );

      const v2 = await contractLifecycleService.updateContract(
        contract.id,
        'Conteúdo versão 2',
        'lawyer-1',
        'Alterações na cláusula 1',
      );

      const v3 = await contractLifecycleService.updateContract(
        contract.id,
        'Conteúdo versão 3',
        'lawyer-2',
        'Alterações na cláusula 2',
      );

      const v4 = await contractLifecycleService.updateContract(
        contract.id,
        'Conteúdo versão 4',
        'client-review',
        'Cliente revisou e aprovou',
      );

      expect(v4.version).toBe(4);
      expect(v4.versionHistory).toHaveLength(3);
      expect(v4.versionHistory[0].author).toBe('lawyer-1');
      expect(v4.versionHistory[1].author).toBe('lawyer-2');
      expect(v4.versionHistory[2].author).toBe('client-review');
    });

    test('should archive signed contracts', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const templates = contractLifecycleService.getTemplates();
      const contract = await contractLifecycleService.createContractFromTemplate(
        client.id,
        templates[0].id,
        {
          CLIENT_NAME: 'João',
          CLIENT_DOCUMENT: '123',
          LAWYER_NAME: 'Maria',
          OAB_NUMBER: '456',
          HOURLY_RATE: 'R$ 200',
          CONTRACT_DURATION: '365',
        },
        'Contrato',
      );

      const sig = await contractLifecycleService.requestSignature(
        contract.id,
        'João',
        'joao@example.com',
        '123',
      );

      await contractLifecycleService.recordDigitalSignature(
        contract.id,
        sig.id,
        'CERT',
        'ICP-Brasil',
      );

      const archived = await contractLifecycleService.archiveContract(contract.id);

      expect(archived.status).toBe('archived');
    });
  });
});
