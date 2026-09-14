/**
 * Integração: Patrimônio ↔ Imovel-Gestao
 * Ciclo de vida completo do ativo imobilizado
 *
 * Fluxo:
 * Imovel criado em imovel-gestao
 *   → Contabilizar aquisição (ativo imobilizado)
 *   → Iniciar rotina de depreciação mensal
 *   → Ao desfazer: baixar ativo e reconhecer ganho/perda
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { contabilizarAquisicaoImovel, contabilizarDepreciacaoImovel } from "./integracao-patrimonio";
import { registrarLancamentoContabil } from "./ledger";

export interface CicloVidaImovelContabil {
  imovel_id: number;
  status: "aquisicao_pendente" | "em_operacao" | "depreciacao_em_dia" | "baixa_pendente" | "baixado";
  data_aquisicao?: string;
  data_primeira_depreciacao?: string;
  data_ultima_depreciacao?: string;
  data_baixa?: string;
  valor_aquisicao: number;
  valor_acumulado_depreciacao: number;
  valor_residual: number;
  vida_util_meses: number;
}

export interface SincronizacaoPatrimonioImovel {
  id: number;
  imovel_id: number;
  tipo_evento: "aquisicao" | "depreciacao_mensal" | "reavalicao" | "baixa";
  data_evento: string;
  status: "sucesso" | "pendente" | "erro";
  valor_evento: number;
  criado_em: string;
}

/**
 * Parâmetros padrão de depreciação (SPED Brasil)
 */
const PARAMETROS_DEPRECIACAO = {
  imovel_residencial: {
    vida_util_anos: 27,
    taxa_anual: 100 / 27, // ~3.7% ao ano
  },
  imovel_comercial: {
    vida_util_anos: 25,
    taxa_anual: 100 / 25, // 4% ao ano
  },
};

/**
 * Sincronizar aquisição de imóvel após criação em imovel-gestao
 * Registra ativo imobilizado no ledger
 */
export function sincronizarAquisicaoImovelFromImovelGestao(
  db: Database,
  imovelId: number,
  entidadeId: number,
  periodoId: number,
  valorAquisicao: number
): boolean {
  try {
    // 1. Validar imóvel existe
    const [imovel] = consultar<{
      id: number;
      endereco: string;
      valor_aquisicao: number;
    }>(
      db,
      `SELECT id, endereco, valor_aquisicao FROM imoveis WHERE id = ?`,
      [imovelId]
    );

    if (!imovel) {
      registrarSincronizacaoPatrimonio(
        db,
        imovelId,
        "aquisicao",
        "erro",
        0,
        "Imóvel não encontrado"
      );
      return false;
    }

    // 2. Verificar se já foi contabilizado
    const [jaContabilizado] = consultar<{ id: number }>(
      db,
      `SELECT id FROM ciclo_vida_imovel_contabil WHERE imovel_id = ? AND status != 'aquisicao_pendente'`,
      [imovelId]
    );

    if (jaContabilizado) {
      registrarSincronizacaoPatrimonio(
        db,
        imovelId,
        "aquisicao",
        "sucesso",
        valorAquisicao,
        "Já contabilizado"
      );
      return true;
    }

    // 3. Contabilizar aquisição
    contabilizarAquisicaoImovel(db, imovelId, entidadeId, periodoId, valorAquisicao);

    // 4. Criar registro de ciclo de vida
    criarCicloVidaImovel(db, imovelId, valorAquisicao);

    // 5. Registrar sincronização
    registrarSincronizacaoPatrimonio(
      db,
      imovelId,
      "aquisicao",
      "sucesso",
      valorAquisicao,
      null
    );

    return true;
  } catch (erro) {
    registrarSincronizacaoPatrimonio(
      db,
      imovelId,
      "aquisicao",
      "erro",
      0,
      (erro as Error).message
    );
    return false;
  }
}

/**
 * Registrar depreciação mensal de imóvel
 * Deve ser executado automaticamente a cada fechamento de período
 */
export function sincronizarDepreciacaoMensalImovel(
  db: Database,
  imovelId: number,
  entidadeId: number,
  periodoId: number
): boolean {
  try {
    // 1. Obter ciclo de vida
    const [ciclo] = consultar<CicloVidaImovelContabil>(
      db,
      `SELECT * FROM ciclo_vida_imovel_contabil WHERE imovel_id = ?`,
      [imovelId]
    );

    if (!ciclo || ciclo.status === "baixado") {
      return false; // Não depreciar se não existe ou já foi baixado
    }

    // 2. Verificar se já foi depreciado neste período
    const [jaDepreciado] = consultar<{ id: number }>(
      db,
      `SELECT id FROM sincronizacoes_patrimonio_imovel
       WHERE imovel_id = ? AND tipo_evento = 'depreciacao_mensal'
       AND datetime(data_evento) >= datetime((SELECT data_inicio FROM periodos_contabeis WHERE id = ?))
       AND datetime(data_evento) <= datetime((SELECT data_fim FROM periodos_contabeis WHERE id = ?))`,
      [imovelId, periodoId, periodoId]
    );

    if (jaDepreciado) {
      return true; // Já deprecido neste período
    }

    // 3. Calcular depreciação mensal
    const taxa_mensal = ciclo.vida_util_meses > 0 ? 100 / ciclo.vida_util_meses : 0;
    const valor_depreciacao_mensal = (ciclo.valor_aquisicao * taxa_mensal) / 100;

    // 4. Contabilizar depreciação
    contabilizarDepreciacaoImovel(db, imovelId, entidadeId, periodoId);

    // 5. Atualizar ciclo de vida
    const nova_depreciacao_acumulada = ciclo.valor_acumulado_depreciacao + valor_depreciacao_mensal;
    const novo_valor_residual = ciclo.valor_aquisicao - nova_depreciacao_acumulada;

    executar(
      db,
      `UPDATE ciclo_vida_imovel_contabil
       SET valor_acumulado_depreciacao = ?,
           valor_residual = ?,
           data_ultima_depreciacao = datetime('now'),
           status = 'depreciacao_em_dia'
       WHERE imovel_id = ?`,
      [nova_depreciacao_acumulada, novo_valor_residual, imovelId]
    );

    // 6. Registrar sincronização
    registrarSincronizacaoPatrimonio(
      db,
      imovelId,
      "depreciacao_mensal",
      "sucesso",
      valor_depreciacao_mensal,
      null
    );

    return true;
  } catch (erro) {
    registrarSincronizacaoPatrimonio(
      db,
      imovelId,
      "depreciacao_mensal",
      "erro",
      0,
      (erro as Error).message
    );
    return false;
  }
}

/**
 * Sincronizar baixa/desfazimento de imóvel
 * Registra saída do ativo e reconhece ganho ou perda na venda
 */
export function sincronizarBaixaImovelFromImovelGestao(
  db: Database,
  imovelId: number,
  entidadeId: number,
  periodoId: number,
  dataBaixa: string,
  valorVenda: number
): boolean {
  try {
    // 1. Obter ciclo de vida
    const [ciclo] = consultar<CicloVidaImovelContabil>(
      db,
      `SELECT * FROM ciclo_vida_imovel_contabil WHERE imovel_id = ?`,
      [imovelId]
    );

    if (!ciclo) {
      registrarSincronizacaoPatrimonio(
        db,
        imovelId,
        "baixa",
        "erro",
        valorVenda,
        "Ciclo de vida não encontrado"
      );
      return false;
    }

    // 2. Calcular ganho ou perda
    const valor_contabil = ciclo.valor_residual;
    const ganho_ou_perda = valorVenda - valor_contabil;

    // 3. Registrar saída do ativo imobilizado (crédito)
    registrarLancamentoContabil(db, {
      entidade_id: entidadeId,
      periodo_id: periodoId,
      conta_id: 40, // Ativo Imobilizado (contra conta para baixa)
      data_lancamento: dataBaixa,
      valor_credito: ciclo.valor_aquisicao,
      descricao: `Baixa imóvel - Valor residual ${ciclo.valor_residual}`,
      origem_modulo: "patrimonio",
      origem_id: imovelId,
      referencia_documento: `BAIXA-IMOVEL-${imovelId}`,
    });

    // 4. Reverter depreciação acumulada (débito em contra-conta)
    registrarLancamentoContabil(db, {
      entidade_id: entidadeId,
      periodo_id: periodoId,
      conta_id: 41, // Depreciação Acumulada (contra-ativo)
      data_lancamento: dataBaixa,
      valor_debito: ciclo.valor_acumulado_depreciacao,
      descricao: `Reversão depreciação acumulada`,
      origem_modulo: "patrimonio",
      origem_id: imovelId,
      referencia_documento: `REVERSAO-DEPREC-${imovelId}`,
    });

    // 5. Registrar entrada de caixa
    registrarLancamentoContabil(db, {
      entidade_id: entidadeId,
      periodo_id: periodoId,
      conta_id: 1, // Conta corrente
      data_lancamento: dataBaixa,
      valor_debito: valorVenda,
      descricao: `Recebimento venda imóvel`,
      origem_modulo: "patrimonio",
      origem_id: imovelId,
      referencia_documento: `VENDA-IMOVEL-${imovelId}`,
    });

    // 6. Registrar ganho ou perda
    if (ganho_ou_perda !== 0) {
      registrarLancamentoContabil(db, {
        entidade_id: entidadeId,
        periodo_id: periodoId,
        conta_id: ganho_ou_perda > 0 ? 50 : 51, // Ganho ou Perda na venda
        data_lancamento: dataBaixa,
        valor_credito: ganho_ou_perda > 0 ? ganho_ou_perda : undefined,
        valor_debito: ganho_ou_perda < 0 ? Math.abs(ganho_ou_perda) : undefined,
        descricao: `${ganho_ou_perda > 0 ? "Ganho" : "Perda"} na venda imóvel`,
        origem_modulo: "patrimonio",
        origem_id: imovelId,
        referencia_documento: `RESULTADO-${imovelId}`,
      });
    }

    // 7. Atualizar ciclo de vida
    executar(
      db,
      `UPDATE ciclo_vida_imovel_contabil
       SET status = 'baixado', data_baixa = ?, valor_residual = 0
       WHERE imovel_id = ?`,
      [dataBaixa, imovelId]
    );

    // 8. Atualizar status do imóvel em imovel-gestao
    executar(
      db,
      `UPDATE imoveis SET status = 'desativado', data_desativacao = ? WHERE id = ?`,
      [dataBaixa, imovelId]
    );

    // 9. Registrar sincronização
    registrarSincronizacaoPatrimonio(
      db,
      imovelId,
      "baixa",
      "sucesso",
      valorVenda,
      null
    );

    return true;
  } catch (erro) {
    registrarSincronizacaoPatrimonio(
      db,
      imovelId,
      "baixa",
      "erro",
      valorVenda,
      (erro as Error).message
    );
    return false;
  }
}

/**
 * Processar todas as deprecações pendentes
 * Deve ser chamado ao fechar cada período contábil
 */
export function processarDepreciacoesPendentes(
  db: Database,
  entidadeId: number,
  periodoId: number
): {
  processados: number;
  sucessos: number;
  erros: number;
} {
  // Obter todos os imóveis em operação
  const [imoveis] = consultar<{ id: number }>(
    db,
    `SELECT DISTINCT c.imovel_id as id
     FROM ciclo_vida_imovel_contabil c
     WHERE c.status IN ('aquisicao_pendente', 'em_operacao', 'depreciacao_em_dia')
       AND c.valor_aquisicao > 0
     ORDER BY c.imovel_id ASC`,
    []
  );

  let sucessos = 0;
  let erros = 0;

  imoveis.forEach((imovel) => {
    const resultado = sincronizarDepreciacaoMensalImovel(
      db,
      imovel.id,
      entidadeId,
      periodoId
    );
    if (resultado) {
      sucessos++;
    } else {
      erros++;
    }
  });

  return {
    processados: imoveis.length,
    sucessos,
    erros,
  };
}

/**
 * Criar registro de ciclo de vida para novo imóvel
 */
function criarCicloVidaImovel(
  db: Database,
  imovelId: number,
  valorAquisicao: number
): void {
  // Definir vida útil (padrão: 25 anos para comercial, 27 para residencial)
  const vida_util_anos = 25;
  const vida_util_meses = vida_util_anos * 12;

  executar(
    db,
    `INSERT INTO ciclo_vida_imovel_contabil
     (imovel_id, status, data_aquisicao, valor_aquisicao, valor_acumulado_depreciacao, valor_residual, vida_util_meses, criado_em)
     VALUES (?, 'aquisicao_pendente', datetime('now'), ?, 0, ?, ?, datetime('now'))`,
    [imovelId, valorAquisicao, valorAquisicao, vida_util_meses]
  );
}

/**
 * Registrar sincronização de patrimônio
 */
function registrarSincronizacaoPatrimonio(
  db: Database,
  imovelId: number,
  tipoEvento: string,
  status: "sucesso" | "pendente" | "erro",
  valorEvento: number,
  erro?: string | null
): void {
  executar(
    db,
    `INSERT INTO sincronizacoes_patrimonio_imovel
     (imovel_id, tipo_evento, data_evento, status, valor_evento, criado_em)
     VALUES (?, ?, datetime('now'), ?, ?, datetime('now'))`,
    [imovelId, tipoEvento, status, valorEvento]
  );
}

/**
 * Validar consistência patrimônio ↔ imovel
 */
export function validarConsistenciaPatrimonioImovel(
  db: Database,
  imovelId: number
): {
  consistente: boolean;
  discrepancias: string[];
  cicloVida?: CicloVidaImovelContabil;
} {
  const discrepancias: string[] = [];

  // 1. Verificar se imóvel existe
  const [imovel] = consultar<{ id: number; valor_aquisicao: number }>(
    db,
    `SELECT id, valor_aquisicao FROM imoveis WHERE id = ?`,
    [imovelId]
  );

  if (!imovel) {
    discrepancias.push("Imóvel não encontrado");
    return { consistente: false, discrepancias };
  }

  // 2. Verificar se ciclo de vida existe
  const [ciclo] = consultar<CicloVidaImovelContabil>(
    db,
    `SELECT * FROM ciclo_vida_imovel_contabil WHERE imovel_id = ?`,
    [imovelId]
  );

  if (!ciclo) {
    discrepancias.push("Ciclo de vida não encontrado");
  } else {
    // 3. Validar valor residual (deve ser aquisição - depreciação)
    const valor_residual_esperado = ciclo.valor_aquisicao - ciclo.valor_acumulado_depreciacao;
    if (Math.abs(ciclo.valor_residual - valor_residual_esperado) > 0.01) {
      discrepancias.push(
        `Valor residual inconsistente: ${ciclo.valor_residual} vs esperado ${valor_residual_esperado}`
      );
    }
  }

  // 4. Verificar se há lançamentos no ledger
  const [ledgerEntry] = consultar<{ id: number }>(
    db,
    `SELECT id FROM ledger_entries WHERE origem_modulo = 'patrimonio' AND origem_id = ? LIMIT 1`,
    [imovelId]
  );

  if (!ledgerEntry && imovel) {
    discrepancias.push("Aquisição não registrada no ledger");
  }

  return {
    consistente: discrepancias.length === 0,
    discrepancias,
    cicloVida: ciclo,
  };
}
