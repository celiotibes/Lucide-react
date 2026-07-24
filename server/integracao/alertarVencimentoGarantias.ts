// Alerta de vencimento de garantias (seguro-fiança, incêndio, etc)
// Executado daily cron: detecta garantias vencendo em 60 dias, envia notificações

import type { Pool } from 'pg';
import { ProvedorEmail } from '@/server/notificacao/Notificador';
import { enviarNotificacaoEmLote } from '@/server/integracao/whatsappTwilio';

export interface GarantiaParaAlertar {
  id: string;
  contrato_id: string;
  tipo: string; // 'caucao', 'fiador', 'seguro_fianca', 'titulo_capitalizacao', 'seguro_incendio'
  valor: number;
  data_vencimento_apolice: string;
  apolice_numero: string | null;
  dias_para_vencer: number;
  imovel_identificacao: string;
  imovel_endereco: string;
  cidade_nome: string;
  proprietario_nome: string;
  proprietario_email: string | null;
  proprietario_celular: string | null;
  contrato_locatario_nome: string;
}

export interface ResultadoAlertasGarantias {
  total_detectadas: number;
  emails_enviados: number;
  whatsapp_enviados: number;
  falhas_totais: number;
  detalhes: Array<{
    garantia_id: string;
    propriedade: string;
    tipo: string;
    dias_para_vencer: number;
    status: 'alerta_enviado' | 'falha_notificacao';
  }>;
}

export async function alertarVencimentoGarantias(pool: Pool): Promise<ResultadoAlertasGarantias> {
  // Buscar garantias vencendo em 30-60 dias (com 30 dias de margem de segurança)
  const { rows: garantiasProximas } = await pool.query<GarantiaParaAlertar>(`
    select
      g.id,
      g.contrato_id,
      g.tipo,
      g.valor,
      g.data_vencimento_apolice,
      g.apolice_numero,
      floor(extract(epoch from (g.data_vencimento_apolice - current_date)) / 86400)::int as dias_para_vencer,
      i.identificacao as imovel_identificacao,
      i.endereco as imovel_endereco,
      c.nome as cidade_nome,
      p.nome as proprietario_nome,
      p.email as proprietario_email,
      p.celular as proprietario_celular,
      (
        select p2.nome
        from contrato_partes cp2
        join pessoas p2 on p2.id = cp2.pessoa_id
        where cp2.contrato_id = g.contrato_id
          and cp2.papel = 'locatario_principal'
        limit 1
      ) as contrato_locatario_nome
    from garantias g
    join contratos co on co.id = g.contrato_id
    join imoveis i on i.id = co.imovel_id
    join cidades c on c.id = i.cidade_id
    join pessoas p on p.id = co.proprietario_id
    where g.status = 'ativa'
      and g.data_vencimento_apolice is not null
      and g.data_vencimento_apolice >= current_date
      and g.data_vencimento_apolice <= current_date + interval '60 days'
      and g.tipo in ('seguro_fianca', 'seguro_incendio')
    order by g.data_vencimento_apolice asc, c.nome, i.identificacao
  `);

  const detalhes: ResultadoAlertasGarantias['detalhes'] = [];
  const emailsEnviar: any[] = [];
  const whatsappEnviar: any[] = [];

  // Agrupar por proprietário para evitar múltiplos emails
  const porProprietario = new Map<string, GarantiaParaAlertar[]>();
  for (const garantia of garantiasProximas) {
    const chave = garantia.proprietario_email || garantia.proprietario_celular || '';
    if (!porProprietario.has(chave)) {
      porProprietario.set(chave, []);
    }
    porProprietario.get(chave)!.push(garantia);
  }

  // Preparar notificações por proprietário
  for (const [contato, garantias] of porProprietario) {
    const primeiraGarantia = garantias[0];

    // Email para proprietário
    if (primeiraGarantia.proprietario_email) {
      const listaGarantias = garantias
        .map((g) => {
          const tipo = traduzirTipoGarantia(g.tipo);
          return `- ${g.imovel_identificacao} (${g.cidade_nome}): ${tipo} vence em ${g.dias_para_vencer} dias (${g.data_vencimento_apolice})`;
        })
        .join('\n');

      emailsEnviar.push({
        para: primeiraGarantia.proprietario_email,
        nome_destinatario: primeiraGarantia.proprietario_nome,
        assunto: `⚠️ Alerta: Garantias para renovação em ${primeiraGarantia.cidade_nome}`,
        html: `
          <p>Olá <strong>${primeiraGarantia.proprietario_nome}</strong>,</p>

          <p>Você tem <strong>${garantias.length}</strong> garantia(s) vencendo em até 60 dias:</p>

          <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">
${listaGarantias}
          </pre>

          <p><strong>Ações Recomendadas:</strong></p>
          <ol>
            <li>Verifique as apólices de seguro na plataforma CRMT</li>
            <li>Contate sua seguradora para renovação</li>
            <li>Atualize a data de vencimento ao renovar</li>
          </ol>

          <p style="color: #888; font-size: 12px;">
            Este é um alerta automático. Acesse <a href="https://app.crmt.local/garantias">app.crmt.local/garantias</a> para mais detalhes.
          </p>
        `,
      });
    }

    // WhatsApp para proprietário (se houver celular)
    if (primeiraGarantia.proprietario_celular) {
      const listaSimples = garantias
        .slice(0, 3) // Limitar a 3 itens por mensagem
        .map((g) => `${g.imovel_identificacao}: ${traduzirTipoGarantia(g.tipo)} em ${g.dias_para_vencer}d`)
        .join('\n');

      whatsappEnviar.push({
        recipienteNumeroCelular: primeiraGarantia.proprietario_celular,
        destinatarioNome: primeiraGarantia.proprietario_nome,
        tipoNotificacao: 'alerta_garantia_vencimento',
        conteudo: `⚠️ Garantias a renovar:\n${listaSimples}${garantias.length > 3 ? '\n+' + (garantias.length - 3) + ' mais' : ''}`,
        dadosRelevantes: {
          total_garantias: garantias.length,
          primeira_vencimento: primeiraGarantia.data_vencimento_apolice,
        },
      });
    }

    // Registrar sucesso inicial
    for (const garantia of garantias) {
      detalhes.push({
        garantia_id: garantia.id,
        propriedade: `${garantia.imovel_identificacao}, ${garantia.cidade_nome}`,
        tipo: traduzirTipoGarantia(garantia.tipo),
        dias_para_vencer: garantia.dias_para_vencer,
        status: 'alerta_enviado',
      });
    }
  }

  // Enviar emails via Resend
  let emailsSucesso = 0;
  let emailsFalha = 0;
  const provedorEmail = new ProvedorEmail();
  for (const email of emailsEnviar) {
    try {
      await provedorEmail.enviar({
        canais: ['email'],
        destinatario: {
          email: email.para,
          nome: email.nome_destinatario,
        },
        template: {
          titulo: email.assunto,
          corpo: email.html,
        },
      });
      emailsSucesso++;
    } catch (err) {
      console.error(`Erro ao enviar email para ${email.para}:`, err);
      emailsFalha++;
      // Marcar como falha
      const garantiasProprietario = garantiasProximas.filter(
        (g) => g.proprietario_email === email.para
      );
      for (const g of garantiasProprietario) {
        const idx = detalhes.findIndex((d) => d.garantia_id === g.id);
        if (idx >= 0) {
          detalhes[idx].status = 'falha_notificacao';
        }
      }
    }
  }

  // Enviar WhatsApp
  let whatsappSucesso = 0;
  let whatsappFalha = 0;
  try {
    const resultado = await enviarNotificacaoEmLote(pool, whatsappEnviar);
    whatsappSucesso = resultado.sucessos;
    whatsappFalha = resultado.falhas;
  } catch (err) {
    console.error('Erro ao enviar notificações WhatsApp:', err);
    whatsappFalha = whatsappEnviar.length;
  }

  // Registrar alertas em auditoria
  for (const garantia of garantiasProximas) {
    await pool.query(
      `insert into audit_log (tabela, operacao, registro_id, usuario_id, dados_novos, mensagem)
       values ('garantias', 'alerta_vencimento', $1, null, $2, $3)`,
      [
        garantia.id,
        JSON.stringify({
          tipo: garantia.tipo,
          dias_para_vencer: garantia.dias_para_vencer,
          vencimento: garantia.data_vencimento_apolice,
        }),
        `Alerta de vencimento gerado: ${garantia.dias_para_vencer} dias`,
      ]
    );
  }

  return {
    total_detectadas: garantiasProximas.length,
    emails_enviados: emailsSucesso,
    whatsapp_enviados: whatsappSucesso,
    falhas_totais: emailsFalha + whatsappFalha,
    detalhes,
  };
}

function traduzirTipoGarantia(tipo: string): string {
  const mapa: Record<string, string> = {
    caucao: 'Caução',
    fiador: 'Fiador',
    seguro_fianca: 'Seguro-Fiança',
    titulo_capitalizacao: 'Título de Capitalização',
    seguro_incendio: 'Seguro-Incêndio',
  };
  return mapa[tipo] || tipo;
}
