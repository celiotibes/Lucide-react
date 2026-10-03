/**
 * Remetente via WhatsApp Cloud API (Meta), usando `fetch` nativo — sem SDK novo, mesmo
 * espírito de `server/src/asaas.ts`: a API usada aqui (um único endpoint, `POST
 * /{phoneNumberId}/messages`) é simples o bastante para não justificar uma dependência.
 *
 * LIMITAÇÃO REAL DA API (documentar aqui, não contornar): a Cloud API só aceita mensagem
 * de TEXTO LIVRE da empresa para o cliente dentro de uma "janela de atendimento" de 24h
 * contadas a partir da ÚLTIMA mensagem que o CLIENTE mandou primeiro para o número do
 * WhatsApp Business. Fora dessa janela (ex: primeiro contato nunca iniciado pelo cliente,
 * ou já passou 24h desde a última mensagem dele), uma mensagem de negócio iniciada pela
 * EMPRESA — como o aviso de um boleto/comunicado, exatamente o caso de uso deste módulo —
 * normalmente PRECISA ser um "template" pré-aprovado pela Meta (WhatsApp Message
 * Templates, cadastrado no Business Manager); texto livre fora da janela é REJEITADO pela
 * API (erro ~131047/"re-engagement message"). `templateName` abaixo é o gancho para esse
 * caso (chamaria o endpoint com `type: "template"` em vez de `type: "text"`) — NÃO
 * implementado nesta rodada porque exige cadastrar e aprovar o template na Meta antes de
 * ter como testar; passar `templateName` hoje lança um erro claro em vez de enviar texto
 * livre e deixar a Meta rejeitar sem explicação. O caminho padrão implementado agora
 * (texto livre, dentro da janela de 24h) cobre o caso comum: locatário/cliente que já
 * interage com o WhatsApp Business do titular.
 */

const VERSAO_API_GRAPH = "v21.0";

/** Lançado quando uma env var obrigatória do WhatsApp Cloud API não está configurada —
 * nunca no boot do servidor, só na chamada de `enviarWhatsapp`. */
export class WhatsappConfiguracaoAusenteError extends Error {
  constructor(variavel: string) {
    super(
      `${variavel} não está configurada no ambiente do servidor — defina-a no .env antes de enviar WhatsApp de notificação (ver .env.example).`,
    );
    this.name = "WhatsappConfiguracaoAusenteError";
  }
}

export interface OpcoesEnviarWhatsapp {
  /** Número do destinatário em E.164 (ex: "+5511987654321") — a Cloud API exige esse
   * formato, sem o "+" no corpo da chamada (removido internamente). */
  destinatarioE164: string;
  mensagem: string;
  /** Nome de um template pré-aprovado pela Meta — ver limitação documentada no topo do
   * arquivo. Passar isto hoje lança erro claro (não implementado), em vez de tentar texto
   * livre fora da janela de 24h e falhar sem explicação do lado da Meta. */
  templateName?: string;
}

function lerEnvObrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new WhatsappConfiguracaoAusenteError(nome);
  return valor;
}

/** Envia uma mensagem de WhatsApp via Cloud API. Lança erro claro se as env vars
 * estiverem ausentes, se `templateName` for informado (não implementado — ver cabeçalho),
 * ou se a API da Meta responder com erro. */
export async function enviarWhatsapp({ destinatarioE164, mensagem, templateName }: OpcoesEnviarWhatsapp): Promise<void> {
  if (templateName) {
    throw new Error(
      `Envio via template Meta ('${templateName}') ainda não implementado — só mensagem de texto livre (dentro da janela de 24h) está disponível nesta integração. Ver comentário no topo de server/src/notificacoes/whatsapp.ts.`,
    );
  }

  const token = lerEnvObrigatoria("WHATSAPP_CLOUD_API_TOKEN");
  const phoneNumberId = lerEnvObrigatoria("WHATSAPP_PHONE_NUMBER_ID");

  const resposta = await fetch(`https://graph.facebook.com/${VERSAO_API_GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: destinatarioE164.replace(/^\+/, ""),
      type: "text",
      text: { body: mensagem },
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`WhatsApp Cloud API respondeu ${resposta.status}: ${corpo}`);
  }
}
