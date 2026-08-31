import { Resend } from 'resend';

interface ContratoVencimento {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string;
  locatario_email: string;
  locador_nome: string;
  locador_email: string;
  data_fim: string;
  aviso_previo_dias: number;
  valor_aluguel: number;
  status: string;
}

interface ResultadoNotificacao {
  contrato_id: string;
  sucesso: boolean;
  erro?: string;
  email_locatario?: string;
  email_locador?: string;
}

export async function enviarEmailVencimento(
  contratos: ContratoVencimento[],
): Promise<ResultadoNotificacao[]> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const resultados: ResultadoNotificacao[] = [];

  for (const contrato of contratos) {
    try {
      // Formatar data para exibição
      const dataFim = new Date(contrato.data_fim);
      const dataFormatada = dataFim.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      // Calcular dias até vencimento
      const agora = new Date();
      const diasAteVencimento = Math.ceil(
        (dataFim.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24),
      );

      const corpoEmail = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    .alert-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin-bottom: 20px;
      border-radius: 4px;
    }
    .alert-box strong {
      color: #d97706;
    }
    .info-section {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: 8px 0;
      font-size: 14px;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .info-value {
      color: #333;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #999;
    }
    .cta-button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      text-decoration: none;
      margin: 20px 0;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Notificação de Vencimento de Contrato</h1>
    </div>

    <div class="content">
      <p>Olá <strong>${contrato.locatario_nome}</strong>,</p>

      <div class="alert-box">
        <strong>Aviso importante:</strong> Seu contrato de locação vence em <strong>${diasAteVencimento} dias</strong> (${dataFormatada})
      </div>

      <p>Segue os detalhes do seu contrato:</p>

      <div class="info-section">
        <div class="info-row">
          <span class="info-label">Imóvel:</span>
          <span class="info-value">${contrato.imovel_identificacao}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Valor do Aluguel:</span>
          <span class="info-value">R$ ${contrato.valor_aluguel.toFixed(2).replace('.', ',')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Data de Vencimento:</span>
          <span class="info-value">${dataFormatada}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Prazo de Aviso Prévio:</span>
          <span class="info-value">${contrato.aviso_previo_dias} dias</span>
        </div>
        <div class="info-row">
          <span class="info-label">Proprietário:</span>
          <span class="info-value">${contrato.locador_nome}</span>
        </div>
      </div>

      <p>
        <strong>Próximos passos:</strong>
      </p>
      <ul>
        <li>Se deseja renovar o contrato, entre em contato com o proprietário assim que possível</li>
        <li>Se deseja desocupar o imóvel, comunique formalmente com antecedência de ${contrato.aviso_previo_dias} dias</li>
        <li>Confira pendências financeiras antes do vencimento</li>
      </ul>

      <p>
        Acesse o portal para mais detalhes:
      </p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'}/portal" class="cta-button">
        Ver Detalhes no Portal
      </a>
    </div>

    <div class="footer">
      <p>Esta é uma notificação automática do sistema CRMT Gestão Imobiliária.</p>
      <p>Se você recebeu este e-mail por engano, favor desconsiderar.</p>
    </div>
  </div>
</body>
</html>
      `.trim();

      // Enviar para locatário
      let emailLocatarioEnviado = false;
      if (contrato.locatario_email) {
        try {
          await resend.emails.send({
            from: 'noreply@crmt.dev',
            to: contrato.locatario_email,
            subject: `⏰ Seu contrato vence em ${diasAteVencimento} dias`,
            html: corpoEmail.replace('${contrato.locatario_nome}', contrato.locatario_nome),
          });
          emailLocatarioEnviado = true;
        } catch (err) {
          console.error(`Erro ao enviar email para locatário ${contrato.locatario_email}:`, err);
        }
      }

      // Enviar para locador também (informativo)
      let emailLocadorEnviado = false;
      if (contrato.locador_email && contrato.locador_email !== contrato.locatario_email) {
        try {
          const corpoEmailLocador = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .info-section { background: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .info-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
    .info-label { font-weight: 600; color: #666; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Aviso: Contrato em Vencimento</h1>
    </div>
    <div class="content">
      <p>Prezado <strong>${contrato.locador_nome}</strong>,</p>
      <p>Informamos que o contrato do imóvel <strong>${contrato.imovel_identificacao}</strong> vence em <strong>${diasAteVencimento} dias</strong>.</p>
      <div class="info-section">
        <div class="info-row"><span class="info-label">Locatário:</span><span>${contrato.locatario_nome}</span></div>
        <div class="info-row"><span class="info-label">Aluguel Mensal:</span><span>R$ ${contrato.valor_aluguel.toFixed(2).replace('.', ',')}</span></div>
        <div class="info-row"><span class="info-label">Vencimento:</span><span>${dataFormatada}</span></div>
      </div>
      <p>Recomendamos tomar as providências necessárias para renovação ou encerramento do contrato dentro do prazo adequado.</p>
    </div>
    <div class="footer">
      <p>Este é um aviso automático do sistema CRMT.</p>
    </div>
  </div>
</body>
</html>
          `.trim();

          await resend.emails.send({
            from: 'noreply@crmt.dev',
            to: contrato.locador_email,
            subject: `📋 Contrato de ${contrato.imovel_identificacao} vencendo em ${diasAteVencimento} dias`,
            html: corpoEmailLocador,
          });
          emailLocadorEnviado = true;
        } catch (err) {
          console.error(`Erro ao enviar email para locador ${contrato.locador_email}:`, err);
        }
      }

      resultados.push({
        contrato_id: contrato.id,
        sucesso: emailLocatarioEnviado || emailLocadorEnviado,
        email_locatario: contrato.locatario_email,
        email_locador: contrato.locador_email,
      });
    } catch (erro) {
      resultados.push({
        contrato_id: contrato.id,
        sucesso: false,
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      });
    }
  }

  return resultados;
}
