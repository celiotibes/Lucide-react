/**
 * Cliente Pluggy para o fluxo MeuPluggy (uso pessoal, gratuito) — PARALELO ao
 * fluxo comercial de `pluggy.ts`, que usa o widget Pluggy Connect e as
 * credenciais comerciais (CLIENT_ID/CLIENT_SECRET). Aqui o usuário já
 * conectou suas contas por fora, em meu.pluggy.ai (grátis, até 5 conexões,
 * atualização a cada 24h) — este módulo só LÊ o que já está conectado, com
 * credenciais PRÓPRIAS (PLUGGY_MEU_CLIENT_ID/PLUGGY_MEU_CLIENT_SECRET),
 * geradas em dashboard.pluggy.ai. Não há connect-token/widget aqui.
 *
 * Por que não importar `normalizarTransacao` de `pluggy.ts`: aquele módulo
 * lança no TOPO do arquivo se CLIENT_ID/CLIENT_SECRET (as credenciais
 * COMERCIAIS) não estiverem definidas. Um `import` estático já executa esse
 * código — então importar daquele arquivo acoplaria o boot deste fluxo
 * pessoal à presença das credenciais comerciais, quebrando exatamente a
 * garantia que este módulo precisa manter (nunca travar o boot do servidor
 * por falta de UMA das duas integrações). Por isso a normalização é
 * duplicada aqui, pequena e local — ver normalizarTransacaoMeuPluggy.
 *
 * Por que não há `listarContasPluggy` batendo em um "fetchItems" global: a
 * API da Pluggy (e o SDK `pluggy-sdk`) não expõe um endpoint para listar
 * todos os Items de uma credencial — só `fetchItem(id)` (um item por vez,
 * dado o id) e `fetchAccounts(itemId)`. Isso é esperado: na Pluggy comercial
 * os Items pertencem a usuários finais distintos, então "listar todos" não
 * existe por design. Para uso pessoal (poucas conexões, no máximo 5), a
 * solução prática é guardar os Item IDs (seu valor fica disponível no
 * dashboard de meu.pluggy.ai depois de conectar cada conta) em
 * `PLUGGY_MEU_ITEM_IDS` (separados por vírgula) e buscar item+contas de cada
 * um. Ver README do servidor para onde achar esse valor.
 */
import { PluggyClient, type Transaction } from "pluggy-sdk";

export interface TransacaoNormalizadaMeuPluggy {
  data: string;
  valor: number;
  descricaoOriginal: string;
  fitid: string;
  documentoFonte?: string;
}

export interface ContaPluggyMeuDisponivel {
  itemId: string;
  nomeInstituicao: string;
  statusItem: string;
  contaId: string;
  nomeConta: string;
  numero: string;
  tipo: "BANK" | "CREDIT";
  subtipo: string;
  saldo: number;
}

export interface OpcoesBuscaTransacoes {
  dataInicio?: string;
  dataFim?: string;
}

let clienteCache: PluggyClient | null = null;

/** Limpa o cache do cliente (uso interno para testes). */
export function _limparCacheClientePluggy(): void {
  clienteCache = null;
}

/** Instancia o PluggyClient só quando alguma função deste módulo é de fato
 * chamada — nunca no topo do arquivo. `server/src/pluggy-meu-routes.ts` e
 * `index.ts` podem importar este módulo mesmo sem PLUGGY_MEU_CLIENT_ID/
 * PLUGGY_MEU_CLIENT_SECRET configurados (ex: servidor só usando o fluxo
 * comercial); o boot inteiro não deve travar por isso — só a chamada que de
 * fato precisar da sincronização pessoal falha, com mensagem clara. */
function obterClientePluggyMeu(): PluggyClient {
  if (clienteCache) return clienteCache;

  const clientId = process.env.PLUGGY_MEU_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_MEU_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Defina PLUGGY_MEU_CLIENT_ID e PLUGGY_MEU_CLIENT_SECRET no .env (veja .env.example) para usar a sincronização " +
        "pessoal via MeuPluggy. Gere essas credenciais PRÓPRIAS em dashboard.pluggy.ai — são diferentes de " +
        "CLIENT_ID/CLIENT_SECRET (credenciais comerciais já usadas pelo widget de conexão).",
    );
  }

  clienteCache = new PluggyClient({ clientId, clientSecret });
  return clienteCache;
}

function obterItemIdsConfigurados(): string[] {
  const bruto = process.env.PLUGGY_MEU_ITEM_IDS;
  if (!bruto || !bruto.trim()) {
    throw new Error(
      "Defina PLUGGY_MEU_ITEM_IDS no .env com os Item IDs das contas já conectadas em meu.pluggy.ai, separados por " +
        "vírgula. A API da Pluggy não tem um endpoint para listar todos os Items de uma credencial — o Item ID de " +
        "cada conexão fica disponível no painel de meu.pluggy.ai depois de conectá-la.",
    );
  }
  return bruto
    .split(",")
    .map((valor) => valor.trim())
    .filter((valor) => valor.length > 0);
}

/** Normaliza uma transação do Pluggy para o mesmo formato que o app web já
 * sabe importar (mesmo shape de `src/domain/parsers/ofx.ts::TransacaoBruta`
 * e de `normalizarTransacao` em `pluggy.ts` — duplicado aqui de propósito,
 * ver comentário no topo do arquivo). */
export function normalizarTransacaoMeuPluggy(transacao: Transaction): TransacaoNormalizadaMeuPluggy {
  const valorAbsoluto = Math.abs(transacao.amount);
  const valor = transacao.type === "DEBIT" ? -valorAbsoluto : valorAbsoluto;

  const contraparte = transacao.paymentData?.payer?.name ?? transacao.paymentData?.receiver?.name;
  const descricaoBase = transacao.descriptionRaw || transacao.description;
  const descricaoOriginal = contraparte ? `${descricaoBase} - ${contraparte}` : descricaoBase;

  const documentoFonte = transacao.paymentData?.boletoMetadata?.digitableLine ?? undefined;

  return {
    data: new Date(transacao.date).toISOString().slice(0, 10),
    valor,
    descricaoOriginal,
    fitid: transacao.id,
    documentoFonte,
  };
}

/** Lista as contas disponíveis em todos os Items configurados em
 * PLUGGY_MEU_ITEM_IDS — para o usuário escolher qual vincular a uma conta
 * bancária já cadastrada no sistema. Um Item com erro de login/execução não
 * derruba a listagem dos demais: aparece com o status que a Pluggy reportou
 * (ex: "LOGIN_ERROR"), e as contas desse Item só não aparecem se a própria
 * chamada fetchAccounts falhar (o que também não interrompe os outros
 * Items). */
export async function listarContasPluggy(): Promise<ContaPluggyMeuDisponivel[]> {
  const cliente = obterClientePluggyMeu();
  const itemIds = obterItemIdsConfigurados();

  const resultado: ContaPluggyMeuDisponivel[] = [];
  for (const itemId of itemIds) {
    const item = await cliente.fetchItem(itemId);
    const { results: contas } = await cliente.fetchAccounts(itemId);
    for (const conta of contas) {
      resultado.push({
        itemId,
        nomeInstituicao: item.connector?.name ?? "Instituição desconhecida",
        statusItem: item.status,
        contaId: conta.id,
        nomeConta: conta.marketingName ?? conta.name,
        numero: conta.number,
        tipo: conta.type,
        subtipo: conta.subtype,
        saldo: conta.balance,
      });
    }
  }
  return resultado;
}

/** Busca (e normaliza) as transações de uma conta já conectada no período
 * pedido. `fetchAllTransactions` já pagina sozinho (cursor), igual ao que
 * `pluggy.ts` usa para o fluxo comercial. */
export async function buscarTransacoesPluggy(
  accountId: string,
  opcoes?: OpcoesBuscaTransacoes,
): Promise<TransacaoNormalizadaMeuPluggy[]> {
  const cliente = obterClientePluggyMeu();
  const transacoes = await cliente.fetchAllTransactions(accountId, {
    dateFrom: opcoes?.dataInicio,
    dateTo: opcoes?.dataFim,
  });
  return transacoes.map(normalizarTransacaoMeuPluggy);
}
