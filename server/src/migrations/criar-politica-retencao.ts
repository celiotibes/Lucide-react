/**
 * Migração: Criar tabelas de Política de Retenção LGPD
 *
 * Esta migração implementa o sistema de retenção de dados de acordo com as
 * disposições da LGPD (Lei Geral de Proteção de Dados), com suporte a:
 * - Regras de retenção diferenciadas por tabela e base legal
 * - Bloqueios por litígio (litigation holds)
 * - Auditoria de exclusões
 * - Marcação de dados para esquecimento (right to be forgotten)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface MigracaoRetencao {
  criar: (db: Database.Database) => void;
}

export const migracaoRetencao: MigracaoRetencao = {
  criar: (db: Database.Database) => {
    console.log(
      '[MIGRAÇÃO] Criando tabelas de Política de Retenção LGPD...'
    );

    // Tabela: politica_retencao
    // Define o período de retenção para cada tabela e base legal
    db.exec(`
      CREATE TABLE IF NOT EXISTS politica_retencao (
        id                    INTEGER PRIMARY KEY,
        tabela_nome           TEXT NOT NULL UNIQUE,
        retencao_dias         INTEGER NOT NULL CHECK (retencao_dias > 0),
        base_legal            TEXT NOT NULL CHECK (base_legal IN ('fiscal', 'operacional', 'contabil', 'outra')),
        coluna_data           TEXT NOT NULL,  -- nome da coluna de data para computar retenção (ex: 'criado_em', 'data')
        descricao             TEXT,
        ativa                 INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
        data_criacao          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        observacoes           TEXT
      );
    `);

    // Tabela: registro_retencao_executada
    // Auditoria de cada execução de limpeza por retenção
    db.exec(`
      CREATE TABLE IF NOT EXISTS registro_retencao_executada (
        id                    INTEGER PRIMARY KEY,
        tabela_nome           TEXT NOT NULL,
        registros_deletados   INTEGER NOT NULL DEFAULT 0,
        registros_testados    INTEGER NOT NULL DEFAULT 0,
        motivo_exclusao       TEXT NOT NULL,  -- "politica_retencao", "direito_esquecimento"
        retencao_dias_aplicado INTEGER,
        base_legal_aplicada   TEXT,
        modo_execucao         TEXT NOT NULL CHECK (modo_execucao IN ('dry_run', 'real')),
        data_execucao         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        executado_por         TEXT,
        observacoes           TEXT
      );
    `);

    // Tabela: marcacao_esquecimento
    // Marca registros para exclusão sob direito ao esquecimento (Art. 18 LGPD)
    // Um registro pode estar marcado para exclusão mesmo antes de completar retenção legal
    db.exec(`
      CREATE TABLE IF NOT EXISTS marcacao_esquecimento (
        id                    INTEGER PRIMARY KEY,
        tabela_nome           TEXT NOT NULL,
        registro_id           INTEGER NOT NULL,
        motivo                TEXT,  -- "solicitacao_usuario", "encerramento_contrato", "outro"
        solicitado_em         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        solicitado_por        TEXT,
        anonimizado_em        DATETIME,  -- preenchido quando anonimização é executada
        deletado_em           DATETIME,
        status                TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'anonimizado', 'deletado', 'cancelado')),
        observacoes           TEXT,
        UNIQUE (tabela_nome, registro_id)
      );
    `);

    // Tabela: litigio_bloqueio
    // Bloqueia exclusão de dados enquanto houver litígio (litigation hold)
    // Cumpre obrigações de preservação de dados em contexto judicial
    db.exec(`
      CREATE TABLE IF NOT EXISTS litigio_bloqueio (
        id                    INTEGER PRIMARY KEY,
        tabela_nome           TEXT NOT NULL,
        registro_id           INTEGER NOT NULL,
        motivo_litigio        TEXT NOT NULL,  -- "processo_judicial", "auditoria_irpf", "sindicancia_anpd", "outro"
        numero_processo       TEXT,
        data_bloqueio         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        bloqueado_por         TEXT,
        data_desbloqueio      DATETIME,
        desbloqueado_por      TEXT,
        ativo                 INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        observacoes           TEXT,
        UNIQUE (tabela_nome, registro_id, numero_processo)
      );
    `);

    // Índices para performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_politica_retencao_tabela
        ON politica_retencao(tabela_nome);

      CREATE INDEX IF NOT EXISTS idx_politica_retencao_base_legal
        ON politica_retencao(base_legal);

      CREATE INDEX IF NOT EXISTS idx_registro_retencao_data
        ON registro_retencao_executada(data_execucao);

      CREATE INDEX IF NOT EXISTS idx_registro_retencao_tabela
        ON registro_retencao_executada(tabela_nome);

      CREATE INDEX IF NOT EXISTS idx_marcacao_esquecimento_status
        ON marcacao_esquecimento(status);

      CREATE INDEX IF NOT EXISTS idx_marcacao_esquecimento_tabela
        ON marcacao_esquecimento(tabela_nome);

      CREATE INDEX IF NOT EXISTS idx_litigio_bloqueio_ativo
        ON litigio_bloqueio(ativo);

      CREATE INDEX IF NOT EXISTS idx_litigio_bloqueio_tabela
        ON litigio_bloqueio(tabela_nome, registro_id);
    `);

    console.log('[MIGRAÇÃO] Tabelas de Política de Retenção LGPD criadas com sucesso.');
  },
};

/**
 * Insere políticas de retenção padrão para todas as tabelas
 * Segue as disposições da LGPD e obrigações contábeis brasileiras
 */
export function inserirPoliticasRetencaoPadrao(db: Database.Database): void {
  console.log('[MIGRAÇÃO] Inserindo políticas de retenção padrão...');

  const politicas = [
    // Dados Operacionais (30-90 dias)
    {
      tabela_nome: 'prestadores',
      retencao_dias: 90,
      base_legal: 'operacional',
      coluna_data: 'criado_em',
      descricao:
        'Contatos de prestadores de serviço. Anonimizar após 90 dias se inativo.',
    },

    // Dados de Contratos (3 anos após término)
    {
      tabela_nome: 'contratos_locacao',
      retencao_dias: 1095, // 3 anos
      base_legal: 'operacional',
      coluna_data: 'data_fim',
      descricao:
        'Contratos de locação. 3 anos após término (Lei do Inquilinato, art. 52).',
    },

    {
      tabela_nome: 'contrato_locatarios',
      retencao_dias: 1095, // 3 anos
      base_legal: 'operacional',
      coluna_data: 'criado_em',
      descricao: 'Dados de locatários. 3 anos após término do contrato.',
    },

    {
      tabela_nome: 'caucoes',
      retencao_dias: 1095, // 3 anos
      base_legal: 'operacional',
      coluna_data: 'data_devolucao',
      descricao:
        'Registros de caução. 3 anos após devolução (Lei do Inquilinato).',
    },

    // Dados Contábeis e Fiscais (10 anos)
    {
      tabela_nome: 'transacoes',
      retencao_dias: 3650, // 10 anos
      base_legal: 'fiscal',
      coluna_data: 'data',
      descricao:
        'Transações bancárias. 10 anos (Lei 8.934/1994 - Guarda de Livros Contábeis).',
    },

    {
      tabela_nome: 'contas_bancarias',
      retencao_dias: 3650, // 10 anos
      base_legal: 'fiscal',
      coluna_data: 'criado_em',
      descricao:
        'Contas bancárias. 10 anos (Lei 8.934/1994 - Guarda de Livros).',
    },

    {
      tabela_nome: 'documentos',
      retencao_dias: 3650, // 10 anos
      base_legal: 'fiscal',
      coluna_data: 'criado_em',
      descricao:
        'Documentos de suporte (notas fiscais, recibos, boletos). 10 anos (Lei 8.934/1994).',
    },

    {
      tabela_nome: 'documentos_gerados',
      retencao_dias: 3650, // 10 anos
      base_legal: 'fiscal',
      coluna_data: 'gerado_em',
      descricao:
        'Laudos e RAD gerados. 10 anos (obrigação contábil e probatória).',
    },

    // Log de Auditoria (Perpétuo - nunca deletar)
    {
      tabela_nome: 'log_alteracoes',
      retencao_dias: 36500, // 100 anos (proxy para perpetuo)
      base_legal: 'contabil',
      coluna_data: 'quando',
      descricao:
        'Trilha de auditoria. Perpétua (imutável por design, exigida por lei).',
    },

    // Imóveis e Patrimônio (Duração da propriedade)
    {
      tabela_nome: 'imoveis',
      retencao_dias: 36500, // 100 anos (proxy para "enquanto propriedade")
      base_legal: 'contabil',
      coluna_data: 'criado_em',
      descricao:
        'Dados de imóveis. Perpetuo enquanto propriedade (patrimônio contábil).',
    },

    // Vistorias (3 anos)
    {
      tabela_nome: 'vistorias',
      retencao_dias: 1095, // 3 anos
      base_legal: 'operacional',
      coluna_data: 'criado_em',
      descricao:
        'Registros de vistorias. 3 anos após contrato (Lei do Inquilinato).',
    },

    {
      tabela_nome: 'vistoria_anexo',
      retencao_dias: 1095, // 3 anos
      base_legal: 'operacional',
      coluna_data: 'criado_em',
      descricao: 'Fotos e documentos de vistoria. 3 anos após contrato.',
    },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO politica_retencao (
      tabela_nome, retencao_dias, base_legal, coluna_data, descricao
    ) VALUES (?, ?, ?, ?, ?)
  `);

  for (const p of politicas) {
    try {
      insert.run(
        p.tabela_nome,
        p.retencao_dias,
        p.base_legal,
        p.coluna_data,
        p.descricao
      );
    } catch (error) {
      console.error(
        `[MIGRAÇÃO] Erro ao inserir política para ${p.tabela_nome}:`,
        error
      );
    }
  }

  console.log(`[MIGRAÇÃO] ${politicas.length} políticas de retenção inseridas.`);
}
