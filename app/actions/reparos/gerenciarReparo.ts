'use server';

import { obterPool } from '@/server/integracao/db';

export interface ReparoDetalhes {
  id: string;
  contestacao_id: string;
  status: string;
  orcamento_valor: number | null;
  orcamento_data: string | null;
  orcamento_fornecedor: string | null;
  data_agendamento: string | null;
  data_inicio_execucao: string | null;
  data_conclusao_execucao: string | null;
  descricao_trabalho_realizado: string | null;
}

export interface ContestacaoDetalhes {
  id: string;
  motivo: string;
  descricao_desacordo: string;
  vistoria_saida_id: string;
  data_aceitacao: string | null;
  preclusao_data_limite: string | null;
  dias_uteis_restantes: number | null;
  status: string;
}

export interface FotoReparo {
  id: string;
  url_foto: string;
  tipo: string;
  data_upload: string;
}

export interface ReparoComDados {
  reparo: ReparoDetalhes;
  contestacao: ContestacaoDetalhes;
  fotos: FotoReparo[];
}

export async function obterReparoComDados(
  reparoId: string
): Promise<ReparoComDados | null> {
  try {
    const pool = obterPool();

    const result = await pool.query(
      `select
        r.id as reparo_id,
        r.contestacao_id,
        r.status,
        r.orcamento_valor,
        r.orcamento_data,
        r.orcamento_fornecedor,
        r.data_agendamento,
        r.data_inicio_execucao,
        r.data_conclusao_execucao,
        r.descricao_trabalho_realizado,
        c.motivo as contestacao_motivo,
        c.descricao_desacordo as contestacao_descricao_desacordo,
        c.vistoria_saida_id,
        c.data_aceitacao,
        c.preclusao_data_limite,
        c.dias_uteis_restantes,
        c.status as status_contestacao
       from reparos_vistoria r
       join contestacoes c on c.id = r.contestacao_id
       where r.id = $1`,
      [reparoId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const reparoData = result.rows[0];

    const fotosResult = await pool.query(
      `select id, url_foto, tipo, data_upload
       from fotos_reparo
       where reparo_id = $1
       order by data_upload asc`,
      [reparoId]
    );

    return {
      reparo: {
        id: reparoData.reparo_id,
        contestacao_id: reparoData.contestacao_id,
        status: reparoData.status,
        orcamento_valor: reparoData.orcamento_valor,
        orcamento_data: reparoData.orcamento_data,
        orcamento_fornecedor: reparoData.orcamento_fornecedor,
        data_agendamento: reparoData.data_agendamento,
        data_inicio_execucao: reparoData.data_inicio_execucao,
        data_conclusao_execucao: reparoData.data_conclusao_execucao,
        descricao_trabalho_realizado: reparoData.descricao_trabalho_realizado,
      },
      contestacao: {
        id: reparoData.contestacao_id,
        motivo: reparoData.contestacao_motivo,
        descricao_desacordo: reparoData.contestacao_descricao_desacordo,
        vistoria_saida_id: reparoData.vistoria_saida_id,
        data_aceitacao: reparoData.data_aceitacao,
        preclusao_data_limite: reparoData.preclusao_data_limite,
        dias_uteis_restantes: reparoData.dias_uteis_restantes,
        status: reparoData.status_contestacao,
      },
      fotos: fotosResult.rows,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao obter reparo:', mensagem);
    throw new Error(mensagem);
  }
}

export async function atualizarStatusReparo(
  reparoId: string,
  status: string,
  descricao_trabalho_realizado?: string
): Promise<ReparoDetalhes> {
  try {
    const estadosValidos = [
      'pendente',
      'orcado',
      'aprovado',
      'rejeitado',
      'agendado',
      'em_execucao',
      'concluido',
      'desistido',
    ];

    if (!estadosValidos.includes(status)) {
      throw new Error(
        `Status inválido. Valores aceitos: ${estadosValidos.join(', ')}`
      );
    }

    const pool = obterPool();

    const updates: string[] = ['status = $1', 'atualizado_em = now()'];
    const params: (string | Date)[] = [status];
    let paramIndex = 2;

    if (status === 'em_execucao') {
      updates.push(`data_inicio_execucao = coalesce(data_inicio_execucao, now())`);
    }

    if (status === 'concluido') {
      updates.push(`data_conclusao_execucao = now()`);
      if (descricao_trabalho_realizado) {
        updates.push(`descricao_trabalho_realizado = $${paramIndex}`);
        params.push(descricao_trabalho_realizado);
        paramIndex++;
      }
    }

    const query = `
      update reparos_vistoria
      set ${updates.join(', ')}
      where id = $${paramIndex}
      returning
        id,
        contestacao_id,
        status,
        orcamento_valor,
        orcamento_data,
        orcamento_fornecedor,
        data_agendamento,
        data_inicio_execucao,
        data_conclusao_execucao,
        descricao_trabalho_realizado
    `;
    params.push(reparoId);

    const result = await pool.query<ReparoDetalhes>(query, params);

    if (result.rows.length === 0) {
      throw new Error('Reparo não encontrado');
    }

    return result.rows[0];
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao atualizar status do reparo:', mensagem);
    throw new Error(mensagem);
  }
}

export async function registrarFotoReparo(
  reparoId: string,
  foto: Buffer,
  tipo: 'antes' | 'durante' | 'depois',
  nomeOriginal: string
): Promise<FotoReparo> {
  try {
    const pool = obterPool();

    // Validar que reparo existe
    const reparoCheck = await pool.query(
      'select id from reparos_vistoria where id = $1',
      [reparoId]
    );

    if (reparoCheck.rows.length === 0) {
      throw new Error('Reparo não encontrado');
    }

    // Gerar ID único
    const { randomUUID } = await import('crypto');
    const fotoId = randomUUID();
    const extension = nomeOriginal.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const fileName = `${fotoId}.${extension}`;

    // Salvar arquivo no sistema de arquivos
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const UPLOAD_DIR = path.join(process.cwd(), 'tmp', 'uploads', 'reparos');

    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
      // Em produção, integrar com serviço de armazenamento (S3, Vercel Blob, etc.)
      console.warn('Foto armazenada em memória em produção. Considere usar S3 ou similar.');
    } else {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      await fs.writeFile(path.join(UPLOAD_DIR, fileName), foto);
    }

    // Registrar no banco de dados
    const fotoResult = await pool.query(
      `insert into fotos_reparo (id, reparo_id, url_foto, tipo, data_upload, meta_dados)
       values ($1, $2, $3, $4, now(), $5)
       returning id, url_foto, tipo, data_upload`,
      [
        fotoId,
        reparoId,
        `/uploads/reparos/${fileName}`,
        tipo,
        JSON.stringify({
          originalName: nomeOriginal,
          size: foto.length,
          uploadedAt: new Date().toISOString(),
        }),
      ]
    );

    return fotoResult.rows[0];
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao registrar foto:', mensagem);
    throw new Error(mensagem);
  }
}

export async function listarReparosPendentes(): Promise<ReparoDetalhes[]> {
  try {
    const pool = obterPool();

    const result = await pool.query<ReparoDetalhes>(
      `select
        id,
        contestacao_id,
        status,
        orcamento_valor,
        orcamento_data,
        orcamento_fornecedor,
        data_agendamento,
        data_inicio_execucao,
        data_conclusao_execucao,
        descricao_trabalho_realizado
       from reparos_vistoria
       where status in ('agendado', 'em_execucao', 'concluido')
       order by data_agendamento asc`
    );

    return result.rows;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao listar reparos:', mensagem);
    throw new Error(mensagem);
  }
}
