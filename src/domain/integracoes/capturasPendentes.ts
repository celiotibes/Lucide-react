/**
 * Captura rápida via bot do Telegram → fila de triagem de documentos já existente.
 *
 * O servidor (`server/`) recebe o texto/foto que o usuário manda ao bot, mas NÃO tem
 * acesso ao banco local sql.js/IndexedDB deste navegador — só o cliente tem. Por isso o
 * servidor só enfileira (`eventos_externos_pendentes`, tipo 'captura_telegram' — ver
 * server/src/domain/integracoes/eventos-externos-db.ts e
 * server/src/routes/telegram-routes.ts) e este módulo, do lado do cliente, consome por
 * polling (`buscarCapturasPendentes`) e decide o que fazer com cada captura
 * (`importarCapturaParaTriagem`).
 *
 * REGRA DE OURO (sem exceção, igual ao resto do sistema): nenhuma captura entra como fato
 * confirmado. `importarCapturaParaTriagem` só grava um registro em `documentos` — a MESMA
 * tabela/fluxo que o upload manual usa (ver src/components/DocumentosView.tsx e
 * src/domain/documentos/documentos.ts) — e um documento recém-inserido já É, por
 * construção, "pendente de confirmação humana": nada neste sistema cria uma transação ou
 * vincula um documento a uma transação (o que o viraria fato contábil) sem passar por
 * `vincularDocumento` (src/domain/documentos/matching.ts), que só roda quando o usuário
 * confirma explicitamente uma sugestão na tela de Documentos. Tipo/valor/data/fornecedor
 * extraídos aqui (heurística determinística e, se ela falhar, o roteador de IA já
 * existente — ver extrairCamposDeTexto) são, no máximo, SUGESTÕES pré-preenchidas — exatamente
 * o que já acontece com qualquer arquivo enviado manualmente.
 *
 * `apiClient` é injetado de propósito (mesmo padrão de
 * src/domain/integracoes/asaasCobranca.ts e src/domain/permissoesAdmin/api.ts): a produção
 * usa `criarCapturasApiClientHttp` (chama o próprio backend com o Bearer token de sessão);
 * os testes usam um fake em memória, sem rede.
 *
 * Convenção de erro deste módulo: `throw new Error(...)` — nunca `{ sucesso, mensagem }`.
 */

import type { Database } from "sql.js";
import { extrairTextoDocumento, extrairCamposDeTexto } from "../documentos/extrairCampos";
import { inserirDocumento, type NovoDocumento } from "../documentos/documentos";

/** Mesmo shape que `server/src/routes/telegram-routes.ts` grava em
 * `eventos_externos_pendentes.payload_json` para `tipo = 'captura_telegram'`. `foto`, quando
 * presente, já traz os bytes em base64 — o servidor baixa do Telegram antes de enfileirar
 * (o link temporário da Bot API expira antes de o evento necessariamente ser consumido). */
export interface CapturaFotoTelegram {
  fileId: string;
  mimeType: string;
  base64: string;
}

export interface PayloadCapturaTelegram {
  chatId: string;
  mensagemTelegramId: number;
  /** ISO 8601 — hora da mensagem no Telegram, não de quando o evento foi consumido aqui. */
  dataMensagem: string;
  texto?: string;
  legenda?: string;
  foto?: CapturaFotoTelegram;
}

export interface CapturaTelegramPendente {
  id: string;
  tipo: "captura_telegram";
  usuarioId: string | null;
  payload: PayloadCapturaTelegram;
  recebidoEm: string;
  consumido: boolean;
  consumidoEm: string | null;
}

/** Porta que este módulo depende — ver `criarCapturasApiClientHttp` para a implementação
 * real (chama GET/POST em `/api/eventos-externos/...`, já existentes no servidor). */
export interface CapturasApiClient {
  listarPendentes(): Promise<CapturaTelegramPendente[]>;
  marcarConsumido(id: string): Promise<void>;
}

/** Lista as capturas do Telegram ainda não consumidas para o usuário autenticado. Função
 * fininha de propósito — só existe para dar ao domínio um nome legível no lugar de
 * `apiClient.listarPendentes()` espalhado pelos componentes, igual ao resto do sistema
 * (ex: `listarDocumentos`, `listarLotes`). */
export async function buscarCapturasPendentes(apiClient: CapturasApiClient): Promise<CapturaTelegramPendente[]> {
  return apiClient.listarPendentes();
}

function extensaoPorMime(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/** Base64 (como o servidor grava no payload) → `File`, para reaproveitar
 * `extrairTextoDocumento` (que espera um `File`, igual ao upload manual via Dropzone). */
function base64ParaArquivo(base64: string, mimeType: string, nomeArquivo: string): File {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new File([bytes], nomeArquivo, { type: mimeType });
}

export interface ResultadoImportacaoCaptura {
  /** Id do documento criado em `documentos` — ainda sem nenhuma transação vinculada. */
  documentoId: number;
  usouOCR: boolean;
  usouIA: boolean;
}

/**
 * Importa UMA captura pendente para a fila de triagem de documentos já existente
 * (`inserirDocumento`, de src/domain/documentos/documentos.ts — a mesma função que
 * DocumentosView.tsx chama ao salvar um upload manual). Depois de inserir com sucesso,
 * marca a captura como consumida no inbox do servidor (`apiClient.marcarConsumido`), para
 * não reaparecer no próximo polling.
 *
 * Texto da mensagem (ou legenda da foto) passa pela MESMA heurística/IA de extração que o
 * upload manual usa (`extrairCamposDeTexto`) para sugerir tipo/valor/data/fornecedor — nunca
 * aplicado como fato, só pré-preenchido no documento, exatamente como um upload manual.
 *
 * Foto: convertida para `File` e passada por OCR local (`extrairTextoDocumento`, a mesma
 * função do upload manual) antes de extrair campos do texto reconhecido. Falha de OCR
 * (worker indisponível, foto ilegível, timeout) NUNCA bloqueia a importação — o documento
 * ainda entra na triagem, só com menos campos pré-preenchidos; o usuário completa na tela,
 * igual a quando a heurística/IA não acerta num upload manual.
 */
export async function importarCapturaParaTriagem(
  db: Database,
  apiClient: CapturasApiClient,
  captura: CapturaTelegramPendente,
): Promise<ResultadoImportacaoCaptura> {
  if (captura.tipo !== "captura_telegram") {
    throw new Error(`importarCapturaParaTriagem só processa eventos do tipo 'captura_telegram' — recebido '${captura.tipo}'`);
  }

  const { payload } = captura;
  let textoExtraido = payload.texto ?? payload.legenda ?? "";
  let usouOCR = false;

  if (payload.foto) {
    try {
      const nomeArquivo = `telegram-${captura.id}.${extensaoPorMime(payload.foto.mimeType)}`;
      const arquivo = base64ParaArquivo(payload.foto.base64, payload.foto.mimeType, nomeArquivo);
      const textoOcr = await extrairTextoDocumento(arquivo);
      textoExtraido = [textoExtraido, textoOcr].filter((t) => t.trim().length > 0).join("\n");
      usouOCR = true;
    } catch (erro) {
      console.error("importarCapturaParaTriagem: falha ao extrair texto da foto via OCR — segue sem texto de OCR:", erro);
    }
  }

  const campos = textoExtraido.trim().length > 0 ? await extrairCamposDeTexto(textoExtraido) : {};

  const nomeArquivoSintetico = payload.foto
    ? `telegram-${captura.id}.${extensaoPorMime(payload.foto.mimeType)}`
    : `telegram-${captura.id}.txt`;

  const novoDocumento: NovoDocumento = {
    tipo: campos.tipo ?? "outro",
    arquivo_nome: nomeArquivoSintetico,
    valor: campos.valor,
    data_documento: campos.data,
    cnpj_cpf_contraparte: campos.cnpjCpf,
    nome_contraparte: campos.nomeContraparte,
    texto_extraido: textoExtraido.trim().length > 0 ? textoExtraido : undefined,
    observacoes:
      `Capturado via bot do Telegram em ${payload.dataMensagem} (chat ${payload.chatId}). ` +
      "Nenhum campo foi confirmado — revise e complete antes de vincular a uma transação.",
  };

  const documentoId = inserirDocumento(db, novoDocumento, []);

  await apiClient.marcarConsumido(captura.id);

  return { documentoId, usouOCR, usouIA: !!campos.usouIA };
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
 * Implementação de produção de `CapturasApiClient` — chama o PRÓPRIO backend
 * (`GET /api/eventos-externos/pendentes?tipo=captura_telegram`,
 * `POST /api/eventos-externos/:id/consumir`, já existentes e usados por outras integrações),
 * com o mesmo Bearer token de sessão do resto do app autenticado. Mesmo padrão de
 * src/domain/permissoesAdmin/api.ts e src/domain/integracoes/asaasCobranca.ts: nunca chama a
 * Asaas/Telegram direto do navegador, sempre o backend configurado.
 */
export function criarCapturasApiClientHttp(backendUrl: string, token: string): CapturasApiClient {
  return {
    async listarPendentes() {
      const resposta = await fetch(`${backendUrl}/api/eventos-externos/pendentes?tipo=captura_telegram`, {
        headers: cabecalhosAutenticados(token),
      });
      if (!resposta.ok) {
        throw new Error(await mensagemErroResposta(resposta, "Falha ao buscar capturas pendentes do Telegram"));
      }
      const corpo: { eventos: CapturaTelegramPendente[] } = await resposta.json();
      return corpo.eventos;
    },
    async marcarConsumido(id: string) {
      const resposta = await fetch(`${backendUrl}/api/eventos-externos/${encodeURIComponent(id)}/consumir`, {
        method: "POST",
        headers: cabecalhosAutenticados(token),
      });
      if (!resposta.ok) {
        throw new Error(await mensagemErroResposta(resposta, "Falha ao marcar captura como consumida"));
      }
    },
  };
}
