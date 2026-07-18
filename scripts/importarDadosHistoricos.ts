#!/usr/bin/env node

/**
 * CLI para importação de dados históricos
 * Uso: npx ts-node scripts/importarDadosHistoricos.ts --tipo apontamentos --arquivo dados.json
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente SUPABASE não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface DadosApontamento {
  prestador_id: string;
  data: string;
  horas_trabalhadas: number;
  valor_hora?: number;
  descricao?: string;
  residenciais?: string[];
}

interface DadosFechamento {
  prestador_id: string;
  competencia_inicio: string;
  competencia_fim: string;
  valor_diarias: number;
  valor_horas_adicionais: number;
  valor_deslocamentos: number;
  status: 'pago' | 'pendente';
  data_pagamento?: string;
}

interface DadosOS {
  categoria: string;
  descricao?: string;
  imovel_id?: string;
  residencial_id?: string;
  prestador_id?: string;
  status: 'concluido' | 'cancelado';
  criado_em: string;
  atualizado_em: string;
}

async function importarApontamentos(dados: DadosApontamento[]) {
  console.log(`📊 Importando ${dados.length} apontamentos...`);
  const erros: string[] = [];
  let importados = 0;

  for (const dado of dados) {
    try {
      const dataObj = new Date(dado.data);
      if (isNaN(dataObj.getTime())) {
        erros.push(`Apontamento: Data inválida - ${dado.data}`);
        continue;
      }

      const { data: prestador, error: erroPrestador } = await supabase
        .from('prestadores_servico')
        .select('id')
        .eq('pessoa_id', dado.prestador_id)
        .single();

      if (erroPrestador || !prestador) {
        erros.push(`Apontamento: Prestador não encontrado - ${dado.prestador_id}`);
        continue;
      }

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
      console.log(`  ✓ Apontamento de ${dado.data} importado`);
    } catch (erro) {
      erros.push(
        `Apontamento: Erro inesperado - ${erro instanceof Error ? erro.message : 'desconhecido'}`
      );
    }
  }

  console.log(`✅ Importação concluída: ${importados} apontamentos, ${erros.length} erros`);
  if (erros.length > 0) {
    console.log('\n⚠️  Erros encontrados:');
    erros.forEach((erro) => console.log(`  - ${erro}`));
  }
  return { importados, erros };
}

async function importarFechamentos(dados: DadosFechamento[]) {
  console.log(`📊 Importando ${dados.length} fechamentos...`);
  const erros: string[] = [];
  let importados = 0;

  for (const dado of dados) {
    try {
      const { data: prestador, error: erroPrestador } = await supabase
        .from('prestadores_servico')
        .select('id')
        .eq('pessoa_id', dado.prestador_id)
        .single();

      if (erroPrestador || !prestador) {
        erros.push(`Fechamento: Prestador não encontrado - ${dado.prestador_id}`);
        continue;
      }

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

      const totalProventos =
        dado.valor_diarias +
        dado.valor_horas_adicionais +
        dado.valor_deslocamentos;

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
          valor_liquido: totalProventos,
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
      console.log(`  ✓ Fechamento ${dado.competencia_inicio} importado`);
    } catch (erro) {
      erros.push(
        `Fechamento: Erro inesperado - ${erro instanceof Error ? erro.message : 'desconhecido'}`
      );
    }
  }

  console.log(`✅ Importação concluída: ${importados} fechamentos, ${erros.length} erros`);
  if (erros.length > 0) {
    console.log('\n⚠️  Erros encontrados:');
    erros.forEach((erro) => console.log(`  - ${erro}`));
  }
  return { importados, erros };
}

async function importarOS(dados: DadosOS[]) {
  console.log(`📊 Importando ${dados.length} ordens de serviço...`);
  const erros: string[] = [];
  let importados = 0;

  for (const dado of dados) {
    try {
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
      console.log(`  ✓ OS ${dado.categoria} importada`);
    } catch (erro) {
      erros.push(
        `OS: Erro inesperado - ${erro instanceof Error ? erro.message : 'desconhecido'}`
      );
    }
  }

  console.log(`✅ Importação concluída: ${importados} OS, ${erros.length} erros`);
  if (erros.length > 0) {
    console.log('\n⚠️  Erros encontrados:');
    erros.forEach((erro) => console.log(`  - ${erro}`));
  }
  return { importados, erros };
}

async function main() {
  const args = process.argv.slice(2);
  const tipoIdx = args.indexOf('--tipo');
  const arquivoIdx = args.indexOf('--arquivo');

  if (tipoIdx === -1 || arquivoIdx === -1) {
    console.error(`
❌ Uso: npx ts-node scripts/importarDadosHistoricos.ts --tipo <tipo> --arquivo <caminho>

Tipos disponíveis:
  - apontamentos: Importar timesheets
  - fechamentos: Importar closings/payroll
  - ordens_servico: Importar service orders

Exemplo:
  npx ts-node scripts/importarDadosHistoricos.ts --tipo apontamentos --arquivo dados/apontamentos.json
    `);
    process.exit(1);
  }

  const tipo = args[tipoIdx + 1];
  const caminhoArquivo = args[arquivoIdx + 1];

  if (!fs.existsSync(caminhoArquivo)) {
    console.error(`❌ Arquivo não encontrado: ${caminhoArquivo}`);
    process.exit(1);
  }

  try {
    console.log(`\n🚀 Iniciando importação de dados históricos`);
    console.log(`  Tipo: ${tipo}`);
    console.log(`  Arquivo: ${caminhoArquivo}\n`);

    const conteudo = fs.readFileSync(caminhoArquivo, 'utf-8');
    const dados = JSON.parse(conteudo);

    if (!Array.isArray(dados)) {
      console.error('❌ Arquivo deve conter um array JSON');
      process.exit(1);
    }

    let resultado;
    switch (tipo) {
      case 'apontamentos':
        resultado = await importarApontamentos(dados as DadosApontamento[]);
        break;
      case 'fechamentos':
        resultado = await importarFechamentos(dados as DadosFechamento[]);
        break;
      case 'ordens_servico':
        resultado = await importarOS(dados as DadosOS[]);
        break;
      default:
        console.error(`❌ Tipo desconhecido: ${tipo}`);
        process.exit(1);
    }

    console.log(`\n✨ Importação finalizada com sucesso!`);
    process.exit(resultado.erros.length > 0 ? 1 : 0);
  } catch (erro) {
    console.error(
      `\n❌ Erro fatal: ${erro instanceof Error ? erro.message : 'desconhecido'}`
    );
    process.exit(1);
  }
}

main();
