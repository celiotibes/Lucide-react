/**
 * Migração: Advocacia e Pagamentos → Ledger Integrado
 * Cria tabelas e adiciona colunas necessárias para integração com ledger
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface MigracaoAdvocaciaStatus {
  tabelas_criadas: string[];
  colunas_adicionadas: string[];
  contas_criadas: string[];
  sucesso: boolean;
  erros: string[];
}

/**
 * Executar todas as migrações necessárias para integração
 */
export function migrarAdvocaciaEPagamentosParaLedger(
  db: Database
): MigracaoAdvocaciaStatus {
  const resultado: MigracaoAdvocaciaStatus = {
    tabelas_criadas: [],
    colunas_adicionadas: [],
    contas_criadas: [],
    sucesso: true,
    erros: [],
  };

  try {
    // 1. Criar tabelas de sincronização
    criarTabelasSincronizacao(db, resultado);

    // 2. Adicionar colunas faltantes
    adicionarColunasATabelas(db, resultado);

    // 3. Criar contas contábeis necessárias
    criarContasContabeis(db, resultado);

    return resultado;
  } catch (erro) {
    resultado.sucesso = false;
    resultado.erros.push((erro as Error).message);
    return resultado;
  }
}

/**
 * Criar tabelas de sincronização para advocacy e pagamentos
 */
function criarTabelasSincronizacao(
  db: Database,
  resultado: MigracaoAdvocaciaStatus
): void {
  try {
    // Tabela de sincronização de advocacia
    executar(
      db,
      `CREATE TABLE IF NOT EXISTS sincronizacoes_advocacia_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        despesa_legal_id INTEGER,
        processo_id INTEGER,
        ledger_entry_id INTEGER NOT NULL,
        tipo_registro TEXT NOT NULL CHECK(tipo_registro IN ('despesa_legal', 'provisao_processo')),
        tipo_despesa TEXT NOT NULL,
        origem_modulo TEXT DEFAULT 'advocacia',
        status TEXT NOT NULL CHECK(status IN ('sucesso', 'erro', 'duplicado')),
        hash_provenance TEXT NOT NULL UNIQUE,
        mensagem_erro TEXT,
        tentativas INTEGER DEFAULT 1,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (despesa_legal_id) REFERENCES despesas_legais(id),
        FOREIGN KEY (processo_id) REFERENCES processos_legais(id),
        FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)
      )`
    );
    resultado.tabelas_criadas.push("sincronizacoes_advocacia_ledger");

    // Tabela de sincronização de pagamentos
    executar(
      db,
      `CREATE TABLE IF NOT EXISTS sincronizacoes_pagamentos_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id TEXT NOT NULL UNIQUE,
        ledger_entry_id INTEGER,
        tipo_pagamento TEXT NOT NULL,
        valor REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('sucesso', 'erro', 'duplicado')),
        hash_provenance TEXT NOT NULL UNIQUE,
        mensagem_erro TEXT,
        tentativas INTEGER DEFAULT 1,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES pagamentos(id),
        FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)
      )`
    );
    resultado.tabelas_criadas.push("sincronizacoes_pagamentos_ledger");
  } catch (erro) {
    resultado.erros.push(`Erro ao criar tabelas de sincronização: ${(erro as Error).message}`);
  }
}

/**
 * Adicionar colunas faltantes nas tabelas existentes
 */
function adicionarColunasATabelas(
  db: Database,
  resultado: MigracaoAdvocaciaStatus
): void {
  try {
    // Verificar e adicionar colunas em despesas_legais
    const colunas_despesas = consultar<{ name: string }>(
      db,
      `PRAGMA table_info(despesas_legais)`
    );

    const nomesColunas = colunas_despesas.map((c) => c.name);

    if (!nomesColunas.includes("origem_modulo")) {
      executar(
        db,
        `ALTER TABLE despesas_legais ADD COLUMN origem_modulo TEXT DEFAULT 'advocacia'`
      );
      resultado.colunas_adicionadas.push("despesas_legais.origem_modulo");
    }

    if (!nomesColunas.includes("ledger_entry_id")) {
      executar(
        db,
        `ALTER TABLE despesas_legais ADD COLUMN ledger_entry_id INTEGER`
      );
      executar(
        db,
        `ALTER TABLE despesas_legais ADD CONSTRAINT fk_despesa_ledger FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)`
      );
      resultado.colunas_adicionadas.push("despesas_legais.ledger_entry_id");
    }

    if (!nomesColunas.includes("tentativas")) {
      executar(
        db,
        `ALTER TABLE despesas_legais ADD COLUMN tentativas INTEGER DEFAULT 0`
      );
      resultado.colunas_adicionadas.push("despesas_legais.tentativas");
    }

    // Verificar e adicionar colunas em pagamentos
    const colunas_pagamentos = consultar<{ name: string }>(
      db,
      `PRAGMA table_info(pagamentos)`
    );

    const nomesColunasPag = colunas_pagamentos.map((c) => c.name);

    if (!nomesColunasPag.includes("ledger_entry_id")) {
      executar(
        db,
        `ALTER TABLE pagamentos ADD COLUMN ledger_entry_id INTEGER`
      );
      executar(
        db,
        `ALTER TABLE pagamentos ADD CONSTRAINT fk_pagamento_ledger FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)`
      );
      resultado.colunas_adicionadas.push("pagamentos.ledger_entry_id");
    }

    if (!nomesColunasPag.includes("tentativas")) {
      executar(
        db,
        `ALTER TABLE pagamentos ADD COLUMN tentativas INTEGER DEFAULT 0`
      );
      resultado.colunas_adicionadas.push("pagamentos.tentativas");
    }
  } catch (erro) {
    // SQLite não suporta ALTER TABLE se a coluna já existe
    // Isso é esperado e não deve ser tratado como erro
    const mensagem = (erro as Error).message;
    if (!mensagem.includes("duplicate column name")) {
      resultado.erros.push(`Erro ao adicionar colunas: ${mensagem}`);
    }
  }
}

/**
 * Criar contas contábeis necessárias
 */
function criarContasContabeis(
  db: Database,
  resultado: MigracaoAdvocaciaStatus
): void {
  try {
    // Definir contas necessárias
    const contasNecessarias = [
      {
        id: 3101,
        codigo: "3.1.01",
        descricao: "Provisão para Riscos Legais",
        natureza: "credito",
        tipo: "passivo_circulante",
      },
      {
        id: 3102,
        codigo: "3.1.02",
        descricao: "Contas a Pagar",
        natureza: "credito",
        tipo: "passivo_circulante",
      },
      {
        id: 3105,
        codigo: "3.1.05",
        descricao: "Remuneração a Pagar",
        natureza: "credito",
        tipo: "passivo_circulante",
      },
      {
        id: 1101,
        codigo: "1.1.01",
        descricao: "Caixa",
        natureza: "debito",
        tipo: "ativo_circulante",
      },
      {
        id: 6301,
        codigo: "6.3.01",
        descricao: "Despesa com Honorários Advocatícios",
        natureza: "debito",
        tipo: "despesa_operacional",
      },
      {
        id: 6302,
        codigo: "6.3.02",
        descricao: "Despesa com Custas Judiciais",
        natureza: "debito",
        tipo: "despesa_operacional",
      },
      {
        id: 6303,
        codigo: "6.3.03",
        descricao: "Despesa com Perícia",
        natureza: "debito",
        tipo: "despesa_operacional",
      },
      {
        id: 6304,
        codigo: "6.3.04",
        descricao: "Outras Despesas com Processos Legais",
        natureza: "debito",
        tipo: "despesa_operacional",
      },
      {
        id: 6401,
        codigo: "6.4.01",
        descricao: "Provisão para Processos Legais",
        natureza: "debito",
        tipo: "despesa_operacional",
      },
      {
        id: 6201,
        codigo: "6.2.01",
        descricao: "Despesas Operacionais",
        natureza: "debito",
        tipo: "despesa_operacional",
      },
      {
        id: 6202,
        codigo: "6.2.02",
        descricao: "Despesas com Utilidades",
        natureza: "debito",
        tipo: "despesa_operacional",
      },
      {
        id: 6101,
        codigo: "6.1.01",
        descricao: "Despesa com Aluguel",
        natureza: "debito",
        tipo: "despesa_operacional",
      },
    ];

    // Verificar e criar contas
    for (const conta of contasNecessarias) {
      const [existente] = consultar<{ id: number }>(
        db,
        `SELECT id FROM contas_plano_contas WHERE codigo = ? OR id = ?`,
        [conta.codigo, conta.id]
      );

      if (!existente) {
        try {
          executar(
            db,
            `INSERT INTO contas_plano_contas (id, codigo, descricao, natureza, tipo, ativo, analisavel)
             VALUES (?, ?, ?, ?, ?, 1, 1)`,
            [conta.id, conta.codigo, conta.descricao, conta.natureza, conta.tipo]
          );
          resultado.contas_criadas.push(`${conta.codigo} - ${conta.descricao}`);
        } catch (erro) {
          // Conta pode já existir com outro ID, não é erro crítico
          const msg = (erro as Error).message;
          if (!msg.includes("UNIQUE constraint failed")) {
            resultado.erros.push(`Erro ao criar conta ${conta.codigo}: ${msg}`);
          }
        }
      }
    }
  } catch (erro) {
    resultado.erros.push(`Erro ao criar contas contábeis: ${(erro as Error).message}`);
  }
}

/**
 * Obter status detalhado da migração
 */
export function verificarStatusMigracao(
  db: Database
): {
  tabelasExistem: boolean;
  colunasExistem: boolean;
  contasExistem: boolean;
  detalhes: string[];
} {
  const detalhes: string[] = [];
  let tabelasExistem = false;
  let colunasExistem = false;
  let contasExistem = false;

  try {
    // Verificar tabelas
    const tabelas = consultar<{ name: string }>(
      db,
      `SELECT name FROM sqlite_master WHERE type='table' AND (name='sincronizacoes_advocacia_ledger' OR name='sincronizacoes_pagamentos_ledger')`
    );

    tabelasExistem = tabelas.length === 2;
    detalhes.push(`Tabelas de sincronização: ${tabelasExistem ? "OK" : "FALTANDO"}`);

    // Verificar colunas
    const colD = consultar<{ name: string }>(
      db,
      `PRAGMA table_info(despesas_legais)`
    );
    const colunasD = colD.map((c) => c.name);

    const colP = consultar<{ name: string }>(
      db,
      `PRAGMA table_info(pagamentos)`
    );
    const colunasP = colP.map((c) => c.name);

    colunasExistem =
      colunasD.includes("ledger_entry_id") &&
      colunasD.includes("origem_modulo") &&
      colunasD.includes("tentativas") &&
      colunasP.includes("ledger_entry_id") &&
      colunasP.includes("tentativas");

    detalhes.push(`Colunas necessárias: ${colunasExistem ? "OK" : "FALTANDO"}`);

    // Verificar contas
    const [contas] = consultar<{ count: number }>(
      db,
      `SELECT COUNT(*) as count FROM contas_plano_contas
       WHERE codigo IN ('3.1.01', '3.1.02', '3.1.05', '1.1.01', '6.3.01', '6.3.02', '6.3.03', '6.3.04', '6.4.01', '6.2.01', '6.2.02', '6.1.01')`
    );

    contasExistem = (contas[0]?.count || 0) >= 12;
    detalhes.push(`Contas contábeis: ${contasExistem ? "OK" : "FALTANDO (${contas[0]?.count || 0}/12)"}`);
  } catch (erro) {
    detalhes.push(`Erro ao verificar status: ${(erro as Error).message}`);
  }

  return {
    tabelasExistem,
    colunasExistem,
    contasExistem,
    detalhes,
  };
}
