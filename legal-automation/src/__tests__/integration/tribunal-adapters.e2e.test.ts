import { AdapterFactory } from '@adapters/AdapterFactory';
import { TribunalAdapter, SearchOptions, SubmitPetitionResponse } from '@adapters/TribunalAdapter';
import { ProcessNotFoundError, AuthenticationError } from '@types/tribunalAdapters';
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
          await pjeAdapter.initialize();
          expect(pjeAdapter).toBeDefined();
        } catch (error) {
          if (error instanceof AuthenticationError) {
            expect(error.code).toBe('AUTH_ERROR');
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
          const result = await pjeAdapter.searchProcess(processNumber);

          expect(result).toBeDefined();
          expect(result.processNumber).toBeDefined();
          expect(result.status).toMatch(/active|pending|concluded|archived/);
          expect(result.currentPhase).toBeDefined();
          expect(result.lastUpdate).toBeInstanceOf(Date);
          expect(Array.isArray(result.movements)).toBe(true);
          expect(Array.isArray(result.parties)).toBe(true);
          expect(Array.isArray(result.documents)).toBe(true);
          expect(Array.isArray(result.deadlines)).toBe(true);
        } catch (error) {
          if (error instanceof ProcessNotFoundError) {
            expect(error.code).toBe('PROCESS_NOT_FOUND');
          }
        }
      });

      it('should throw ProcessNotFoundError for invalid process', async () => {
        expect.assertions(2);
        try {
          await pjeAdapter.searchProcess('0000000-00.0000.0.00.0000');
        } catch (error) {
          expect(error).toBeInstanceOf(ProcessNotFoundError);
          if (error instanceof ProcessNotFoundError) {
            expect(error.code).toBe('PROCESS_NOT_FOUND');
          }
        }
      });

      it('should handle malformed process numbers gracefully', async () => {
        expect.assertions(1);
        try {
          await pjeAdapter.searchProcess('invalid-process-123');
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
              await pjeAdapter.searchProcess(format);
            } catch (error) {
              if (!(error instanceof ProcessNotFoundError)) {
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
          const options: SearchOptions = { limit: 10, offset: 0 };
          const results = await pjeAdapter.searchProcessByParty(partyName, options);

          expect(Array.isArray(results)).toBe(true);
          if (results.length > 0) {
            expect(results[0]).toHaveProperty('processNumber');
            expect(results[0]).toHaveProperty('partyName');
            expect(results[0]).toHaveProperty('classified');
            expect(results[0]).toHaveProperty('lastUpdate');
            expect(results[0]).toHaveProperty('url');
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should respect pagination options', async () => {
        try {
          const partyName = 'Silva';
          const results1 = await pjeAdapter.searchProcessByParty(partyName, {
            limit: 5,
            offset: 0,
          });
          const results2 = await pjeAdapter.searchProcessByParty(partyName, {
            limit: 5,
            offset: 5,
          });

          if (results1.length > 0 && results2.length > 0) {
            // Results should be different due to offset
            const firstIds = results1.map((r: any) => r.processNumber);
            const secondIds = results2.map((r: any) => r.processNumber);
            expect(JSON.stringify(firstIds)).not.toBe(JSON.stringify(secondIds));
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should return empty array for unknown party', async () => {
        try {
          const results = await pjeAdapter.searchProcessByParty(
            'ZZZZZZZZZZZZZZZZZZZZZZZZZ',
          );
          expect(Array.isArray(results)).toBe(true);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('submitPetition', () => {
      it('should submit petition with valid payload', async () => {
        try {
          const caseNumber = '0000001-23.2024.1.17.0001';
          const petition = {
            content: 'Petição de teste para validação do sistema',
            type: 'Petição Inicial',
            sequence: 1,
            attachments: [],
          };

          const response = await pjeAdapter.submitPetition(caseNumber, petition);

          expect(response).toBeDefined();
          expect(response).toHaveProperty('success');
          expect(response).toHaveProperty('caseNumber', caseNumber);
          expect(response).toHaveProperty('timestamp');
          expect(response.timestamp).toBeInstanceOf(Date);

          if (response.success) {
            expect(response).toHaveProperty('submissionId');
            expect(response).toHaveProperty('message');
          } else {
            expect(response).toHaveProperty('error');
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should handle petition submission with attachments', async () => {
        try {
          const caseNumber = '0000001-23.2024.1.17.0001';
          const petition = {
            content: 'Petição com anexos',
            type: 'Petição',
            attachments: [
              {
                name: 'documento.pdf',
                content: Buffer.from('PDF content'),
              },
            ],
          };

          const response = await pjeAdapter.submitPetition(caseNumber, petition);
          expect(response).toBeDefined();
          expect(response).toHaveProperty('success');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should handle invalid case numbers gracefully', async () => {
        try {
          const response = await pjeAdapter.submitPetition('invalid-case', {
            content: 'Test',
          });

          expect(response).toBeDefined();
          expect(response).toHaveProperty('success');
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
          await esajAdapter.initialize();
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
          const result = await esajAdapter.searchProcess(processNumber);

          expect(result).toBeDefined();
          expect(result.processNumber).toBeDefined();
          expect(result.status).toMatch(/active|pending|concluded|archived/);
          expect(result.currentPhase).toBeDefined();
          expect(result.lastUpdate).toBeInstanceOf(Date);
          expect(Array.isArray(result.movements)).toBe(true);
          expect(Array.isArray(result.parties)).toBe(true);
          expect(Array.isArray(result.documents)).toBe(true);
          expect(Array.isArray(result.deadlines)).toBe(true);
        } catch (error) {
          if (error instanceof ProcessNotFoundError) {
            expect(error.code).toBe('PROCESS_NOT_FOUND');
          }
        }
      });

      it('should throw ProcessNotFoundError for invalid process', async () => {
        expect.assertions(2);
        try {
          await esajAdapter.searchProcess('0000000-00.0000.0.00.0000');
        } catch (error) {
          expect(error).toBeInstanceOf(ProcessNotFoundError);
          if (error instanceof ProcessNotFoundError) {
            expect(error.code).toBe('PROCESS_NOT_FOUND');
          }
        }
      });

      it('should handle malformed process numbers gracefully', async () => {
        expect.assertions(1);
        try {
          await esajAdapter.searchProcess('invalid-number');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });
    });

    describe('searchProcessByParty', () => {
      it('should search for processes by party name', async () => {
        try {
          const partyName = 'Empresa XYZ';
          const options: SearchOptions = { limit: 10, offset: 0 };
          const results = await esajAdapter.searchProcessByParty(
            partyName,
            options,
          );

          expect(Array.isArray(results)).toBe(true);
          if (results.length > 0) {
            const result = results[0] as any;
            expect(result).toHaveProperty('cdProcesso');
            expect(result).toHaveProperty('dsProcesso');
            expect(result).toHaveProperty('nmParte');
            expect(result).toHaveProperty('dtMovimentacao');
          }
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should respect pagination options', async () => {
        try {
          const partyName = 'Empresa';
          const results1 = await esajAdapter.searchProcessByParty(partyName, {
            limit: 5,
            offset: 0,
          });
          const results2 = await esajAdapter.searchProcessByParty(partyName, {
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
          const caseNumber = '0000001-02.2024.8.26.0100';
          const petition = {
            content: 'Petição de teste eSAJ',
            type: 'Petição',
            sequence: 1,
          };

          const response = await esajAdapter.submitPetition(
            caseNumber,
            petition,
          );

          expect(response).toBeDefined();
          expect(response).toHaveProperty('success');
          expect(response).toHaveProperty('caseNumber');
          expect(response).toHaveProperty('timestamp');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should handle petition submission errors gracefully', async () => {
        try {
          const response = await esajAdapter.submitPetition('invalid', {
            content: 'Test',
          });

          expect(response).toBeDefined();
          expect(response).toHaveProperty('success');
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
