// Lógica de cadastro de imóvel separada da Server Action (actions.ts) de
// propósito: `redirect()` do Next.js só funciona dentro do runtime de uma
// requisição real, então testar a Server Action diretamente num script não
// é confiável. Esta função faz a parte que importa testar (validação +
// insert) e é uma função comum, importável de qualquer teste.
import type { Pool } from 'pg';

export interface DadosNovoImovel {
  identificacao: string;
  tipo: string;
  cidadeId: string;
  residencialId?: string | null;
  endereco?: string | null;
  permiteColiving?: boolean;
  valorAvaliacao?: number | null;
}

export type ResultadoCadastro = { sucesso: true; id: string } | { sucesso: false; erro: string };

const TIPOS_VALIDOS = new Set(['kitnet', 'apartamento', 'sala_comercial', 'casa']);

export async function inserirImovel(pool: Pool, dados: DadosNovoImovel): Promise<ResultadoCadastro> {
  const identificacao = dados.identificacao.trim();

  if (!identificacao) {
    return { sucesso: false, erro: 'Informe a identificação do imóvel (ex.: "Kitnet 14").' };
  }
  if (!TIPOS_VALIDOS.has(dados.tipo)) {
    return { sucesso: false, erro: 'Selecione um tipo de imóvel válido.' };
  }
  if (!dados.cidadeId) {
    return { sucesso: false, erro: 'Selecione a cidade.' };
  }
  if (dados.valorAvaliacao !== null && dados.valorAvaliacao !== undefined && !(dados.valorAvaliacao >= 0)) {
    return { sucesso: false, erro: 'Valor de avaliação deve ser zero ou positivo.' };
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
      `insert into imoveis (identificacao, tipo, cidade_id, residencial_id, endereco, permite_coliving, valor_avaliacao)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        identificacao,
        dados.tipo,
        dados.cidadeId,
        dados.residencialId ?? null,
        dados.endereco?.trim() || null,
        dados.permiteColiving ?? false,
        dados.valorAvaliacao ?? null,
      ],
    );
    return { sucesso: true, id: rows[0].id };
  } catch (e) {
    return { sucesso: false, erro: `Não foi possível salvar: ${e instanceof Error ? e.message : 'erro desconhecido'}` };
  }
}
