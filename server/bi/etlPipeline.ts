/**
 * ETL Pipeline para Data Warehouse BI
 * Extrai dados operacionais e carrega no warehouse em schema estrela
 */

import { createClient } from '@/lib/supabase/server';

export interface ETLStatus {
  nome_pipeline: string;
  inicio: Date;
  fim?: Date;
  status: 'executando' | 'sucesso' | 'erro';
  registros_processados: number;
  registros_carregados: number;
  tempo_execucao_ms?: number;
  erro?: string;
}

/**
 * Carregar dimensão de data (se não existir)
 */
export async function carregarDimData(): Promise<ETLStatus> {
  const status: ETLStatus = {
    nome_pipeline: 'carregar_dim_data',
    inicio: new Date(),
    status: 'executando',
    registros_processados: 0,
    registros_carregados: 0,
  };

  try {
    const supabase = await createClient();

    // Gerar 5 anos de datas (para trás e para frente)
    const dataInicio = new Date();
    dataInicio.setFullYear(dataInicio.getFullYear() - 3);
    const dataFim = new Date();
    dataFim.setFullYear(dataFim.getFullYear() + 2);

    const datas: any[] = [];
    let dataAtual = new Date(dataInicio);

    while (dataAtual <= dataFim) {
      const ano = dataAtual.getFullYear();
      const mes = dataAtual.getMonth() + 1;
      const dia = dataAtual.getDate();
      const trimestre = Math.ceil(mes / 3);
      const semanaAno = Math.floor(
        (dataAtual.getTime() - new Date(ano, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
      ) + 1;
      const diaSemana = dataAtual.getDay() + 1; // 1-7 (domingo-sábado)

      const nomeMeses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
      ];
      const nomeDiasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

      const dataInicioMes = new Date(ano, mes - 1, 1);
      const dataFimMes = new Date(ano, mes, 0);

      datas.push({
        data_completa: dataAtual.toISOString().split('T')[0],
        ano,
        mes,
        dia,
        trimestre,
        semana_ano: semanaAno,
        dia_semana: diaSemana,
        nome_mes: nomeMeses[mes - 1],
        nome_dia_semana: nomeDiasSemana[diaSemana - 1],
        eh_fim_de_semana: diaSemana >= 6,
        eh_feriado: false, // TODO: carregar feriados
        data_inicio_mes: dataInicioMes.toISOString().split('T')[0],
        data_fim_mes: dataFimMes.toISOString().split('T')[0],
      });

      dataAtual.setDate(dataAtual.getDate() + 1);
    }

    status.registros_processados = datas.length;

    // Inserir em batch
    const { error: erroInsert } = await supabase.from('dim_data').upsert(datas, {
      onConflict: 'data_completa',
    });

    if (erroInsert) throw erroInsert;

    status.registros_carregados = datas.length;
    status.status = 'sucesso';
  } catch (erro) {
    status.status = 'erro';
    status.erro = erro instanceof Error ? erro.message : 'Erro desconhecido';
  }

  status.fim = new Date();
  status.tempo_execucao_ms = status.fim.getTime() - status.inicio.getTime();
  return status;
}

/**
 * Carregar dimensão de prestador
 */
export async function carregarDimPrestador(): Promise<ETLStatus> {
  const status: ETLStatus = {
    nome_pipeline: 'carregar_dim_prestador',
    inicio: new Date(),
    status: 'executando',
    registros_processados: 0,
    registros_carregados: 0,
  };

  try {
    const supabase = await createClient();

    // Buscar prestadores
    const { data: prestadores, error: erroFetch } = await supabase
      .from('prestadores_servico')
      .select('id, nome_completo, email, telefone, status, data_inicio');

    if (erroFetch) throw erroFetch;

    status.registros_processados = prestadores?.length || 0;

    if (!prestadores || prestadores.length === 0) {
      status.status = 'sucesso';
      status.fim = new Date();
      status.tempo_execucao_ms = status.fim.getTime() - status.inicio.getTime();
      return status;
    }

    // Transformar para dimensão
    const dimPrestadores = prestadores.map((p) => ({
      prestador_id: p.id,
      nome_completo: p.nome_completo,
      email: p.email,
      telefone: p.telefone,
      status: p.status || 'ativo',
      data_inicio: p.data_inicio,
      data_fim: null,
      is_current: true,
    }));

    // Inserir
    const { error: erroInsert } = await supabase.from('dim_prestador').upsert(dimPrestadores, {
      onConflict: 'prestador_id',
    });

    if (erroInsert) throw erroInsert;

    status.registros_carregados = dimPrestadores.length;
    status.status = 'sucesso';
  } catch (erro) {
    status.status = 'erro';
    status.erro = erro instanceof Error ? erro.message : 'Erro desconhecido';
  }

  status.fim = new Date();
  status.tempo_execucao_ms = status.fim.getTime() - status.inicio.getTime();
  return status;
}

/**
 * Carregar fact table de apontamentos
 */
export async function carregarFactApontamento(): Promise<ETLStatus> {
  const status: ETLStatus = {
    nome_pipeline: 'carregar_fact_apontamento',
    inicio: new Date(),
    status: 'executando',
    registros_processados: 0,
    registros_carregados: 0,
  };

  try {
    const supabase = await createClient();

    // Buscar apontamentos do último mês
    const dataInicio = new Date();
    dataInicio.setMonth(dataInicio.getMonth() - 1);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];

    const { data: apontamentos, error: erroFetch } = await supabase
      .from('apontamentos_prestador')
      .select(
        `
        id,
        data,
        horas_trabalhadas,
        contrato_id,
        foi_importado_retroativo,
        contratos_prestador (
          id,
          prestador_id,
          valor_hora_padrao
        ),
        apontamento_custos (
          ordem_servico_id,
          valor_total
        )
      `
      )
      .gte('data', dataInicioStr);

    if (erroFetch) throw erroFetch;

    status.registros_processados = apontamentos?.length || 0;

    if (!apontamentos || apontamentos.length === 0) {
      status.status = 'sucesso';
      status.fim = new Date();
      status.tempo_execucao_ms = status.fim.getTime() - status.inicio.getTime();
      return status;
    }

    // Buscar SKs para os apontamentos
    const { data: dataSks } = await supabase
      .from('dim_data')
      .select('data_sk, data_completa')
      .in(
        'data_completa',
        apontamentos.map((a) => a.data)
      );

    const dataSksMap = new Map(dataSks?.map((d) => [d.data_completa, d.data_sk]) || []);

    const { data: prestadorSks } = await supabase
      .from('dim_prestador')
      .select('prestador_sk, prestador_id')
      .eq('is_current', true);

    const prestadorSksMap = new Map(
      prestadorSks?.map((p) => [p.prestador_id, p.prestador_sk]) || []
    );

    // Transformar
    const factApontamentos = apontamentos
      .map((a) => {
        const prestadorSk = prestadorSksMap.get(a.contratos_prestador?.prestador_id);
        const dataSk = dataSksMap.get(a.data);

        if (!prestadorSk || !dataSk) return null;

        return {
          apontamento_id: a.id,
          prestador_sk: prestadorSk,
          contrato_id: a.contrato_id,
          residencial_sk: null, // TODO: buscar de apontamentos_residencial_detalhe
          data_sk: dataSk,
          horas_trabalhadas: a.horas_trabalhadas,
          valor_hora: a.contratos_prestador?.valor_hora_padrao || 0,
          valor_total: (a.horas_trabalhadas || 0) * (a.contratos_prestador?.valor_hora_padrao || 0),
          foi_rateado: a.apontamento_custos?.length > 0,
          foi_anomalia: false, // TODO: buscar de análise ML
          status: 'processado',
          foi_importado_retroativo: a.foi_importado_retroativo,
        };
      })
      .filter((a) => a !== null);

    status.registros_carregados = factApontamentos.length;

    // Inserir
    const { error: erroInsert } = await supabase.from('fact_apontamento').upsert(factApontamentos, {
      onConflict: 'apontamento_id',
    });

    if (erroInsert) throw erroInsert;

    status.status = 'sucesso';
  } catch (erro) {
    status.status = 'erro';
    status.erro = erro instanceof Error ? erro.message : 'Erro desconhecido';
  }

  status.fim = new Date();
  status.tempo_execucao_ms = status.fim.getTime() - status.inicio.getTime();
  return status;
}

/**
 * Carregar fact table de faturamento
 */
export async function carregarFactFaturamento(): Promise<ETLStatus> {
  const status: ETLStatus = {
    nome_pipeline: 'carregar_fact_faturamento',
    inicio: new Date(),
    status: 'executando',
    registros_processados: 0,
    registros_carregados: 0,
  };

  try {
    const supabase = await createClient();

    const { data: faturas, error: erroFetch } = await supabase
      .from('faturas')
      .select(
        `
        id,
        data_inicio,
        data_fim,
        valor_bruto,
        total_deducoes,
        valor_liquido,
        status,
        data_emissao,
        data_vencimento,
        data_pagamento,
        numero_apontamentos
      `
      )
      .eq('status', 'paga')
      .limit(10000); // Últimas 10k faturas pagas

    if (erroFetch) throw erroFetch;

    status.registros_processados = faturas?.length || 0;

    if (!faturas || faturas.length === 0) {
      status.status = 'sucesso';
      status.fim = new Date();
      status.tempo_execucao_ms = status.fim.getTime() - status.inicio.getTime();
      return status;
    }

    // Buscar SKs
    const { data: dataSks } = await supabase.from('dim_data').select('data_sk, data_completa');
    const dataSksMap = new Map(dataSks?.map((d) => [d.data_completa, d.data_sk]) || []);

    // Transformar
    const factFaturas = faturas
      .map((f) => {
        const dataInicioSk = dataSksMap.get(f.data_inicio);

        if (!dataInicioSk) return null;

        const competencia = new Date(f.data_inicio);
        return {
          fatura_id: f.id,
          residencial_sk: null, // TODO
          contrato_sk: null, // TODO
          data_sk: dataInicioSk,
          competencia_mes: competencia.getMonth() + 1,
          competencia_ano: competencia.getFullYear(),
          valor_bruto: f.valor_bruto,
          total_deducoes: f.total_deducoes,
          valor_liquido: f.valor_liquido,
          status_fatura: f.status,
          data_emissao: f.data_emissao,
          data_vencimento: f.data_vencimento,
          data_pagamento: f.data_pagamento,
          apontamentos_count: f.numero_apontamentos,
        };
      })
      .filter((f) => f !== null);

    status.registros_carregados = factFaturas.length;

    const { error: erroInsert } = await supabase.from('fact_faturamento').upsert(factFaturas, {
      onConflict: 'fatura_id',
    });

    if (erroInsert) throw erroInsert;

    status.status = 'sucesso';
  } catch (erro) {
    status.status = 'erro';
    status.erro = erro instanceof Error ? erro.message : 'Erro desconhecido';
  }

  status.fim = new Date();
  status.tempo_execucao_ms = status.fim.getTime() - status.inicio.getTime();
  return status;
}

/**
 * Executar pipeline completo
 */
export async function executarPipelineCompleto(): Promise<ETLStatus[]> {
  const resultados: ETLStatus[] = [];

  console.log('🚀 Iniciando ETL Pipeline...');

  // Executar sequencialmente (algumas dependem de outras)
  resultados.push(await carregarDimData());
  resultados.push(await carregarDimPrestador());
  resultados.push(await carregarFactApontamento());
  resultados.push(await carregarFactFaturamento());

  console.log('✅ Pipeline completo:');
  resultados.forEach((r) => {
    console.log(`  ${r.nome_pipeline}: ${r.status} (${r.registros_carregados} registros)`);
  });

  return resultados;
}
