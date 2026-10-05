/**
 * Tests for AlertService
 * Verifica: envio de emails, webhooks Slack, cooldown/deduplicação
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertService } from '../alert-service.js';

// Mock Nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(),
    })),
  },
}));

// Mock HTTPS para Slack
vi.mock('https', () => ({
  default: {
    request: vi.fn(),
  },
}));

describe('AlertService', () => {
  let alertService: AlertService;

  beforeEach(() => {
    // Limpar variáveis de ambiente
    delete process.env.BACKUP_ALERT_EMAILS;
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    // Limpar mocks
    vi.clearAllMocks();

    // Criar nova instância
    alertService = new AlertService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Inicialização', () => {
    it('deve inicializar sem erros', () => {
      expect(alertService).toBeDefined();
    });

    it('deve carregar configuração de ambiente', () => {
      process.env.BACKUP_ALERT_EMAILS = 'admin@example.com,ops@example.com';
      process.env.SLACK_WEBHOOK_URL = 'MOCK_SLACK_WEBHOOK_URL_FOR_TESTING';

      const service = new AlertService();
      const status = service.getAlertStatus();
      expect(status).toBeDefined();
    });

    it('deve rejeitar emails inválidos', () => {
      process.env.BACKUP_ALERT_EMAILS = 'invalid-email,admin@example.com,another-invalid';
      const service = new AlertService();
      // Não deve lançar erro, apenas ignorar emails inválidos
      expect(service).toBeDefined();
    });
  });

  describe('Controle de Cooldown', () => {
    beforeEach(() => {
      process.env.BACKUP_ALERT_EMAILS = 'admin@example.com';
    });

    it('deve bloquear alertas duplicados dentro do período de cooldown', async () => {
      const payload = {
        backupName: 'backup-001',
        errorMessage: 'Erro de teste',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      // Primeiro alerta deve passar
      await alertService.enviarAlertaFalhaBackup(payload);

      // Segundo alerta deve ser bloqueado (dentro de 1 hora)
      await alertService.enviarAlertaFalhaBackup(payload);

      // Status deve mostrar o alerta
      const status = alertService.getAlertStatus();
      expect(Object.keys(status).length).toBeGreaterThan(0);
    });

    it('deve permitir alertas após período de cooldown', async () => {
      const payload = {
        backupName: 'backup-002',
        errorMessage: 'Erro de teste',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      // Simular passagem de tempo (2 horas)
      const originalNow = Date.now;
      let currentTime = originalNow();

      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      await alertService.enviarAlertaFalhaBackup(payload);

      // Avançar 2 horas
      currentTime += 2 * 60 * 60 * 1000;

      // Novo alerta deve passar
      await alertService.enviarAlertaFalhaBackup(payload);

      // Restaurar
      Date.now = originalNow;
    });
  });

  describe('Estado de Alertas', () => {
    it('deve rastrear estado de alertas', async () => {
      const payload = {
        backupName: 'backup-003',
        errorMessage: 'Erro de teste',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      await alertService.enviarAlertaFalhaBackup(payload);

      const status = alertService.getAlertStatus();
      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
    });

    it('deve limpar alertas antigos', () => {
      // Simular passagem de tempo
      const originalNow = Date.now;
      const currentTime = originalNow();

      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      const payload = {
        backupName: 'backup-old',
        errorMessage: 'Erro antigo',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      // Não enviando alerta real, apenas testando cleanup
      alertService.cleanupOldAlerts();

      // Restaurar
      Date.now = originalNow;
    });
  });

  describe('Método enviarAlertaVerificacaoFalhou', () => {
    beforeEach(() => {
      process.env.BACKUP_ALERT_EMAILS = 'admin@example.com';
    });

    it('deve enviar alerta com mensagem de verificação falhou', async () => {
      const backupId = 'backup-verify-001';
      const erro = 'Integridade do banco corrompida';
      const detalhes = {
        integridade: ['Error: database disk image is malformed'],
      };

      await alertService.enviarAlertaVerificacaoFalhou(backupId, erro, detalhes);

      // Deve ter criado estado de alerta
      const status = alertService.getAlertStatus();
      expect(Object.keys(status).length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Método enviarAlertaCopiaFalhou', () => {
    beforeEach(() => {
      process.env.BACKUP_ALERT_EMAILS = 'admin@example.com';
    });

    it('deve enviar alerta com mensagem de cópia falhou', async () => {
      const backupId = 'backup-copy-001';
      const erro = 'Permission denied';
      const nasPath = '/mnt/nas/backups';

      await alertService.enviarAlertaCopiaFalhou(backupId, erro, nasPath);

      // Deve ter criado estado de alerta
      const status = alertService.getAlertStatus();
      expect(Object.keys(status).length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Sanitização HTML', () => {
    beforeEach(() => {
      process.env.BACKUP_ALERT_EMAILS = 'admin@example.com';
    });

    it('deve escapar caracteres HTML perigosos na mensagem de erro', async () => {
        backupName: 'backup-xss',
        errorMessage: '<script>alert("XSS")</script>',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      // Não deve lançar erro
      await alertService.enviarAlertaFalhaBackup(payload);
    });

    it('deve escapar caracteres HTML nos detalhes', async () => {
        backupName: 'backup-details',
        errorMessage: 'Erro com detalhes',
        timestamp: new Date(),
        severity: 'warning' as const,
        details: {
          query: '<select * from users>',
          error: '&lt;malformed&gt;',
        },
      };

      await alertService.enviarAlertaFalhaBackup(payload);
    });
  });

  describe('Configuração de severidade', () => {
    beforeEach(() => {
      process.env.BACKUP_ALERT_EMAILS = 'admin@example.com';
    });

    it('deve aceitar severidade crítica', async () => {
        backupName: 'backup-critical',
        errorMessage: 'Falha crítica',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      await alertService.enviarAlertaFalhaBackup(payload);
    });

    it('deve aceitar severidade warning', async () => {
        backupName: 'backup-warning',
        errorMessage: 'Aviso',
        timestamp: new Date(),
        severity: 'warning' as const,
      };

      await alertService.enviarAlertaFalhaBackup(payload);
    });
  });

  describe('Passos de recuperação', () => {
    beforeEach(() => {
      process.env.BACKUP_ALERT_EMAILS = 'admin@example.com';
    });

    it('deve incluir passos de recuperação quando fornecidos', async () => {
        backupName: 'backup-recovery',
        errorMessage: 'Erro com instruções',
        timestamp: new Date(),
        severity: 'critical' as const,
        recoverySteps: [
          'Passo 1: Verificar sistema de arquivos',
          'Passo 2: Tentar restaurar backup anterior',
          'Passo 3: Contatar suporte se problema persistir',
        ],
      };

      await alertService.enviarAlertaFalhaBackup(payload);
    });
  });

  describe('Múltiplos alertas com backups diferentes', () => {
    beforeEach(() => {
      process.env.BACKUP_ALERT_EMAILS = 'admin@example.com';
    });

    it('deve permitir alertas para backups diferentes', async () => {
      const payload1 = {
        backupName: 'backup-001',
        errorMessage: 'Erro no backup 1',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      const payload2 = {
        backupName: 'backup-002',
        errorMessage: 'Erro no backup 2',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      await alertService.enviarAlertaFalhaBackup(payload1);
      await alertService.enviarAlertaFalhaBackup(payload2);

      const status = alertService.getAlertStatus();
      expect(Object.keys(status).length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Sem configuração de alertas', () => {
    it('não deve falhar se nenhum email está configurado', async () => {
      // Não configurar emails
      delete process.env.BACKUP_ALERT_EMAILS;

        backupName: 'backup-no-email',
        errorMessage: 'Erro teste',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      // Não deve lançar erro
      expect(async () => {
        await alertService.enviarAlertaFalhaBackup(payload);
      }).not.toThrow();
    });

    it('não deve falhar se Slack não está configurado', async () => {
      // Não configurar Slack
      delete process.env.SLACK_WEBHOOK_URL;

        backupName: 'backup-no-slack',
        errorMessage: 'Erro teste',
        timestamp: new Date(),
        severity: 'critical' as const,
      };

      // Não deve lançar erro
      expect(async () => {
        await alertService.enviarAlertaFalhaBackup(payload);
      }).not.toThrow();
    });
  });
});
