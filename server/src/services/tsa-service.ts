/**
 * Cliente RFC 3161 (carimbo de tempo) — serviço do SERVIDOR (o navegador não alcança a TSA por CORS).
 *
 * Monta o TimeStampReq em DER (SHA-256), envia a UMA OU MAIS autoridades (complementares: uma falha
 * não impede as outras) e valida o PKIStatus da resposta com um parser DER estrito. A validação
 * criptográfica do token (assinatura da TSA) NÃO é feita aqui: o token é guardado para verificação
 * posterior com `openssl ts -verify` (ver docs/CARIMBO-DE-TEMPO.md).
 */
import { randomBytes } from "crypto";

const TAG = { BOOLEAN: 0x01, INTEGER: 0x02, OCTET_STRING: 0x04, NULL: 0x05, OID: 0x06, SEQUENCE: 0x30 } as const;
/** OID de SHA-256: 2.16.840.1.101.3.4.2.1 */
const OID_SHA256 = Buffer.from([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);

function comprimento(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, ...conteudo: Buffer[]): Buffer {
  const corpo = Buffer.concat(conteudo);
  return Buffer.concat([Buffer.from([tag]), comprimento(corpo.length), corpo]);
}

/** INTEGER não negativo, complemento de dois mínimo (byte 0x00 na frente se o bit alto estiver ligado). */
function inteiro(valor: bigint): Buffer {
  if (valor < 0n) throw new Error("INTEGER negativo não suportado");
  let hex = valor.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let bytes = Buffer.from(hex, "hex");
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0x00]), bytes]);
  return tlv(TAG.INTEGER, bytes);
}

function nonceAleatorio(): bigint {
  const b = randomBytes(8);
  b[0] &= 0x7f; // positivo
  const n = BigInt(`0x${b.toString("hex")}`);
  return n === 0n ? 1n : n;
}

/**
 * TimeStampReq ::= SEQUENCE { version INTEGER(1), messageImprint MessageImprint, nonce INTEGER,
 *                             certReq BOOLEAN TRUE }
 * MessageImprint ::= SEQUENCE { AlgorithmIdentifier(sha256, NULL), OCTET STRING(hash) }
 */
export function montarTimeStampReq(hashHex: string, opcoes?: { nonce?: bigint }): Buffer {
  if (!/^[0-9a-f]{64}$/.test(hashHex)) {
    throw new Error("Hash inválido: esperado SHA-256 em 64 caracteres hexadecimais minúsculos");
  }
  const algoritmo = tlv(TAG.SEQUENCE, tlv(TAG.OID, OID_SHA256), tlv(TAG.NULL));
  const imprint = tlv(TAG.SEQUENCE, algoritmo, tlv(TAG.OCTET_STRING, Buffer.from(hashHex, "hex")));
  return tlv(
    TAG.SEQUENCE,
    inteiro(1n),
    imprint,
    inteiro(opcoes?.nonce ?? nonceAleatorio()),
    tlv(TAG.BOOLEAN, Buffer.from([0xff])),
  );
}

interface Elemento {
  tag: number;
  inicio: number; // início do conteúdo
  fim: number; // fim do conteúdo (exclusivo) = início do próximo irmão
}

function lerElemento(buf: Buffer, pos: number): Elemento {
  if (pos + 2 > buf.length) throw new Error("DER truncado");
  const tag = buf[pos];
  let tamanho = buf[pos + 1];
  let inicio = pos + 2;
  if (tamanho & 0x80) {
    const n = tamanho & 0x7f;
    if (n === 0 || n > 4 || inicio + n > buf.length) throw new Error("comprimento DER inválido");
    tamanho = 0;
    for (let i = 0; i < n; i++) tamanho = tamanho * 256 + buf[inicio + i];
    inicio += n;
  }
  const fim = inicio + tamanho;
  if (fim > buf.length) throw new Error("DER truncado");
  return { tag, inicio, fim };
}

const NOMES_STATUS: Record<number, string> = {
  0: "granted",
  1: "grantedWithMods",
  2: "rejection",
  3: "waiting",
  4: "revocationWarning",
  5: "revocationNotification",
};

/**
 * TimeStampResp ::= SEQUENCE { status PKIStatusInfo (SEQUENCE { status INTEGER, ... }), timeStampToken OPTIONAL }
 * Aceita PKIStatus 0 (granted) ou 1 (grantedWithMods) E exige que o token (ContentInfo) esteja presente.
 */
export function validarRespostaTsr(buf: Buffer): { pkiStatus: number } {
  try {
    const resposta = lerElemento(buf, 0);
    if (resposta.tag !== TAG.SEQUENCE || resposta.fim !== buf.length) throw new Error("não é um TimeStampResp");
    const statusInfo = lerElemento(buf, resposta.inicio);
    if (statusInfo.tag !== TAG.SEQUENCE) throw new Error("PKIStatusInfo ausente");
    const status = lerElemento(buf, statusInfo.inicio);
    if (status.tag !== TAG.INTEGER || status.fim - status.inicio !== 1) throw new Error("PKIStatus inválido");
    const pkiStatus = buf[status.inicio];

    if (pkiStatus !== 0 && pkiStatus !== 1) {
      throw new Error(`Carimbo recusado pela TSA: PKIStatus ${pkiStatus} (${NOMES_STATUS[pkiStatus] ?? "desconhecido"})`);
    }
    if (statusInfo.fim >= resposta.fim) throw new Error("status concedido, mas sem timeStampToken");
    const token = lerElemento(buf, statusInfo.fim);
    if (token.tag !== TAG.SEQUENCE) throw new Error("timeStampToken inválido");
    return { pkiStatus };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    throw new Error(msg.startsWith("Carimbo recusado") ? msg : `Resposta TSA inválida: ${msg}`);
  }
}

export interface ResultadoCarimbo {
  resultados: Array<{ tsa_url: string; token_base64: string; solicitado_em: string }>;
  falhas: Array<{ tsa_url: string; erro: string }>;
}

export interface OpcoesCarimbo {
  urls?: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Pede o carimbo a cada TSA. Uma falha não impede as outras; se TODAS falharem, lança erro. */
export async function solicitarCarimbo(hashHex: string, opcoes: OpcoesCarimbo = {}): Promise<ResultadoCarimbo> {
  const pedido = montarTimeStampReq(hashHex); // valida o hash
  const urls = opcoes.urls ?? (process.env.TSA_URLS ?? "https://freetsa.org/tsr").split(",").map((u) => u.trim()).filter(Boolean);
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const timeoutMs = opcoes.timeoutMs ?? 10_000;
  const resultado: ResultadoCarimbo = { resultados: [], falhas: [] };

  for (const url of urls) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), timeoutMs);
    try {
      const resp = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/timestamp-query" },
        body: pedido,
        signal: controle.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const corpo = Buffer.from(await resp.arrayBuffer());
      validarRespostaTsr(corpo);
      resultado.resultados.push({ tsa_url: url, token_base64: corpo.toString("base64"), solicitado_em: new Date().toISOString() });
    } catch (erro) {
      resultado.falhas.push({ tsa_url: url, erro: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      clearTimeout(relogio);
    }
  }

  if (resultado.resultados.length === 0) {
    throw new Error(`Nenhuma TSA disponível: ${resultado.falhas.map((f) => `${f.tsa_url}: ${f.erro}`).join("; ")}`);
  }
  return resultado;
}
