'use server';

// Mesmo padrão de app/conciliacao-bancaria/actions.ts: aprovar/rejeitar é
// sempre uma ação humana explícita (nunca em lote, nunca automático) — a
// extração da IA fica em 'pendente_revisao' até o operador decidir aqui.
// `revisado_por` fica null pelo mesmo motivo que `aprovado_por` lá: não há
// sessão de usuário autenticado ainda no back-office (docs/09).
//
// Ao aprovar, só os campos que o operador marcou explicitamente no
// formulário são copiados de extracoes_documento_ia.dados_extraidos para
// contratos/garantias/contrato_componentes_mensais — nunca todos de uma vez
// só porque a IA os propôs. `campos_aplicados` registra o que foi de fato
// gravado, para auditoria.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import type { DadosContratoExtraidos } from '@/server/documentos/extrairDadosContrato';
import { perguntarSobreDocumento } from '@/server/documentos/perguntarDocumento';

// Fase 7: pergunta livre sobre o documento — síncrona (o operador espera a
// resposta na tela), independente do status da extração estruturada acima.
export async function perguntarSobreDocumentoAction(formData: FormData): Promise<void> {
  const documentoId = String(formData.get('documento_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  const pergunta = String(formData.get('pergunta') ?? '');
  if (!documentoId || !contratoId) {
    throw new Error('documento_id ou contrato_id ausente');
  }

  const resultado = await perguntarSobreDocumento(obterPool(), documentoId, pergunta);
  if (!resultado.sucesso) {
    throw new Error(resultado.erro ?? 'Falha ao perguntar à IA');
  }

  revalidatePath(`/contratos/${contratoId}/documentos/${documentoId}/revisao`);
}

export async function rejeitarExtracao(formData: FormData): Promise<void> {
  const extracaoId = String(formData.get('extracao_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!extracaoId || !contratoId) {
    throw new Error('extracao_id ou contrato_id ausente');
  }

  await obterPool().query(
    `update extracoes_documento_ia set status = 'rejeitada', revisado_por = $1, revisado_em = now() where id = $2`,
    [null, extracaoId],
  );

  revalidatePath(`/contratos/${contratoId}/documentos`);
}

export async function aprovarExtracao(formData: FormData): Promise<void> {
  const extracaoId = String(formData.get('extracao_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!extracaoId || !contratoId) {
    throw new Error('extracao_id ou contrato_id ausente');
  }

  const pool = obterPool();
  const { rows } = await pool.query<{ dados_extraidos: DadosContratoExtraidos | null; status: string }>(
    `select dados_extraidos, status from extracoes_documento_ia where id = $1`,
    [extracaoId],
  );
  const extracao = rows[0];
  if (!extracao || !extracao.dados_extraidos) {
    throw new Error('Extração não encontrada ou sem dados');
  }
  if (extracao.status !== 'pendente_revisao') {
    throw new Error('Esta extração já foi revisada');
  }

  const dados = extracao.dados_extraidos;
  const camposAplicados: Record<string, unknown> = {};

  const client = await pool.connect();
  try {
    await client.query('begin');

    if (formData.get('aplicar_valorAluguel') === 'on' && dados.valorAluguel != null) {
      await client.query(`update contratos set valor_aluguel = $1, atualizado_em = now() where id = $2`, [
        dados.valorAluguel,
        contratoId,
      ]);
      camposAplicados.valorAluguel = dados.valorAluguel;
    }

    if (formData.get('aplicar_indiceReajuste') === 'on' && dados.indiceReajuste) {
      await client.query(`update contratos set indice_reajuste = $1, atualizado_em = now() where id = $2`, [
        dados.indiceReajuste,
        contratoId,
      ]);
      camposAplicados.indiceReajuste = dados.indiceReajuste;
    }

    if (formData.get('aplicar_dataFim') === 'on' && dados.dataFim) {
      await client.query(`update contratos set data_fim = $1, atualizado_em = now() where id = $2`, [
        dados.dataFim,
        contratoId,
      ]);
      camposAplicados.dataFim = dados.dataFim;
    }

    if (formData.get('aplicar_diaVencimento') === 'on' && dados.diaVencimento != null) {
      await client.query(`update contratos set dia_vencimento = $1, atualizado_em = now() where id = $2`, [
        dados.diaVencimento,
        contratoId,
      ]);
      camposAplicados.diaVencimento = dados.diaVencimento;
    }

    if (formData.get('aplicar_valorCaucao') === 'on' && dados.valorCaucao != null) {
      const { rows: garantiaExistente } = await client.query<{ id: string }>(
        `select id from garantias where contrato_id = $1 and tipo = 'caucao'`,
        [contratoId],
      );
      if (garantiaExistente[0]) {
        await client.query(`update garantias set valor = $1 where id = $2`, [dados.valorCaucao, garantiaExistente[0].id]);
      } else {
        await client.query(
          `insert into garantias (contrato_id, tipo, valor, data_inicio, status)
           values ($1, 'caucao', $2, current_date, 'ativa')`,
          [contratoId, dados.valorCaucao],
        );
      }
      camposAplicados.valorCaucao = dados.valorCaucao;
    }

    const custosAplicados: string[] = [];
    for (const custo of dados.custosObrigatorios ?? []) {
      if (formData.get(`aplicar_custo_${custo.tipo}`) !== 'on' || custo.valor == null) continue;

      const { rows: componenteExistente } = await client.query<{ id: string; natureza: string }>(
        `select id, natureza from contrato_componentes_mensais where contrato_id = $1 and tipo = $2`,
        [contratoId, custo.tipo],
      );
      if (componenteExistente[0]) {
        // Só sobrescreve quando o componente já cadastrado também é valor fixo — um
        // componente 'repassado_variavel' ou 'percentual_do_aluguel' tem semântica
        // incompatível com um valor fixo extraído do texto do contrato.
        if (componenteExistente[0].natureza === 'valor_fixo') {
          await client.query(
            `update contrato_componentes_mensais set valor_fixo = $1, descricao = coalesce($2, descricao) where id = $3`,
            [custo.valor, custo.descricao, componenteExistente[0].id],
          );
          custosAplicados.push(custo.tipo);
        }
      } else {
        await client.query(
          `insert into contrato_componentes_mensais (contrato_id, tipo, descricao, natureza, valor_fixo)
           values ($1, $2, $3, 'valor_fixo', $4)`,
          [contratoId, custo.tipo, custo.descricao, custo.valor],
        );
        custosAplicados.push(custo.tipo);
      }
    }
    if (custosAplicados.length > 0) {
      camposAplicados.custosObrigatorios = custosAplicados;
    }

    await client.query(
      `update extracoes_documento_ia
       set status = 'aprovada', campos_aplicados = $1, revisado_por = $2, revisado_em = now()
       where id = $3`,
      [JSON.stringify(camposAplicados), null, extracaoId],
    );

    await client.query('commit');
  } catch (erro) {
    await client.query('rollback');
    throw erro;
  } finally {
    client.release();
  }

  revalidatePath(`/contratos/${contratoId}/documentos`);
  revalidatePath(`/contratos/${contratoId}/contrato`);
}
