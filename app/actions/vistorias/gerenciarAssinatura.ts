'use server';

import { obterPool } from '@/server/integracao/db';
import {
  criarDocumentoParaAssinatura,
  obterDocumento,
  enviarDocumentoParaAssinatura,
  obterLinkAssinatura,
  obterAuditoriaDocumento,
  verificarStatusDocumento,
} from '@/server/vistorias/integracao-zapsign';
import { gerarPdfFechamento } from '@/server/vistorias/gerarPdfFechamento';

interface ResultadoAssinatura {
  success: boolean;
  documentoUuid?: string;
  linkAssinatura?: string;
  mensagem?: string;
  erro?: string;
  status?: string;
}

interface ResultadoVerificacao {
  success: boolean;
  documentoUuid: string;
  status: string;
  signatarios: Array<{
    nome: string;
    email: string;
    status: string;
    dataAssinatura?: string;
  }>;
  todosAssinaram: boolean;
  erro?: string;
}

/**
 * Cria um documento de fechamento para assinatura eletrônica (vistoriador + inquilino + testemunhas)
 */
export async function criarDocumentoAssinatura(vistoriaSaidaId: string): Promise<ResultadoAssinatura> {
  try {
    const pool = obterPool();

    // 1. Buscar dados da vistoria e contrato
    const vistoriaResult = await pool.query(
      `select v.id, v.contrato_id, v.data,
              c.inquilino_id, c.locador_id, v.vistoriador_id
       from vistorias v
       join contratos c on c.id = v.contrato_id
       where v.id = $1`,
      [vistoriaSaidaId]
    );

    if (vistoriaResult.rows.length === 0) {
      return { success: false, erro: 'Vistoria não encontrada' };
    }

    const vistoria = vistoriaResult.rows[0];

    // 2. Buscar dados de contato
    const contatosResult = await pool.query(
      `select p.id, p.nome, p.email, p.telefone, p.cpf
       from pessoas p
       where p.id in ($1, $2, $3)`,
      [vistoria.inquilino_id, vistoria.locador_id, vistoria.vistoriador_id]
    );

    const contatos = new Map();
    for (const contato of contatosResult.rows) {
      contatos.set(contato.id, contato);
    }

    const inquilino = contatos.get(vistoria.inquilino_id);
    const vistoriador = contatos.get(vistoria.vistoriador_id);

    if (!inquilino || !inquilino.email) {
      return { success: false, erro: 'Email do inquilino não cadastrado' };
    }

    // 3. Gerar PDF do fechamento
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await gerarPdfFechamento(vistoriaSaidaId);
    } catch (err) {
      return { success: false, erro: `Falha ao gerar PDF: ${err instanceof Error ? err.message : String(err)}` };
    }

    // 4. Armazenar PDF temporariamente e obter URL
    // TODO: Implementar upload para storage (S3, Supabase Storage, etc)
    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/vistorias/${vistoriaSaidaId}/pdf`;

    // 5. Criar documento no ZapSign
    const signatarios = [
      {
        email: vistoriador?.email || 'vistoriador@example.com',
        nome: vistoriador?.nome || 'Vistoriador',
        cpf: vistoriador?.cpf,
        telefone: vistoriador?.telefone,
      },
      {
        email: inquilino.email,
        nome: inquilino.nome,
        cpf: inquilino.cpf,
        telefone: inquilino.telefone,
      },
    ];

    const documento = await criarDocumentoParaAssinatura(
      `Relatório de Vistoria de Saída - ${vistoria.id}`,
      pdfUrl,
      signatarios,
      'Por favor, revise e assine o relatório de vistoria de saída.',
      `${process.env.NEXT_PUBLIC_APP_URL}/vistorias/${vistoriaSaidaId}`
    );

    // 6. Armazenar referência do documento no banco
    await pool.query(
      `insert into assinaturas_vistoria (id, vistoria_id, documento_zapsign_uuid, status, criado_em)
       values ($1, $2, $3, $4, now())`,
      [`sig-${Date.now()}`, vistoriaSaidaId, documento.uuid, 'criado']
    );

    // 7. Enviar para assinatura
    await enviarDocumentoParaAssinatura(documento.uuid);

    // 8. Obter link de assinatura para o vistoriador
    const linkAssinatura = await obterLinkAssinatura(documento.uuid, vistoriador?.email || 'vistoriador@example.com');

    return {
      success: true,
      documentoUuid: documento.uuid,
      linkAssinatura,
      mensagem: 'Documento criado e enviado para assinatura',
      status: 'enviado',
    };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      erro: mensagem,
    };
  }
}

/**
 * Verifica o status de assinatura de um documento
 */
export async function verificarStatusAssinatura(documentoUuid: string): Promise<ResultadoVerificacao> {
  try {
    const documento = await verificarStatusDocumento(documentoUuid);

    const signatarios = documento.signers.map((s) => ({
      nome: s.name,
      email: s.email,
      status: s.status,
      dataAssinatura: s.signed_at,
    }));

    const todosAssinaram = documento.signers.every((s) => s.status === 'signed');

    return {
      success: true,
      documentoUuid: documento.uuid,
      status: documento.status,
      signatarios,
      todosAssinaram,
    };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      documentoUuid,
      erro: mensagem,
      status: 'erro',
      signatarios: [],
      todosAssinaram: false,
    };
  }
}

/**
 * Obtém a auditoria completa de um documento de assinatura
 */
export async function obterAuditoriaAssinatura(documentoUuid: string) {
  try {
    const auditoria = await obterAuditoriaDocumento(documentoUuid);

    return {
      success: true,
      documentoUuid,
      auditoria: auditoria.map((a) => ({
        timestamp: a.timestamp,
        acao: a.acao,
        signatario: a.signatario,
        ip: a.ip,
        detalhes: a.detalhes,
      })),
    };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      documentoUuid,
      erro: mensagem,
      auditoria: [],
    };
  }
}
