export interface EstadoSincronizacao {
  versao: number;
  atualizadoEm: string | null;
  hashSha256: string | null;
  tamanhoBytes: number;
  dispositivo: string | null;
}

/** Lançado quando o servidor já tem uma versão mais nova que a que este dispositivo
 * conhecia — a única forma de "conflito" que este esquema de sincronização detecta
 * (concorrência otimista por contador de versão, não merge de edições). */
export class ConflitoSincronizacaoError extends Error {
  estadoServidor: EstadoSincronizacao;
  constructor(estadoServidor: EstadoSincronizacao) {
    super("O servidor já tem uma versão mais nova do que a que este dispositivo conhecia — baixe-a antes de enviar a sua.");
    this.estadoServidor = estadoServidor;
  }
}

function montarUrl(baseUrl: string, caminho: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${caminho}`;
}

/** Todas as chamadas aqui vão para o SEU servidor de sincronização (sync-server/), que roda
 * na sua própria máquina/rede — nunca um serviço de nuvem de terceiro. Ver sync-server/README.md. */
export async function obterEstadoServidor(baseUrl: string, chaveApi: string): Promise<EstadoSincronizacao> {
  const resposta = await fetch(montarUrl(baseUrl, "/api/sync/estado"), { headers: { "X-API-Key": chaveApi } });
  if (!resposta.ok) throw new Error(`Falha ao consultar o servidor de sincronização (${resposta.status}). Ele está rodando e a chave está correta?`);
  return resposta.json();
}

export async function baixarBancoDoServidor(baseUrl: string, chaveApi: string): Promise<Uint8Array> {
  const resposta = await fetch(montarUrl(baseUrl, "/api/sync/banco"), { headers: { "X-API-Key": chaveApi } });
  if (resposta.status === 404) throw new Error("Nenhum banco foi enviado a este servidor ainda — use \"Enviar\" a partir de um dispositivo que já tenha dados.");
  if (!resposta.ok) throw new Error(`Falha ao baixar o banco do servidor (${resposta.status}).`);
  return new Uint8Array(await resposta.arrayBuffer());
}

export async function enviarBancoAoServidor(
  baseUrl: string,
  chaveApi: string,
  bytes: Uint8Array,
  versaoBase: number,
  dispositivo: string,
): Promise<EstadoSincronizacao> {
  const parametros = new URLSearchParams({ versaoBase: String(versaoBase), dispositivo });
  const resposta = await fetch(montarUrl(baseUrl, `/api/sync/banco?${parametros}`), {
    method: "POST",
    headers: { "X-API-Key": chaveApi, "Content-Type": "application/octet-stream" },
    // Blob em vez do Uint8Array cru: alguns lib.dom.d.ts (TS mais novo, tipos genéricos de
    // ArrayBufferLike) não aceitam Uint8Array direto como BodyInit/BlobPart — Blob sempre é
    // aceito e preserva os bytes exatamente (mesma classe de fricção de tipos já vista em
    // backupIntegridade.ts, onde bytes.buffer precisa do cast `as ArrayBuffer`).
    body: new Blob([bytes as BlobPart]),
  });
  if (resposta.status === 409) {
    const corpo = await resposta.json();
    throw new ConflitoSincronizacaoError(corpo.estadoServidor);
  }
  if (!resposta.ok) throw new Error(`Falha ao enviar o banco ao servidor (${resposta.status}).`);
  return resposta.json();
}
