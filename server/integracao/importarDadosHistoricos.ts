/**
 * Importação de dados históricos e migração retroativa
 * Permite importar dados de 01/2023 a 06/2026
 * Task #53
 */

import { createClient } from '@/lib/supabase/server';

export interface DadosApontamentoHistorico {
  prestador_id: string;
  data: string;
  horas_trabalhadas: number;
  valor_hora?: number;
  descricao?: string;
  residenciais?: string[];
}

export interface DadosFechamentoHistorico {
  prestador_id: string;
  competencia_inicio: string;
  competencia_fim: string;
  valor_diarias: number;
  valor_horas_adicionais: number;
  valor_deslocamentos: number;
  status: 'pago' | 'pendente';
  data_pagamento?: string;
}

export interface DadosOrdemServicoHistorica {
  categoria: string;
  descricao?: string;
  imovel_id?: string;
  residencial_id?: string;
  prestador_id?: string;
  status: 'concluido' | 'cancelado';
  criado_em: string;
  atualizado_em: string;
}

/**
 * Importar apontamentos históricos
 */
export async function importarApontamentosHistoricos(
  dados: DadosApontamentoHistorico[]
): Promise<{
  sucesso: boolean;
  importados: number;
  erros: string[];
}> {
  const supabase = await createClient();
  const erros: string[] = [];
  let importados = 0;

  try {
    for (const dado of dados) {
      try {
        // Validar data
        const data = new Date(dado.data);
        if (isNaN(data.getTime())) {
          erros.push(`Apontamento: Data inválida - ${dado.data}`);
          continue;
        }

        // Buscar prestador
        const { data: prestador, error: erroPrestador } = await supabase
          .from('prestadores_servico')
          .select('id')
          .eq('pessoa_id', dado.prestador_id)
          .single();

        if (erroPrestador || !prestador) {
          erros.push(`Apontamento: Prestador não encontrado - ${dado.prestador_id}`);
          continue;
        }

        // Buscar contrato ativo
        const { data: contrato, error: erroContrato } = await supabase
          .from('contratos_prestador')
          .select('id')
          .eq('prestador_id', prestador.id)
          .eq('status', 'ativo')
          .limit(1)
          .single();

        if (erroContrato || !contrato) {
          erros.push(
            `Apontamento (${dado.data}): Nenhum contrato ativo para prestador ${dado.prestador_id}`
          );
          continue;
        }

        // Inserir apontamento
        const { error: erroInsert } = await supabase
          .from('apontamentos_prestador')
          .insert({
            contrato_id: contrato.id,
            data: dado.data,
            horas_trabalhadas: dado.horas_trabalhadas,
            descricao_atividades: dado.descricao,
            residenciais_ids: dado.residenciais?.join(','),
            foi_importado_retroativo: true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          });

        if (erroInsert) {
          erros.push(`Apontamento (${dado.data}): ${erroInsert.message}`);
          continue;
        }

        importados++;
      } catch (erro) {
        erros.push(
          `Apontamento: Erro inesperado - ${erro instanceof Error ? erro.message : 'desconhecido'}`
        );
      }
    }

    return { sucesso: erros.length === 0, importados, erros };
  } catch (erro) {
    console.error('Erro ao importar apontamentos históricos:', erro);
    return {
      sucesso: false,
      importados: 0,
      erros: [`Erro geral: ${erro instanceof Error ? erro.message : 'desconhecido'}`],
    };
  }
}

/**
 * Importar fechamentos históricos
 */
export async function importarFechamentosHistoricos(
  dados: DadosFechamentoHistorico[]
): Promise<{
  sucesso: boolean;
  importados: number;
  erros: string[];
}> {
  const supabase = await createClient();
  const erros: string[] = [];
  let importados = 0;

  try {
    for (const dado of dados) {
      try {
        // Buscar prestador
        const { data: prestador, error: erroPrestador } = await supabase
          .from('prestadores_servico')
          .select('id')
          .eq('pessoa_id', dado.prestador_id)
          .single();

        if (erroPrestador || !prestador) {
          erros.push(`Fechamento: Prestador não encontrado - ${dado.prestador_id}`);
          continue;
        }

        // Buscar contrato
        const { data: contrato, error: erroContrato } = await supabase
          .from('contratos_prestador')
          .select('id')
          .eq('prestador_id', prestador.id)
          .limit(1)
          .single();

        if (erroContrato || !contrato) {
          erros.push(`Fechamento (${dado.competencia_inicio}): Contrato não encontrado`);
          continue;
        }

        // Calcular valores
        const totalProventos =
          dado.valor_diarias +
          dado.valor_horas_adicionais +
          dado.valor_deslocamentos;
        const valorLiquido = totalProventos;

        // Inserir fechamento
        const { error: erroInsert } = await supabase
          .from('fechamentos_prestador')
          .insert({
            contrato_id: contrato.id,
            data_inicio: dado.competencia_inicio,
            data_fim: dado.competencia_fim,
            frequencia: 'mensal',
            valor_diarias: dado.valor_diarias,
            valor_horas_adicionais: dado.valor_horas_adicionais,
            valor_deslocamentos: dado.valor_deslocamentos,
            total_proventos: totalProventos,
            total_deducoes: 0,
            valor_liquido: valorLiquido,
            status: dado.status === 'pago' ? 'pago' : 'rascunho',
            data_pagamento: dado.data_pagamento,
            foi_importado_retroativo: true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          });

        if (erroInsert) {
          erros.push(`Fechamento (${dado.competencia_inicio}): ${erroInsert.message}`);
          continue;
        }

        importados++;
      } catch (erro) {
        erros.push(
          `Fechamento: Erro inesperado - ${erro instanceof Error ? erro.message : 'desconhecido'}`
        );
      }
    }

    return { sucesso: erros.length === 0, importados, erros };
  } catch (erro) {
    console.error('Erro ao importar fechamentos históricos:', erro);
    return {
      sucesso: false,
      importados: 0,
      erros: [`Erro geral: ${erro instanceof Error ? erro.message : 'desconhecido'}`],
    };
  }
}

/**
 * Importar ordens de serviço histórica
 */
export async function importarOrdensServicoHistoricas(
  dados: DadosOrdemServicoHistorica[]
): Promise<{
  sucesso: boolean;
  importados: number;
  erros: string[];
}> {
  const supabase = await createClient();
  const erros: string[] = [];
  let importados = 0;

  try {
    for (const dado of dados) {
      try {
        // Inserir OS
        const { error: erroInsert } = await supabase
          .from('ordens_servico')
          .insert({
            categoria: dado.categoria,
            descricao: dado.descricao,
            imovel_id: dado.imovel_id,
            residencial_id: dado.residencial_id,
            prestador_id: dado.prestador_id,
            status: dado.status,
            urgencia: 'media',
            criado_em: dado.criado_em,
            atualizado_em: dado.atualizado_em,
          });

        if (erroInsert) {
          erros.push(`OS (${dado.categoria}): ${erroInsert.message}`);
          continue;
        }

        importados++;
      } catch (erro) {
        erros.push(
          `OS: Erro inesperado - ${erro instanceof Error ? erro.message : 'desconhecido'}`
        );
      }
    }

    return { sucesso: erros.length === 0, importados, erros };
  } catch (erro) {
    console.error('Erro ao importar OS histórica:', erro);
    return {
      sucesso: false,
      importados: 0,
      erros: [`Erro geral: ${erro instanceof Error ? erro.message : 'desconhecido'}`],
    };
  }
}

/**
 * Importar dados de arquivo CSV/JSON
 * Formato esperado: JSON array com dados estruturados
 */
export async function importarDadosDoArquivo(
  arquivo: File,
  tipo: 'apontamentos' | 'fechamentos' | 'ordens_servico'
): Promise<{
  sucesso: boolean;
  importados: number;
  erros: string[];
}> {
  try {
    const conteudo = await arquivo.text();
    const dados = JSON.parse(conteudo);

    if (!Array.isArray(dados)) {
      return {
        sucesso: false,
        importados: 0,
        erros: ['Arquivo deve conter um array JSON'],
      };
    }

    switch (tipo) {
      case 'apontamentos':
        return await importarApontamentosHistoricos(dados);
      case 'fechamentos':
        return await importarFechamentosHistoricos(dados);
      case 'ordens_servico':
        return await importarOrdensServicoHistoricas(dados);
      default:
        return {
          sucesso: false,
          importados: 0,
          erros: ['Tipo de importação não reconhecido'],
        };
    }
  } catch (erro) {
    console.error('Erro ao processar arquivo:', erro);
    return {
      sucesso: false,
      importados: 0,
      erros: [
        `Erro ao processar arquivo: ${erro instanceof Error ? erro.message : 'desconhecido'}`,
      ],
    };
  }
}

/**
 * Gerar template de exemplo para importação
 */
export function gerarTemplateImportacao(
  tipo: 'apontamentos' | 'fechamentos' | 'ordens_servico'
): string {
  const templates = {
    apontamentos: [
      {
        prestador_id: 'uuid-prestador-1',
        data: '2023-01-15',
        horas_trabalhadas: 8,
        valor_hora: 50,
        descricao: 'Manutenção predial',
        residenciais: ['uuid-residencial-1', 'uuid-residencial-2'],
      },
    ],
    fechamentos: [
      {
        prestador_id: 'uuid-prestador-1',
        competencia_inicio: '2023-01-01',
        competencia_fim: '2023-01-31',
        valor_diarias: 1200,
        valor_horas_adicionais: 300,
        valor_deslocamentos: 150,
        status: 'pago',
        data_pagamento: '2023-02-05',
      },
    ],
    ordens_servico: [
      {
        categoria: 'Manutenção',
        descricao: 'Reparo em hidráulica',
        imovel_id: 'uuid-imovel-1',
        prestador_id: 'uuid-prestador-1',
        status: 'concluido',
        criado_em: '2023-01-10T09:00:00Z',
        atualizado_em: '2023-01-15T17:00:00Z',
      },
    ],
  };

  return JSON.stringify(templates[tipo], null, 2);
}
