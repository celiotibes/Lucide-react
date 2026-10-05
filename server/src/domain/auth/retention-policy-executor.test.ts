/**
 * Testes para Retention Policy Executor (LGPD)
 *
 * Verifica:
 * - Execução com dry-run (sem deletar dados)
 * - Deleção real com validação de backup
 * - Bloqueios por litígio
 * - Marcação de esquecimento
 * - Auditoria completa
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { RetentionPolicyExecutor } from '../../services/retention-policy-executor';
import {
  migracaoRetencao } from '../../migrations/criar-politica-retencao';

describe('RetentionPolicyExecutor', () => {
  let db: Database.Database;
  let executor: RetentionPolicyExecutor;
  let dbPath: string;

  beforeEach(() => {
    // Criar banco de dados em memória para testes
    dbPath = path.join('/tmp', `test-retention-${Date.now()}.db`);
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    executor = new RetentionPolicyExecutor(db);

    // Criar tabelas de retenção
    migracaoRetencao.criar(db);

    // Criar tabela de teste
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_dados (
        id INTEGER PRIMARY KEY,
        dados TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Inserir política de retenção para teste
    const stmt = db.prepare(`
      INSERT INTO politica_retencao (
        tabela_nome, retencao_dias, base_legal, coluna_data, descricao, ativa
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run('test_dados', 7, 'operacional', 'criado_em', 'Dados de teste', 1);
  });

  afterEach(() => {
    try {
      db.close();
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe('Execução com DRY-RUN', () => {
    it('deve reportar registros a deletar sem deletar', async () => {
      // Inserir dados antigos (15 dias atrás)
      const dataAntiga = new Date();
      dataAntiga.setDate(dataAntiga.getDate() - 15);

      const stmt = db.prepare(`
        INSERT INTO test_dados (dados, criado_em)
        VALUES (?, ?)
      `);
      stmt.run('dado antigo 1', dataAntiga.toISOString());
      stmt.run('dado antigo 2', dataAntiga.toISOString());

      // Inserir dados recentes (2 dias atrás)
      const dataRecente = new Date();
      dataRecente.setDate(dataRecente.getDate() - 2);
      stmt.run('dado recente', dataRecente.toISOString());

      // Verificar contagem antes
      const contAntes = (db.prepare('SELECT COUNT(*) as count FROM test_dados').get() as {
        count: number;
      }).count;
      expect(contAntes).toBe(3);

      // Executar com dry-run
      const resultados = await executor.executarRetencao({
        dryRun: true,
        executadoPor: 'test',
        backupValidado: false,
      });

      // Verificar que reportou os registros expirados
      const resultado = resultados.find((r) => r.tabela_nome === 'test_dados');
      expect(resultado).toBeDefined();
      expect(resultado?.registros_testados).toBe(2); // 2 registros antigos
      expect(resultado?.registros_deletados).toBe(2); // Simulou deleção

      // Verificar que NADA foi realmente deletado
      const contDepois = (db.prepare('SELECT COUNT(*) as count FROM test_dados').get() as {
        count: number;
      }).count;
      expect(contDepois).toBe(3);
    });

    it('deve listar registros bloqueados por litígio', async () => {
      // Inserir bloqueio de litígio
      const stmtBloqueio = db.prepare(`
        INSERT INTO litigio_bloqueio (
          tabela_nome, registro_id, motivo_litigio, numero_processo, bloqueado_por
        ) VALUES (?, ?, ?, ?, ?)
      `);
      stmtBloqueio.run('test_dados', 1, 'processo_judicial', '0001234/2026', 'dpo');

      // Listar bloqueios
      const bloqueios = executor.listarRegistrosBloqueados('test_dados');

      expect(bloqueios.length).toBe(1);
      expect(bloqueios[0].numero_processo).toBe('0001234/2026');
      expect(bloqueios[0].ativo).toBe(1);
    });
  });

  describe('Execução REAL', () => {
    it('deve recusar deleção sem backup validado', async () => {
      const resultPromise = executor.executarRetencao({
        dryRun: false,
        executadoPor: 'test',
        backupValidado: false, // Sem backup validado
      });

      expect(resultPromise).rejects.toThrow(
        /backup/i
      );
    });

    it('deve deletar registros quando backup é validado', async () => {
      // Inserir dados antigos
      const dataAntiga = new Date();
      dataAntiga.setDate(dataAntiga.getDate() - 15);

      const stmt = db.prepare(`
        INSERT INTO test_dados (dados, criado_em)
        VALUES (?, ?)
      `);
      stmt.run('dado antigo', dataAntiga.toISOString());
      stmt.run('dado recente', new Date().toISOString());

      const contAntes = (db.prepare('SELECT COUNT(*) as count FROM test_dados').get() as {
        count: number;
      }).count;
      expect(contAntes).toBe(2);

      // Executar com backup validado
      const resultados = await executor.executarRetencao({
        dryRun: false,
        executadoPor: 'sistema',
        backupValidado: true,
      });

      // Verificar deleção
      const resultado = resultados.find((r) => r.tabela_nome === 'test_dados');
      expect(resultado?.registros_deletados).toBe(1);

      // Verificar que foi realmente deletado
      const contDepois = (db.prepare('SELECT COUNT(*) as count FROM test_dados').get() as {
        count: number;
      }).count;
      expect(contDepois).toBe(1);
    });
  });

  describe('Bloqueios por Litígio', () => {
    it('deve bloquear deleção de registro em litígio', async () => {
      // Inserir dado antigo
      const dataAntiga = new Date();
      dataAntiga.setDate(dataAntiga.getDate() - 15);

      const stmt = db.prepare(`
        INSERT INTO test_dados (dados, criado_em)
        VALUES (?, ?)
      `);
      stmt.run('dado antigo', dataAntiga.toISOString());

      // Bloquear por litígio
      executor.bloquearPorLitigio(
        'test_dados',
        1,
        'auditoria_irpf',
        '00000000000190201/0000-91',
        'dpo'
      );

      // Executar retenção com dry-run
      const resultados = await executor.executarRetencao({
        dryRun: true,
        executadoPor: 'test',
        backupValidado: false,
      });

      const resultado = resultados.find((r) => r.tabela_nome === 'test_dados');
      expect(resultado?.registros_bloqueados_litigio).toBe(1);
      expect(resultado?.registros_testados).toBe(1);
      expect(resultado?.registros_deletados).toBe(0); // Não foi simulada deleção
    });

    it('deve permitir deleção após remover bloqueio de litígio', async () => {
      // Inserir dado antigo
      const dataAntiga = new Date();
      dataAntiga.setDate(dataAntiga.getDate() - 15);

      const stmt = db.prepare(`
        INSERT INTO test_dados (dados, criado_em)
        VALUES (?, ?)
      `);
      stmt.run('dado antigo', dataAntiga.toISOString());

      // Bloquear por litígio
      executor.bloquearPorLitigio(
        'test_dados',
        1,
        'auditoria_irpf',
        '00000000000190201/0000-91',
        'dpo'
      );

      // Verificar bloqueio
      const bloqueiosBefore = executor.listarRegistrosBloqueados('test_dados');
      expect(bloqueiosBefore.length).toBe(1);
      expect(bloqueiosBefore[0].ativo).toBe(1);

      // Desbloquear
      executor.desbloquearLitigio(
        'test_dados',
        1,
        'juiz',
        'Processo finalizado'
      );

      // Verificar que está desbloqueado
      const bloqueiosAfter = executor.listarRegistrosBloqueados('test_dados');
      expect(bloqueiosAfter.length).toBe(0);

      // Verificar que agora pode ser deletado (dry-run)
      const resultados = await executor.executarRetencao({
        dryRun: true,
        executadoPor: 'test',
        backupValidado: false,
      });

      const resultado = resultados.find((r) => r.tabela_nome === 'test_dados');
      expect(resultado?.registros_bloqueados_litigio).toBe(0);
      expect(resultado?.registros_deletados).toBe(1);
    });
  });

  describe('Marcação para Esquecimento', () => {
    it('deve marcar registro para direito ao esquecimento', async () => {
      // Inserir dado
      const stmt = db.prepare(`
        INSERT INTO test_dados (dados) VALUES (?)
      `);
      stmt.run('dados para esquecer');

      // Marcar para esquecimento
      executor.marcarParaEsquecimento(
        'test_dados',
        1,
        'solicitacao_usuario',
        'usuario@example.com'
      );

      // Verificar que foi marcado
      const marcacoes = db.prepare(`
        SELECT * FROM marcacao_esquecimento
        WHERE tabela_nome = ? AND registro_id = ?
      `).all('test_dados', 1) as Array<{
        status: string;
        motivo: string;
      }>;

      expect(marcacoes.length).toBe(1);
      expect(marcacoes[0].motivo).toBe('solicitacao_usuario');
      expect(marcacoes[0].status).toBe('pendente');
    });

    it('não deve duplicar marcação de esquecimento', async () => {
      // Inserir dado
      const stmt = db.prepare(`
        INSERT INTO test_dados (dados) VALUES (?)
      `);
      stmt.run('dados para esquecer');

      // Marcar duas vezes
      executor.marcarParaEsquecimento(
        'test_dados',
        1,
        'solicitacao_usuario',
        'usuario1'
      );
      executor.marcarParaEsquecimento(
        'test_dados',
        1,
        'outro_motivo',
        'usuario2'
      );

      // Verificar que tem apenas 1
      const marcacoes = db.prepare(`
        SELECT COUNT(*) as count FROM marcacao_esquecimento
        WHERE tabela_nome = ? AND registro_id = ?
      `).get('test_dados', 1) as { count: number };

      expect(marcacoes.count).toBe(1);
    });
  });

  describe('Relatório de Retenção', () => {
    it('deve gerar relatório com informações corretas', () => {
      // Inserir alguns bloqueios
      const stmtBloqueio = db.prepare(`
        INSERT INTO litigio_bloqueio (
          tabela_nome, registro_id, motivo_litigio, numero_processo, bloqueado_por
        ) VALUES (?, ?, ?, ?, ?)
      `);
      stmtBloqueio.run('test_dados', 1, 'processo', '0001/2026', 'dpo');
      stmtBloqueio.run('test_dados', 2, 'processo', '0002/2026', 'dpo');

      const relatorio = executor.gerarRelatoriRetencao();

      expect(relatorio.politicas_ativas).toBeGreaterThan(0);
      expect(relatorio.registros_bloqueados_total).toBe(2);
      expect(relatorio.ultima_execucao).toBeNull();
    });
  });

  describe('Validação de Integridade', () => {
    it('deve ignorar tabelas que não existem', async () => {
      // Adicionar política para tabela inexistente
      const stmt = db.prepare(`
        INSERT INTO politica_retencao (
          tabela_nome, retencao_dias, base_legal, coluna_data, descricao, ativa
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run('tabela_inexistente', 7, 'operacional', 'criado_em', 'Teste', 1);

      // Executar não deve falhar
      const resultados = await executor.executarRetencao({
        dryRun: true,
        executadoPor: 'test',
        backupValidado: false,
      });

      const resultado = resultados.find((r) => r.tabela_nome === 'tabela_inexistente');
      expect(resultado).toBeDefined();
      expect(resultado?.erros.length).toBeGreaterThan(0);
    });
  });
});
