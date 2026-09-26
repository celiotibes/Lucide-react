/**
 * Ledger Integrado: Núcleo contábil com auditoria e período fechável
 * Todas as 7 integrações alimentam este ledger centralizado
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import {
  assegurarPeriodoAberto,
  obterDescricaoPeriodo,
} from "./ledger-period-validation";
import { CONTA_LUCROS_ACUMULADOS_ERP } from "./mapeamentoPlanoApp";

/** SHA-256 pela Web Crypto API — a mesma que src/domain/backupIntegridade.ts usa.
 *
 * Aqui havia `import crypto from "crypto"`, o módulo NATIVO DO NODE. Este app roda
 * inteiramente no navegador (sql.js em WASM, sem backend), e o Vite externaliza esse
 * import: `crypto.createHash` estoura em tempo de execução no cliente. Os testes nunca
 * pegaram porque o Vitest roda em Node, onde o módulo existe de verdade — o defeito só
 * apareceria no primeiro fechamento de período feito por um usuário.
 *
 * Por isso encerrarPeriodo() é assíncrona: crypto.subtle.digest não tem versão síncrona,
 * e não vale trocar por um hash caseiro num campo que serve justamente para detectar
 * manipulação do balancete depois do fechamento. */
async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface LancamentoContabil {
  entidade_id: number;
  periodo_id: number;
  centro_custo_id?: number;
  conta_id: number;
  data_lancamento: string;
  valor_debito?: number;
  valor_credito?: number;
  descricao: string;
  origem_modulo: 'transacoes' | 'contratos' | 'patrimonio' | 'caucao' | 'financiamento' | 'rateios' | 'vistorias' | 'advocacia' | 'contas-pessoais' | 'imovel-gestao' | 'apontamento-prestador' | 'pagamentos-integracao' | 'skillos' | 'manual';
  origem_id: number;
  referencia_documento: string;
  criado_por?: number;
}

export interface BalancetePeriodo {
  periodo: string;
  data_fechamento?: string;
  saldos: Array<{
    conta_codigo: string;
    conta_descricao: string;
    saldo_anterior: number;
    total_debito: number;
    total_credito: number;
    saldo_final: number;
  }>;
  total_debito_periodo: number;
  total_credito_periodo: number;
  balanceado: boolean;
}

/** Registrar lançamento no ledger integrado */
export function registrarLancamentoContabil(
  db: Database,
  lancamento: LancamentoContabil,
): number {
  // VALIDAÇÃO 1: Verificar se período está aberto
  // Deve ser feito ANTES de qualquer INSERT para evitar duplicação
  assegurarPeriodoAberto(db, lancamento.periodo_id);

  if (!lancamento.valor_debito && !lancamento.valor_credito) {
    throw new Error("Lançamento deve ter débito ou crédito");
  }

  if (lancamento.valor_debito && lancamento.valor_credito) {
    throw new Error("Lançamento não pode ter débito E crédito simultaneamente");
  }

  executar(
    db,
    `INSERT INTO ledger_entries (
      entidade_id, periodo_id, centro_custo_id, conta_id,
      data_lancamento, valor_debito, valor_credito,
      descricao, origem_modulo, origem_id, referencia_documento,
      criado_por, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      lancamento.entidade_id,
      lancamento.periodo_id,
      lancamento.centro_custo_id || null,
      lancamento.conta_id,
      lancamento.data_lancamento,
      lancamento.valor_debito || null,
      lancamento.valor_credito || null,
      lancamento.descricao,
      lancamento.origem_modulo,
      lancamento.origem_id,
      lancamento.referencia_documento,
      lancamento.criado_por || null,
    ],
  );

  const [result] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
    [],
  );

  return result?.id || 0;
}

/** Obter saldo de uma conta em um período */
export function obterSaldoConta(
  db: Database,
  periodo_id: number,
  conta_id: number,
): number {
  const [saldo] = consultar<{ total_debito: number; total_credito: number }>(
    db,
    `SELECT
      COALESCE(SUM(CASE WHEN valor_debito IS NOT NULL THEN valor_debito ELSE 0 END), 0) as total_debito,
      COALESCE(SUM(CASE WHEN valor_credito IS NOT NULL THEN valor_credito ELSE 0 END), 0) as total_credito
     FROM ledger_entries
     WHERE periodo_id = ? AND conta_id = ?`,
    [periodo_id, conta_id],
  );

  if (!saldo) return 0;

  // Determinar natureza da conta (débito ou crédito)
  const [conta] = consultar<{ natureza: string }>(
    db,
    "SELECT natureza FROM contas_plano_contas WHERE id = ?",
    [conta_id],
  );

  const natureza = conta?.natureza || "debito";
  const saldo_bruto =
    (saldo.total_debito || 0) - (saldo.total_credito || 0);

  return natureza === "debito" ? saldo_bruto : -saldo_bruto;
}

/** Gerar balancete completo de um período */
export function gerarBalancete(
  db: Database,
  periodo_id: number,
): BalancetePeriodo {
  const [periodo] = consultar<{ ano: number; mes: number; status: string; data_fechamento: string }>(
    db,
    "SELECT ano, mes, status, data_fechamento FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  const saldos = consultar<{
    id: number;
    codigo: string;
    descricao: string;
    total_debito: number;
    total_credito: number;
  }>(
    db,
    `SELECT
      c.id,
      c.codigo,
      c.descricao,
      COALESCE(SUM(CASE WHEN l.valor_debito IS NOT NULL THEN l.valor_debito ELSE 0 END), 0) as total_debito,
      COALESCE(SUM(CASE WHEN l.valor_credito IS NOT NULL THEN l.valor_credito ELSE 0 END), 0) as total_credito
     FROM contas_plano_contas c
     LEFT JOIN ledger_entries l ON c.id = l.conta_id AND l.periodo_id = ?
     WHERE c.analisavel = 1 AND c.ativo = 1
     GROUP BY c.id
     ORDER BY c.codigo`,
    [periodo_id],
  );

  const saldosAnteriores = consultar<{ conta_id: number; saldo_anterior: number }>(
    db,
    "SELECT conta_id, saldo_anterior FROM ledger_saldos_periodo WHERE periodo_id = ?",
    [periodo_id],
  );
  const saldoAnteriorPorConta = new Map<number, number>(
    saldosAnteriores.map((s) => [s.conta_id, s.saldo_anterior || 0]),
  );

  let total_debito = 0;
  let total_credito = 0;

  const saldos_processados = saldos.map((s) => {
    const debito = s.total_debito || 0;
    const credito = s.total_credito || 0;
    total_debito += debito;
    total_credito += credito;
    const saldo_anterior = saldoAnteriorPorConta.get(s.id) || 0;

    return {
      conta_codigo: s.codigo,
      conta_descricao: s.descricao,
      saldo_anterior,
      total_debito: debito,
      total_credito: credito,
      saldo_final: saldo_anterior + debito - credito,
    };
  });

  return {
    periodo: `${periodo?.ano}/${String(periodo?.mes || 1).padStart(2, "0")}`,
    data_fechamento: periodo?.data_fechamento,
    saldos: saldos_processados,
    total_debito_periodo: total_debito,
    total_credito_periodo: total_credito,
    balanceado: Math.abs(total_debito - total_credito) < 0.01, // Margem de arredondamento
  };
}

/** Validar integridade do ledger (débitos = créditos) */
export function validarBalanceamento(
  db: Database,
  periodo_id: number,
): { balanceado: boolean; diferenca: number } {
  const [totais] = consultar<{ total_debito: number; total_credito: number }>(
    db,
    `SELECT
      COALESCE(SUM(valor_debito), 0) as total_debito,
      COALESCE(SUM(valor_credito), 0) as total_credito
     FROM ledger_entries
     WHERE periodo_id = ?`,
    [periodo_id],
  );

  const diferenca = Math.abs(
    (totais?.total_debito || 0) - (totais?.total_credito || 0),
  );

  return {
    balanceado: diferenca < 0.01,
    diferenca,
  };
}

/** Encerrar um período contábil (período fechado, não pode ser alterado) */
export async function encerrarPeriodo(
  db: Database,
  periodo_id: number,
  encerrado_por: number,
  motivo: string,
): Promise<{ sucesso: boolean; mensagem: string }> {
  // 1. Validar que o período está aberto
  const [periodo] = consultar<{ status: string; entidade_id: number }>(
    db,
    "SELECT status, entidade_id FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  if (!periodo) {
    return { sucesso: false, mensagem: "Período não encontrado" };
  }

  // Esta checagem também é a garantia de idempotência do lançamento de encerramento
  // logo abaixo: encerrarPeriodo só chega em fecharContasDeResultado() enquanto o
  // período ainda está 'aberto', e o status vira 'fechado' antes de retornar (passo 6).
  // Rodar encerrarPeriodo de novo no mesmo período cai aqui e nunca duplica a
  // transferência — não precisa de nenhuma checagem extra por referencia_documento.
  if (periodo.status !== "aberto") {
    return { sucesso: false, mensagem: "Período já está fechado" };
  }

  // 2. Validar balanceamento (do movimento lançado pelos módulos, antes do encerramento)
  const balancete = validarBalanceamento(db, periodo_id);
  if (!balancete.balanceado) {
    return {
      sucesso: false,
      mensagem: `Ledger desbalanceado. Diferença: R$ ${balancete.diferenca.toFixed(2)}`,
    };
  }

  // 2.5. Lançamento de encerramento: fecha as contas de resultado (receita/despesa)
  // contra o Patrimônio Líquido (2.1.02, Lucros Acumulados) — ver fecharContasDeResultado()
  // para o desenho da contrapartida. Roda ANTES do snapshot (passo 3) para o balancete e o
  // saldo transportado ao próximo período (passo 7) já refletirem o resultado transferido.
  fecharContasDeResultado(db, periodo_id, periodo.entidade_id, encerrado_por);

  // 3. Gerar snapshot dos saldos finais (já com o efeito do encerramento acima)
  const balancete_completo = gerarBalancete(db, periodo_id);

  // 4. Hash dos saldos (para detectar manipulação pós-fechamento)
  const snapshot = JSON.stringify(balancete_completo.saldos);
  const hash_snapshot = await sha256Hex(snapshot);

  // 5. Registrar no histórico de encerramentos
  executar(
    db,
    `INSERT INTO ledger_encerramentos (
      periodo_id, encerrado_por, balancete_OK,
      total_debito, total_credito, hash_snapshot, observacoes,
      data_encerramento
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      periodo_id,
      encerrado_por,
      1, // balancete OK
      balancete_completo.total_debito_periodo,
      balancete_completo.total_credito_periodo,
      hash_snapshot,
      motivo,
    ],
  );

  // 6. Fechar o período
  executar(
    db,
    `UPDATE periodos_contabeis
     SET status = 'fechado', data_fechamento = datetime('now'),
         encerrado_por = ?
     WHERE id = ?`,
    [encerrado_por, periodo_id],
  );

  // 7. Criar cache de saldos para próximo período
  criarSaldosProximoPeriodo(db, periodo_id);

  return { sucesso: true, mensagem: "Período encerrado com sucesso" };
}

/**
 * Lançamento de encerramento: fecha as contas de resultado (receita/despesa) do período
 * contra o Patrimônio Líquido — a "closing entry" clássica de contabilidade que faltava
 * (achado D do teste `reconstituicao-golden-path.test.ts`; ver o comentário no topo
 * daquele arquivo).
 *
 * DESENHO DA CONTRAPARTIDA (por que não é "uma perna só" em 2.1.02):
 * a tarefa pede para NÃO criar conta nova, e não existe no plano nenhuma conta "neutra"
 * de apuração de resultado (só as próprias contas de receita/despesa e 2.1.02). A opção
 * que sobra — e é, por sinal, o lançamento de encerramento real de contabilidade — é
 * zerar CADA conta de receita/despesa que teve movimento no período (lançando o inverso
 * do seu saldo) e levar o LÍQUIDO dessas zeragens para 2.1.02: crédito se o período deu
 * lucro, débito se deu prejuízo. Isso é sempre balanceado por construção:
 *   - Represento o saldo de cada conta como (débito − crédito) no período.
 *   - Receita (natureza crédito) normalmente fecha o período com saldo NEGATIVO nessa
 *     conta (mais crédito que débito); despesa (natureza débito) fecha POSITIVO.
 *   - Resultado do período (lucro > 0) = receita líquida − despesa líquida = −Σ(saldo)
 *     de todas as contas de receita/despesa tocadas.
 *   - Para "zerar" uma conta de saldo positivo (típico despesa), lança-se um CRÉDITO
 *     igual ao saldo; para saldo negativo (típico receita), um DÉBITO igual a |saldo|.
 *   - Somando tudo: débitos = Σ|saldo| das contas com saldo<0 (receita líquida) + (se
 *     prejuízo) o débito em 2.1.02; créditos = Σ saldo das contas com saldo>0 (despesa
 *     líquida) + (se lucro) o crédito em 2.1.02. Substituindo resultado = receita −
 *     despesa nos dois lados, débitos = créditos sempre — não é preciso confiar, dá para
 *     conferir na conta: receita=2000, despesa=300 (lucro=1700) → débitos = 2000
 *     (zeragem da receita) = créditos = 300 (zeragem da despesa) + 1700 (crédito em
 *     2.1.02). Por isso o período continua batendo (débito=crédito) depois do
 *     encerramento, e a identidade "Ativo = Passivo + PL + resultado" do razão (testada
 *     em reconstituicao-golden-path.test.ts) não se altera: o encerramento só RECLASSIFICA
 *     o resultado, tirando-o das contas de receita/despesa e colocando em Lucros
 *     Acumulados — o total do lado direito da equação patrimonial não muda.
 *
 * IDEMPOTÊNCIA: não tem checagem própria porque não precisa — encerrarPeriodo só chama
 * esta função enquanto o período está 'aberto' (ver comentário lá), e vira 'fechado'
 * antes de qualquer retorno bem-sucedido. Rodar encerrarPeriodo duas vezes no mesmo
 * período nunca chega aqui na segunda vez.
 */
function fecharContasDeResultado(
  db: Database,
  periodo_id: number,
  entidade_id: number,
  encerrado_por: number,
): void {
  // Uma conta por linha, cada uma com seu saldo líquido (débito − crédito) no período —
  // não SUM(valor_debito)/SUM(valor_credito) brutos por lado, para já vir líquido de
  // eventuais estornos (mesmo cuidado do achado C, gerarDRE).
  const contas = consultar<{ id: number; descricao: string; saldo: number }>(
    db,
    `SELECT cp.id, cp.descricao,
            COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0) AS saldo
     FROM ledger_entries le
     INNER JOIN contas_plano_contas cp ON cp.id = le.conta_id
     WHERE le.periodo_id = ? AND cp.grupo IN ('receita', 'despesa')
     GROUP BY cp.id, cp.descricao
     HAVING ABS(COALESCE(SUM(le.valor_debito), 0) - COALESCE(SUM(le.valor_credito), 0)) > 0.005`,
    [periodo_id],
  );

  if (contas.length === 0) return; // período sem movimento de resultado — nada a fechar

  // Mesma data para todas as pernas deste lançamento: a data do último movimento real do
  // período (não "hoje", que não tem relação nenhuma com o período contábil sendo
  // fechado, e apareceria fora de ordem cronológica no razão de um período passado).
  const [ultimoMovimento] = consultar<{ data: string }>(
    db,
    "SELECT MAX(data_lancamento) as data FROM ledger_entries WHERE periodo_id = ?",
    [periodo_id],
  );
  const dataFechamento = ultimoMovimento?.data || new Date().toISOString().slice(0, 10);

  const referencia = `ENCERRAMENTO-${periodo_id}`;
  let somaSaldos = 0;

  for (const conta of contas) {
    somaSaldos += conta.saldo;
    const descricao = `Encerramento do período: zeragem de ${conta.descricao} contra Lucros Acumulados`;
    const zeragem: LancamentoContabil =
      conta.saldo > 0
        ? {
            // Saldo devedor (típico de despesa): zera com crédito.
            entidade_id,
            periodo_id,
            conta_id: conta.id,
            data_lancamento: dataFechamento,
            valor_credito: conta.saldo,
            descricao,
            origem_modulo: "manual",
            origem_id: periodo_id,
            referencia_documento: referencia,
            criado_por: encerrado_por,
          }
        : {
            // Saldo credor (típico de receita): zera com débito.
            entidade_id,
            periodo_id,
            conta_id: conta.id,
            data_lancamento: dataFechamento,
            valor_debito: -conta.saldo,
            descricao,
            origem_modulo: "manual",
            origem_id: periodo_id,
            referencia_documento: referencia,
            criado_por: encerrado_por,
          };
    registrarLancamentoContabil(db, zeragem);
  }

  // resultado = −Σ(saldo): ver a conta completa no comentário da função.
  const resultado = -somaSaldos;
  if (Math.abs(resultado) <= 0.005) return; // resultado nulo — receita e despesa se cancelam

  const transferenciaPL: LancamentoContabil =
    resultado > 0
      ? {
          // Lucro: credita Lucros Acumulados.
          entidade_id,
          periodo_id,
          conta_id: CONTA_LUCROS_ACUMULADOS_ERP,
          data_lancamento: dataFechamento,
          valor_credito: resultado,
          descricao: "Encerramento do período: transferência do resultado (lucro) para Lucros Acumulados",
          origem_modulo: "manual",
          origem_id: periodo_id,
          referencia_documento: referencia,
          criado_por: encerrado_por,
        }
      : {
          // Prejuízo: debita Lucros Acumulados (reduz o PL).
          entidade_id,
          periodo_id,
          conta_id: CONTA_LUCROS_ACUMULADOS_ERP,
          data_lancamento: dataFechamento,
          valor_debito: -resultado,
          descricao: "Encerramento do período: transferência do resultado (prejuízo) para Lucros Acumulados",
          origem_modulo: "manual",
          origem_id: periodo_id,
          referencia_documento: referencia,
          criado_por: encerrado_por,
        };
  registrarLancamentoContabil(db, transferenciaPL);
}

/** Criar saldos iniciais (saldo_anterior) do próximo período */
function criarSaldosProximoPeriodo(
  db: Database,
  periodo_id: number,
): void {
  // Obter info do período fechado
  const [periodo] = consultar<{ entidade_id: number; ano: number; mes: number }>(
    db,
    "SELECT entidade_id, ano, mes FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );

  if (!periodo) return;

  // Calcular próximo período
  let proximo_mes = (periodo.mes || 1) + 1;
  let proximo_ano = periodo.ano;
  if (proximo_mes > 12) {
    proximo_mes = 1;
    proximo_ano += 1;
  }

  // Verificar se próximo período já existe; caso contrário, criar
  let [proximo_periodo] = consultar<{ id: number }>(
    db,
    `SELECT id FROM periodos_contabeis
     WHERE entidade_id = ? AND ano = ? AND mes = ?`,
    [periodo.entidade_id, proximo_ano, proximo_mes],
  );

  if (!proximo_periodo) {
    executar(
      db,
      `INSERT INTO periodos_contabeis (entidade_id, ano, mes, status)
       VALUES (?, ?, ?, 'aberto')`,
      [periodo.entidade_id, proximo_ano, proximo_mes],
    );

    [proximo_periodo] = consultar<{ id: number }>(
      db,
      `SELECT id FROM periodos_contabeis
       WHERE entidade_id = ? AND ano = ? AND mes = ?`,
      [periodo.entidade_id, proximo_ano, proximo_mes],
    );
  }

  if (!proximo_periodo) return;

  // Inserir saldos finais do período anterior como saldo_anterior do próximo
  const contas = consultar<{ id: number; saldo_final: number }>(
    db,
    `SELECT conta_id as id,
            COALESCE(SUM(valor_debito), 0) - COALESCE(SUM(valor_credito), 0) as saldo_final
     FROM ledger_entries
     WHERE periodo_id = ?
     GROUP BY conta_id`,
    [periodo_id],
  );

  contas.forEach((conta) => {
    executar(
      db,
      `INSERT OR REPLACE INTO ledger_saldos_periodo
       (periodo_id, conta_id, saldo_anterior, total_debito, total_credito, saldo_final)
       VALUES (?, ?, ?, 0, 0, ?)`,
      [proximo_periodo.id, conta.id, conta.saldo_final, conta.saldo_final],
    );
  });
}

/** Registrar estorno de lançamento (lançamento reverso com trilha de auditoria) */
export function estornarLancamento(
  db: Database,
  lancamento_id: number,
  motivo_estorno: string,
  estornado_por: number,
): boolean {
  // Obter lançamento original
  const [original] = consultar<{
    valor_debito: number;
    valor_credito: number;
  }>(
    db,
    "SELECT valor_debito, valor_credito FROM ledger_entries WHERE id = ?",
    [lancamento_id],
  );

  if (!original) return false;

  // Criar lançamento reverso primeiro (débito ↔ crédito invertido): o id dele é o que
  // o original precisa guardar para a trilha de auditoria ligar um ao outro.
  executar(
    db,
    `INSERT INTO ledger_entries (
      entidade_id, periodo_id, conta_id, data_lancamento,
      valor_debito, valor_credito, descricao, origem_modulo,
      origem_id, referencia_documento, criado_por, criado_em, estorno_de_id
    ) SELECT
      entidade_id, periodo_id, conta_id, datetime('now'),
      valor_credito, valor_debito,
      'ESTORNO: ' || descricao,
      origem_modulo,
      origem_id,
      referencia_documento || '-EST',
      ?, datetime('now'),
      id
     FROM ledger_entries WHERE id = ?`,
    [estornado_por, lancamento_id],
  );

  const [reverso] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
  );

  // Marcar original como estornado, apontando para o lançamento que o estornou.
  // Antes gravava estornado_por_id = lancamento_id na própria linha do original: o
  // lançamento apontava para si mesmo, e a trilha nunca chegava ao estorno.
  executar(
    db,
    `UPDATE ledger_entries
     SET estornado_por_id = ?, motivo_estorno = ?
     WHERE id = ?`,
    [reverso.id, motivo_estorno, lancamento_id],
  );

  return true;
}

/** Auditoria: aprovar lançamentos para finalizar processamento contábil */
export function aprovarLancamentos(
  db: Database,
  lancamento_ids: number[],
  auditado_por: number,
): number {
  let aprovados = 0;

  lancamento_ids.forEach((id) => {
    executar(
      db,
      `UPDATE ledger_entries
       SET auditada = 1, auditado_em = datetime('now'), auditado_por = ?
       WHERE id = ?`,
      [auditado_por, id],
    );
    aprovados++;
  });

  return aprovados;
}

/** Interface para retificação contábil (valor anterior → valor novo) */
export interface RetificacaoContabil {
  apontamento_id?: number;
  retificacao_id?: number;
  conta_id: number;
  valor_anterior: number;
  valor_novo: number;
  entidade_id: number;
  periodo_id: number;
  data_lancamento: string;
  origem_modulo:
    | "transacoes"
    | "contratos"
    | "patrimonio"
    | "caucao"
    | "financiamento"
    | "rateios"
    | "vistorias"
    | "apontamento-prestador"
    | "manual";
  motivo_retificacao: string;
  retificada_por: number;
}

/**
 * Registrar retificação com mecanismo de reversão (sem duplicação)
 *
 * Fluxo:
 * 1. Se valor_anterior > 0: cria lançamento REVERSO (inverte débito ↔ crédito)
 * 2. Registra novo lançamento com valor_novo
 * 3. Mapeia ambos no rastreamento (retificacao_ledger_mapping)
 *
 * Resultado: débito original REVERSADO + novo lançamento = valor final correto
 * (não duplicado, sim corrigido)
 */
export function registrarRetificacao(
  db: Database,
  retificacao: RetificacaoContabil,
): { sucesso: boolean; ledger_reverso_id?: number; ledger_novo_id?: number; mensagem: string } {
  try {
    // VALIDAÇÃO: Período deve estar aberto
    assegurarPeriodoAberto(db, retificacao.periodo_id);

    // PASSO 1: Se havia valor anterior, reverter o lançamento original
    let ledger_reverso_id: number | undefined;

    if (retificacao.valor_anterior > 0) {
      // Encontrar lançamento original
      const [original] = consultar<{
        id: number;
        valor_debito: number;
        valor_credito: number;
      }>(
        db,
        `SELECT id, valor_debito, valor_credito FROM ledger_entries
         WHERE conta_id = ? AND periodo_id = ? AND (valor_debito = ? OR valor_credito = ?)
         ORDER BY id DESC LIMIT 1`,
        [
          retificacao.conta_id,
          retificacao.periodo_id,
          retificacao.valor_anterior,
          retificacao.valor_anterior,
        ]
      );

      // Sem o original não há o que reverter. Antes o código seguia em frente e montava
      // um reverso com débito e crédito indefinidos, que morria lá na frente com
      // "Lançamento deve ter débito ou crédito" — mensagem que aponta para o lugar
      // errado e esconde a causa (valor_anterior que não casa com nenhum lançamento).
      if (!original) {
        return {
          sucesso: false,
          mensagem: `Erro ao registrar retificação: nenhum lançamento de R$${retificacao.valor_anterior.toFixed(2)} encontrado na conta ${retificacao.conta_id} do período ${retificacao.periodo_id} para reverter`,
        };
      }

      // PASSO 1a: Criar lançamento reverso (inverte débito ↔ crédito)
      const lancamento_reverso: LancamentoContabil = {
        entidade_id: retificacao.entidade_id,
        periodo_id: retificacao.periodo_id,
        conta_id: retificacao.conta_id,
        data_lancamento: retificacao.data_lancamento,
        // Inverter: se original era débito, reverso é crédito
        valor_debito: original.valor_credito || undefined,
        valor_credito: original.valor_debito || undefined,
        descricao: `RETIFICAÇÃO REVERSO: ${retificacao.motivo_retificacao}`,
        origem_modulo: retificacao.origem_modulo,
        origem_id: retificacao.retificacao_id || retificacao.apontamento_id || 0,
        referencia_documento: `RETIF-${retificacao.retificacao_id || "MANUAL"}-REV`,
        criado_por: retificacao.retificada_por,
      };

      // Registrar sem validação (já validamos período acima)
      ledger_reverso_id = registrarLancamentoSemValidacao(
        db,
        lancamento_reverso
      );
    }

    // PASSO 2: Registrar novo lançamento com valor correto
    const lancamento_novo: LancamentoContabil = {
      entidade_id: retificacao.entidade_id,
      periodo_id: retificacao.periodo_id,
      conta_id: retificacao.conta_id,
      data_lancamento: retificacao.data_lancamento,
      // Manter natureza da conta: se débito era débito, continua débito
      valor_debito:
        retificacao.valor_novo > 0
          ? retificacao.valor_novo
          : undefined,
      valor_credito:
        retificacao.valor_novo > 0 ? undefined : Math.abs(retificacao.valor_novo),
      descricao: `RETIFICAÇÃO: ${retificacao.motivo_retificacao}`,
      origem_modulo: retificacao.origem_modulo,
      origem_id: retificacao.retificacao_id || retificacao.apontamento_id || 0,
      referencia_documento: `RETIF-${retificacao.retificacao_id || "MANUAL"}`,
      criado_por: retificacao.retificada_por,
    };

    const ledger_novo_id = registrarLancamentoSemValidacao(db, lancamento_novo);

    // PASSO 3: Registrar rastreamento (se tabela existir)
    if (ledger_reverso_id && retificacao.retificacao_id) {
      executar(
        db,
        `INSERT OR IGNORE INTO retificacao_ledger_mapping
         (retificacao_id, ledger_entry_reverso_id, ledger_entry_novo_id)
         VALUES (?, ?, ?)`,
        [retificacao.retificacao_id, ledger_reverso_id, ledger_novo_id]
      );
    }

    return {
      sucesso: true,
      ledger_reverso_id,
      ledger_novo_id,
      mensagem: `Retificação registrada: R$${retificacao.valor_anterior.toFixed(2)} → R$${retificacao.valor_novo.toFixed(2)}`,
    };
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Erro ao registrar retificação: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}

/**
 * Versão interna de registrarLancamentoContabil sem validação de período
 * Usada por registrarRetificacao para evitar validação dupla
 */
function registrarLancamentoSemValidacao(
  db: Database,
  lancamento: LancamentoContabil,
): number {
  if (!lancamento.valor_debito && !lancamento.valor_credito) {
    throw new Error("Lançamento deve ter débito ou crédito");
  }

  if (lancamento.valor_debito && lancamento.valor_credito) {
    throw new Error("Lançamento não pode ter débito E crédito simultaneamente");
  }

  executar(
    db,
    `INSERT INTO ledger_entries (
      entidade_id, periodo_id, centro_custo_id, conta_id,
      data_lancamento, valor_debito, valor_credito,
      descricao, origem_modulo, origem_id, referencia_documento,
      criado_por, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      lancamento.entidade_id,
      lancamento.periodo_id,
      lancamento.centro_custo_id || null,
      lancamento.conta_id,
      lancamento.data_lancamento,
      lancamento.valor_debito || null,
      lancamento.valor_credito || null,
      lancamento.descricao,
      lancamento.origem_modulo,
      lancamento.origem_id,
      lancamento.referencia_documento,
      lancamento.criado_por || null,
    ]
  );

  const [result] = consultar<{ id: number }>(
    db,
    "SELECT last_insert_rowid() as id",
    []
  );

  return result?.id || 0;
}
