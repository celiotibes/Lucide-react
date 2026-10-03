/**
 * Mensagens de notificação (e-mail/WhatsApp/Telegram) montadas a partir de dados que as
 * telas de inadimplência (`ContratosInadimplenciaView.tsx`), caução/RAD (`CaucaoView.tsx`)
 * e reajustes/rescisão (`ReajustesRescisaoView.tsx`) JÁ calculam e exibem — nenhuma função
 * aqui recalcula nada (dias de atraso, dedução do RAD, percentual de reajuste, multa
 * rescisória): cada uma só formata, em texto, o que a tela já tem em mãos.
 *
 * Lógica pura (sem `Database`, sem React) de propósito, para poder ser testada direto, no
 * mesmo espírito de `formatarMoeda.ts`. O disparo de fato continua em
 * `src/domain/notificacoes/despachoCliente.ts` (`dispararNotificacaoComunicado`) — este
 * arquivo só monta `{ assunto, mensagem }` para passar a ele, e resume o `ResultadoDisparo[]`
 * que ele devolve para exibição na tela (`resumirResultadosDisparo`).
 */
import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { ResultadoDisparo } from "../notificacoes/despachoCliente";
import { formatarMoeda } from "../formatarMoeda";

export interface MensagemNotificacao {
  assunto: string;
  mensagem: string;
}

/** Id do locatário principal (`contrato_locatarios.id`, papel='locatario', o mais antigo) de
 * um contrato — mesmo critério/consulta já usado internamente por
 * `resolverDestinatariosPorContratoId` (`domain/notificacoes/resolverDestinatarios.ts`), mas
 * devolvendo o ID em si (não o contato já resolvido) — é o que
 * `<VincularTelegramExterno referenciaId={...} />` precisa receber. `null` quando o contrato
 * não tem nenhum locatário cadastrado ainda. */
export function obterLocatarioPrincipalId(db: Database, contratoId: number): number | null {
  const [linha] = consultar<{ id: number }>(
    db,
    "SELECT id FROM contrato_locatarios WHERE contrato_id = ? AND papel = 'locatario' ORDER BY id ASC LIMIT 1",
    [contratoId],
  );
  return linha?.id ?? null;
}

// ============================================================================
// Inadimplência (ContratosInadimplenciaView.tsx)
// ============================================================================

export interface DadosInadimplenciaNotificacao {
  locatario: string;
  imovelApelido: string;
  diasAtraso: number;
  valorAluguelVencido: number;
  multaValor: number;
  jurosValor: number;
  valorTotalDevido: number;
}

export function montarMensagemInadimplencia(dados: DadosInadimplenciaNotificacao): MensagemNotificacao {
  const { locatario, imovelApelido, diasAtraso, valorAluguelVencido, multaValor, jurosValor, valorTotalDevido } = dados;
  const partesMulta = multaValor > 0 ? `, multa de mora: ${formatarMoeda(multaValor)}` : "";
  const partesJuros = jurosValor > 0 ? `, juros de mora: ${formatarMoeda(jurosValor)}` : "";
  return {
    assunto: `Aluguel em atraso — ${imovelApelido}`,
    mensagem:
      `Olá, ${locatario}. Identificamos um débito de aluguel referente ao imóvel ${imovelApelido}, ` +
      `com ${diasAtraso} dia(s) de atraso. Aluguel vencido: ${formatarMoeda(valorAluguelVencido)}${partesMulta}${partesJuros}. ` +
      `Total devido: ${formatarMoeda(valorTotalDevido)}. Pedimos a regularização o quanto antes ou que entre em ` +
      `contato para tratarmos da pendência.`,
  };
}

// ============================================================================
// RAD — Relatório de Apuração de Débitos (CaucaoView.tsx)
// ============================================================================

export interface ItemRadNotificacao {
  descricao: string;
  valorDepreciado: number;
  aceito: boolean;
}

export interface DadosRadNotificacao {
  locatario: string;
  imovelApelido: string;
  versao: number;
  status: string;
  valorTotalDeducao: number | null;
  itens: ItemRadNotificacao[];
}

export function montarMensagemRad(dados: DadosRadNotificacao): MensagemNotificacao {
  const { locatario, imovelApelido, versao, status, valorTotalDeducao, itens } = dados;
  const itensAceitos = itens.filter((item) => item.aceito);
  const linhasItens =
    itensAceitos.length > 0
      ? itensAceitos.map((item) => `- ${item.descricao}: ${formatarMoeda(item.valorDepreciado)}`).join("\n")
      : "- (nenhum item de dedução apurado)";
  return {
    assunto: `RAD — Relatório de Apuração de Débitos (v${versao}) — ${imovelApelido}`,
    mensagem:
      `Olá, ${locatario}. Segue o Relatório de Apuração de Débitos (RAD) referente à devolução da caução do ` +
      `imóvel ${imovelApelido} — versão ${versao}, status "${status}".\n\n` +
      `Itens considerados na dedução:\n${linhasItens}\n\n` +
      `Valor total de dedução: ${valorTotalDeducao != null ? formatarMoeda(valorTotalDeducao) : "ainda em apuração (rascunho)"}.`,
  };
}

// ============================================================================
// Reajuste / rescisão (ReajustesRescisaoView.tsx)
// ============================================================================

export interface DadosReajusteNotificacao {
  locatario: string;
  imovelApelido: string;
  valorAtual: number;
  valorSugerido: number;
  percentual: number;
  criterio: string;
  dataVigencia: string;
}

export function montarMensagemReajuste(dados: DadosReajusteNotificacao): MensagemNotificacao {
  const { locatario, imovelApelido, valorAtual, valorSugerido, percentual, criterio, dataVigencia } = dados;
  return {
    assunto: `Reajuste de aluguel — ${imovelApelido}`,
    mensagem:
      `Olá, ${locatario}. Informamos o reajuste do aluguel do imóvel ${imovelApelido}, com vigência a partir de ` +
      `${dataVigencia}. Valor atual: ${formatarMoeda(valorAtual)}. Novo valor: ${formatarMoeda(valorSugerido)} ` +
      `(variação de ${percentual.toFixed(2)}%, critério: ${criterio}).`,
  };
}

export interface DadosRescisaoNotificacao {
  locatario: string;
  imovelApelido: string;
  dataRescisao: string;
  mesesRestantes: number;
  multaProporcional: number;
}

export function montarMensagemRescisao(dados: DadosRescisaoNotificacao): MensagemNotificacao {
  const { locatario, imovelApelido, dataRescisao, mesesRestantes, multaProporcional } = dados;
  return {
    assunto: `Rescisão de contrato — ${imovelApelido}`,
    mensagem:
      `Olá, ${locatario}. Em relação à rescisão do contrato de locação do imóvel ${imovelApelido}, com data de ` +
      `rescisão em ${dataRescisao} (${mesesRestantes} mês(es) restante(s) do prazo determinado), a multa ` +
      `rescisória proporcional apurada é de ${formatarMoeda(multaProporcional)}.`,
  };
}

// ============================================================================
// Resumo do disparo (comum às 3 telas) — para exibir no toast de sucesso/aviso.
// ============================================================================

const ROTULO_CANAL: Record<ResultadoDisparo["canal"], string> = {
  email: "e-mail",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

/** Resume `ResultadoDisparo[]` (devolvido por `dispararNotificacaoComunicado`) numa única
 * frase para o toast da tela — nunca lança, só descreve o que aconteceu em cada canal. */
export function resumirResultadosDisparo(resultados: ResultadoDisparo[]): string {
  const enviados = resultados.filter((r) => r.status === "enviado");
  const falhas = resultados.filter((r) => r.status === "falha");
  const pulados = resultados.filter((r) => r.status === "pulado");

  const partes: string[] = [];
  if (enviados.length > 0) {
    partes.push(`enviado por ${enviados.map((r) => ROTULO_CANAL[r.canal]).join(", ")}`);
  }
  if (falhas.length > 0) {
    partes.push(`falhou em ${falhas.map((r) => `${ROTULO_CANAL[r.canal]} (${r.motivo ?? "erro desconhecido"})`).join(", ")}`);
  }
  if (pulados.length > 0) {
    partes.push(`sem destinatário em ${pulados.map((r) => ROTULO_CANAL[r.canal]).join(", ")}`);
  }
  return partes.length > 0 ? partes.join(" — ") : "nenhum canal disponível para este destinatário";
}
