// Cadastro de um interessado (candidato) em um quarto de coliving —
// substitui o formulário externo hoje hospedado fora do sistema
// (docs/39-modulo-coliving-triagem-e-matching-proposta.md). Ao gravar o
// perfil comportamental do candidato, busca automaticamente concorrentes de
// comparação (morador atual ou outro candidato pendente para outro quarto
// do mesmo imóvel) e calcula a compatibilidade contra cada um. Quando não
// há concorrente ainda (primeiro interessado num apartamento totalmente
// vago), só grava o perfil — fica "aguardando 2º interessado": o próximo
// candidato a se cadastrar para o mesmo imóvel já encontra este perfil e
// dispara o cálculo, sem cron nem reprocessamento em lote.

import type { Pool, PoolClient } from 'pg';
import { calcularCompatibilidade, type PerfilConvivencia, type QuadroAlergico, type NivelVetor } from '../coliving/calcularCompatibilidade';

export interface DadosPerfilConvivencia extends PerfilConvivencia {
  descricaoPet?: string | null;
  genero?: string | null;
  preferenciaGeneroConvivio?: 'mesmo_genero' | 'indiferente' | null;
  neurodivergencia?: string | null;
  pcd?: string | null;
  condicaoSaude?: string | null;
  quadroAlergicoDetalhe?: string | null;
}

export interface DadosInteresseColiving {
  nome: string;
  contato?: string | null;
  imovelInteresseId: string;
  comodoInteresseId: string;
  imovelInteresse2Id?: string | null;
  comodoInteresse2Id?: string | null;
  perfil: DadosPerfilConvivencia;
}

export interface ResultadoRegistrarInteresse {
  sucesso: boolean;
  erro?: string;
  leadId?: string;
  perfilId?: string;
  comparacoesGeradas?: string[];
}

interface PerfilConcorrente {
  perfilId: string;
  dados: PerfilConvivencia;
}

export async function registrarInteresseColiving(
  pool: Pool,
  dados: DadosInteresseColiving,
): Promise<ResultadoRegistrarInteresse> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('begin');

    const { rows: imovelRows } = await client.query<{ permite_coliving: boolean }>(
      `select permite_coliving from imoveis where id = $1`,
      [dados.imovelInteresseId],
    );
    if (!imovelRows[0]) {
      await client.query('rollback');
      return { sucesso: false, erro: 'Imóvel não encontrado' };
    }
    if (!imovelRows[0].permite_coliving) {
      await client.query('rollback');
      return { sucesso: false, erro: 'Este imóvel não está configurado para coliving' };
    }

    const { rows: comodoRows } = await client.query<{ id: string }>(
      `select id from comodos where id = $1 and imovel_id = $2 and ativo`,
      [dados.comodoInteresseId, dados.imovelInteresseId],
    );
    if (!comodoRows[0]) {
      await client.query('rollback');
      return { sucesso: false, erro: 'Quarto não encontrado neste imóvel' };
    }

    const { rows: leadRows } = await client.query<{ id: string }>(
      `insert into leads (nome, contato, origem, imovel_interesse_id, comodo_interesse_id, imovel_interesse_2_id, comodo_interesse_2_id, status)
       values ($1, $2, 'coliving', $3, $4, $5, $6, 'novo')
       returning id`,
      [
        dados.nome,
        dados.contato ?? null,
        dados.imovelInteresseId,
        dados.comodoInteresseId,
        dados.imovelInteresse2Id ?? null,
        dados.comodoInteresse2Id ?? null,
      ],
    );
    const leadId = leadRows[0].id;

    const p = dados.perfil;
    const { rows: perfilRows } = await client.query<{ id: string }>(
      `insert into perfis_convivencia
         (lead_id, v1_limpeza, v2_ruido, v3_rotina, v4_fumo, v5_pets, v6_dieta, v7_conflito,
          tem_pet, descricao_pet, genero, preferencia_genero_convivio, neurodivergencia, pcd,
          condicao_saude, quadro_alergico, quadro_alergico_detalhe)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       returning id`,
      [
        leadId,
        p.v1Limpeza,
        p.v2Ruido,
        p.v3Rotina,
        p.v4Fumo,
        p.v5Pets,
        p.v6Dieta,
        p.v7Conflito,
        p.temPet,
        p.descricaoPet ?? null,
        p.genero ?? null,
        p.preferenciaGeneroConvivio ?? null,
        p.neurodivergencia ?? null,
        p.pcd ?? null,
        p.condicaoSaude ?? null,
        p.quadroAlergico,
        p.quadroAlergicoDetalhe ?? null,
      ],
    );
    const perfilId = perfilRows[0].id;

    const concorrentes = await buscarConcorrentes(client, dados.imovelInteresseId, dados.comodoInteresseId, leadId);

    const comparacoesGeradas: string[] = [];
    for (const concorrente of concorrentes) {
      const resultado = calcularCompatibilidade(p, concorrente.dados);
      const [perfilAId, perfilBId] = [perfilId, concorrente.perfilId].sort();

      const { rows: compatRows } = await client.query<{ id: string }>(
        `insert into compatibilidades_coliving
           (imovel_id, perfil_a_id, perfil_b_id, score_geral, pontos_atrito, alertas_criticos, status)
         values ($1, $2, $3, $4, $5, $6, 'calculado')
         on conflict (perfil_a_id, perfil_b_id) do nothing
         returning id`,
        [
          dados.imovelInteresseId,
          perfilAId,
          perfilBId,
          resultado.scoreGeral,
          JSON.stringify(resultado.pontosAtrito),
          JSON.stringify(resultado.alertasCriticos),
        ],
      );
      if (compatRows[0]) comparacoesGeradas.push(compatRows[0].id);
    }

    await client.query('commit');
    return { sucesso: true, leadId, perfilId, comparacoesGeradas };
  } catch (erro) {
    await client.query('rollback');
    return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro ao registrar interesse em coliving' };
  } finally {
    client.release();
  }
}

// Concorrentes de comparação: quem já mora (contrato ativo) ou está
// candidatando (lead pendente) a QUALQUER OUTRO quarto do mesmo imóvel —
// futuros colegas de convivência, não candidatos ao mesmo quarto.
async function buscarConcorrentes(
  client: PoolClient,
  imovelId: string,
  comodoId: string,
  leadIdAtual: string,
): Promise<PerfilConcorrente[]> {
  const { rows: moradores } = await client.query<PerfilConcorrenteRow>(
    `select pc.id as perfil_id, pc.v1_limpeza, pc.v2_ruido, pc.v3_rotina, pc.v4_fumo, pc.v5_pets,
            pc.v6_dieta, pc.v7_conflito, pc.tem_pet, pc.quadro_alergico
     from contratos c
     join comodos co on co.id = c.comodo_id
     join contrato_partes cp on cp.contrato_id = c.id and cp.papel in ('locatario_principal', 'locatario_adicional')
     join perfis_convivencia pc on pc.pessoa_id = cp.pessoa_id
     where co.imovel_id = $1 and co.id <> $2 and c.status = 'ativo'`,
    [imovelId, comodoId],
  );

  const { rows: candidatos } = await client.query<PerfilConcorrenteRow>(
    `select pc.id as perfil_id, pc.v1_limpeza, pc.v2_ruido, pc.v3_rotina, pc.v4_fumo, pc.v5_pets,
            pc.v6_dieta, pc.v7_conflito, pc.tem_pet, pc.quadro_alergico
     from leads l
     join perfis_convivencia pc on pc.lead_id = l.id
     where l.imovel_interesse_id = $1 and l.comodo_interesse_id <> $2 and l.id <> $3
       and l.status not in ('reprovado', 'contrato_assinado')`,
    [imovelId, comodoId, leadIdAtual],
  );

  return [...moradores, ...candidatos].map(linhaParaPerfil);
}

interface PerfilConcorrenteRow {
  perfil_id: string;
  v1_limpeza: NivelVetor;
  v2_ruido: NivelVetor;
  v3_rotina: NivelVetor;
  v4_fumo: NivelVetor;
  v5_pets: NivelVetor;
  v6_dieta: NivelVetor;
  v7_conflito: NivelVetor;
  tem_pet: boolean;
  quadro_alergico: QuadroAlergico;
}

function linhaParaPerfil(linha: PerfilConcorrenteRow): PerfilConcorrente {
  return {
    perfilId: linha.perfil_id,
    dados: {
      v1Limpeza: linha.v1_limpeza,
      v2Ruido: linha.v2_ruido,
      v3Rotina: linha.v3_rotina,
      v4Fumo: linha.v4_fumo,
      v5Pets: linha.v5_pets,
      v6Dieta: linha.v6_dieta,
      v7Conflito: linha.v7_conflito,
      temPet: linha.tem_pet,
      quadroAlergico: linha.quadro_alergico,
    },
  };
}
