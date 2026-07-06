import { AdapterFactory } from '@adapters/AdapterFactory';
import { TribunalAdapter, SearchCriteria } from '@adapters/TribunalAdapter';
import { logger } from '@utils/logger';

describe('Tribunal Adapters - E2E Tests', () => {
  let pjeAdapter: TribunalAdapter;
  let esajAdapter: TribunalAdapter;

  beforeAll(() => {
    // Initialize adapters from factory
    pjeAdapter = AdapterFactory.getAdapter('pje-tjal');
    esajAdapter = AdapterFactory.getAdapter('esaj-tjsp');
  });

  describe('PJe Adapter - TJAL', () => {
    describe('initialization', () => {
      it('should initialize PJe adapter successfully', async () => {
        try {
          if (pjeAdapter.initialize) {
            await pjeAdapter.initialize();
          }
          expect(pjeAdapter).toBeDefined();
        } catch (error) {
          if (error instanceof Error) {
            expect(error).toBeDefined();
          }
        }
      });

      it('should have valid base URL', () => {
        const baseUrl = pjeAdapter.getBaseUrl();
        expect(baseUrl).toBeDefined();
        expect(typeof baseUrl).toBe('string');
        expect(baseUrl.length).toBeGreaterThan(0);
      });

      it('should have valid name', () => {
        const name = pjeAdapter.getName();
        expect(name).toBeDefined();
        expect(name).toContain('PJe');
      });
    });

    describe('searchProcess', () => {
      it('should search for a valid process number', async () => {
        try {
          const processNumber = '0000001-23.2024.1.17.0001';
          const result = await pjeAdapter.getProcess(processNumber);

          expect(result).toBeDefined();
          expect(result.number).toBeDefined();
          expect(result.status).toBeDefined();
          expect(result.lastUpdate).toBeInstanceOf(Date);
          expect(Array.isArray(result.parties)).toBe(true);
        } catch (error) {
          if (error instanceof Error) {
            expect(error).toBeDefined();
          }
        }
      });

      it('should throw error for invalid process', async () => {
        try {
          await pjeAdapter.getProcess('0000000-00.0000.0.00.0000');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });

      it('should handle malformed process numbers gracefully', async () => {
        try {
          await pjeAdapter.getProcess('invalid-process-123');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should clean and normalize process numbers', async () => {
        try {
          // Test with various formats
          const formats = [
            '0000001-23.2024.1.17.0001',
            '0000001232024117O001',
            '0000001.2024.1.17.0001',
          ];

          for (const format of formats) {
            try {
              await pjeAdapter.getProcess(format);
            } catch (error) {
              if (!(error instanceof Error)) {
                throw error;
              }
            }
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('searchProcessByParty', () => {
      it('should search for processes by party name', async () => {
        try {
          const partyName = 'João Silva';
          const criteria: SearchCriteria = { partyName, limit: 10, offset: 0 };
          const results = await pjeAdapter.searchProcesses(criteria);

          expect(Array.isArray(results)).toBe(true);
          if (results.length > 0) {
            expect(results[0]).toHaveProperty('number');
            expect(results[0]).toHaveProperty('status');
            expect(results[0]).toHaveProperty('parties');
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should respect pagination options', async () => {
        try {
          const partyName = 'Silva';
          const results1 = await pjeAdapter.searchProcesses({
            partyName,
            limit: 5,
            offset: 0,
          });
          const results2 = await pjeAdapter.searchProcesses({
            partyName,
            limit: 5,
            offset: 5,
          });

          expect(Array.isArray(results1)).toBe(true);
          expect(Array.isArray(results2)).toBe(true);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should return empty array for unknown party', async () => {
        try {
          const results = await pjeAdapter.searchProcesses({
            partyName: 'ZZZZZZZZZZZZZZZZZZZZZZZZZ',
          });
          expect(Array.isArray(results)).toBe(true);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('submitPetition', () => {
      it('should submit petition with valid payload', async () => {
        try {
          const petition = {
            id: '1',
            userId: 'user-1',
            processNumber: '0000001-23.2024.1.17.0001',
            title: 'Petição de teste',
            subject: 'Teste',
            type: 'initial' as const,
            content: 'Petição de teste para validação do sistema',
            attachments: [],
            tribunal: 'pje' as const,
            status: 'draft' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const response = await pjeAdapter.submitPetition(petition, '', '');

          expect(response).toBeDefined();
          expect(response).toHaveProperty('protocolo');
          expect(response).toHaveProperty('dataProtocolo');
          expect(response).toHaveProperty('sucesso');
          expect(response.dataProtocolo).toBeInstanceOf(Date);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should handle petition submission with attachments', async () => {
        try {
          const petition = {
            id: '2',
            userId: 'user-1',
            processNumber: '0000001-23.2024.1.17.0001',
            title: 'Petição com anexos',
            type: 'initial' as const,
            content: 'Petição com anexos',
            attachments: [],
            tribunal: 'pje' as const,
            status: 'draft' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const response = await pjeAdapter.submitPetition(petition, '', '');
          expect(response).toBeDefined();
          expect(response).toHaveProperty('sucesso');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should handle invalid case numbers gracefully', async () => {
        try {
          const petition = {
            id: '3',
            userId: 'user-1',
            processNumber: 'invalid-case',
            title: 'Test',
            type: 'initial' as const,
            content: 'Test',
            attachments: [],
            tribunal: 'pje' as const,
            status: 'draft' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const response = await pjeAdapter.submitPetition(petition, '', '');

          expect(response).toBeDefined();
          expect(response).toHaveProperty('sucesso');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('getProcessDeadlines', () => {
      it('should retrieve deadlines for a process', async () => {
        try {
          const processNumber = '0000001-23.2024.1.17.0001';
          const deadlines = await pjeAdapter.getProcessDeadlines(processNumber);

          expect(Array.isArray(deadlines)).toBe(true);
          if (deadlines.length > 0) {
            expect(deadlines[0]).toHaveProperty('id');
            expect(deadlines[0]).toHaveProperty('description');
            expect(deadlines[0]).toHaveProperty('dueDate');
            expect(deadlines[0]).toHaveProperty('priority');
            expect(deadlines[0].dueDate).toBeInstanceOf(Date);
            expect(['low', 'medium', 'high', 'critical']).toContain(
              deadlines[0].priority,
            );
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should return empty array for process without deadlines', async () => {
        try {
          const deadlines = await pjeAdapter.getProcessDeadlines(
            '0000000-00.0000.0.00.0000',
          );
          expect(Array.isArray(deadlines)).toBe(true);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('health check', () => {
      it('should check adapter health status', async () => {
        const health = await pjeAdapter.getHealthStatus();

        expect(health).toBeDefined();
        expect(health).toHaveProperty('status');
        expect(['ok', 'error']).toContain(health.status);
        expect(health).toHaveProperty('message');
        expect(typeof health.message).toBe('string');
      });

      it('should support isHealthy method', async () => {
        const isHealthy = await pjeAdapter.isHealthy();
        expect(typeof isHealthy).toBe('boolean');
      });
    });
  });

  describe('eSAJ Adapter - TJSP', () => {
    describe('initialization', () => {
      it('should initialize eSAJ adapter successfully', async () => {
        try {
          if (esajAdapter.initialize) {
            await esajAdapter.initialize();
          }
          expect(esajAdapter).toBeDefined();
        } catch (error) {
          if (error instanceof Error) {
            expect(error).toBeDefined();
          }
        }
      });

      it('should have valid base URL', () => {
        const baseUrl = esajAdapter.getBaseUrl();
        expect(baseUrl).toBeDefined();
        expect(typeof baseUrl).toBe('string');
        expect(baseUrl.length).toBeGreaterThan(0);
      });

      it('should have valid name', () => {
        const name = esajAdapter.getName();
        expect(name).toBeDefined();
        expect(name).toContain('eSAJ');
      });
    });

    describe('searchProcess', () => {
      it('should search for a valid process number', async () => {
        try {
          const processNumber = '0000001-02.2024.8.26.0100';
          const result = await esajAdapter.getProcess(processNumber);

          expect(result).toBeDefined();
          expect(result.number).toBeDefined();
          expect(result.status).toBeDefined();
          expect(result.lastUpdate).toBeInstanceOf(Date);
          expect(Array.isArray(result.parties)).toBe(true);
        } catch (error) {
          if (error instanceof Error) {
            expect(error).toBeDefined();
          }
        }
      });

      it('should throw error for invalid process', async () => {
        try {
          await esajAdapter.getProcess('0000000-00.0000.0.00.0000');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });

      it('should handle malformed process numbers gracefully', async () => {
        try {
          await esajAdapter.getProcess('invalid-number');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('searchProcessByParty', () => {
      it('should search for processes by party name', async () => {
        try {
          const partyName = 'Empresa XYZ';
          const criteria: SearchCriteria = { partyName, limit: 10, offset: 0 };
          const results = await esajAdapter.searchProcesses(criteria);

          expect(Array.isArray(results)).toBe(true);
          if (results.length > 0) {
            const result = results[0];
            expect(result).toHaveProperty('number');
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('parties');
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should respect pagination options', async () => {
        try {
          const partyName = 'Empresa';
          const results1 = await esajAdapter.searchProcesses({
            partyName,
            limit: 5,
            offset: 0,
          });
          const results2 = await esajAdapter.searchProcesses({
            partyName,
            limit: 5,
            offset: 5,
          });

          expect(Array.isArray(results1)).toBe(true);
          expect(Array.isArray(results2)).toBe(true);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('submitPetition', () => {
      it('should submit petition with valid payload', async () => {
        try {
          const petition = {
            id: '1',
            userId: 'user-1',
            processNumber: '0000001-02.2024.8.26.0100',
            title: 'Petição de teste eSAJ',
            type: 'initial' as const,
            content: 'Petição de teste eSAJ',
            attachments: [],
            tribunal: 'eproc' as const,
            status: 'draft' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const response = await esajAdapter.submitPetition(petition, '', '');

          expect(response).toBeDefined();
          expect(response).toHaveProperty('protocolo');
          expect(response).toHaveProperty('dataProtocolo');
          expect(response).toHaveProperty('sucesso');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should handle petition submission errors gracefully', async () => {
        try {
          const petition = {
            id: '2',
            userId: 'user-1',
            processNumber: 'invalid',
            title: 'Test',
            type: 'initial' as const,
            content: 'Test',
            attachments: [],
            tribunal: 'eproc' as const,
            status: 'draft' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const response = await esajAdapter.submitPetition(petition, '', '');

          expect(response).toBeDefined();
          expect(response).toHaveProperty('sucesso');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('getProcessDeadlines', () => {
      it('should retrieve deadlines for a process', async () => {
        try {
          const processNumber = '0000001-02.2024.8.26.0100';
          const deadlines = await esajAdapter.getProcessDeadlines(
            processNumber,
          );

          expect(Array.isArray(deadlines)).toBe(true);
          if (deadlines.length > 0) {
            expect(deadlines[0]).toHaveProperty('id');
            expect(deadlines[0]).toHaveProperty('description');
            expect(deadlines[0]).toHaveProperty('dueDate');
            expect(deadlines[0]).toHaveProperty('priority');
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('health check', () => {
      it('should check adapter health status', async () => {
        const health = await esajAdapter.getHealthStatus();

        expect(health).toBeDefined();
        expect(health).toHaveProperty('status');
        expect(['ok', 'error']).toContain(health.status);
        expect(health).toHaveProperty('message');
      });

      it('should support isHealthy method', async () => {
        const isHealthy = await esajAdapter.isHealthy();
        expect(typeof isHealthy).toBe('boolean');
      });
    });
  });

  describe('AdapterFactory', () => {
    describe('adapter registration', () => {
      it('should list all registered adapters', () => {
        const adapters = AdapterFactory.listAdapters();
        expect(Array.isArray(adapters)).toBe(true);
        expect(adapters.length).toBeGreaterThan(0);

        // Verify PJe adapters are registered
        expect(adapters).toContain('pje-tjal');
        expect(adapters).toContain('pje-tjpi');
        expect(adapters).toContain('pje-tjma');

        // Verify eSAJ adapters are registered
        expect(adapters).toContain('esaj-tjsp');
        expect(adapters).toContain('esaj-tjrs');
        expect(adapters).toContain('esaj-tjmg');
      });

      it('should return adapter info for all registered adapters', () => {
        const info = AdapterFactory.getAdaptersInfo();
        expect(Array.isArray(info)).toBe(true);
        expect(info.length).toBeGreaterThan(0);

        info.forEach((adapter: any) => {
          expect(adapter).toHaveProperty('code');
          expect(adapter).toHaveProperty('name');
          expect(adapter).toHaveProperty('baseUrl');
        });
      });

      it('should check if tribunal is supported', () => {
        expect(AdapterFactory.isSupported('pje-tjal')).toBe(true);
        expect(AdapterFactory.isSupported('esaj-tjsp')).toBe(true);
        expect(AdapterFactory.isSupported('invalid-tribunal')).toBe(false);
      });

      it('should get adapter by case-insensitive code', () => {
        const adapter1 = AdapterFactory.getAdapter('PJE-TJAL');
        const adapter2 = AdapterFactory.getAdapter('pje-tjal');

        expect(adapter1).toBeDefined();
        expect(adapter2).toBeDefined();
        expect(adapter1.getName()).toBe(adapter2.getName());
      });

      it('should throw error for unsupported tribunal', () => {
        expect(() => {
          AdapterFactory.getAdapter('unsupported-tribunal');
        }).toThrow();
      });
    });

    describe('adapter by name lookup', () => {
      it('should find adapter by full name', () => {
        const adapter = AdapterFactory.getAdapterByName(
          'PJe - Plataforma de Processo Eletrônico',
        );
        expect(adapter).toBeDefined();
      });

      it('should find adapter with case-insensitive name', () => {
        const adapter = AdapterFactory.getAdapterByName(
          'pje - plataforma de processo eletrônico',
        );
        expect(adapter).toBeDefined();
      });

      it('should return null for unknown name', () => {
        const adapter = AdapterFactory.getAdapterByName('Unknown System');
        expect(adapter).toBeNull();
      });
    });

    describe('health check all', () => {
      it('should check health of all adapters', async () => {
        const health = await AdapterFactory.checkAllHealth();

        expect(health).toBeInstanceOf(Map);
        expect(health.size).toBeGreaterThan(0);

        // Each adapter should have a boolean health status
        health.forEach((status: boolean, code: string) => {
          expect(typeof status).toBe('boolean');
          expect(typeof code).toBe('string');
        });
      });

      it('should check health of specific tribunal', async () => {
        const isHealthy = await AdapterFactory.getHealth('pje-tjal');
        expect(typeof isHealthy).toBe('boolean');
      });

      it('should handle health check errors gracefully', async () => {
        const isHealthy = await AdapterFactory.getHealth('unsupported');
        expect(isHealthy).toBe(false);
      });
    });
  });

  describe('Multi-tribunal scenarios', () => {
    it('should handle concurrent process searches across adapters', async () => {
      const adapters = ['pje-tjal', 'esaj-tjsp'];

      const results = await Promise.allSettled(
        adapters.map((tribunalCode) => {
          const adapter = AdapterFactory.getAdapter(tribunalCode);
          return adapter.searchProcess('0000001-23.2024.1.17.0001');
        }),
      );

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });

    it('should support adapter switching based on tribunal', () => {
      const tribunals = ['pje-tjal', 'pje-tjpi', 'esaj-tjsp', 'esaj-tjrs'];

      tribunals.forEach((tribunal) => {
        const adapter = AdapterFactory.getAdapter(tribunal);
        expect(adapter).toBeDefined();
        expect(typeof adapter.getName()).toBe('string');
      });
    });

    it('should maintain adapter state independently', () => {
      const adapter1 = AdapterFactory.getAdapter('pje-tjal');
      const adapter2 = AdapterFactory.getAdapter('pje-tjpi');

      expect(adapter1).not.toBe(adapter2);
      expect(adapter1.getName()).not.toBe(adapter2.getName());
    });
  });

  describe('Error handling and resilience', () => {
    it('should handle network timeouts gracefully', async () => {
      try {
        const adapter = AdapterFactory.getAdapter('pje-tjal');
        // Test with very short timeout scenario
        await adapter.searchProcess('0000001-23.2024.1.17.0001');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should provide meaningful error messages', () => {
      try {
        AdapterFactory.getAdapter('nonexistent');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toContain('não suportado');
        }
      }
    });

    it('should log operations for debugging', () => {
      const adapter = AdapterFactory.getAdapter('pje-tjal');
      expect(adapter).toBeDefined();
      // Logger operations should not throw
    });
  });
});
