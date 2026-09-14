/**
 * Migração: Transações Existentes → Ledger Integrado
 * Bridge entre o sistema legado (transacoes) e nova arquitetura contábil
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";

export interface MigracaoStatus {
  total_transacoes: number;
  transacoes_migradas: number;
  transacoes_falhadas: number;
  erros: Array<{ transacao_id: number; erro: string }>;
  tempo_ms: number;
}

/** Migrar todas as transações existentes para o ledger */
export function migrarTransacoesParaLedger(
  db: Database,
  entidade_id: number,
): MigracaoStatus {
  const inicio = Date.now();
  const erros: Array<{ transacao_id: number; erro: string }> = [];
  let migradas = 0;

  // 1. Obter ou criar período padrão para transações antigas
  const hoje = new Date();
  const [periodo] = consultar<{ id: number }>(
    db,
    `SELECT id FROM periodos_contabeis
     WHERE entidade_id = ? AND ano = ? AND mes = ?`,
    [entidade_id, hoje.getFullYear(), hoje.getMonth() + 1],
  );

  if (!periodo) {
    // Criar período atual
    executar(
      db,
      `INSERT INTO periodos_contabeis (entidade_id, ano, mes, status)
       VALUES (?, ?, ?, 'aberto')`,
      [entidade_id, hoje.getFullYear(), hoje.getMonth() + 1],
    );
  }

  const [periodo_atual] = consultar<{ id: number }>(
    db,
    `SELECT id FROM periodos_contabeis
     WHERE entidade_id = ? AND ano = ? AND mes = ?`,
    [entidade_id, hoje.getFullYear(), hoje.getMonth() + 1],
  );

  if (!periodo_atual) {
    return {
      total_transacoes: 0,
      transacoes_migradas: 0,
      transacoes_falhadas: 1,
      erros: [{ transacao_id: 0, erro: "Não conseguiu criar período contábil" }],
      tempo_ms: Date.now() - inicio,
    };
  }

  // 2. Obter todas as transações
  const transacoes = consultar<{
    id: number;
    data: string;
    valor: number;
    descricao_original: string;
    imovel_id?: number;
    contrato_id?: number;
    plano_conta_codigo?: string;
  }>(
    db,
    `SELECT t.id, t.data, t.valor, t.descricao_original,
            t.imovel_id, t.contrato_id, t.plano_conta_codigo
     FROM transacoes t
     ORDER BY t.data ASC`,
    [],
  );

  // 3. Mapear plano_de_contas para novo plano_contas
  const contas_map = consultar<{ codigo: string; conta_nova_id: number }>(
    db,
    `SELECT p.codigo, c.id as conta_nova_id
     FROM plano_de_contas p
     LEFT JOIN contas_plano_contas c ON c.codigo = p.codigo
       AND c.entidade_id = ?`,
    [entidade_id],
  );

  const mapa_contas: Record<string, number> = Object.fromEntries(
    contas_map.map((row) => [row.codigo, row.conta_nova_id || 0]),
  );

  // 4. Migrar cada transação
  transacoes.forEach((txn) => {
    try {
      // Determinar conta do plano (mapeamento)
      let conta_id = txn.plano_conta_codigo ? mapa_contas[txn.plano_conta_codigo] : undefined;

      if (!conta_id) {
        // Fallback: procurar conta padrão por tipo de valor
        const [conta_default] = consultar<{ id: number }>(
          db,
          `SELECT id FROM contas_plano_contas
           WHERE entidade_id = ? AND codigo LIKE ?
           LIMIT 1`,
          [entidade_id, txn.valor > 0 ? "1.%%" : "2.%%"],
        );

        conta_id = conta_default?.id;
      }

      if (!conta_id) {
        throw new Error("Conta não encontrada para plano_conta_codigo");
      }

      // Registrar no ledger
      registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id: periodo_atual.id,
        conta_id,
        data_lancamento: txn.data || new Date().toISOString().split("T")[0],
        valor_debito: txn.valor > 0 ? txn.valor : undefined,
        valor_credito: txn.valor < 0 ? Math.abs(txn.valor) : undefined,
        descricao: txn.descricao_original,
        origem_modulo: "transacoes",
        origem_id: txn.id,
        referencia_documento: `TXN-${txn.id}`,
        criado_por: 0, // Sistema
      });

      migradas++;
    } catch (erro) {
      erros.push({
        transacao_id: txn.id,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  return {
    total_transacoes: transacoes.length,
    transacoes_migradas: migradas,
    transacoes_falhadas: erros.length,
    erros,
    tempo_ms: Date.now() - inicio,
  };
}

/** Criar plano de contas padrão (39 contas) */
export function garantirPlanoContasPadrao(
  db: Database,
  entidade_id: number,
): void {
  const contas_padrao = [
    // ATIVO CIRCULANTE
    { codigo: "1.1.01", descricao: "Caixa", grupo: "ativo", natureza: "debito" },
    {
      codigo: "1.1.02",
      descricao: "Bancos Conta Corrente",
      grupo: "ativo",
      natureza: "debito",
    },
    {
      codigo: "1.1.03",
      descricao: "Bancos Poupança/Investimento",
      grupo: "ativo",
      natureza: "debito",
    },
    {
      codigo: "1.2.01",
      descricao: "Receita de Aluguel a Receber",
      grupo: "ativo",
      natureza: "debito",
    },
    {
      codigo: "1.2.02",
      descricao: "Rateio de Despesa a Receber",
      grupo: "ativo",
      natureza: "debito",
    },
    {
      codigo: "1.3.01",
      descricao: "Caução a Devolver (Ativo Circulante)",
      grupo: "ativo",
      natureza: "debito",
    },

    // ATIVO NÃO-CIRCULANTE
    {
      codigo: "2.1.01",
      descricao: "Imóvel para Locação",
      grupo: "ativo",
      natureza: "debito",
    },
    {
      codigo: "2.1.02",
      descricao: "Imóvel Uso Pessoal",
      grupo: "ativo",
      natureza: "debito",
    },
    {
      codigo: "2.2.01",
      descricao: "Depreciação Acumulada - Imóveis",
      grupo: "ativo",
      natureza: "credito",
    },
    {
      codigo: "2.2.02",
      descricao: "Móveis e Equipamentos",
      grupo: "ativo",
      natureza: "debito",
    },
    {
      codigo: "2.2.03",
      descricao: "Depreciação Acumulada - Móveis",
      grupo: "ativo",
      natureza: "credito",
    },

    // PASSIVO CIRCULANTE
    {
      codigo: "3.1.01",
      descricao: "Caução a Devolver (Passivo)",
      grupo: "passivo",
      natureza: "credito",
    },
    {
      codigo: "3.1.02",
      descricao: "Financiamento a Pagar (Curto Prazo)",
      grupo: "passivo",
      natureza: "credito",
    },
    {
      codigo: "3.1.03",
      descricao: "Fornecedores a Pagar",
      grupo: "passivo",
      natureza: "credito",
    },
    {
      codigo: "3.1.04",
      descricao: "Impostos a Pagar",
      grupo: "passivo",
      natureza: "credito",
    },

    // PASSIVO NÃO-CIRCULANTE
    {
      codigo: "3.2.01",
      descricao: "Financiamento Imobiliário (LP)",
      grupo: "passivo",
      natureza: "credito",
    },

    // PATRIMÔNIO LÍQUIDO
    {
      codigo: "4.1.01",
      descricao: "Capital",
      grupo: "patrimonio_liquido",
      natureza: "credito",
    },
    {
      codigo: "4.1.02",
      descricao: "Lucros/Prejuízos Acumulados",
      grupo: "patrimonio_liquido",
      natureza: "credito",
    },

    // RECEITAS
    {
      codigo: "5.1.01",
      descricao: "Receita de Aluguel",
      grupo: "receita",
      natureza: "credito",
    },
    {
      codigo: "5.1.02",
      descricao: "Receita de Reajuste Contratual",
      grupo: "receita",
      natureza: "credito",
    },
    {
      codigo: "5.1.03",
      descricao: "Receita de Rateio",
      grupo: "receita",
      natureza: "credito",
    },
    {
      codigo: "5.2.01",
      descricao: "Receita de Juros",
      grupo: "receita",
      natureza: "credito",
    },
    {
      codigo: "5.3.01",
      descricao: "Outras Receitas",
      grupo: "receita",
      natureza: "credito",
    },

    // DESPESAS
    {
      codigo: "6.1.01",
      descricao: "Despesa com Condomínio",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.1.02",
      descricao: "Despesa com Água/Esgoto",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.1.03",
      descricao: "Despesa com Eletricidade",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.1.04",
      descricao: "Despesa com Internet/Telefone",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.1.05",
      descricao: "Despesa com Manutenção",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.1.06",
      descricao: "Despesa com Limpeza/Higiene",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.1.07",
      descricao: "Despesa com Seguros",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.2.01",
      descricao: "Depreciação - Imóveis",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.2.02",
      descricao: "Depreciação - Móveis e Equipamentos",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.3.01",
      descricao: "Despesa de Juros (Financiamentos)",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.3.02",
      descricao: "Despesa com Multa/Juros de Mora",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.4.01",
      descricao: "Provisão para Devedora (Inadimplência)",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.5.01",
      descricao: "Despesa com Serviços Profissionais",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.5.02",
      descricao: "Despesa Tributária/Fiscal",
      grupo: "despesa",
      natureza: "debito",
    },
    {
      codigo: "6.6.01",
      descricao: "Outras Despesas Operacionais",
      grupo: "despesa",
      natureza: "debito",
    },
  ];

  contas_padrao.forEach((conta) => {
    executar(
      db,
      `INSERT OR IGNORE INTO contas_plano_contas
       (entidade_id, codigo, descricao, grupo, natureza, analisavel, ativo)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [
        entidade_id,
        conta.codigo,
        conta.descricao,
        conta.grupo,
        conta.natureza,
      ],
    );
  });
}
