/**
 * Remetente via WhatsApp Cloud API (Meta), usando `fetch` nativo — sem SDK novo, mesmo
 * espírito de `server/src/asaas.ts`: a API usada aqui é simples o bastante para não
 * justificar uma dependência.
 *
 * LIMITAÇÃO REAL DA API (documentar aqui, não contornar): a Cloud API só aceita mensagem
 * de TEXTO LIVRE da empresa para o cliente dentro de uma "janela de atendimento" de 24h
 * contadas a partir da ÚLTIMA mensagem que o CLIENTE mandou primeiro para o número do
 * WhatsApp Business. Fora dessa janela (ex: primeiro contato nunca iniciado pelo cliente,
 * ou já passou 24h desde a última mensagem dele), uma mensagem de negócio iniciada pela
 * EMPRESA — como o aviso de um boleto/comunicado, exatamente o caso de uso deste módulo —
 * normalmente PRECISA ser um "template" pré-aprovado pela Meta (WhatsApp Message
 * Templates, cadastrado no Business Manager); texto livre fora da janela é REJEITADO pela
 * API (erro ~131047/"re-engagement message"). `templateName` e `templateVariables` abaixo
 * implementam esse caso (chama o endpoint com `type: "template"` em vez de `type: "text"`),
 * resolvendo templates a partir da WhatsApp Business Account.
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
  /** Mensagem de texto livre (usado quando templateName não é fornecido). */
  mensagem?: string;
  /** Nome de um template pré-aprovado pela Meta — ver limitação documentada no topo do
   * arquivo. Quando fornecido, usa o template em vez de texto livre. */
  templateName?: string;
  /** Variáveis para substituir em placeholders do template (ex: ["João", "2024-01-31"]).
   * Ordem deve corresponder aos placeholders {{1}}, {{2}}, etc no template. */
  templateVariables?: string[];
}

function lerEnvObrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new WhatsappConfiguracaoAusenteError(nome);
  return valor;
}

function lerEnvOpcional(nome: string): string | undefined {
  return process.env[nome];
}

/** Interface para template recuperado da API Meta */
interface TemplateWhatsappMeta {
  name: string;
  status: string;
  language: string;
  category?: string;
  components?: Array<{
    type: string;
    format?: string;
    text?: string;
    body?: {
      text?: string;
    };
  }>;
}

/**
 * Recupera templates disponíveis da WhatsApp Business Account.
 * Requer WHATSAPP_BUSINESS_ACCOUNT_ID configurado.
 */
async function obterTemplatesDisponiveis(token: string): Promise<TemplateWhatsappMeta[]> {
  const businessAccountId = lerEnvOpcional("WHATSAPP_BUSINESS_ACCOUNT_ID");
  if (!businessAccountId) {
    throw new Error(
      "WHATSAPP_BUSINESS_ACCOUNT_ID não está configurado — necessário para usar templates"
    );
  }

  const resposta = await fetch(
    `https://graph.facebook.com/${VERSAO_API_GRAPH}/${businessAccountId}/message_templates`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(
      `Erro ao recuperar templates: ${resposta.status} - ${corpo}`
    );
  }

  const dados = (await resposta.json()) as { data?: TemplateWhatsappMeta[] };
  return dados.data || [];
}

/**
 * Encontra um template pelo nome na lista de templates disponíveis
 */
async function obterTemplate(
  templateName: string,
  token: string
): Promise<TemplateWhatsappMeta> {
  const templates = await obterTemplatesDisponiveis(token);
  const template = templates.find((t) => t.name === templateName);

  if (!template) {
    const nomesCadastrados = templates.map((t) => t.name).join(", ");
    throw new Error(
      `Template '${templateName}' não encontrado. Templates disponíveis: ${
        nomesCadastrados || "(nenhum)"
      }`
    );
  }

  return template;
}

/** Envia uma mensagem de WhatsApp via Cloud API. Suporta tanto mensagem de texto livre
 * (dentro da janela de 24h) quanto templates pré-aprovados pela Meta. Lança erro claro
 * se as env vars estiverem ausentes, se o template não for encontrado, ou se a API da
 * Meta responder com erro. */
export async function enviarWhatsapp({
  destinatarioE164,
  mensagem,
  templateName,
  templateVariables,
}: OpcoesEnviarWhatsapp): Promise<void> {
  const token = lerEnvObrigatoria("WHATSAPP_CLOUD_API_TOKEN");
  const phoneNumberId = lerEnvObrigatoria("WHATSAPP_PHONE_NUMBER_ID");

  let corpoRequisicao: Record<string, unknown>;

  if (templateName) {
    // Modo template: recupera o template da Meta, valida e envia com variáveis
    const template = await obterTemplate(templateName, token);

    // Constrói payload com template
    const templateBody: Record<string, unknown> = {
      name: template.name,
    };

    // Se houver variáveis, adiciona ao payload
    if (templateVariables && templateVariables.length > 0) {
      templateBody.parameters = {
        body: {
          parameters: templateVariables.map((valor) => ({ type: "text", text: valor })),
        },
      };
    }

    corpoRequisicao = {
      messaging_product: "whatsapp",
      to: destinatarioE164.replace(/^\+/, ""),
      type: "template",
      template: templateBody,
    };
  } else {
    // Modo texto livre: usa mensagem direta (dentro da janela de 24h)
    if (!mensagem) {
      throw new Error(
        "Mensagem é obrigatória quando templateName não é fornecido"
      );
    }

    corpoRequisicao = {
      messaging_product: "whatsapp",
      to: destinatarioE164.replace(/^\+/, ""),
      type: "text",
      text: { body: mensagem },
    };
  }

  const resposta = await fetch(
    `https://graph.facebook.com/${VERSAO_API_GRAPH}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpoRequisicao),
    }
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`WhatsApp Cloud API respondeu ${resposta.status}: ${corpo}`);
  }
}
