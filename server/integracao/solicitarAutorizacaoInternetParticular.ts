// Pedido administrativo de autorização para instalar internet particular
// (distinta da rede wi-fi coletiva já provida pelo condomínio/residencial
// — Anexo IV, item 3). Abre um chamado de natureza 'contratual' (é uma
// autorização, quem decide é a gestão, não um SLA de manutenção física) e
// devolve, se já cadastrada, a orientação técnica de como instalar sem
// dano à estrutura daquele imóvel específico (imoveis.orientacoes_
// instalacao_internet — schema seção 26.3). Esse texto não é gerado por
// código: é informação física de cada prédio (fiação, rack, se pode
// furar parede), então a função nunca inventa conteúdo — só avisa quando
// ainda não foi cadastrado.

import type { Pool, PoolClient } from 'pg';
import { abrirChamado } from './abrirChamado';

export interface SolicitarAutorizacaoInternetParticularInput {
  pessoaId: string;
  imovelId: string;
  provedorPretendido?: string;
}

export interface ResultadoSolicitarAutorizacaoInternetParticular {
  ordemServicoId: string;
  protocolo: string;
  /** null quando a orientação técnica deste imóvel ainda não foi cadastrada pelo admin. */
  orientacoesInstalacao: string | null;
}

export async function solicitarAutorizacaoInternetParticular(
  pool: Pool | PoolClient,
  input: SolicitarAutorizacaoInternetParticularInput,
): Promise<ResultadoSolicitarAutorizacaoInternetParticular> {
  const chamado = await abrirChamado(pool, {
    pessoaId: input.pessoaId,
    imovelId: input.imovelId,
    natureza: 'contratual',
    categoria: 'autorizacao_internet_particular',
    descricao: input.provedorPretendido
      ? `Pedido de autorização para internet particular — provedor pretendido: ${input.provedorPretendido}`
      : 'Pedido de autorização para internet particular',
  });

  const { rows } = await pool.query<{ orientacoes_instalacao_internet: string | null }>(
    `select orientacoes_instalacao_internet from imoveis where id = $1`,
    [input.imovelId],
  );

  return {
    ordemServicoId: chamado.ordemServicoId,
    protocolo: chamado.protocolo,
    orientacoesInstalacao: rows[0]?.orientacoes_instalacao_internet ?? null,
  };
}
