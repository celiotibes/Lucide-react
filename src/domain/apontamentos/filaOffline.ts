/**
 * Fila offline de apontamentos de campo (serviço/vistoria) e fotos do prestador.
 *
 * Objetivo: o prestador registra o apontamento no celular mesmo sem sinal; o item fica
 * guardado no aparelho (IndexedDB) e é reenviado quando houver rede. Nada é descartado
 * localmente antes de o servidor CONFIRMAR o recebimento.
 *
 * CONTRATO ESPERADO DO SERVIDOR (não existe endpoint neste repositório — quem integrar
 * implementa `enviar`):
 *  - `enviar(item)` deve fazer o POST do `item.payload` (+ anexos) incluindo `item.uuid`
 *    como chave de idempotência (ex.: cabeçalho `Idempotency-Key` ou campo `uuid_cliente`).
 *  - O servidor deve tratar o mesmo `uuid` repetido como no-op e responder sucesso (2xx, ou
 *    409 mapeado pelo chamador para `{ confirmado: true }`), pois a resposta pode se perder
 *    e o cliente reenviar.
 *  - Retorno `{ confirmado: true }`: servidor gravou (ou já tinha gravado). O item é então
 *    marcado "enviado" e os anexos (blobs) são liberados do aparelho.
 *  - Retorno `{ confirmado: false, permanente: true, mensagem }`: rejeição definitiva
 *    (ex.: 400/422). Item vai direto para "erro" e só volta com `reenviar(uuid)`.
 *  - Retorno `{ confirmado: false, mensagem }` OU exceção (rede, 5xx, 401 etc.): falha
 *    transitória; reagenda com backoff exponencial até `maxTentativas`, quando vira "erro".
 *  - Respostas autenticadas não devem ser cacheadas pelo service worker (ver docs/PWA-PRESTADOR.md).
 */

export type StatusItemFila = "pendente" | "enviando" | "enviado" | "erro";

export interface AnexoFila {
  nome: string;
  tipo: string; // MIME
  tamanho: number; // bytes
  dados: Blob;
}

export interface ItemFila<P = unknown> {
  /** UUID gerado no cliente: chave de idempotência (fila e servidor). */
  uuid: string;
  payload: P;
  anexos: AnexoFila[];
  status: StatusItemFila;
  tentativas: number;
  /** epoch ms; item "pendente" só é tentado quando agora >= proximaTentativaEm. */
  proximaTentativaEm: number;
  ultimoErro?: string;
  criadoEm: number;
  atualizadoEm: number;
}

export interface ResultadoEnvio {
  confirmado: boolean;
  permanente?: boolean;
  mensagem?: string;
}

export type EnviarItem<P = unknown> = (item: ItemFila<P>) => Promise<ResultadoEnvio>;

// ---------------------------------------------------------------------------
// Armazenamento (injetável)
// ---------------------------------------------------------------------------

export interface ArmazenamentoFila<P = unknown> {
  obter(uuid: string): Promise<ItemFila<P> | undefined>;
  salvar(item: ItemFila<P>): Promise<void>;
  remover(uuid: string): Promise<void>;
  listar(): Promise<ItemFila<P>[]>;
}

export function criarArmazenamentoMemoria<P = unknown>(): ArmazenamentoFila<P> {
  const mapa = new Map<string, ItemFila<P>>();
  // structuredClone preserva Blob em Node/navegador e isola o estado interno de mutações.
  const copia = (i: ItemFila<P>): ItemFila<P> => structuredClone(i);
  return {
    async obter(uuid) {
      const i = mapa.get(uuid);
      return i ? copia(i) : undefined;
    },
    async salvar(item) {
      mapa.set(item.uuid, copia(item));
    },
    async remover(uuid) {
      mapa.delete(uuid);
    },
    async listar() {
      return [...mapa.values()].map(copia);
    },
  };
}

const STORE = "itens";

function promessaDe<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB"));
  });
}

export function criarArmazenamentoIdb<P = unknown>(
  nomeBanco = "prestador-fila-offline",
  fabrica: IDBFactory = indexedDB,
): ArmazenamentoFila<P> {
  let abrindo: Promise<IDBDatabase> | null = null;
  const abrir = () => {
    abrindo ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = fabrica.open(nomeBanco, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: "uuid" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        abrindo = null;
        reject(req.error ?? new Error("Não foi possível abrir o IndexedDB"));
      };
    });
    return abrindo;
  };
  const store = async (modo: IDBTransactionMode) => (await abrir()).transaction(STORE, modo).objectStore(STORE);
  return {
    async obter(uuid) {
      return (await promessaDe((await store("readonly")).get(uuid))) as ItemFila<P> | undefined;
    },
    async salvar(item) {
      await promessaDe((await store("readwrite")).put(item));
    },
    async remover(uuid) {
      await promessaDe((await store("readwrite")).delete(uuid));
    },
    async listar() {
      return (await promessaDe((await store("readonly")).getAll())) as ItemFila<P>[];
    },
  };
}

/** IndexedDB quando disponível; senão memória (os itens NÃO sobrevivem a recarregar a página). */
export function criarArmazenamentoPadrao<P = unknown>(): { armazenamento: ArmazenamentoFila<P>; persistente: boolean } {
  if (typeof indexedDB !== "undefined") {
    try {
      return { armazenamento: criarArmazenamentoIdb<P>(), persistente: true };
    } catch {
      /* cai para memória */
    }
  }
  return { armazenamento: criarArmazenamentoMemoria<P>(), persistente: false };
}

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

export interface ConfigBackoff {
  baseMs: number;
  maxMs: number;
  maxTentativas: number;
}

export const BACKOFF_PADRAO: ConfigBackoff = { baseMs: 2_000, maxMs: 15 * 60_000, maxTentativas: 8 };

/** Espera após a N-ésima falha (N >= 1): base * 2^(N-1), limitada a maxMs. */
export function calcularBackoffMs(tentativas: number, cfg: ConfigBackoff = BACKOFF_PADRAO): number {
  const n = Math.max(1, Math.floor(tentativas));
  return Math.min(cfg.maxMs, cfg.baseMs * 2 ** (n - 1));
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

export const LIMITE_ANEXO_BYTES = 5 * 1024 * 1024;
export const LIMITE_TOTAL_ANEXOS_BYTES = 15 * 1024 * 1024;

export class ErroAnexoGrande extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroAnexoGrande";
  }
}

export interface OpcoesFila<P> {
  armazenamento: ArmazenamentoFila<P>;
  enviar: EnviarItem<P>;
  agora?: () => number;
  gerarUuid?: () => string;
  estaOnline?: () => boolean;
  limiteAnexoBytes?: number;
  limiteTotalAnexosBytes?: number;
  backoff?: Partial<ConfigBackoff>;
}

export interface EntradaFila<P> {
  /** Informe para reaproveitar o mesmo uuid (ex.: o formulário já o gerou); senão é gerado. */
  uuid?: string;
  payload: P;
  anexos?: AnexoFila[];
}

export interface ResumoSincronizacao {
  pulado: boolean; // offline (outra sincronização em andamento compartilha a mesma execução)
  enviados: number;
  falhasTransitorias: number;
  falhasPermanentes: number;
  adiados: number; // ainda dentro da janela de backoff
}

export interface ContagemFila {
  pendente: number;
  enviando: number;
  enviado: number;
  erro: number;
}

export interface FilaOffline<P> {
  enfileirar(entrada: EntradaFila<P>): Promise<ItemFila<P>>;
  listar(): Promise<ItemFila<P>[]>;
  contar(): Promise<ContagemFila>;
  sincronizar(): Promise<ResumoSincronizacao>;
  reenviar(uuid: string): Promise<void>;
  descartar(uuid: string): Promise<void>;
  limparEnviados(): Promise<number>;
  /** Menor `proximaTentativaEm` entre pendentes, para agendar o próximo ciclo (undefined = nada). */
  proximaTentativaEm(): Promise<number | undefined>;
}

function uuidPadrao(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback para contextos sem randomUUID (http sem TLS em alguns navegadores).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function criarFilaOffline<P = unknown>(opcoes: OpcoesFila<P>): FilaOffline<P> {
  const { armazenamento, enviar } = opcoes;
  const agora = opcoes.agora ?? (() => Date.now());
  const gerarUuid = opcoes.gerarUuid ?? uuidPadrao;
  const estaOnline = opcoes.estaOnline ?? (() => true);
  const limiteAnexo = opcoes.limiteAnexoBytes ?? LIMITE_ANEXO_BYTES;
  const limiteTotal = opcoes.limiteTotalAnexosBytes ?? LIMITE_TOTAL_ANEXOS_BYTES;
  const cfg: ConfigBackoff = { ...BACKOFF_PADRAO, ...opcoes.backoff };
  let emAndamento: Promise<ResumoSincronizacao> | null = null;

  function validarAnexos(anexos: AnexoFila[]) {
    let total = 0;
    for (const a of anexos) {
      if (a.tamanho > limiteAnexo) {
        throw new ErroAnexoGrande(
          `O anexo "${a.nome}" tem ${(a.tamanho / 1048576).toFixed(1)} MB; o limite é ${(limiteAnexo / 1048576).toFixed(0)} MB.`,
        );
      }
      total += a.tamanho;
    }
    if (total > limiteTotal) {
      throw new ErroAnexoGrande(`Os anexos somam mais que o limite de ${(limiteTotal / 1048576).toFixed(0)} MB.`);
    }
  }

  async function processar(): Promise<ResumoSincronizacao> {
    const resumo: ResumoSincronizacao = { pulado: false, enviados: 0, falhasTransitorias: 0, falhasPermanentes: 0, adiados: 0 };
    if (!estaOnline()) return { ...resumo, pulado: true };

    // Retomada após reinício/fechamento no meio de um envio: "enviando" órfão volta a pendente
    // (seguro porque o envio é idempotente por uuid no servidor).
    for (const i of await armazenamento.listar()) {
      if (i.status === "enviando") await armazenamento.salvar({ ...i, status: "pendente", atualizadoEm: agora() });
    }

    const itens = (await armazenamento.listar())
      .filter((i) => i.status === "pendente")
      .sort((a, b) => a.criadoEm - b.criadoEm || a.uuid.localeCompare(b.uuid));

    for (const original of itens) {
      if (original.proximaTentativaEm > agora()) {
        resumo.adiados++;
        continue;
      }
      let item: ItemFila<P> = { ...original, status: "enviando", atualizadoEm: agora() };
      await armazenamento.salvar(item);

      let resultado: ResultadoEnvio;
      try {
        resultado = await enviar(item);
      } catch (e) {
        resultado = { confirmado: false, mensagem: e instanceof Error ? e.message : String(e) };
      }

      if (resultado.confirmado) {
        // Só aqui os blobs são liberados: servidor confirmou.
        item = { ...item, status: "enviado", anexos: [], ultimoErro: undefined, atualizadoEm: agora() };
        await armazenamento.salvar(item);
        resumo.enviados++;
        continue;
      }

      const tentativas = item.tentativas + 1;
      const permanente = resultado.permanente === true || tentativas >= cfg.maxTentativas;
      item = {
        ...item,
        tentativas,
        status: permanente ? "erro" : "pendente",
        proximaTentativaEm: permanente ? item.proximaTentativaEm : agora() + calcularBackoffMs(tentativas, cfg),
        ultimoErro: resultado.mensagem ?? "Falha no envio",
        atualizadoEm: agora(),
      };
      await armazenamento.salvar(item);
      if (permanente) resumo.falhasPermanentes++;
      else resumo.falhasTransitorias++;
    }
    return resumo;
  }

  return {
    async enfileirar({ uuid, payload, anexos = [] }) {
      const id = uuid ?? gerarUuid();
      const existente = await armazenamento.obter(id);
      if (existente) return existente; // idempotência: mesmo uuid não duplica nem sobrescreve
      validarAnexos(anexos);
      const t = agora();
      const item: ItemFila<P> = {
        uuid: id,
        payload,
        anexos,
        status: "pendente",
        tentativas: 0,
        proximaTentativaEm: t,
        criadoEm: t,
        atualizadoEm: t,
      };
      await armazenamento.salvar(item);
      return item;
    },
    listar: () => armazenamento.listar(),
    async contar() {
      const c: ContagemFila = { pendente: 0, enviando: 0, enviado: 0, erro: 0 };
      for (const i of await armazenamento.listar()) c[i.status]++;
      return c;
    },
    sincronizar() {
      // Sem concorrência: chamadas simultâneas (botão + evento "online") compartilham a execução.
      emAndamento ??= processar().finally(() => {
        emAndamento = null;
      });
      return emAndamento;
    },
    async reenviar(uuid) {
      const i = await armazenamento.obter(uuid);
      if (!i || i.status !== "erro") return;
      await armazenamento.salvar({ ...i, status: "pendente", tentativas: 0, proximaTentativaEm: agora(), atualizadoEm: agora() });
    },
    async descartar(uuid) {
      // Descarte manual explícito (usuário); o automático só ocorre via limparEnviados().
      await armazenamento.remover(uuid);
    },
    async limparEnviados() {
      let n = 0;
      for (const i of await armazenamento.listar()) {
        if (i.status === "enviado") {
          await armazenamento.remover(i.uuid);
          n++;
        }
      }
      return n;
    },
    async proximaTentativaEm() {
      const ts = (await armazenamento.listar()).filter((i) => i.status === "pendente").map((i) => i.proximaTentativaEm);
      return ts.length ? Math.min(...ts) : undefined;
    },
  };
}
