/**
 * Lembretes automáticos de vencimento de aluguel/honorário — "2 dias antes" e "no dia".
 *
 * LIMITAÇÃO DE ARQUITETURA (deliberada, não um defeito a corrigir aqui): este é um app
 * client-side (sql.js/IndexedDB) com um backend que só faz PROXY de integrações externas —
 * os dados de negócio (competências, vencimentos, `dia_vencimento` de cada contrato) só
 * existem no banco local do NAVEGADOR. Não há processo nenhum rodando no servidor, num
 * relógio real, que possa varrer `aluguel_competencias`/`honorarios_advocaticios` às 3h da
 * manhã do dia certo — o servidor nunca tem acesso a esse banco (mesmo motivo documentado
 * no cabeçalho de `notificacoes-db.ts`). Por isso "2 dias antes" e "no dia" NÃO significam
 * um horário cravado do relógio: significam "a primeira vez que o app for aberto (ou que o
 * usuário clicar em 'disparar agora') depois que a condição ficar verdadeira". Se o app
 * ficar fechado por vários dias, vencimentos que caíram nesse intervalo são simplesmente
 * perdidos (o lembrete "2 dias antes" de uma competência que já venceu há uma semana não
 * faz mais sentido disparar) — este módulo só identifica o que está dentro da janela
 * (exatamente hoje OU exatamente em 2 dias) no momento em que é chamado, nunca "recupera"
 * atraso. Construir um mecanismo de cron/push real do servidor está EXPLICITAMENTE fora de
 * escopo desta rodada — ver o relatório da tarefa para a decisão completa.
 *
 * Quem decide QUANDO chamar `dispararLembretesPendentes` (ao abrir o app, e/ou por um botão
 * manual) é a camada de UI (`LembretesVencimentoView.tsx`), não este módulo — este módulo só
 * sabe "o que precisa de lembrete agora", dado um banco e uma data de referência.
 */
import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { formatarMoeda } from "../formatarMoeda";
import { listarPorOrigem } from "./notificacoes-db";
import type { CanalNotificacao } from "./notificacoes-db";
import { resolverDestinatariosCobranca, type DestinatariosResolvidos } from "./resolverDestinatarios";
import { dispararNotificacao, type NotificacoesApiClient, type ResultadoDisparo } from "./despachoCliente";

export type TipoLembrete = "2_dias_antes" | "no_dia";

/** `origemTipo` aqui é o de `notificacoes_enviadas` (ver `notificacoes-db.ts`) — NÃO
 * confundir com o `origemTipo` que `resolverDestinatariosCobranca` espera
 * (`'aluguel_competencia' | 'honorario_advocaticio'`, um vocabulário DIFERENTE para a MESMA
 * distinção). Ver o comentário em `dispararLembretesPendentes` para o mapeamento entre os
 * dois. */
export interface LembretePendente {
  origemTipo: "lembrete_aluguel" | "lembrete_honorario";
  /** `aluguel_competencias.id` quando `origemTipo = 'lembrete_aluguel'`,
   * `honorarios_advocaticios.id` quando `origemTipo = 'lembrete_honorario'`. */
  origemId: number;
  tipoLembrete: TipoLembrete;
  /** 0 para `'no_dia'`, 2 para `'2_dias_antes'` — redundante com `tipoLembrete` de
   * propósito: poupa quem consome este tipo de ter que decodificar a string de volta num
   * número para exibir ("vence em X dias"). */
  diasParaVencimento: number;
  valorDevido: number;
  /** `'YYYY-MM-DD'`, igual ao formato de `data_vencimento` no banco. */
  dataVencimento: string;
  /** Texto pronto para exibição na tela (locatário/contrato ou cliente/processo) — montado
   * aqui para não duplicar o JOIN em `LembretesVencimentoView.tsx`. */
  descricaoContexto: string;
}

export interface ResultadoLembrete {
  lembrete: LembretePendente;
  /** Resultado por canal (email/whatsapp/telegram) do disparo deste lembrete específico —
   * mesmo tipo que `dispararNotificacaoCobranca` devolve (`despachoCliente.ts`). Vazio
   * quando o destinatário não tinha NENHUM canal cadastrado (todos "pulados" já viram neste
   * array, com `status: 'pulado'` — nunca fica faltando o lembrete na lista por falta de
   * contato). */
  resultadosDisparo: ResultadoDisparo[];
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Soma dias a uma data `'YYYY-MM-DD'`, virando mês/ano corretamente — `Date.setDate` do
 * JavaScript já lida com isso nativamente (ex.: 31 de janeiro + 2 dias = 2 de fevereiro),
 * então não há nada de especial a fazer aqui além de não reimplementar esse cálculo à mão.
 * Mesmo padrão já usado (duplicado, por convenção deste domínio — ver
 * `src/domain/reconcile/contratos.ts` e `src/domain/reports/analiseVerticalHorizontal.ts`)
 * em vez de importado de um utilitário compartilhado. */
function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function tipoLembreteDe(dataVencimento: string, dataRef: string, dataDoisDiasAntes: string): TipoLembrete | null {
  if (dataVencimento === dataRef) return "no_dia";
  if (dataVencimento === dataDoisDiasAntes) return "2_dias_antes";
  return null;
}

/** Dedup: já existe algum lembrete (`notificacoes_enviadas`, qualquer canal/status) desta
 * origem registrado HOJE? Nenhuma coluna nova foi criada para isso de propósito — comparar
 * `criado_em` (timestamp completo, `'YYYY-MM-DD HH:MM:SS'`) com a data de referência (só os
 * 10 primeiros caracteres) é suficiente, e é a abordagem escolhida para esta rodada.
 *
 * IMPORTANTE: "hoje" aqui é `dataRef` (o parâmetro de referência de quem chamou), nunca o
 * relógio real do sistema — pelo MESMO motivo que `relatorioInadimplenciaDetalhado`
 * (`integracao-inadimplencia.ts`) foi corrigido nesta mesma sessão para propagar
 * `data_referencia` em vez de usar `new Date()` internamente: sem isso, o dedup seria
 * impossível de testar de forma determinística (dependeria do dia real em que o teste
 * roda) e, em produção, o teste "já mandei hoje?" significaria sempre o dia real mesmo
 * quando alguém pedir explicitamente a situação de uma data diferente (ex.: investigação

 * posterior de "o que deveria ter disparado no dia X").
 *
 * LIMITAÇÃO conhecida (não contorná-vel sem editar `notificacoes-db.ts`, fora do escopo
 * desta tarefa): `notificacoes_enviadas.criado_em` é `DEFAULT CURRENT_TIMESTAMP` do
 * próprio SQLite — sempre o relógio REAL do sistema no momento do INSERT, nunca o
 * `dataReferencia` passado para `dispararLembretesPendentes`. Em uso normal (sem passar
 * `dataReferencia`, o caso real de produção) isso não importa: `dataRef` já é o relógio
 * real por default, então bate com `criado_em`. Só importa para quem chamar esta função
 * com uma `dataReferencia` explícita DIFERENTE do dia real (ex.: reconstituir "o que
 * deveria ter disparado em 2026-05-10") — nesse caso o dedup não encontra as linhas
 * (gravadas com o timestamp real de quando o teste/reconstituição rodou, não com
 * 2026-05-10), então identificaria (e um disparo real duplicaria) o mesmo lembrete. Dentro
 * do escopo desta rodada, aceito como limitação documentada, não corrigida. */
function jaLembradoNestaData(
  db: Database,
  origemTipo: "lembrete_aluguel" | "lembrete_honorario",
  origemId: number,
  dataRef: string,
): boolean {
  const notificacoes = listarPorOrigem(db, origemTipo, origemId);
  return notificacoes.some((n) => (n.criadoEm ?? "").slice(0, 10) === dataRef);
}

/**
 * Varre `aluguel_competencias` e `honorarios_advocaticios` (status `'pendente'`) por
 * vencimentos que caem exatamente em `dataReferencia` (hoje) ou exatamente 2 dias depois,
 * excluindo o que já teve um lembrete disparado nesta mesma data de referência (dedup —
 * ver `jaLembradoNestaData`).
 *
 * `dataReferencia` opcional, default = hoje — mesmo padrão de parâmetro já usado em
 * `relatorioInadimplenciaDetalhado`/`resumoInadimplenciaTotal`
 * (`src/domain/erp/integracao-inadimplencia.ts`), corrigido nesta mesma sessão para nunca
 * depender do relógio real implicitamente dentro da função: o valor default só é lido UMA
 * vez, no topo, e usado de ponta a ponta (cálculo da janela de 2 dias E dedup) — nunca um
 * `new Date()` solto mais abaixo. Passar `dataReferencia` explicitamente é o que torna este
 * módulo testável sem depender do dia real em que a suíte roda.
 *
 * Cada contrato de locação tem seu PRÓPRIO `dia_vencimento` (`contratos_locacao.
 * dia_vencimento`) — "dia 10" é só o padrão mais comum usado nos contratos deste sistema,
 * nunca um valor fixo assumido aqui. Esta função nunca lê `dia_vencimento` diretamente: usa
 * `aluguel_competencias.data_vencimento`, já fixado na geração da competência (ver
 * `gerarCompetenciasPendentes`, `aluguel-competencias.ts`) a partir daquele dia — a fonte
 * única de vencimento "real" de cada mês.
 */
interface LinhaCompetenciaAluguel {
  id: number;
  contrato_id: number;
  locatario: string;
  valor_devido: number;
  data_vencimento: string;
}

interface LinhaHonorario {
  id: number;
  processo_id: number;
  cliente: string;
  descricao: string | null;
  valor_devido: number;
  data_vencimento: string;
}

/** Query ÚNICA de competências de aluguel `pendente` (sem filtro de data nenhum) — usada
 * tanto por `identificarLembretesPendentes` (filtra em JS por "hoje OU em 2 dias exatos")
 * quanto por `identificarLembretesFuturos` (filtra em JS por um INTERVALO de datas). Extraída
 * para aqui de propósito, para as duas funções nunca duplicarem o mesmo JOIN/SELECT — só a
 * forma de filtrar por data é diferente entre elas (pontual vs. intervalo), e isso não dá
 * para expressar com a mesma cláusula WHERE SQL sem duplicar a query inteira. */
function buscarCompetenciasAluguelPendentes(db: Database): LinhaCompetenciaAluguel[] {
  return consultar<LinhaCompetenciaAluguel>(
    db,
    `SELECT ac.id, ac.contrato_id, cl.locatario, ac.valor_devido, ac.data_vencimento
     FROM aluguel_competencias ac
     JOIN contratos_locacao cl ON cl.id = ac.contrato_id
     WHERE ac.status = 'pendente'
     ORDER BY ac.data_vencimento ASC, ac.id ASC`,
  );
}

/** Mesmo motivo de `buscarCompetenciasAluguelPendentes`, para honorários. */
function buscarHonorariosPendentes(db: Database): LinhaHonorario[] {
  return consultar<LinhaHonorario>(
    db,
    `SELECT h.id, h.processo_id, el.nome AS cliente, h.descricao, h.valor_devido, h.data_vencimento
     FROM honorarios_advocaticios h
     JOIN processos_legais p ON p.id = h.processo_id
     JOIN entidades_legais el ON el.id = p.entidade_id
     WHERE h.status = 'pendente'
     ORDER BY h.data_vencimento ASC, h.id ASC`,
  );
}

export function identificarLembretesPendentes(db: Database, dataReferencia?: string): LembretePendente[] {
  const dataRef = dataReferencia || hoje();
  const dataDoisDiasAntes = somarDias(dataRef, 2);

  const competenciasAluguel = buscarCompetenciasAluguelPendentes(db).filter(
    (c) => c.data_vencimento === dataRef || c.data_vencimento === dataDoisDiasAntes,
  );
  const honorarios = buscarHonorariosPendentes(db).filter(
    (h) => h.data_vencimento === dataRef || h.data_vencimento === dataDoisDiasAntes,
  );

  const pendentes: LembretePendente[] = [];

  for (const c of competenciasAluguel) {
    const tipoLembrete = tipoLembreteDe(c.data_vencimento, dataRef, dataDoisDiasAntes);
    if (!tipoLembrete) continue;
    if (jaLembradoNestaData(db, "lembrete_aluguel", c.id, dataRef)) continue;
    pendentes.push({
      origemTipo: "lembrete_aluguel",
      origemId: c.id,
      tipoLembrete,
      diasParaVencimento: tipoLembrete === "no_dia" ? 0 : 2,
      valorDevido: c.valor_devido,
      dataVencimento: c.data_vencimento,
      descricaoContexto: `Aluguel — ${c.locatario} (contrato #${c.contrato_id})`,
    });
  }

  for (const h of honorarios) {
    const tipoLembrete = tipoLembreteDe(h.data_vencimento, dataRef, dataDoisDiasAntes);
    if (!tipoLembrete) continue;
    if (jaLembradoNestaData(db, "lembrete_honorario", h.id, dataRef)) continue;
    pendentes.push({
      origemTipo: "lembrete_honorario",
      origemId: h.id,
      tipoLembrete,
      diasParaVencimento: tipoLembrete === "no_dia" ? 0 : 2,
      valorDevido: h.valor_devido,
      dataVencimento: h.data_vencimento,
      descricaoContexto: `Honorário advocatício — ${h.cliente}${h.descricao ? `: ${h.descricao}` : ""} (processo #${h.processo_id})`,
    });
  }

  return pendentes;
}

function formatarDataBr(dataIso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataIso);
  if (!partes) return dataIso;
  return `${partes[3]}/${partes[2]}`;
}

/** Só precisa destes 4 campos (não o `LembretePendente` inteiro) — assim também serve
 * `identificarLembretesFuturos`, que nunca monta um `LembretePendente` completo (não tem
 * `diasParaVencimento`/`descricaoContexto` prontos no mesmo formato). */
interface DadosParaMensagem {
  origemTipo: "lembrete_aluguel" | "lembrete_honorario";
  tipoLembrete: TipoLembrete;
  valorDevido: number;
  dataVencimento: string;
}

function montarMensagem(lembrete: DadosParaMensagem): { assunto: string; mensagem: string } {
  const dataFormatada = formatarDataBr(lembrete.dataVencimento);
  const valorFormatado = formatarMoeda(lembrete.valorDevido);
  const tipoDescricao = lembrete.origemTipo === "lembrete_aluguel" ? "aluguel" : "honorário advocatício";

  if (lembrete.tipoLembrete === "no_dia") {
    return {
      assunto: `Vencimento HOJE — ${tipoDescricao}`,
      mensagem: `Seu ${tipoDescricao} de ${valorFormatado} vence HOJE (${dataFormatada}).`,
    };
  }
  return {
    assunto: `Vencimento em 2 dias — ${tipoDescricao}`,
    mensagem: `Seu ${tipoDescricao} de ${valorFormatado} vence em 2 dias (${dataFormatada}).`,
  };
}

/** Mapeia o vocabulário de `origemTipo` de `notificacoes_enviadas`/`lembretes_agendados`
 * (`'lembrete_aluguel' | 'lembrete_honorario'`) para o vocabulário que
 * `resolverDestinatariosCobranca` espera (`'aluguel_competencia' | 'honorario_advocaticio'`)
 * — ver a nota "ATENÇÃO" em `dispararLembretesPendentes` para por que são dois vocabulários
 * diferentes para a mesma distinção. Extraída para não duplicar este mapeamento entre
 * `dispararLembretesPendentes` e `identificarLembretesFuturos`. */
function origemTipoCobrancaDe(
  origemTipo: "lembrete_aluguel" | "lembrete_honorario",
): "aluguel_competencia" | "honorario_advocaticio" {
  return origemTipo === "lembrete_aluguel" ? "aluguel_competencia" : "honorario_advocaticio";
}

/**
 * Identifica (`identificarLembretesPendentes`) e dispara os lembretes de vencimento
 * pendentes — um `dispararNotificacao` por lembrete (`despachoCliente.ts`, que já cuida de
 * registrar a tentativa em `notificacoes_enviadas` por canal, chamar o apiClient e marcar
 * enviado/falha).
 *
 * ATENÇÃO — dois vocabulários de "origemTipo" DIFERENTES e fáceis de confundir, usados na
 * mesma função:
 *   - `lembrete.origemTipo` (`'lembrete_aluguel' | 'lembrete_honorario'`): o `origem_tipo`
 *     gravado em `notificacoes_enviadas` — identifica que esta notificação É um lembrete de
 *     vencimento (e de qual tipo), não uma cobrança Asaas nem um comunicado genérico.
 *   - `origemTipoCobranca` (`'aluguel_competencia' | 'honorario_advocaticio'`): o parâmetro
 *     que `resolverDestinatariosCobranca` espera — identifica de QUAL TABELA vem o id
 *     (`aluguel_competencias` ou `honorarios_advocaticios`) para navegar até o contato.
 *     Nada a ver com cobrança Asaas ter sido emitida ou não: `resolverDestinatariosCobranca`
 *     funciona direto a partir da competência/honorário, sem exigir nenhuma linha em
 *     `cobrancas_asaas` — por isso um lembrete de vencimento pode disparar mesmo que nenhum
 *     boleto tenha sido emitido ainda.
 *
 * `dataReferencia` opcional, propagado para `identificarLembretesPendentes` — ver o
 * comentário lá.
 */
export async function dispararLembretesPendentes(
  db: Database,
  apiClient: NotificacoesApiClient,
  dataReferencia?: string,
): Promise<ResultadoLembrete[]> {
  const pendentes = identificarLembretesPendentes(db, dataReferencia);
  const resultados: ResultadoLembrete[] = [];

  for (const lembrete of pendentes) {
    const { assunto, mensagem } = montarMensagem(lembrete);
    const destinatarios = resolverDestinatariosCobranca(db, origemTipoCobrancaDe(lembrete.origemTipo), lembrete.origemId);

    const resultadosDisparo = await dispararNotificacao(db, apiClient, {
      origemTipo: lembrete.origemTipo,
      origemId: lembrete.origemId,
      assunto,
      mensagem,
      destinatarios,
    });

    resultados.push({ lembrete, resultadosDisparo });
  }

  return resultados;
}

// ============================================================================
// Lembretes FUTUROS — sincronização com o servidor (`lembretes_agendados`), para o
// disparo acontecer num horário real mesmo com o app fechado no dia do vencimento.
// ============================================================================

/**
 * Um item PRONTO para sincronizar com o servidor — um por (origem, tipo de lembrete,
 * CANAL), já achatado: diferente de `LembretePendente` (um por origem, com os 3 canais só
 * implícitos via `resolverDestinatariosCobranca`), aqui cada canal com destinatário vira
 * sua própria linha, porque é essa a granularidade de `lembretes_agendados` no servidor
 * (ver `migrations-phase5-lembretes-agendados.sql`: `UNIQUE(origem_tipo, origem_id,
 * tipo_lembrete, canal)`).
 */
export interface LembreteFuturo {
  origemTipo: "lembrete_aluguel" | "lembrete_honorario";
  origemId: number;
  tipoLembrete: TipoLembrete;
  canal: CanalNotificacao;
  destinatario: string;
  assunto?: string;
  mensagem: string;
  /** 'YYYY-MM-DD' — quando o SERVIDOR deve disparar este lembrete (vencimento em si para
   * `'no_dia'`, vencimento menos 2 dias para `'2_dias_antes'`). Pode cair no passado em
   * relação a `dataReferencia` quando o vencimento está a 0 ou 1 dia (o "2 dias antes"
   * resultante já passou) — isso é intencional: o servidor (`listarPendentesParaDisparo`)
   * trata qualquer `data_disparo_prevista <= hoje` como "disparar agora", nunca como erro;
   * um lembrete "atrasado" dispara na próxima rodada do loop em vez de nunca disparar. */
  dataDisparoPrevista: string;
}

/** Gera os até 2 gatilhos (`'2_dias_antes'` e `'no_dia'`) × até 3 canais para UMA origem
 * (competência ou honorário) — reusa `montarMensagem`/`resolverDestinatariosCobranca`, as
 * mesmas usadas por `dispararLembretesPendentes`, para nunca ter dois jeitos diferentes de
 * montar a mensagem ou resolver o destinatário de uma mesma origem. */
function gerarLembretesFuturosDaOrigem(
  db: Database,
  origemTipo: "lembrete_aluguel" | "lembrete_honorario",
  origemId: number,
  dataVencimento: string,
  valorDevido: number,
): LembreteFuturo[] {
  const destinatarios: DestinatariosResolvidos = resolverDestinatariosCobranca(db, origemTipoCobrancaDe(origemTipo), origemId);
  const canais: Array<[CanalNotificacao, string | undefined]> = [
    ["email", destinatarios.email],
    ["whatsapp", destinatarios.whatsappE164],
    ["telegram", destinatarios.telegramChatId],
  ];

  const itens: LembreteFuturo[] = [];
  for (const tipoLembrete of ["2_dias_antes", "no_dia"] as const) {
    const { assunto, mensagem } = montarMensagem({ origemTipo, tipoLembrete, valorDevido, dataVencimento });
    const dataDisparoPrevista = tipoLembrete === "no_dia" ? dataVencimento : somarDias(dataVencimento, -2);
    for (const [canal, destinatario] of canais) {
      if (!destinatario) continue; // mesmo critério de dispararLembretesPendentes: canal sem contato nunca gera linha (nunca um "pulado" morto na agenda).
      itens.push({ origemTipo, origemId, tipoLembrete, canal, destinatario, assunto, mensagem, dataDisparoPrevista });
    }
  }
  return itens;
}

/**
 * Identifica TODOS os lembretes futuros (ambos os gatilhos, não só o que já está no ponto
 * de disparo — diferença central em relação a `identificarLembretesPendentes`) para toda
 * competência/honorário `pendente` cujo VENCIMENTO cai dentro de
 * `[dataReferencia, dataReferencia + diasHorizonte]`. Achatado por canal — ver
 * `LembreteFuturo`. Pronto para ser enviado direto para `sincronizarLembretesFuturos`.
 *
 * Por que filtra pelo VENCIMENTO (não pela `dataDisparoPrevista`): é o vencimento que
 * define "esta competência está dentro do horizonte que me interessa sincronizar agora";
 * os dois gatilhos (vencimento e vencimento-2) derivam dele, não o contrário. Uma
 * competência vencendo no ÚLTIMO dia do horizonte ainda entra — os dois gatilhos são
 * gerados, mesmo que o de "2 dias antes" caia DEPOIS do fim do horizonte (ele vai, na
 * prática, disparar antes do vencimento de qualquer forma, e a próxima sincronização
 * (horizonte deslizante) o alcança de novo bem antes disso importar).
 *
 * Nunca aplica o dedup de `jaLembradoNestaData` — não faz sentido aqui: a FOTO que este
 * cliente manda ao servidor não é "o que falta enviar hoje", é "o que ainda é válido",
 * independente de already ter sido notificado antes (o servidor, não o cliente, decide o
 * que falta enviar, via `status = 'pendente'` em `lembretes_agendados`).
 */
export function identificarLembretesFuturos(
  db: Database,
  { diasHorizonte, dataReferencia }: { diasHorizonte: number; dataReferencia?: string },
): LembreteFuturo[] {
  const dataRef = dataReferencia || hoje();
  const dataFim = somarDias(dataRef, diasHorizonte);

  const itens: LembreteFuturo[] = [];

  const competenciasAluguel = buscarCompetenciasAluguelPendentes(db).filter(
    (c) => c.data_vencimento >= dataRef && c.data_vencimento <= dataFim,
  );
  for (const c of competenciasAluguel) {
    itens.push(...gerarLembretesFuturosDaOrigem(db, "lembrete_aluguel", c.id, c.data_vencimento, c.valor_devido));
  }

  const honorarios = buscarHonorariosPendentes(db).filter((h) => h.data_vencimento >= dataRef && h.data_vencimento <= dataFim);
  for (const h of honorarios) {
    itens.push(...gerarLembretesFuturosDaOrigem(db, "lembrete_honorario", h.id, h.data_vencimento, h.valor_devido));
  }

  return itens;
}

/** Porta para sincronizar a agenda de lembretes futuros com o servidor — a implementação
 * real é `criarLembretesAgendadosApiClientHttp` (chama `POST /api/lembretes-agendados/
 * sincronizar`, em `server/src/routes/lembretes-agendados-routes.ts`); testes usam um fake
 * em memória. Mesmo padrão de porta/adapter de `AsaasApiClient`/`NotificacoesApiClient`. */
export interface LembretesAgendadosApiClient {
  sincronizar(dados: { origemTipo: "lembrete_aluguel" | "lembrete_honorario"; lembretes: LembreteFuturo[] }): Promise<void>;
}

/**
 * Calcula (`identificarLembretesFuturos`) e sincroniza com o servidor — em DUAS chamadas
 * separadas (`'lembrete_aluguel'` e `'lembrete_honorario'`), porque o cancelamento no
 * servidor (`LembretesAgendadosServiceDB.sincronizar`) é isolado por `origemTipo`: cada
 * chamada manda a foto completa só daquele tipo, nunca os dois juntos numa única "foto"
 * (ver contrato detalhado no servidor). Devolve quantos itens (linhas por canal, não
 * quantas competências/honorários) foram enviados de cada tipo — só para a UI reportar
 * "sincronizado com sucesso".
 */
export async function sincronizarLembretesFuturos(
  db: Database,
  apiClient: LembretesAgendadosApiClient,
  { diasHorizonte, dataReferencia }: { diasHorizonte: number; dataReferencia?: string },
): Promise<{ aluguel: number; honorario: number }> {
  const todos = identificarLembretesFuturos(db, { diasHorizonte, dataReferencia });
  const deAluguel = todos.filter((i) => i.origemTipo === "lembrete_aluguel");
  const deHonorario = todos.filter((i) => i.origemTipo === "lembrete_honorario");

  await apiClient.sincronizar({ origemTipo: "lembrete_aluguel", lembretes: deAluguel });
  await apiClient.sincronizar({ origemTipo: "lembrete_honorario", lembretes: deHonorario });

  return { aluguel: deAluguel.length, honorario: deHonorario.length };
}

function cabecalhosAutenticados(token: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function mensagemErroResposta(resposta: Response, acaoDescricao: string): Promise<string> {
  try {
    const corpo = await resposta.json();
    if (typeof corpo?.erro === "string") return corpo.erro;
  } catch {
    /* corpo não é JSON — segue para a mensagem genérica abaixo */
  }
  return `${acaoDescricao} (HTTP ${resposta.status})`;
}

/**
 * Implementação de produção de `LembretesAgendadosApiClient` — chama o PRÓPRIO backend
 * (`POST /api/lembretes-agendados/sincronizar`), com o mesmo Bearer token de sessão do
 * resto do app autenticado. Mesmo padrão de `criarNotificacoesApiClientHttp`
 * (`src/domain/notificacoes/vinculosExternos.ts`) e `criarVinculosExternosApiClientHttp`.
 */
export function criarLembretesAgendadosApiClientHttp(backendUrl: string, token: string): LembretesAgendadosApiClient {
  const base = backendUrl.replace(/\/+$/, "");
  return {
    async sincronizar({ origemTipo, lembretes }) {
      const resposta = await fetch(`${base}/api/lembretes-agendados/sincronizar`, {
        method: "POST",
        headers: cabecalhosAutenticados(token),
        body: JSON.stringify({ origemTipo, lembretes }),
      });
      if (!resposta.ok) {
        throw new Error(await mensagemErroResposta(resposta, "Falha ao sincronizar lembretes agendados"));
      }
    },
  };
}
