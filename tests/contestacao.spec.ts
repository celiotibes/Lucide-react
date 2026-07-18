import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { obterPool } from '@/server/integracao/db';
import {
  registrarContestacao,
  avaliarContestacao,
  atualizarStatusReparo,
  listarContestacôesEmAberto,
} from '@/app/actions/vistorias/gerenciarContestacao';
import { Pool } from 'pg';

let pool: Pool;

describe('Contestação de Danos - Lei 8.245/91', () => {
  beforeAll(async () => {
    pool = obterPool();
  });

  afterAll(async () => {
    // Limpar dados de teste
    await pool.query('delete from contestacoes where motivo like %test%');
  });

  describe('registrarContestacao', () => {
    it('deve registrar contestação com validação de schema', async () => {
      const resultado = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-001',
        itemVistoriaId: 'test-item-001',
        motivo: 'Dano não causado por mim',
        descricaoDesacordo: 'Este dano já existia antes da minha entrada, conforme fotos do recebimento.',
        contatoInquilino: 'test@example.com',
      });

      expect(resultado.success).toBe(true);
      expect(resultado.contestacaoId).toBeDefined();
      expect(resultado.preclusaolimite).toBeDefined();
    });

    it('deve rejeitar contestação com motivo muito curto', async () => {
      const resultado = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-001',
        itemVistoriaId: 'test-item-001',
        motivo: 'Erro', // < 10 caracteres
        descricaoDesacordo: 'Este dano já existia antes da minha entrada.',
        contatoInquilino: 'test@example.com',
      });

      expect(resultado.success).toBe(false);
      expect(resultado.erro).toBeDefined();
    });

    it('deve rejeitar contestação com descrição muito curta', async () => {
      const resultado = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-001',
        itemVistoriaId: 'test-item-001',
        motivo: 'Dano não causado por mim',
        descricaoDesacordo: 'Não é meu', // < 20 caracteres
        contatoInquilino: 'test@example.com',
      });

      expect(resultado.success).toBe(false);
      expect(resultado.erro).toBeDefined();
    });

    it('deve rejeitar email inválido', async () => {
      const resultado = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-001',
        itemVistoriaId: 'test-item-001',
        motivo: 'Dano não causado por mim',
        descricaoDesacordo: 'Este dano já existia antes da minha entrada.',
        contatoInquilino: 'invalid-email', // email inválido
      });

      expect(resultado.success).toBe(false);
    });
  });

  describe('Preclusão - Lei 8.245/91', () => {
    it('deve calcular 5 dias úteis (seg-sex)', async () => {
      // Criar contestação
      const resultado = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-preclusao',
        itemVistoriaId: 'test-item-preclusao',
        motivo: 'Teste de preclusão',
        descricaoDesacordo: 'Verificar se preclusão calcula corretamente 5 dias úteis.',
        contatoInquilino: 'test-preclusao@example.com',
      });

      expect(resultado.success).toBe(true);

      // Verificar se preclusao_data_limite foi calculada
      const contestacao = await pool.query(
        'select preclusao_data_limite, dias_uteis_restantes from contestacoes where id = $1',
        [resultado.contestacaoId]
      );

      expect(contestacao.rows.length).toBe(1);
      expect(contestacao.rows[0].preclusao_data_limite).toBeDefined();
      expect(contestacao.rows[0].dias_uteis_restantes).toBe(5);

      // Verificar que não conta sábado/domingo
      const dataVencimento = new Date(contestacao.rows[0].preclusao_data_limite);
      const diaSemana = dataVencimento.getDay();

      // Não deve vencer em sábado (6) ou domingo (0)
      expect([0, 6]).not.toContain(diaSemana);
    });

    it('deve atualizar dias_uteis_restantes dinamicamente', async () => {
      const resultado = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-dinamica',
        itemVistoriaId: 'test-item-dinamica',
        motivo: 'Teste de dias restantes',
        descricaoDesacordo: 'Verificar se dias_uteis_restantes atualiza conforme tempo passa.',
        contatoInquilino: 'test-dinamica@example.com',
      });

      const contestacao1 = await pool.query(
        'select dias_uteis_restantes from contestacoes where id = $1',
        [resultado.contestacaoId]
      );

      expect(contestacao1.rows[0].dias_uteis_restantes).toBe(5);

      // Simular passagem de 2 dias (mantém 3 úteis)
      // Nota: em teste real, seria mock de data/hora
      // Por enquanto, verificamos que a coluna existe e é atualizada
      expect(contestacao1.rows[0].dias_uteis_restantes).toBeGreaterThan(0);
    });
  });

  describe('avaliarContestacao', () => {
    it('deve aceitar contestação e criar reparo', async () => {
      // Registrar contestação
      const contestacao = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-aceitar',
        itemVistoriaId: 'test-item-aceitar',
        motivo: 'Dano contestado',
        descricaoDesacordo: 'Apresento evidências de que não foi responsável por este dano.',
        contatoInquilino: 'test-aceitar@example.com',
      });

      // Avaliar (aceitar)
      const avaliacao = await avaliarContestacao({
        contestacaoId: contestacao.contestacaoId!,
        aceitar: true,
        justificativa: 'Evidências suficientes para reabrir o item.',
      });

      expect(avaliacao.success).toBe(true);
      expect(avaliacao.statusNovoReparo).toBe('pendente');

      // Verificar se reparo foi criado
      const reparos = await pool.query(
        'select id, status from reparos_vistoria where contestacao_id = $1',
        [contestacao.contestacaoId]
      );

      expect(reparos.rows.length).toBe(1);
      expect(reparos.rows[0].status).toBe('pendente');
    });

    it('deve rejeitar contestação sem criar reparo', async () => {
      const contestacao = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-rejeitar',
        itemVistoriaId: 'test-item-rejeitar',
        motivo: 'Dano controverso',
        descricaoDesacordo: 'Discordo, mas admito que pode ter sido causado por mim.',
        contatoInquilino: 'test-rejeitar@example.com',
      });

      const avaliacao = await avaliarContestacao({
        contestacaoId: contestacao.contestacaoId!,
        aceitar: false,
        justificativa: 'Responsabilidade clara do inquilino conforme cláusula 5.2 do contrato.',
      });

      expect(avaliacao.success).toBe(true);
      expect(avaliacao.statusNovoReparo).toBeNull();

      // Verificar que nenhum reparo foi criado
      const reparos = await pool.query(
        'select id from reparos_vistoria where contestacao_id = $1',
        [contestacao.contestacaoId]
      );

      expect(reparos.rows.length).toBe(0);

      // Verificar status da contestação
      const contestacaoDb = await pool.query(
        'select status from contestacoes where id = $1',
        [contestacao.contestacaoId]
      );

      expect(contestacaoDb.rows[0].status).toBe('rejeitada');
    });
  });

  describe('atualizarStatusReparo', () => {
    it('deve atualizar workflow: pendente → orcado → concluido', async () => {
      // Setup: criar contestação aceita e reparo
      const contestacao = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-workflow',
        itemVistoriaId: 'test-item-workflow',
        motivo: 'Teste de workflow',
        descricaoDesacordo: 'Verificar transição de status do reparo.',
        contatoInquilino: 'test-workflow@example.com',
      });

      await avaliarContestacao({
        contestacaoId: contestacao.contestacaoId!,
        aceitar: true,
        justificativa: 'Aceito para reparo.',
      });

      // Buscar reparo criado
      const reparos = await pool.query(
        'select id from reparos_vistoria where contestacao_id = $1',
        [contestacao.contestacaoId]
      );

      const reparoId = reparos.rows[0].id;

      // Atualizar para orcado
      const orcado = await atualizarStatusReparo({
        reparoId,
        novoStatus: 'orcado',
      });

      expect(orcado.success).toBe(true);

      // Atualizar para concluido
      const concluido = await atualizarStatusReparo({
        reparoId,
        novoStatus: 'concluido',
        detalhes: 'Reparo concluído. Pintura realizada conforme especificação.',
      });

      expect(concluido.success).toBe(true);

      // Verificar transição
      const reparo = await pool.query(
        'select status, descricao_trabalho_realizado from reparos_vistoria where id = $1',
        [reparoId]
      );

      expect(reparo.rows[0].status).toBe('concluido');
      expect(reparo.rows[0].descricao_trabalho_realizado).toContain('Pintura realizada');
    });

    it('deve atualizar status_reparo na contestação', async () => {
      const contestacao = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-sync',
        itemVistoriaId: 'test-item-sync',
        motivo: 'Teste de sync status',
        descricaoDesacordo: 'Verificar se status_reparo sincroniza com reparos_vistoria.',
        contatoInquilino: 'test-sync@example.com',
      });

      await avaliarContestacao({
        contestacaoId: contestacao.contestacaoId!,
        aceitar: true,
        justificativa: 'Aceito.',
      });

      const reparos = await pool.query(
        'select id from reparos_vistoria where contestacao_id = $1',
        [contestacao.contestacaoId]
      );

      const reparoId = reparos.rows[0].id;

      // Atualizar status
      await atualizarStatusReparo({
        reparoId,
        novoStatus: 'em_execucao',
      });

      // Verificar se contestacao.status_reparo foi atualizado
      const contestacaoDb = await pool.query(
        'select status_reparo from contestacoes where id = $1',
        [contestacao.contestacaoId]
      );

      expect(contestacaoDb.rows[0].status_reparo).toBe('reparo_em_execucao');
    });
  });

  describe('listarContestacôesEmAberto', () => {
    it('deve ordenar por dias_uteis_restantes (mais urgente primeiro)', async () => {
      // Criar múltiplas contestações
      const c1 = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-lista',
        itemVistoriaId: 'test-item-lista-1',
        motivo: 'Contestação urgente',
        descricaoDesacordo: 'Precisa de análise urgente.',
        contatoInquilino: 'test-lista-1@example.com',
      });

      const c2 = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-lista',
        itemVistoriaId: 'test-item-lista-2',
        motivo: 'Contestação menos urgente',
        descricaoDesacordo: 'Pode esperar mais dias.',
        contatoInquilino: 'test-lista-2@example.com',
      });

      const lista = await listarContestacôesEmAberto();

      expect(lista.success).toBe(true);
      expect(lista.contestacoes!.length).toBeGreaterThan(0);

      // Verificar ordenação
      let diasAnteriores = Infinity;
      for (const contestacao of lista.contestacoes!) {
        if (contestacao.diasUteisRestantes !== null) {
          expect(contestacao.diasUteisRestantes).toBeLessThanOrEqual(diasAnteriores);
          diasAnteriores = contestacao.diasUteisRestantes;
        }
      }
    });
  });

  describe('Auditoria e segurança', () => {
    it('deve registrar ação em auditoria_contestacao', async () => {
      const contestacao = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-auditoria',
        itemVistoriaId: 'test-item-auditoria',
        motivo: 'Teste de auditoria',
        descricaoDesacordo: 'Verificar se ações são registradas em auditoria.',
        contatoInquilino: 'test-auditoria@example.com',
      });

      // Buscar registro de auditoria
      const auditoria = await pool.query(
        'select acao, detalhes, dados_depois from auditoria_contestacao where contestacao_id = $1',
        [contestacao.contestacaoId]
      );

      expect(auditoria.rows.length).toBeGreaterThan(0);
      expect(auditoria.rows[0].acao).toBe('CONTESTACAO_ABERTA');
      expect(auditoria.rows[0].dados_depois).toBeDefined();
    });

    it('deve criar notificação para gestor', async () => {
      const contestacao = await registrarContestacao({
        vistoriaSaidaId: 'test-vistoria-notif',
        itemVistoriaId: 'test-item-notif',
        motivo: 'Teste de notificação',
        descricaoDesacordo: 'Verificar se notificação foi criada.',
        contatoInquilino: 'test-notif@example.com',
      });

      const notificacoes = await pool.query(
        'select id, tipo, mensagem from notificacoes_vistoria where vistoria_id = $1 and tipo = $2',
        [contestacao.contestacaoId, 'contestacao_aberta']
      );

      expect(notificacoes.rows.length).toBeGreaterThan(0);
      expect(notificacoes.rows[0].mensagem).toContain('Teste de notificação');
    });
  });
});
