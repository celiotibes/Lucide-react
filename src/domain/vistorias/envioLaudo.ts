/**
 * Lógica pura (sem React, sem rede) de apoio ao botão "Enviar laudo" de `VistoriaView.tsx` —
 * extraída para cá para ser testável isoladamente, nos termos do mesmo padrão já usado no
 * resto do domínio (ex: `historicoJuros.ts`). Não substitui nenhuma função já existente em
 * `agenda.ts`/`inspecao.ts`/`aprova.ts`/`audit.ts`/`laudo.ts` — só decide duas coisas que a
 * TELA precisa e que não cabem em nenhum desses arquivos (eles não sabem de "enviar por
 * notificação", que é um conceito de `src/domain/notificacoes/*`, não de vistoria):
 *
 *   1. `avaliarEnvioLaudo`: o botão só faz sentido quando a vistoria tem `contrato_id`
 *      (sem contrato não há como achar o locatário via `resolverDestinatariosPorContratoId`,
 *      ver `resolverDestinatarios.ts`) — vistoria de rotina sem contrato ativo, por exemplo,
 *      nunca tem para quem enviar.
 *   2. `montarAssuntoLaudo`: assunto padronizado do e-mail/comunicado, a partir dos mesmos
 *      dados que `formatarLaudoTexto` (laudo.ts) já usa para o corpo da mensagem — nunca
 *      inventa um dado que o laudo não tenha.
 */
import type { Vistoria } from "../types";

export interface AvaliacaoEnvioLaudo {
  podeEnviar: boolean;
  /** Presente só quando `podeEnviar === false` — motivo a mostrar na tela (ex: tooltip do
   * botão desabilitado). */
  motivo?: string;
}

/** Decide se o botão "Enviar laudo" pode ser acionado para esta vistoria. Hoje a única
 * condição é ter `contrato_id` — mas fica centralizado aqui para a tela nunca duplicar essa
 * regra nem divergir entre o `disabled` do botão e a chamada real de envio. */
export function avaliarEnvioLaudo(vistoria: Pick<Vistoria, "contrato_id">): AvaliacaoEnvioLaudo {
  if (!vistoria.contrato_id) {
    return {
      podeEnviar: false,
      motivo:
        "Vistoria sem contrato vinculado — não há locatário para notificar (vistoria de rotina ou sem contrato ativo).",
    };
  }
  return { podeEnviar: true };
}

/** Assunto do e-mail/comunicado de envio do laudo — mesmo texto para todo canal (o campo
 * `assunto` de `dispararNotificacaoComunicado` é usado só pelo canal e-mail; WhatsApp/Telegram
 * ignoram, mas recebem o mesmo objeto por simplicidade). */
export function montarAssuntoLaudo(vistoria: Pick<Vistoria, "id">, imovelApelido: string): string {
  return `Laudo de vistoria — ${imovelApelido} (#${vistoria.id})`;
}
