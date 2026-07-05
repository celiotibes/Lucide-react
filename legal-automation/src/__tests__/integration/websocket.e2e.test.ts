import { WebSocket as ClientWebSocket } from 'ws';
import express, { Express } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { webSocketManager } from '@services/WebSocketManager';
import { eventEmitterService } from '@services/EventEmitterService';

let expressApp: Express;
let httpServer: HTTPServer;
let serverUrl: string;
let serverPort: number;

describe('WebSocket Integration - E2E Tests', () => {
  beforeAll((done) => {
    expressApp = express();
    expressApp.use(express.json());

    httpServer = createServer(expressApp);
    serverPort = 3001;

    expressApp.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    httpServer.listen(serverPort, () => {
      serverUrl = `ws://localhost:${serverPort}`;
      done();
    });
  });

  afterAll((done) => {
    webSocketManager.shutdown();
    httpServer.close(() => done());
  });

  describe('WebSocket Connection Management', () => {
    it('Should connect client with valid authentication', (done) => {
      const userId = 'test-user-1';
      const token = 'test-token-1';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);

      ws.on('open', () => {
        ws.on('message', (data: string) => {
          const message = JSON.parse(data);
          expect(message.type).toBe('connection');
          expect(message.data.clientId).toBeDefined();
          ws.close();
          done();
        });
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('Should reject connection without userId', (done) => {
      const token = 'test-token';
      const ws = new ClientWebSocket(`${serverUrl}?token=${token}`);

      ws.on('close', (code) => {
        expect(code).toBe(1008);
        done();
      });

      ws.on('error', () => {
        // Connection error expected
      });
    });

    it('Should reject connection without token', (done) => {
      const userId = 'test-user';
      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}`);

      ws.on('close', (code) => {
        expect(code).toBe(1008);
        done();
      });

      ws.on('error', () => {
        // Connection error expected
      });
    });

    it('Should track multiple connections per user', (done) => {
      const userId = 'test-user-multi';
      const token = 'test-token-multi';

      const ws1 = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);
      const ws2 = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);

      let connectedCount = 0;

      const checkStats = () => {
        const stats = webSocketManager.getConnectionStats();
        expect(stats.totalUsers).toBeGreaterThan(0);
        expect(stats.totalConnections).toBeGreaterThan(0);

        ws1.close();
        ws2.close();
        done();
      };

      ws1.on('open', () => {
        connectedCount++;
        if (connectedCount === 2) checkStats();
      });

      ws2.on('open', () => {
        connectedCount++;
        if (connectedCount === 2) checkStats();
      });

      ws1.on('error', (error) => {
        done(error);
      });

      ws2.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('OCR Progress Events', () => {
    it('Should receive OCR progress event', (done) => {
      const userId = 'test-user-ocr';
      const token = 'test-token-ocr';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);

      ws.on('open', () => {
        eventEmitterService.emitOCRProgress(userId, {
          data: {
            fileId: 'test-file-123',
            status: 'processing',
            progress: 50,
            message: 'Extração em progresso',
          },
        });
      });

      let receivedConnection = false;

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);

        if (message.type === 'connection') {
          receivedConnection = true;
        } else if (message.type === 'ocr-progress' && receivedConnection) {
          expect(message.data.fileId).toBe('test-file-123');
          expect(message.data.status).toBe('processing');
          expect(message.data.progress).toBe(50);
          expect(message.data.message).toBe('Extração em progresso');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('Should receive multiple OCR events with progress updates', (done) => {
      const userId = 'test-user-ocr-multi';
      const token = 'test-token-ocr-multi';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);
      let messageCount = 0;

      ws.on('open', () => {
        setTimeout(() => {
          eventEmitterService.emitOCRProgress(userId, {
            data: {
              fileId: 'test-file-456',
              status: 'processing',
              progress: 25,
              message: 'Iniciando extração',
            },
          });
        }, 50);

        setTimeout(() => {
          eventEmitterService.emitOCRProgress(userId, {
            data: {
              fileId: 'test-file-456',
              status: 'processing',
              progress: 75,
              message: 'Processando tabelas',
            },
          });
        }, 100);

        setTimeout(() => {
          eventEmitterService.emitOCRProgress(userId, {
            data: {
              fileId: 'test-file-456',
              status: 'completed',
              progress: 100,
              message: 'Extração concluída',
              extractedText: 'Texto extraído',
              confidence: 0.95,
            },
          });
        }, 150);
      });

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);

        if (message.type === 'ocr-progress') {
          messageCount++;

          if (messageCount === 1) {
            expect(message.data.progress).toBe(25);
          } else if (messageCount === 2) {
            expect(message.data.progress).toBe(75);
          } else if (messageCount === 3) {
            expect(message.data.status).toBe('completed');
            expect(message.data.progress).toBe(100);
            ws.close();
            done();
          }
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Workflow Update Events', () => {
    it('Should receive workflow update event', (done) => {
      const userId = 'test-user-workflow';
      const token = 'test-token-workflow';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);

      ws.on('open', () => {
        eventEmitterService.emitWorkflowUpdate(userId, {
          data: {
            workflowId: 'wf-123',
            executionId: 'exec-123',
            status: 'running',
            currentStep: 1,
            totalSteps: 3,
            stepName: 'Extração de texto',
            progress: 33,
            message: 'Processando documento',
          },
        });
      });

      let receivedConnection = false;

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);

        if (message.type === 'connection') {
          receivedConnection = true;
        } else if (message.type === 'workflow-update' && receivedConnection) {
          expect(message.data.workflowId).toBe('wf-123');
          expect(message.data.status).toBe('running');
          expect(message.data.currentStep).toBe(1);
          expect(message.data.totalSteps).toBe(3);
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('Should receive workflow completion event', (done) => {
      const userId = 'test-user-workflow-complete';
      const token = 'test-token-workflow-complete';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);

      ws.on('open', () => {
        setTimeout(() => {
          eventEmitterService.emitWorkflowUpdate(userId, {
            data: {
              workflowId: 'wf-456',
              executionId: 'exec-456',
              status: 'completed',
              currentStep: 3,
              totalSteps: 3,
              stepName: 'Finalizado',
              progress: 100,
              message: 'Fluxo executado com sucesso',
            },
          });
        }, 50);
      });

      let receivedConnection = false;

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);

        if (message.type === 'connection') {
          receivedConnection = true;
        } else if (message.type === 'workflow-update' && receivedConnection) {
          expect(message.data.status).toBe('completed');
          expect(message.data.progress).toBe(100);
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Notification Events', () => {
    it('Should receive notification event', (done) => {
      const userId = 'test-user-notify';
      const token = 'test-token-notify';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);

      ws.on('open', () => {
        eventEmitterService.emitNotification(userId, {
          data: {
            title: 'Documento processado',
            message: 'Seu documento foi processado com sucesso',
            level: 'success',
          },
        });
      });

      let receivedConnection = false;

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);

        if (message.type === 'connection') {
          receivedConnection = true;
        } else if (message.type === 'notification' && receivedConnection) {
          expect(message.data.title).toBe('Documento processado');
          expect(message.data.level).toBe('success');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Error Events', () => {
    it('Should receive error event', (done) => {
      const userId = 'test-user-error';
      const token = 'test-token-error';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);

      ws.on('open', () => {
        eventEmitterService.emitError(userId, 'Arquivo não encontrado', 'FILE_NOT_FOUND');
      });

      let receivedConnection = false;

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);

        if (message.type === 'connection') {
          receivedConnection = true;
        } else if (message.type === 'error' && receivedConnection) {
          expect(message.data.message).toBe('Arquivo não encontrado');
          expect(message.data.code).toBe('FILE_NOT_FOUND');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Multiple Event Types', () => {
    it('Should handle mixed event types for same user', (done) => {
      const userId = 'test-user-mixed';
      const token = 'test-token-mixed';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);
      let eventCount = 0;

      ws.on('open', () => {
        setTimeout(() => {
          eventEmitterService.emitOCRProgress(userId, {
            data: {
              fileId: 'file-mix',
              status: 'processing',
              progress: 50,
              message: 'Processando OCR',
            },
          });
        }, 50);

        setTimeout(() => {
          eventEmitterService.emitNotification(userId, {
            data: {
              title: 'Info',
              message: 'Notificação enviada',
              level: 'info',
            },
          });
        }, 100);

        setTimeout(() => {
          eventEmitterService.emitWorkflowUpdate(userId, {
            data: {
              workflowId: 'wf-mixed',
              executionId: 'exec-mixed',
              status: 'running',
              currentStep: 1,
              totalSteps: 1,
              stepName: 'Passo 1',
              progress: 50,
              message: 'Executando',
            },
          });
        }, 150);
      });

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);

        if (message.type !== 'connection') {
          eventCount++;

          if (eventCount === 1) {
            expect(message.type).toBe('ocr-progress');
          } else if (eventCount === 2) {
            expect(message.type).toBe('notification');
          } else if (eventCount === 3) {
            expect(message.type).toBe('workflow-update');
            ws.close();
            done();
          }
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Petition Status Events', () => {
    it('Should receive petition status event', (done) => {
      const userId = 'test-user-petition';
      const token = 'test-token-petition';

      const ws = new ClientWebSocket(`${serverUrl}?userId=${userId}&token=${token}`);

      ws.on('open', () => {
        eventEmitterService.emitPetitionStatus(userId, {
          data: {
            petitionId: 'pet-123',
            status: 'submitted',
            message: 'Petição submetida com sucesso',
            timestamp: new Date().toISOString(),
            caseNumber: '0001234-56.2024.8.24.0000',
          },
        });
      });

      let receivedConnection = false;

      ws.on('message', (data: string) => {
        const message = JSON.parse(data);

        if (message.type === 'connection') {
          receivedConnection = true;
        } else if (message.type === 'petition-status' && receivedConnection) {
          expect(message.data.petitionId).toBe('pet-123');
          expect(message.data.status).toBe('submitted');
          expect(message.data.caseNumber).toBe('0001234-56.2024.8.24.0000');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });
});
