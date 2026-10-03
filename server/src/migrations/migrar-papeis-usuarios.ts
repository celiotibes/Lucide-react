/**
 * Migração idempotente: Adiciona novos papéis (inquilino, prestador) às tabelas usuarios e permissoes_papel
 *
 * SQLite não permite alterar CHECK constraints — é preciso:
 * 1. Criar nova tabela com CHECK atualizado
 * 2. Copiar dados com lista explícita de colunas
 * 3. Desabilitar foreign keys
 * 4. Descartar views dependentes
 * 5. Descartar tabela antiga
 * 6. Renomear nova → antiga
 * 7. Recriar índices e views
 * 8. Reabilitar foreign keys
 *
 * A migração é idempotente: se rodar duas vezes, a segunda é no-op (verifica o CHECK).
 */

import type Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";

export function migrarPapeisUsuarios(db: Database.Database): void {
  try {
    // 1. Verificar se o CHECK já inclui os novos papéis
    const sqlUsuarios = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='usuarios'")
      .get() as { sql: string } | undefined;

    if (!sqlUsuarios) {
      logger.warn("[migrarPapeisUsuarios] Tabela usuarios não encontrada — pulando migração");
      return;
    }

    const usuarioCheckAtualizado =
      sqlUsuarios.sql.includes("'inquilino'") && sqlUsuarios.sql.includes("'prestador'");

    const sqlPermissoesPapel = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='permissoes_papel'")
      .get() as { sql: string } | undefined;

    const permissoesCheckAtualizado = sqlPermissoesPapel
      ? sqlPermissoesPapel.sql.includes("'inquilino'") && sqlPermissoesPapel.sql.includes("'prestador'")
      : true; // Se não existe, considera atualizado

    if (usuarioCheckAtualizado && permissoesCheckAtualizado) {
      logger.info(
        "[migrarPapeisUsuarios] CHECK das tabelas usuarios e permissoes_papel já incluem 'inquilino' e 'prestador' — no-op",
      );
      return;
    }

    logger.info("[migrarPapeisUsuarios] Iniciando migração de papéis...");

    // 2. Desabilitar foreign keys (fora de transação — SQLite exige)
    db.pragma("foreign_keys = OFF");

    // 3. Iniciar transação
    const transacao = db.transaction(() => {
      // 4. Obter definições de views dependentes
      const views = db
        .prepare(
          `SELECT name, sql FROM sqlite_master
           WHERE type='view' AND (
             sql LIKE '%usuarios%' OR
             name IN ('view_sessoes_ativas', 'view_auditoria_usuarios')
           )`,
        )
        .all() as Array<{ name: string; sql: string }>;

      const viewsDefs = new Map(views.map((v) => [v.name, v.sql || ""]));

      // === MIGRAR TABELA USUARIOS ===
      if (!usuarioCheckAtualizado) {
        // 5. Criar tabela nova com CHECK atualizado
        db.exec(`
          CREATE TABLE usuarios_novo (
            id TEXT PRIMARY KEY,
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('titular', 'administrador', 'contador', 'perito', 'advogado', 'economista', 'inquilino', 'prestador')),
            prestador_id INTEGER,
            ativo BOOLEAN NOT NULL DEFAULT true,
            data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ultimo_login TIMESTAMP,
            tentativas_falhas INTEGER DEFAULT 0,
            bloqueado_ate TIMESTAMP,
            CONSTRAINT email_format CHECK(email LIKE '%@%.%')
          )
        `);

        // 6. Copiar dados (lista explícita de colunas para evitar divergências)
        db.exec(`
          INSERT INTO usuarios_novo (
            id, nome, email, senha_hash, role, prestador_id, ativo,
            data_criacao, ultimo_login, tentativas_falhas, bloqueado_ate
          )
          SELECT
            id, nome, email, senha_hash, role, prestador_id, ativo,
            data_criacao, ultimo_login, tentativas_falhas, bloqueado_ate
          FROM usuarios
        `);

        // 7. Descartar views dependentes
        for (const [viewName] of viewsDefs) {
          db.exec(`DROP VIEW IF EXISTS ${viewName}`);
        }

        // 8. Descartar tabela antiga
        db.exec("DROP TABLE usuarios");

        // 9. Renomear nova → antiga
        db.exec("ALTER TABLE usuarios_novo RENAME TO usuarios");

        // 10. Recriar índices
        db.exec(`
          CREATE INDEX idx_usuarios_email ON usuarios(email);
          CREATE INDEX idx_usuarios_prestador_id ON usuarios(prestador_id);
          CREATE INDEX idx_usuarios_role ON usuarios(role);
          CREATE INDEX idx_usuarios_ativo ON usuarios(ativo);
        `);

        // 11. Recriar views
        for (const [viewName, viewSql] of viewsDefs) {
          if (viewSql) {
            try {
              db.exec(viewSql);
            } catch (e) {
              logger.warn(`[migrarPapeisUsuarios] Erro ao recriar view ${viewName}:`, e);
            }
          }
        }

        logger.info("[migrarPapeisUsuarios] Tabela usuarios migrada com sucesso");
      }

      // === MIGRAR TABELA PERMISSOES_PAPEL ===
      if (!permissoesCheckAtualizado && sqlPermissoesPapel) {
        // Criar tabela nova com CHECK atualizado
        db.exec(`
          CREATE TABLE permissoes_papel_novo (
            papel TEXT NOT NULL CHECK(papel IN ('titular', 'administrador', 'contador', 'perito', 'advogado', 'economista', 'inquilino', 'prestador')),
            funcao TEXT NOT NULL CHECK(funcao IN (
              'gerenciar_usuarios',
              'gerenciar_permissoes',
              'ver_trilha_auditoria',
              'aprovar_despesa_os',
              'aprovar_pagamento',
              'editar_plano_de_contas',
              'lancar_transacoes',
              'fechar_periodo_contabil',
              'gerar_laudo_pericial',
              'exportar_ecd',
              'ver_indicadores_gestao',
              'gerenciar_contratos_advocacia',
              'editar_lgpd_chaves',
              'importar_documentos'
            )),
            habilitado BOOLEAN NOT NULL DEFAULT false,
            limite_valor DECIMAL(12, 2),
            atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_por TEXT,
            PRIMARY KEY (papel, funcao),
            FOREIGN KEY(atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
          )
        `);

        // Copiar dados
        db.exec(`
          INSERT INTO permissoes_papel_novo (papel, funcao, habilitado, limite_valor, atualizado_em, atualizado_por)
          SELECT papel, funcao, habilitado, limite_valor, atualizado_em, atualizado_por
          FROM permissoes_papel
        `);

        // Descartar tabela antiga
        db.exec("DROP TABLE permissoes_papel");

        // Renomear nova → antiga
        db.exec("ALTER TABLE permissoes_papel_novo RENAME TO permissoes_papel");

        // Recriar índices
        db.exec(`
          CREATE INDEX idx_permissoes_papel_papel ON permissoes_papel(papel);
          CREATE INDEX idx_permissoes_papel_funcao ON permissoes_papel(funcao);
          CREATE INDEX idx_permissoes_papel_atualizado_por ON permissoes_papel(atualizado_por);
        `);

        logger.info("[migrarPapeisUsuarios] Tabela permissoes_papel migrada com sucesso");
      }

      logger.info("[migrarPapeisUsuarios] Migração de papéis concluída com sucesso");
    });

    // 4. Executar transação
    transacao();

    // 5. Reabilitar foreign keys e verificar integridade
    db.pragma("foreign_keys = ON");
    const fkCheck = db.pragma("foreign_key_check") as Array<unknown>;
    if (fkCheck.length > 0) {
      throw new Error(
        `[migrarPapeisUsuarios] Violações de foreign key detectadas após migração: ${fkCheck.length} linha(s)`,
      );
    }

    logger.info("[migrarPapeisUsuarios] Foreign key check passou — integridade preservada");
  } catch (erro) {
    logger.error("[migrarPapeisUsuarios] Erro durante migração:", erro);
    // Tentar reabilitar foreign keys mesmo em erro
    try {
      db.pragma("foreign_keys = ON");
    } catch {
      /* silenciar */
    }
    throw erro;
  }
}
