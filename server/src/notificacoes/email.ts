/**
 * Remetente de e-mail via SMTP (nodemailer) — um dos 3 canais de notificação disparados
 * quando uma cobrança/boleto é emitida ou um comunicado genérico é enviado (decisão do
 * usuário, 2026-10: toda cobrança/comunicado deve sair por e-mail e WhatsApp/Telegram
 * cadastrados, não só ficar visível dentro do sistema).
 *
 * Ver `server/src/domain/notificacoes/despacho.ts` para a orquestração dos 3 canais e
 * `server/src/routes/notificacoes-routes.ts` para a rota HTTP que usa este módulo.
 *
 * REGRA DE OURO DE SEGURANÇA (mesmo padrão de `server/src/asaas.ts` e
 * `server/src/pluggy-meu.ts`): SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM só são
 * lidas DENTRO de `enviarEmail`, no momento da chamada — NUNCA no topo do módulo nem no
 * boot do servidor. Importar este arquivo (em `index.ts` ou em qualquer teste) nunca deve
 * exigir essas env vars configuradas; só a tentativa de envio de fato falha, com mensagem
 * clara, quando alguém chama `enviarEmail` sem elas.
 */
import nodemailer, { type Transporter } from "nodemailer";

/** Lançado quando uma env var obrigatória de SMTP não está configurada — nunca no boot,
 * só na chamada de `enviarEmail` que de fato precisar dela. */
export class EmailConfiguracaoAusenteError extends Error {
  constructor(variavel: string) {
    super(
      `${variavel} não está configurada no ambiente do servidor — defina-a no .env antes de enviar e-mail de notificação (ver .env.example).`,
    );
    this.name = "EmailConfiguracaoAusenteError";
  }
}

export interface OpcoesEnviarEmail {
  destinatario: string;
  assunto: string;
  corpo: string;
}

function lerEnvObrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new EmailConfiguracaoAusenteError(nome);
  return valor;
}

/** Monta um transporter novo a cada chamada — este módulo não é um caminho de alta
 * frequência (notificações, não transações bancárias) a ponto de justificar cache de
 * conexão, e um transporter novo por chamada evita reaproveitar credenciais stale entre
 * testes/trocas de configuração em runtime. */
function criarTransporter(): Transporter {
  const host = lerEnvObrigatoria("SMTP_HOST");
  const portaBruta = lerEnvObrigatoria("SMTP_PORT");
  const porta = Number(portaBruta);
  if (!Number.isFinite(porta) || porta <= 0) {
    throw new EmailConfiguracaoAusenteError("SMTP_PORT (valor configurado não é um número de porta válido)");
  }
  const user = lerEnvObrigatoria("SMTP_USER");
  const pass = lerEnvObrigatoria("SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port: porta,
    secure: porta === 465, // 465 = SMTPS implícito; 587/25 usam STARTTLS, já tratado pela lib.
    auth: { user, pass },
  });
}

/** Envia um e-mail de notificação (cobrança emitida ou comunicado genérico). Lança
 * `EmailConfiguracaoAusenteError` com mensagem clara se qualquer env var de SMTP estiver
 * ausente — nunca falha em silêncio nem no boot do servidor, só aqui, quando chamada. */
export async function enviarEmail({ destinatario, assunto, corpo }: OpcoesEnviarEmail): Promise<void> {
  const from = lerEnvObrigatoria("SMTP_FROM");
  const transporter = criarTransporter();
  await transporter.sendMail({ from, to: destinatario, subject: assunto, text: corpo });
}
