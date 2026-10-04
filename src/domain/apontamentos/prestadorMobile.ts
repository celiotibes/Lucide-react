/**
 * Funções puras da tela mobile do prestador (validação, parsing e rótulos) — separadas do
 * componente para serem testáveis sem DOM.
 */
import type { ContagemFila, StatusItemFila } from "./filaOffline";

export type TipoApontamentoCampo = "servico" | "vistoria";

export interface FormularioApontamentoCampo {
  imovelId: string;
  tipo: TipoApontamentoCampo;
  servico: string;
  horas: string;
  valor: string;
  observacoes: string;
}

export interface PayloadApontamentoCampo {
  tipo: TipoApontamentoCampo;
  imovel_id: number;
  servico: string;
  horas?: number;
  valor?: number;
  observacoes?: string;
  /** YYYY-MM-DD (data local do aparelho no momento do registro). */
  data: string;
  /** ISO 8601 do registro no aparelho. */
  registrado_em: string;
}

/** Aceita "1,5", "1.5" e "1.234,56" (formato BR). Retorna undefined se vazio/inválido. */
export function parseDecimalBR(texto: string): number | undefined {
  const t = texto.trim().replace(/^R\$\s*/i, "");
  if (!t) return undefined;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d+)?$/.test(normal)) return undefined;
  const n = Number(normal);
  return Number.isFinite(n) ? n : undefined;
}

export function validarFormulario(f: FormularioApontamentoCampo): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!f.imovelId || !Number.isInteger(Number(f.imovelId))) erros.imovelId = "Selecione o imóvel.";
  if (f.servico.trim().length < 3) erros.servico = "Descreva o serviço (mín. 3 caracteres).";
  if (f.horas.trim()) {
    const h = parseDecimalBR(f.horas);
    if (h === undefined) erros.horas = "Horas inválidas.";
    else if (h <= 0 || h > 24) erros.horas = "Horas devem estar entre 0 e 24.";
  }
  if (f.valor.trim() && parseDecimalBR(f.valor) === undefined) erros.valor = "Valor inválido.";
  return erros;
}

function dataLocalISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Pré-condição: `validarFormulario(f)` sem erros. */
export function montarPayload(f: FormularioApontamentoCampo, agora: Date = new Date()): PayloadApontamentoCampo {
  const horas = parseDecimalBR(f.horas);
  const valor = parseDecimalBR(f.valor);
  const obs = f.observacoes.trim();
  return {
    tipo: f.tipo,
    imovel_id: Number(f.imovelId),
    servico: f.servico.trim(),
    ...(horas !== undefined ? { horas } : {}),
    ...(valor !== undefined ? { valor } : {}),
    ...(obs ? { observacoes: obs } : {}),
    data: dataLocalISO(agora),
    registrado_em: agora.toISOString(),
  };
}

export const ROTULO_STATUS_FILA: Record<StatusItemFila, string> = {
  pendente: "Pendente",
  enviando: "Enviando",
  enviado: "Enviado",
  erro: "Erro",
};

export function resumoContagem(c: ContagemFila): string {
  const aEnviar = c.pendente + c.enviando;
  const partes: string[] = [aEnviar === 1 ? "1 item na fila" : `${aEnviar} itens na fila`];
  if (c.erro) partes.push(c.erro === 1 ? "1 com erro" : `${c.erro} com erro`);
  if (c.enviado) partes.push(c.enviado === 1 ? "1 enviado" : `${c.enviado} enviados`);
  return partes.join(" · ");
}

/** "em 12 s" / "em 3 min" a partir de um instante futuro; vazio se já venceu. */
export function formatarEspera(proximaEm: number, agora: number): string {
  const s = Math.ceil((proximaEm - agora) / 1000);
  if (s <= 0) return "";
  if (s < 60) return `em ${s} s`;
  return `em ${Math.ceil(s / 60)} min`;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
