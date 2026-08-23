import type { TransacaoBruta } from "./ofx";

export interface ContaPluggy {
  id: string;
  nome: string;
  numero: string;
  tipo: "BANK" | "CREDIT";
  subtipo: string;
  saldo: number;
}

/** Todas as chamadas aqui vão para o SEU backend (server/), nunca direto para
 * a Pluggy — é o backend quem guarda o Client Secret. Ver server/README.md.
 * `chaveApi` é a mesma API_KEY configurada no .env do backend, exigida em
 * toda rota — sem ela, qualquer um que descobrisse a URL do seu backend
 * conseguiria ler seus extratos (ver auditoria de segurança). */

export async function criarConnectToken(backendUrl: string, chaveApi: string, clientUserId?: string): Promise<string> {
  const resposta = await fetch(`${backendUrl}/api/connect-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": chaveApi },
    body: JSON.stringify({ clientUserId }),
  });
  if (!resposta.ok) throw new Error(`Falha ao criar connect token (${resposta.status}). O backend está rodando e a chave de API está correta?`);
  const { accessToken } = await resposta.json();
  return accessToken;
}

export async function listarContasPluggy(backendUrl: string, chaveApi: string, itemId: string): Promise<ContaPluggy[]> {
  const resposta = await fetch(`${backendUrl}/api/accounts?itemId=${encodeURIComponent(itemId)}`, {
    headers: { "X-API-Key": chaveApi },
  });
  if (!resposta.ok) throw new Error(`Falha ao listar contas (${resposta.status})`);
  return resposta.json();
}

export async function buscarTransacoesPluggy(
  backendUrl: string,
  chaveApi: string,
  accountId: string,
  dataInicio: string,
  dataFim: string,
): Promise<TransacaoBruta[]> {
  const parametros = new URLSearchParams({ accountId, from: dataInicio, to: dataFim });
  const resposta = await fetch(`${backendUrl}/api/transactions?${parametros}`, {
    headers: { "X-API-Key": chaveApi },
  });
  if (!resposta.ok) throw new Error(`Falha ao buscar transações (${resposta.status})`);
  const transacoes: { data: string; valor: number; descricaoOriginal: string; fitid: string; documentoFonte?: string }[] =
    await resposta.json();
  return transacoes.map((t) => ({
    data: t.data,
    valor: t.valor,
    descricaoOriginal: t.descricaoOriginal,
    fitid: `pluggy-${t.fitid}`,
    documentoFonte: t.documentoFonte,
  }));
}
