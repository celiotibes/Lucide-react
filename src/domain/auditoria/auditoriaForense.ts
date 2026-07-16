import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface TransacaoDuplicada {
  conta_id: number;
  data: string;
  valor: number;
  descricao_original: string;
  ocorrencias: number;
  transacaoIds: number[];
}

/** Mesma conta, mesma data, mesmo valor e mesma descrição em mais de um lançamento —
 * o sintoma mais comum de pagamento em duplicidade (boleto pago duas vezes, PIX
 * repetido). O import já evita duplicar o mesmo arquivo (fitid único), então isso
 * captura duplicidade "real" entre documentos diferentes. */
export function detectarDuplicatas(db: Database): TransacaoDuplicada[] {
  const grupos = consultar<{ conta_id: number; data: string; valor: number; descricao_original: string; ocorrencias: number; ids: string }>(
    db,
    `SELECT conta_id, data, valor, descricao_original, COUNT(*) AS ocorrencias, GROUP_CONCAT(id) AS ids
     FROM transacoes
     GROUP BY conta_id, data, valor, descricao_original
     HAVING COUNT(*) > 1
     ORDER BY ABS(valor) DESC`,
  );
  return grupos.map((g) => ({
    conta_id: g.conta_id,
    data: g.data,
    valor: g.valor,
    descricao_original: g.descricao_original,
    ocorrencias: g.ocorrencias,
    transacaoIds: g.ids.split(",").map(Number),
  }));
}

export interface OutlierEstatistico {
  transacaoId: number;
  data: string;
  descricao: string;
  valor: number;
  planoContaCodigo: string;
  mediaCategoria: number;
  desvioPadraoCategoria: number;
  zScore: number;
}

const AMOSTRA_MINIMA_OUTLIER = 5;
const Z_SCORE_LIMITE = 3;

/** Para cada categoria do plano de contas com volume suficiente, sinaliza lançamentos
 * cujo valor absoluto foge mais de 3 desvios-padrão da média da própria categoria —
 * o mesmo princípio que motores de conciliação tipo IDEA/ACL usam para achar
 * lançamento fora do padrão dentro de centenas de linhas. */
export function detectarOutliers(db: Database, dataInicio: string, dataFim: string): OutlierEstatistico[] {
  const linhas = consultar<{ id: number; data: string; descricao_original: string; valor: number; plano_conta_codigo: string }>(
    db,
    `SELECT id, data, descricao_original, valor, plano_conta_codigo
     FROM transacoes
     WHERE plano_conta_codigo IS NOT NULL AND data BETWEEN ? AND ?`,
    [dataInicio, dataFim],
  );

  const porCategoria = new Map<string, typeof linhas>();
  for (const linha of linhas) {
    const lista = porCategoria.get(linha.plano_conta_codigo) ?? [];
    lista.push(linha);
    porCategoria.set(linha.plano_conta_codigo, lista);
  }

  const outliers: OutlierEstatistico[] = [];
  for (const [codigo, itens] of porCategoria) {
    if (itens.length < AMOSTRA_MINIMA_OUTLIER) continue;

    const valoresAbsolutos = itens.map((i) => Math.abs(i.valor));
    const media = valoresAbsolutos.reduce((a, b) => a + b, 0) / valoresAbsolutos.length;
    const variancia = valoresAbsolutos.reduce((acc, v) => acc + (v - media) ** 2, 0) / valoresAbsolutos.length;
    const desvioPadrao = Math.sqrt(variancia);
    if (desvioPadrao === 0) continue;

    for (const item of itens) {
      const zScore = (Math.abs(item.valor) - media) / desvioPadrao;
      if (Math.abs(zScore) > Z_SCORE_LIMITE) {
        outliers.push({
          transacaoId: item.id,
          data: item.data,
          descricao: item.descricao_original,
          valor: item.valor,
          planoContaCodigo: codigo,
          mediaCategoria: media,
          desvioPadraoCategoria: desvioPadrao,
          zScore,
        });
      }
    }
  }
  return outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

export interface LacunaMensal {
  imovelApelido: string;
  planoContaCodigo: string;
  mesesFaltantes: string[];
}

/** Para despesas recorrentes por imóvel (condomínio, financiamento), lista meses
 * dentro da janela de dados em que não existe nenhum lançamento — um "buraco" no
 * histórico que precisa ser investigado (documento perdido ou pagamento por fora). */
export function detectarLacunasMensais(db: Database, planosRecorrentes: string[], dataInicio: string, dataFim: string): LacunaMensal[] {
  const imoveis = consultar<{ id: number; apelido: string }>(db, "SELECT id, apelido FROM imoveis");
  const resultado: LacunaMensal[] = [];

  for (const imovel of imoveis) {
    for (const codigo of planosRecorrentes) {
      const meses = consultar<{ mes: string }>(
        db,
        `SELECT DISTINCT substr(data, 1, 7) AS mes FROM transacoes
         WHERE imovel_id = ? AND plano_conta_codigo = ? AND data BETWEEN ? AND ?`,
        [imovel.id, codigo, dataInicio, dataFim],
      );
      if (meses.length === 0) continue; // nunca teve lançamento nessa categoria — não é lacuna, é ausência total

      const mesesPresentes = new Set(meses.map((m) => m.mes));
      const mesesFaltantes: string[] = [];
      let cursor = new Date(dataInicio + "T00:00:00");
      const fim = new Date(dataFim + "T00:00:00");
      while (cursor <= fim) {
        const chave = cursor.toISOString().slice(0, 7);
        if (!mesesPresentes.has(chave)) mesesFaltantes.push(chave);
        cursor.setMonth(cursor.getMonth() + 1);
      }
      if (mesesFaltantes.length > 0) resultado.push({ imovelApelido: imovel.apelido, planoContaCodigo: codigo, mesesFaltantes });
    }
  }
  return resultado;
}

export interface ResultadoBenford {
  digito: number;
  frequenciaObservada: number;
  frequenciaEsperada: number;
}

/** Lei de Benford: em conjuntos naturais de valores que variam livremente, o primeiro
 * dígito segue log10(1+1/d), não é uniforme. Só faz sentido aplicar a categorias com
 * valor variável (manutenção, prestadores, obras) — NÃO a aluguel/financiamento, cujo
 * valor é fixado em contrato e não tem motivo nenhum para seguir a distribuição. */
export function testeBenford(valores: number[]): ResultadoBenford[] {
  const contagem = new Array(10).fill(0);
  let total = 0;
  for (const valor of valores) {
    const absoluto = Math.abs(valor);
    if (absoluto < 1) continue;
    const primeiroDigito = parseInt(absoluto.toString().replace(".", "").replace(/^0+/, "")[0], 10);
    if (primeiroDigito >= 1 && primeiroDigito <= 9) {
      contagem[primeiroDigito]++;
      total++;
    }
  }
  if (total === 0) return [];

  return Array.from({ length: 9 }, (_, indice) => {
    const digito = indice + 1;
    return {
      digito,
      frequenciaObservada: contagem[digito] / total,
      frequenciaEsperada: Math.log10(1 + 1 / digito),
    };
  });
}

// ============================================================================
// Consistência entre módulos: o mesmo fato financeiro é registrado em dois lugares
// independentes (o cadastro formal — caução, financiamento — e a transação bancária real
// importada do extrato). Um sem o outro é sinal de documento perdido, lançamento por fora,
// ou cadastro que nunca foi de fato cumprido — o tipo de cruzamento que ferramentas de
// conciliação bancária (Simetrik) e auditoria fiscal (SCI/Makrosystem) chamam de "alerta de
// inconsistência entre contas".
// ============================================================================

const JANELA_CONCILIACAO_DIAS = 30;

function diferencaEmDiasAbsoluta(dataA: string, dataB: string): number {
  const a = new Date(dataA + "T00:00:00").getTime();
  const b = new Date(dataB + "T00:00:00").getTime();
  return Math.abs(Math.round((a - b) / (1000 * 60 * 60 * 24)));
}

export interface CaucaoSemTransacao {
  caucaoId: number;
  imovelApelido: string;
  locatario: string;
  valorInicial: number;
  dataDeposito: string;
}

/** Cauções cadastradas (Cadastros → Contratos → Depósito caução) sem nenhuma transação
 * bancária código 9.0.02 lançada para o mesmo imóvel dentro de ±30 dias da data de
 * depósito informada — o cadastro existe, mas não há prova de que o dinheiro de fato
 * entrou na conta. Não exige valor exatamente igual (a caução pode ter sido parcelada em
 * mais de um depósito, cada um menor que o total) — só que exista ALGUM lançamento 9.0.02
 * próximo à data informada. */
export function detectarCaucoesSemTransacao(db: Database): CaucaoSemTransacao[] {
  const caucoes = consultar<{ id: number; contrato_id: number; valor_inicial: number; data_deposito: string; imovel_id: number; locatario: string; imovel_apelido: string }>(
    db,
    `SELECT c.id, c.contrato_id, c.valor_inicial, c.data_deposito, ct.imovel_id, ct.locatario, i.apelido AS imovel_apelido
     FROM caucoes c
     JOIN contratos_locacao ct ON ct.id = c.contrato_id
     JOIN imoveis i ON i.id = ct.imovel_id`,
  );

  return caucoes
    .filter((c) => {
      const transacoesProximas = consultar<{ data: string }>(
        db,
        `SELECT data FROM transacoes WHERE imovel_id = ? AND plano_conta_codigo = '9.0.02'`,
        [c.imovel_id],
      );
      return !transacoesProximas.some((t) => diferencaEmDiasAbsoluta(t.data, c.data_deposito) <= JANELA_CONCILIACAO_DIAS);
    })
    .map((c) => ({ caucaoId: c.id, imovelApelido: c.imovel_apelido, locatario: c.locatario, valorInicial: c.valor_inicial, dataDeposito: c.data_deposito }));
}

export interface TransacaoCaucaoSemRegistro {
  transacaoId: number;
  imovelApelido: string;
  valor: number;
  data: string;
}

/** O inverso de detectarCaucoesSemTransacao: transações código 9.0.02 lançadas para um
 * imóvel sem nenhuma caução cadastrada com data_deposito próxima (±30 dias) para aquele
 * mesmo imóvel — dinheiro que transitou como caução no extrato, mas nunca virou um
 * registro formal em Cadastros → Contratos → Depósito caução (esquecimento comum quando a
 * caução é lançada direto na categorização de transações, sem passar pelo formulário). */
export function detectarTransacoesCaucaoSemRegistro(db: Database): TransacaoCaucaoSemRegistro[] {
  const transacoes = consultar<{ id: number; valor: number; data: string; imovel_id: number; imovel_apelido: string }>(
    db,
    `SELECT t.id, t.valor, t.data, t.imovel_id, i.apelido AS imovel_apelido
     FROM transacoes t
     JOIN imoveis i ON i.id = t.imovel_id
     WHERE t.plano_conta_codigo = '9.0.02'`,
  );

  return transacoes
    .filter((t) => {
      const caucoesDoImovel = consultar<{ data_deposito: string }>(
        db,
        `SELECT c.data_deposito FROM caucoes c JOIN contratos_locacao ct ON ct.id = c.contrato_id WHERE ct.imovel_id = ?`,
        [t.imovel_id],
      );
      return !caucoesDoImovel.some((c) => diferencaEmDiasAbsoluta(c.data_deposito, t.data) <= JANELA_CONCILIACAO_DIAS);
    })
    .map((t) => ({ transacaoId: t.id, imovelApelido: t.imovel_apelido, valor: t.valor, data: t.data }));
}

export interface FinanciamentoSemLancamento {
  financiamentoId: number;
  imovelApelido: string;
  instituicao: string;
  dataContrato: string;
}

function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

/** Financiamentos SAC/Price cadastrados (Cadastros → Financiamentos) sem NENHUMA
 * transação de juros (2.1.05) ou amortização (2.1.06) lançada para o imóvel — a dívida
 * está no cadastro (entra no passivo/patrimônio), mas a despesa correspondente nunca
 * apareceu no DRE. Sintoma típico de extrato ainda não importado ou parcela paga por
 * conta não cadastrada no sistema: sem isso, o lucro do imóvel fica superestimado porque
 * uma despesa real e recorrente está ausente. Não se aplica a financiamento 'OUTRO' (ex:
 * consórcio) — esse usa saldo/parcela manuais, não um cronograma esperado para comparar.
 * Só considera financiamentos cuja 1ª parcela já venceu (data_contrato + 1 mês <=
 * dataReferencia) — um financiamento contratado semana passada legitimamente ainda não
 * tem nenhuma parcela lançada, e isso não é inconsistência. */
export function detectarFinanciamentosSemLancamento(db: Database, dataReferencia: string): FinanciamentoSemLancamento[] {
  const financiamentos = consultar<{ id: number; instituicao: string; data_contrato: string; imovel_id: number; imovel_apelido: string }>(
    db,
    `SELECT f.id, f.instituicao, f.data_contrato, f.imovel_id, i.apelido AS imovel_apelido
     FROM financiamentos f
     JOIN imoveis i ON i.id = f.imovel_id
     WHERE f.sistema IN ('SAC', 'PRICE')`,
  );

  return financiamentos
    .filter((f) => somarMeses(f.data_contrato, 1) <= dataReferencia)
    .filter((f) => {
      const [{ total }] = consultar<{ total: number }>(
        db,
        `SELECT COUNT(*) AS total FROM transacoes WHERE imovel_id = ? AND plano_conta_codigo IN ('2.1.05', '2.1.06')`,
        [f.imovel_id],
      );
      return total === 0;
    })
    .map((f) => ({ financiamentoId: f.id, imovelApelido: f.imovel_apelido, instituicao: f.instituicao, dataContrato: f.data_contrato }));
}
