'use server';

// Camada de aplicação sobre o schema já existente (vistorias, vistoria_fotos,
// confissoes_divida — RLS pronta desde a auditoria original, mas sem nenhum
// código escrevendo até aqui). Fotos reaproveitam o mesmo bucket privado de
// Storage dos documentos (lib/supabase/storage.ts) — mesma justificativa de
// acesso restrito (podem mostrar interior de imóvel ocupado).
//
// Retenção de caução (server/financeiro/calcularRetencaoCaucao.ts) só roda
// na conclusão de vistoria de SAÍDA. Não altera o status da garantia nem
// gera lançamento financeiro de devolução — isso fica fora do escopo desta
// camada; o que existe hoje é: registrar o cálculo (para consulta) e, se
// houver saldo devedor, abrir uma confissão de dívida 'pendente' — igual ao
// padrão já usado por solicitacoes_quebra_contrato de nunca inventar que
// algo foi resolvido quando não foi.

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { uploadDocumentoStorage } from '@/lib/supabase/storage';
import { sanitizarNomeArquivo } from '@/server/documentos/logicaUpload';
import {
  ITENS_CHECKLIST_VISTORIA,
  checklistVazio,
  type ChecklistVistoria,
  type ItemChecklistVistoria,
} from '@/server/vistorias/checklist';
import { concluirVistoria as concluirVistoriaLogica } from '@/server/integracao/concluirVistoria';

export async function criarVistoria(formData: FormData): Promise<void> {
  const contratoId = String(formData.get('contrato_id') ?? '');
  const tipo = String(formData.get('tipo') ?? '');
  if (!contratoId || !['entrada', 'periodica', 'saida'].includes(tipo)) {
    throw new Error('contrato_id ou tipo inválido');
  }

  const pool = obterPool();
  const { rows } = await pool.query<{ imovel_id: string }>(`select imovel_id from contratos where id = $1`, [
    contratoId,
  ]);
  if (!rows[0]) {
    throw new Error('Contrato não encontrado');
  }

  await pool.query(
    `insert into vistorias (contrato_id, imovel_id, tipo, checklist_json, status)
     values ($1, $2, $3, $4, 'em_andamento')`,
    [contratoId, rows[0].imovel_id, tipo, JSON.stringify(checklistVazio())],
  );

  revalidatePath(`/contratos/${contratoId}/vistorias`);
}

export async function salvarChecklist(formData: FormData): Promise<void> {
  const vistoriaId = String(formData.get('vistoria_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!vistoriaId || !contratoId) {
    throw new Error('vistoria_id ou contrato_id ausente');
  }

  const chavesDevolvidasRaw = formData.get('chaves_devolvidas');
  const checklist: ChecklistVistoria = {
    chavesDevolvidas: chavesDevolvidasRaw === null ? null : chavesDevolvidasRaw === 'sim',
    itens: ITENS_CHECKLIST_VISTORIA.map((item): ItemChecklistVistoria => {
      const situacao = String(formData.get(`situacao_${item}`) ?? 'ok');
      const custoRaw = String(formData.get(`custo_${item}`) ?? '').trim();
      const observacao = String(formData.get(`observacao_${item}`) ?? '').trim();
      return {
        item,
        situacao: situacao === 'dano' || situacao === 'nao_aplica' ? situacao : 'ok',
        custoReparo: situacao === 'dano' && custoRaw ? Number(custoRaw) : null,
        observacao: observacao || null,
      };
    }),
  };

  await obterPool().query(`update vistorias set checklist_json = $1 where id = $2`, [
    JSON.stringify(checklist),
    vistoriaId,
  ]);

  revalidatePath(`/contratos/${contratoId}/vistorias/${vistoriaId}`);
}

export async function adicionarFotoVistoria(formData: FormData): Promise<void> {
  const vistoriaId = String(formData.get('vistoria_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  const arquivo = formData.get('arquivo');
  const latitudeRaw = String(formData.get('latitude') ?? '').trim();
  const longitudeRaw = String(formData.get('longitude') ?? '').trim();

  if (!vistoriaId || !contratoId) {
    throw new Error('vistoria_id ou contrato_id ausente');
  }
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    throw new Error('Selecione uma foto');
  }

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const caminhoStorage = `vistorias/${vistoriaId}/${Date.now()}-${hash}-${sanitizarNomeArquivo(arquivo.name)}`;

  await uploadDocumentoStorage(caminhoStorage, bytes, arquivo.type);

  await obterPool().query(
    `insert into vistoria_fotos (vistoria_id, url, latitude, longitude)
     values ($1, $2, $3, $4)`,
    [vistoriaId, caminhoStorage, latitudeRaw ? Number(latitudeRaw) : null, longitudeRaw ? Number(longitudeRaw) : null],
  );

  revalidatePath(`/contratos/${contratoId}/vistorias/${vistoriaId}`);
}

export async function concluirVistoria(formData: FormData): Promise<void> {
  const vistoriaId = String(formData.get('vistoria_id') ?? '');
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!vistoriaId || !contratoId) {
    throw new Error('vistoria_id ou contrato_id ausente');
  }

  const resultado = await concluirVistoriaLogica(obterPool(), vistoriaId, contratoId);
  if (!resultado.sucesso) {
    throw new Error(resultado.erro);
  }

  revalidatePath(`/contratos/${contratoId}/vistorias/${vistoriaId}`);
  revalidatePath(`/contratos/${contratoId}/vistorias`);
}
