'use server';

import { redirect } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { abrirChamado, ChamadoInvalidoError, type NaturezaChamado, type UrgenciaChamado } from '@/server/integracao/abrirChamado';
import { solicitarChaveReserva } from '@/server/integracao/solicitarChaveReserva';
import { solicitarImagensCameras, SolicitacaoImagensCamerasInvalidaError } from '@/server/integracao/solicitarImagensCameras';
import { solicitarAutorizacaoInternetParticular } from '@/server/integracao/solicitarAutorizacaoInternetParticular';

export interface EstadoFormularioSolicitacao {
  erro?: string;
}

const NATUREZAS: NaturezaChamado[] = ['emergencia', 'financeiro', 'contratual', 'manutencao', 'juridico'];
const URGENCIAS: UrgenciaChamado[] = ['baixa', 'media', 'alta', 'urgente'];

// Enquanto não existe portal de autenticação do inquilino (bloqueio
// documentado desde docs/09), quem abre a solicitação aqui é a gestão em
// nome do inquilino (telefone/WhatsApp) — mesmo padrão já usado em
// app/quebras-contrato. O locatário principal do contrato ativo escolhido
// é sempre o `pessoaId` de quem abre, nunca informado à mão pelo
// formulário, para não permitir abrir chamado em nome de qualquer pessoa.
export async function criarSolicitacao(
  _estadoAnterior: EstadoFormularioSolicitacao,
  formData: FormData,
): Promise<EstadoFormularioSolicitacao> {
  const contratoId = String(formData.get('contrato_id') ?? '');
  if (!contratoId) {
    return { erro: 'Selecione o imóvel/locatário.' };
  }

  const pool = obterPool();
  const { rows } = await pool.query<{ imovel_id: string; pessoa_id: string }>(
    `select c.imovel_id, cp.pessoa_id
     from contratos c
     join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
     where c.id = $1 and c.status = 'ativo'`,
    [contratoId],
  );
  if (rows.length === 0) {
    return { erro: 'Contrato não encontrado ou não está mais ativo.' };
  }
  const { imovel_id: imovelId, pessoa_id: pessoaId } = rows[0];

  const tipo = String(formData.get('tipo') ?? '');

  try {
    switch (tipo) {
      case 'geral': {
        const natureza = String(formData.get('natureza') ?? '');
        if (!NATUREZAS.includes(natureza as NaturezaChamado)) {
          return { erro: 'Selecione a natureza do chamado.' };
        }
        const categoria = String(formData.get('categoria') ?? '').trim();
        if (!categoria) {
          return { erro: 'Categoria é obrigatória.' };
        }
        const urgenciaInformada = String(formData.get('urgencia') ?? '');
        await abrirChamado(pool, {
          pessoaId,
          imovelId,
          natureza: natureza as NaturezaChamado,
          categoria,
          descricao: String(formData.get('descricao') ?? '').trim() || undefined,
          urgencia: URGENCIAS.includes(urgenciaInformada as UrgenciaChamado) ? (urgenciaInformada as UrgenciaChamado) : undefined,
        });
        break;
      }
      case 'chave_reserva':
        await solicitarChaveReserva(pool, {
          pessoaId,
          imovelId,
          contratoId,
          motivo: String(formData.get('motivo') ?? '').trim() || undefined,
        });
        break;
      case 'imagens_cameras':
        await solicitarImagensCameras(pool, {
          pessoaId,
          imovelId,
          dataSolicitada: String(formData.get('data_solicitada') ?? ''),
          horarioSolicitado: String(formData.get('horario_solicitado') ?? ''),
          justificativa: String(formData.get('justificativa') ?? ''),
        });
        break;
      case 'internet_particular':
        await solicitarAutorizacaoInternetParticular(pool, {
          pessoaId,
          imovelId,
          provedorPretendido: String(formData.get('provedor_pretendido') ?? '').trim() || undefined,
        });
        break;
      default:
        return { erro: 'Selecione o tipo de solicitação.' };
    }
  } catch (erro) {
    if (erro instanceof ChamadoInvalidoError || erro instanceof SolicitacaoImagensCamerasInvalidaError) {
      return { erro: erro.message };
    }
    return { erro: erro instanceof Error ? erro.message : 'Não foi possível abrir a solicitação.' };
  }

  redirect('/ordens-servico');
}
