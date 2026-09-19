/**
 * Camada de acesso a dados do Painel de Conferência.
 *
 * Achado de auditoria corrigido aqui: PainelConferencia.tsx (e as telas/modais sob
 * painel-conferencia/) buscavam `/api/apontamentos`, `/api/fechamentos-semanais`,
 * `/api/movimentacoes`, `/api/reajuste-ipca/proposta` e mais um punhado de rotas PUT/POST —
 * nenhuma delas existe em server/ (que só tem Pluggy + health). Todo o banco contábil deste
 * app vive no navegador (sql.js + IndexedDB, ver src/db/connection.ts); o servidor não tem
 * acesso a esses dados. A correção certa não é inventar rotas de servidor — é ler/escrever
 * direto no banco local, como o resto do app já faz via `consultar`/`executar`.
 *
 * Este módulo mapeia as tabelas reais do schema contábil (apontamentos_diarios,
 * itens_remuneraveis, movimentacoes_financeiras, fechamentos_semanais,
 * parametros_operacionais, indices_economicos) para os tipos de "view model" definidos em
 * src/domain/apontamentos.ts, que é o contrato que as telas do Painel já esperam.
 *
 * Limitações conhecidas (o schema real não foi desenhado 1:1 para este view model, e alterar
 * contabilidade-reconstituicao/schema.sql está fora do escopo deste componente):
 *  - `Apontamento.requer_analise` não tem coluna correspondente em apontamentos_diarios —
 *    fica sempre `false` até que o schema seja estendido com essa flag.
 *  - `apontamentos_diarios.status` não aceita 'rejeitado' (CHECK só permite rascunho/
 *    enviado/aprovado/retificado) — `rejeitarApontamento` lança um erro claro em vez de
 *    fingir sucesso ou quebrar uma constraint em silêncio.
 *  - Parcelas/juros de empréstimo (na aprovação de uma Movimentação do tipo "empréstimo")
 *    não têm onde ser persistidos em `movimentacoes_financeiras` — isso vive numa tabela
 *    `emprestimos` separada e sem vínculo com a movimentação; o cálculo de parcela na tela
 *    continua funcionando (é só aritmética local), mas não é gravado no banco.
 *  - "Gerar Pagamento" de um fechamento só atualiza o status local para 'pago'. Acionar uma
 *    transferência real via Pluggy é uma integração externa de verdade (não um dado que já
 *    mora no navegador) e fica fora do escopo desta correção.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../../db/connection";
// Existem duas funções `calcularHoras` no projeto, com assinaturas incompatíveis: a de
// erp/apontamento-prestador recebe um apontamento inteiro e devolve HorasApontamento; a
// de apontamentos/apontamentoUtils recebe os quatro horários e devolve o número de horas.
// A chamada abaixo usa a segunda forma — importar a primeira fazia o arquivo não compilar.
import { calcularHoras } from "../../../domain/apontamentos/apontamentoUtils";
import type {
  Apontamento,
  FechamentoSemanal,
  FiltrosApontamentos,
  FiltrosFechamentos,
  FiltrosMovimentacoes,
  Movimentacao,
  ReajusteIPCA,
  RubricaReajuste,
  StatusApontamento,
  StatusFechamento,
  StatusMovimentacao,
  TipoApontamento,
  TipoMovimentacao,
} from "../../../domain/apontamentos";

// ===================================================================================
// Helpers genéricos
// ===================================================================================

function recortarHora(horaHms: string): string {
  return horaHms.length >= 5 ? horaHms.slice(0, 5) : horaHms;
}

function diferencaEmMinutos(inicioHms: string, fimHms: string): number {
  const paraMinutos = (h: string) => {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm;
  };
  return Math.max(0, paraMinutos(fimHms) - paraMinutos(inicioHms));
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** O input "Prestador" nas telas do Painel é uma caixa de texto livre (não um seletor de id)
 * — então o filtro correto é buscar por nome, não por um id numérico exato. */
function condicaoNomePrestador(valor: string | undefined, params: (string | number)[]): string | null {
  if (!valor) return null;
  params.push(`%${valor}%`);
  return "p.nome LIKE ?";
}

export function existemPrestadoresCadastrados(db: Database): boolean {
  const [linha] = consultar<{ total: number }>(db, "SELECT COUNT(*) AS total FROM prestadores");
  return (linha?.total ?? 0) > 0;
}

// ===================================================================================
// Apontamentos
// ===================================================================================

interface ApontamentoRow {
  id: number;
  prestador_id: number;
  prestador_nome: string;
  data: string;
  entrada: string;
  saida_intervalo: string | null;
  retorno_intervalo: string | null;
  saida_final: string;
  status: string;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface ItemRemuneravelRow {
  tipo: string;
  rubrica: string;
  valor_base: number;
  adicional_percentual: number;
  valor_final: number;
}

/** itens_remuneraveis.tipo usa 'materiais'/'extra'; o domínio do Painel usa
 * 'busca_materiais'/'ajudante'. Mapeamento best-effort entre os dois vocabulários. */
const TIPO_DB_PARA_DOMINIO: Record<string, TipoApontamento> = {
  diaria: "diaria",
  airbnb: "airbnb",
  urgencia: "urgencia",
  deslocamento: "deslocamento",
  materiais: "busca_materiais",
  extra: "ajudante",
};

function construirApontamento(db: Database, linha: ApontamentoRow): Apontamento {
  const itens = consultar<ItemRemuneravelRow>(
    db,
    "SELECT tipo, rubrica, valor_base, adicional_percentual, valor_final FROM itens_remuneraveis WHERE apontamento_id = ? ORDER BY id",
    [linha.id],
  );

  const somaPorTipoDb = (tipoDb: string) => itens.filter((i) => i.tipo === tipoDb).reduce((acc, i) => acc + i.valor_final, 0);
  const valor_diaria = somaPorTipoDb("diaria") || undefined;
  const valor_airbnb = somaPorTipoDb("airbnb") || undefined;
  const valor_urgencia = somaPorTipoDb("urgencia") || undefined;
  const valor_deslocamento = somaPorTipoDb("deslocamento") || undefined;
  const valor_busca_materiais = somaPorTipoDb("materiais") || undefined;
  const valor_ajudante = somaPorTipoDb("extra") || undefined;
  const valor_total = itens.reduce((acc, i) => acc + i.valor_final, 0);

  const tipos = Array.from(
    new Set(itens.map((i) => TIPO_DB_PARA_DOMINIO[i.tipo]).filter((t): t is TipoApontamento => Boolean(t))),
  );

  const intervalo =
    linha.saida_intervalo && linha.retorno_intervalo ? diferencaEmMinutos(linha.saida_intervalo, linha.retorno_intervalo) : undefined;

  let horas: number | undefined;
  try {
    horas =
      linha.entrada && linha.saida_final
        ? calcularHoras(linha.entrada, linha.saida_final, linha.saida_intervalo ?? undefined, linha.retorno_intervalo ?? undefined)
        : undefined;
  } catch {
    horas = undefined;
  }

  return {
    id: String(linha.id),
    prestador_id: String(linha.prestador_id),
    prestador_nome: linha.prestador_nome,
    data: linha.data,
    entrada: recortarHora(linha.entrada),
    saida: recortarHora(linha.saida_final),
    intervalo,
    horas,
    tipos,
    valor_diaria,
    valor_airbnb,
    valor_urgencia,
    valor_deslocamento,
    valor_busca_materiais,
    valor_ajudante,
    valor_total,
    status: linha.status as StatusApontamento,
    // Ver nota de limitações no topo do arquivo: o schema atual não persiste essa flag.
    requer_analise: false,
    data_criacao: linha.criado_em,
    data_atualizacao: linha.atualizado_em,
    observacoes: linha.observacoes ?? undefined,
  };
}

export function listarApontamentos(db: Database, filtros: FiltrosApontamentos = {}): Apontamento[] {
  const condicoes: string[] = [];
  const params: (string | number)[] = [];

  const condNome = condicaoNomePrestador(filtros.prestador_id, params);
  if (condNome) condicoes.push(condNome);
  if (filtros.status) {
    condicoes.push("ad.status = ?");
    params.push(filtros.status);
  }
  if (filtros.data_inicio) {
    condicoes.push("ad.data >= ?");
    params.push(filtros.data_inicio);
  }
  if (filtros.data_fim) {
    condicoes.push("ad.data <= ?");
    params.push(filtros.data_fim);
  }
  // filtros.requer_analise não é aplicado: não há coluna correspondente no schema atual.

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = consultar<ApontamentoRow>(
    db,
    `SELECT ad.*, p.nome AS prestador_nome
     FROM apontamentos_diarios ad
     JOIN prestadores p ON p.id = ad.prestador_id
     ${where}
     ORDER BY ad.data DESC, ad.id DESC`,
    params,
  );

  return linhas.map((linha) => construirApontamento(db, linha));
}

export function aprovarApontamento(db: Database, id: string): void {
  executar(db, "UPDATE apontamentos_diarios SET status = 'aprovado', atualizado_em = ? WHERE id = ?", [
    new Date().toISOString(),
    Number(id),
  ]);
}

export function rejeitarApontamento(): void {
  throw new Error(
    "Rejeitar apontamento não é suportado pelo schema atual: apontamentos_diarios.status só aceita " +
      "'rascunho' | 'enviado' | 'aprovado' | 'retificado' (contabilidade-reconstituicao/schema.sql). " +
      "Adicionar 'rejeitado' ao CHECK da tabela está fora do escopo deste componente.",
  );
}

export function retificarApontamento(
  db: Database,
  id: string,
  campoAlterado: "entrada" | "saida" | "intervalo",
  valorAnterior: string,
  novoValor: string,
  motivo: string,
): void {
  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);
  const coluna = campoAlterado === "entrada" ? "entrada" : campoAlterado === "saida" ? "saida_final" : null;

  if (coluna) {
    const valorColuna = /^\d{2}:\d{2}$/.test(novoValor) ? `${novoValor}:00` : novoValor;
    executar(db, `UPDATE apontamentos_diarios SET ${coluna} = ?, status = 'retificado', atualizado_em = ? WHERE id = ?`, [
      valorColuna,
      agora,
      Number(id),
    ]);
  } else {
    // campo === "intervalo": o schema não guarda "minutos de intervalo" isolado, só os
    // horários saida_intervalo/retorno_intervalo — sem um horário concreto para gravar,
    // registra a retificação na trilha de auditoria e marca o apontamento como retificado.
    executar(db, "UPDATE apontamentos_diarios SET status = 'retificado', atualizado_em = ? WHERE id = ?", [agora, Number(id)]);
  }

  executar(
    db,
    `INSERT INTO retificacoes (apontamento_id, campo_alterado, valor_anterior, valor_novo, motivo, data_retificacao, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [Number(id), campoAlterado, valorAnterior, novoValor, motivo, hoje, agora],
  );
}

// ===================================================================================
// Fechamentos semanais
// ===================================================================================

interface FechamentoRow {
  id: number;
  prestador_id: number;
  prestador_nome: string;
  data_inicio: string;
  data_fim: string;
  valor_bruto: number;
  descontos_total: number;
  valor_liquido: number;
  status: string;
  criado_em: string;
}

const STATUS_FECHAMENTO_DB_PARA_DOMINIO: Record<string, StatusFechamento> = {
  aberto: "rascunho",
  fechado: "enviado",
  aprovado: "aprovado",
  pago: "pago",
};
const STATUS_FECHAMENTO_DOMINIO_PARA_DB: Record<StatusFechamento, string> = {
  rascunho: "aberto",
  enviado: "fechado",
  aprovado: "aprovado",
  pago: "pago",
};

function construirFechamento(db: Database, linha: FechamentoRow): FechamentoSemanal {
  const apontamentosDoPeriodo = consultar<{ id: number }>(
    db,
    "SELECT id FROM apontamentos_diarios WHERE prestador_id = ? AND data BETWEEN ? AND ?",
    [linha.prestador_id, linha.data_inicio, linha.data_fim],
  );

  const descontosPorTipo = consultar<{ tipo: string; total: number }>(
    db,
    `SELECT mf.tipo AS tipo, SUM(mf.valor) AS total
     FROM movimentacoes_financeiras mf
     JOIN apontamentos_diarios ad ON ad.id = mf.apontamento_id
     WHERE ad.prestador_id = ? AND mf.status = 'descontado' AND mf.data_desconto BETWEEN ? AND ?
     GROUP BY mf.tipo`,
    [linha.prestador_id, linha.data_inicio, linha.data_fim],
  );
  const obterDesconto = (tipo: string) => descontosPorTipo.find((d) => d.tipo === tipo)?.total ?? 0;
  const descontos_vale = obterDesconto("vale");
  const descontos_emprestimo = obterDesconto("emprestimo");
  const descontos_adiantamento = obterDesconto("adiantamento");

  return {
    id: String(linha.id),
    prestador_id: String(linha.prestador_id),
    prestador_nome: linha.prestador_nome,
    semana_inicio: linha.data_inicio,
    semana_fim: linha.data_fim,
    apontamentos_ids: apontamentosDoPeriodo.map((a) => String(a.id)),
    valor_bruto: linha.valor_bruto,
    descontos_vale,
    descontos_emprestimo,
    descontos_adiantamento,
    descontos_total: linha.descontos_total || descontos_vale + descontos_emprestimo + descontos_adiantamento,
    valor_liquido: linha.valor_liquido,
    status: STATUS_FECHAMENTO_DB_PARA_DOMINIO[linha.status] ?? "rascunho",
    data_criacao: linha.criado_em,
    // fechamentos_semanais não tem coluna própria de atualização no schema atual.
    data_atualizacao: linha.criado_em,
  };
}

export function listarFechamentos(db: Database, filtros: FiltrosFechamentos = {}): FechamentoSemanal[] {
  const condicoes: string[] = [];
  const params: (string | number)[] = [];

  const condNome = condicaoNomePrestador(filtros.prestador_id, params);
  if (condNome) condicoes.push(condNome);
  if (filtros.status) {
    condicoes.push("fs.status = ?");
    params.push(STATUS_FECHAMENTO_DOMINIO_PARA_DB[filtros.status]);
  }
  if (filtros.semana_inicio) {
    condicoes.push("fs.data_inicio >= ?");
    params.push(filtros.semana_inicio);
  }
  if (filtros.semana_fim) {
    condicoes.push("fs.data_fim <= ?");
    params.push(filtros.semana_fim);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = consultar<FechamentoRow>(
    db,
    `SELECT fs.*, p.nome AS prestador_nome
     FROM fechamentos_semanais fs
     JOIN prestadores p ON p.id = fs.prestador_id
     ${where}
     ORDER BY fs.data_inicio DESC, fs.id DESC`,
    params,
  );

  return linhas.map((linha) => construirFechamento(db, linha));
}

export function aprovarFechamento(db: Database, id: string): void {
  executar(db, "UPDATE fechamentos_semanais SET status = 'aprovado', aprovado_em = ? WHERE id = ?", [
    new Date().toISOString(),
    Number(id),
  ]);
}

/** Só atualiza o registro local para "pago". Disparar uma transferência real via Pluggy é uma
 * integração externa própria — ver nota de limitações no topo do arquivo. */
export function gerarPagamentoFechamento(db: Database, id: string): void {
  executar(db, "UPDATE fechamentos_semanais SET status = 'pago' WHERE id = ?", [Number(id)]);
}

// ===================================================================================
// Movimentações financeiras
// ===================================================================================

interface MovimentacaoRow {
  id: number;
  tipo: string;
  valor: number;
  data_solicitacao: string;
  data_desconto: string | null;
  motivo: string | null;
  status: string;
  criado_em: string;
  prestador_id: number;
  prestador_nome: string;
}

const STATUS_MOV_DB_PARA_DOMINIO: Record<string, StatusMovimentacao> = {
  pendente: "solicitado",
  aprovado: "aprovado",
  descontado: "descontado",
  rejeitado: "rejeitado",
};
const STATUS_MOV_DOMINIO_PARA_DB: Record<string, string> = {
  solicitado: "pendente",
  aprovado: "aprovado",
  descontado: "descontado",
  rejeitado: "rejeitado",
  pago: "descontado",
};

function construirMovimentacao(linha: MovimentacaoRow): Movimentacao {
  return {
    id: String(linha.id),
    prestador_id: String(linha.prestador_id),
    prestador_nome: linha.prestador_nome,
    tipo: linha.tipo as TipoMovimentacao,
    valor: linha.valor,
    data_solicitacao: linha.data_solicitacao,
    status: STATUS_MOV_DB_PARA_DOMINIO[linha.status] ?? "solicitado",
    semana_desconto: linha.data_desconto ?? undefined,
    motivo_rejeicao: linha.status === "rejeitado" ? (linha.motivo ?? undefined) : undefined,
    data_criacao: linha.criado_em,
    data_atualizacao: linha.criado_em,
    observacoes: linha.status !== "rejeitado" ? (linha.motivo ?? undefined) : undefined,
  };
}

export function listarMovimentacoes(db: Database, filtros: FiltrosMovimentacoes = {}): Movimentacao[] {
  const condicoes: string[] = [];
  const params: (string | number)[] = [];

  const condNome = condicaoNomePrestador(filtros.prestador_id, params);
  if (condNome) condicoes.push(condNome);
  if (filtros.tipo) {
    condicoes.push("mf.tipo = ?");
    params.push(filtros.tipo);
  }
  if (filtros.status) {
    condicoes.push("mf.status = ?");
    params.push(STATUS_MOV_DOMINIO_PARA_DB[filtros.status] ?? filtros.status);
  }
  if (filtros.data_inicio) {
    condicoes.push("mf.data_solicitacao >= ?");
    params.push(filtros.data_inicio);
  }
  if (filtros.data_fim) {
    condicoes.push("mf.data_solicitacao <= ?");
    params.push(filtros.data_fim);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = consultar<MovimentacaoRow>(
    db,
    `SELECT mf.id, mf.tipo, mf.valor, mf.data_solicitacao, mf.data_desconto, mf.motivo, mf.status, mf.criado_em,
            ad.prestador_id AS prestador_id, p.nome AS prestador_nome
     FROM movimentacoes_financeiras mf
     JOIN apontamentos_diarios ad ON ad.id = mf.apontamento_id
     JOIN prestadores p ON p.id = ad.prestador_id
     ${where}
     ORDER BY mf.data_solicitacao DESC, mf.id DESC`,
    params,
  );

  return linhas.map(construirMovimentacao);
}

export function aprovarMovimentacao(db: Database, id: string, semanaDesconto: string): void {
  executar(db, "UPDATE movimentacoes_financeiras SET status = 'aprovado', data_aprovacao = ?, data_desconto = ? WHERE id = ?", [
    formatarDataISO(new Date()),
    semanaDesconto,
    Number(id),
  ]);
}

export function rejeitarMovimentacao(db: Database, id: string, motivo: string): void {
  executar(db, "UPDATE movimentacoes_financeiras SET status = 'rejeitado', motivo = ? WHERE id = ?", [motivo, Number(id)]);
}

// ===================================================================================
// Reajuste IPCA
// ===================================================================================

/** Nomes de parametro (parametros_operacionais.parametro) para cada rubrica reajustável —
 * a própria tabela já foi desenhada para guardar exatamente isso (valor vigente + janela de
 * vigência), então não é preciso nenhuma tabela nova. */
const RUBRICAS_REAJUSTAVEIS: RubricaReajuste["rubrica"][] = [
  "urgencia_50",
  "urgencia_62_50",
  "airbnb_1q",
  "airbnb_2q",
  "deslocamento",
  "busca_materiais",
  "diaria_ajudante",
];

function proximaVigenciaIpca(hoje: Date): string {
  const ano = hoje.getFullYear();
  const candidatos = [Date.UTC(ano, 0, 1), Date.UTC(ano, 6, 1), Date.UTC(ano + 1, 0, 1)];
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const proxima = candidatos.find((c) => c >= hojeUtc) ?? candidatos[candidatos.length - 1];
  return new Date(proxima).toISOString().slice(0, 10);
}

function vigenciaAnteriorIpca(dataVigencia: string): string {
  const [ano, mes] = dataVigencia.split("-").map(Number);
  return mes === 1 ? `${ano - 1}-07-01` : `${ano}-01-01`;
}

function proximaRevisaoApos(dataVigencia: string): string {
  const [ano, mes] = dataVigencia.split("-").map(Number);
  return mes === 1 ? `${ano}-07-01` : `${ano + 1}-01-01`;
}

function diaAnterior(dataISO: string): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function calcularIpcaAcumulado(db: Database, dataVigencia: string): number {
  const inicioJanela = vigenciaAnteriorIpca(dataVigencia);
  const linhas = consultar<{ taxa_mensal: number }>(
    db,
    "SELECT taxa_mensal FROM indices_economicos WHERE indice = 'ipca' AND mes_referencia >= ? AND mes_referencia < ? ORDER BY mes_referencia",
    [inicioJanela, dataVigencia],
  );
  const fator = linhas.reduce((acc, l) => acc * (1 + l.taxa_mensal / 100), 1);
  return Math.round((fator - 1) * 100 * 100) / 100;
}

function valorVigenteDoParametro(db: Database, parametro: string, hojeIso: string): number | null {
  const [linha] = consultar<{ valor: number | null }>(
    db,
    `SELECT valor FROM parametros_operacionais
     WHERE parametro = ? AND vigencia_inicio <= ? AND (vigencia_fim IS NULL OR vigencia_fim >= ?)
     ORDER BY vigencia_inicio DESC LIMIT 1`,
    [parametro, hojeIso, hojeIso],
  );
  return linha?.valor ?? null;
}

function upsertParametro(
  db: Database,
  parametro: string,
  dados: { valor?: number | null; valor_descricao?: string | null; vigencia_inicio: string; vigencia_fim?: string | null },
): void {
  const agora = new Date().toISOString();
  executar(
    db,
    `INSERT INTO parametros_operacionais (parametro, valor, valor_descricao, vigencia_inicio, vigencia_fim, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(parametro, vigencia_inicio) DO UPDATE SET
       valor = excluded.valor,
       valor_descricao = excluded.valor_descricao,
       vigencia_fim = excluded.vigencia_fim,
       atualizado_em = excluded.atualizado_em`,
    [parametro, dados.valor ?? null, dados.valor_descricao ?? null, dados.vigencia_inicio, dados.vigencia_fim ?? null, agora],
  );
}

function lerStatusCiclo(db: Database, dataVigencia: string): ReajusteIPCA["status"] {
  const [linha] = consultar<{ valor_descricao: string }>(
    db,
    "SELECT valor_descricao FROM parametros_operacionais WHERE parametro = 'reajuste_ipca_status' AND vigencia_inicio = ?",
    [dataVigencia],
  );
  const status = linha?.valor_descricao;
  if (status === "proposta_gerada" || status === "aprovado" || status === "rejeitado") return status;
  return "pendente";
}

function lerPropostaCiclo(db: Database, dataVigencia: string): RubricaReajuste[] | null {
  const [linha] = consultar<{ valor_descricao: string }>(
    db,
    "SELECT valor_descricao FROM parametros_operacionais WHERE parametro = 'reajuste_ipca_proposta' AND vigencia_inicio = ?",
    [dataVigencia],
  );
  if (!linha?.valor_descricao) return null;
  try {
    return JSON.parse(linha.valor_descricao) as RubricaReajuste[];
  } catch {
    return null;
  }
}

function calcularRubricasProposta(db: Database, dataVigencia: string, ipcaAcumulado: number, hojeIso: string): RubricaReajuste[] {
  const rubricas: RubricaReajuste[] = [];
  for (const nome of RUBRICAS_REAJUSTAVEIS) {
    const valorAtual = valorVigenteDoParametro(db, nome, hojeIso);
    if (valorAtual === null) continue; // sem parâmetro cadastrado ainda para essa rubrica
    const novoValor = Math.round(valorAtual * (1 + ipcaAcumulado / 100) * 100) / 100;
    rubricas.push({
      rubrica: nome,
      valor_atual: valorAtual,
      percentual_ipca: ipcaAcumulado,
      novo_valor: novoValor,
      memoria_calculo: `Valor atual: R$${valorAtual.toFixed(2)} × (1 + ${ipcaAcumulado.toFixed(2)}%) = R$${novoValor.toFixed(2)} (vigência ${dataVigencia})`,
    });
  }
  return rubricas;
}

/** Lê o estado do ciclo de reajuste IPCA (janeiro/julho) atualmente em aberto. Sempre retorna
 * um objeto — não há "nenhum reajuste" no domínio do negócio, sempre existe um próximo ciclo
 * pendente ou em algum estágio de aprovação; o `| null` no tipo é preservado por compatibilidade
 * com a tela existente, para o caso raro de leitura falhar. */
export function obterReajusteIPCA(db: Database, hoje: Date = new Date()): ReajusteIPCA | null {
  const dataVigencia = proximaVigenciaIpca(hoje);
  const hojeIso = formatarDataISO(hoje);
  const status = lerStatusCiclo(db, dataVigencia);
  const ipcaAcumulado = calcularIpcaAcumulado(db, dataVigencia);

  const diasAte = Math.ceil((new Date(`${dataVigencia}T00:00:00Z`).getTime() - new Date(`${hojeIso}T00:00:00Z`).getTime()) / 86400000);
  const dentroDaJanela = diasAte <= 15 && diasAte > 0;

  let rubricas = status !== "pendente" ? lerPropostaCiclo(db, dataVigencia) : null;
  if (!rubricas && (status !== "pendente" || dentroDaJanela)) {
    // Preview calculado na hora (sem persistir) para o gestor já ver a proposta antes de
    // clicar em "Gerar Proposta de Reajuste".
    rubricas = calcularRubricasProposta(db, dataVigencia, ipcaAcumulado, hojeIso);
  }

  const [notificacao] = consultar<{ valor_descricao: string }>(
    db,
    "SELECT valor_descricao FROM parametros_operacionais WHERE parametro = 'reajuste_ipca_notificacao' AND vigencia_inicio = ?",
    [dataVigencia],
  );

  return {
    id: `reajuste-${dataVigencia}`,
    data_notificacao: notificacao?.valor_descricao,
    data_vigencia_esperada: dataVigencia,
    ipca_acumulado: ipcaAcumulado,
    status,
    proxima_revisao: proximaRevisaoApos(dataVigencia),
    rubricas_reajustadas: rubricas && rubricas.length > 0 ? rubricas : undefined,
    data_criacao: dataVigencia,
    data_atualizacao: new Date().toISOString(),
    observacoes:
      status === "aprovado"
        ? "Reajuste aprovado. Combustível não é reajustado automaticamente por IPCA."
        : "Combustível não está incluído no reajuste automático de IPCA (ajuste manual).",
  };
}

export function gerarPropostaReajusteIPCA(db: Database, hoje: Date = new Date()): void {
  const dataVigencia = proximaVigenciaIpca(hoje);
  const hojeIso = formatarDataISO(hoje);
  const ipcaAcumulado = calcularIpcaAcumulado(db, dataVigencia);
  const rubricas = calcularRubricasProposta(db, dataVigencia, ipcaAcumulado, hojeIso);

  upsertParametro(db, "reajuste_ipca_proposta", { valor_descricao: JSON.stringify(rubricas), vigencia_inicio: dataVigencia });
  upsertParametro(db, "reajuste_ipca_notificacao", { valor_descricao: hojeIso, vigencia_inicio: dataVigencia });
  upsertParametro(db, "reajuste_ipca_status", { valor_descricao: "proposta_gerada", vigencia_inicio: dataVigencia });
}

export function aprovarReajusteIPCA(db: Database, rubricas: RubricaReajuste[], hoje: Date = new Date()): void {
  const dataVigencia = proximaVigenciaIpca(hoje);
  const fimVigenciaAnterior = diaAnterior(dataVigencia);

  for (const rubrica of rubricas) {
    const novoValor = rubrica.valor_ajustado_manual ?? rubrica.novo_valor;
    executar(
      db,
      "UPDATE parametros_operacionais SET vigencia_fim = ?, atualizado_em = ? WHERE parametro = ? AND vigencia_fim IS NULL AND vigencia_inicio < ?",
      [fimVigenciaAnterior, new Date().toISOString(), rubrica.rubrica, dataVigencia],
    );
    upsertParametro(db, rubrica.rubrica, { valor: novoValor, vigencia_inicio: dataVigencia, vigencia_fim: null });
  }

  upsertParametro(db, "reajuste_ipca_proposta", { valor_descricao: JSON.stringify(rubricas), vigencia_inicio: dataVigencia });
  upsertParametro(db, "reajuste_ipca_status", { valor_descricao: "aprovado", vigencia_inicio: dataVigencia });
}

export function rejeitarReajusteIPCA(db: Database, hoje: Date = new Date()): void {
  const dataVigencia = proximaVigenciaIpca(hoje);
  upsertParametro(db, "reajuste_ipca_status", { valor_descricao: "rejeitado", vigencia_inicio: dataVigencia });
}
