'use server';

import Anthropic from '@anthropic-ai/sdk';
import { obterPool } from '@/server/integracao/db';

const client = new Anthropic();

interface DadosExtraidosContrato {
  numero_contrato?: string;
  valor_aluguel?: number;
  valor_caucao?: number;
  valor_taxa_condominio?: number;
  valor_iptu?: number;
  valor_seguro?: number;
  valor_agua_esgoto?: number;
  valor_luz?: number;
  valor_outras_despesas?: number;
  indice_reajuste?: string;
  percentual_reajuste?: number;
  data_inicio?: string;
  data_fim?: string;
  periodo_reajuste?: string;
  nome_inquilino?: string;
  nome_proprietario?: string;
  endereco_imovel?: string;
  restricoes_importantes?: string[];
  multa_rescisoria?: number;
  taxa_adm?: number;
  observacoes?: string;
}

interface ResultadoAnaliseContrato {
  sucesso: boolean;
  confianca: number;
  dados_extraidos: DadosExtraidosContrato;
  alertas: string[];
  recomendacoes: string[];
  campos_incertos: string[];
  resume_executivo: string;
  analise_completa: string;
}

const PROMPT_ANALISE_CONTRATO = `Você é um especialista em análise de contratos de aluguel no Brasil, com conhecimento em Lei 8.245/91.

Analise o contrato de aluguel fornecido e extraia as seguintes informações:

1. **Dados Financeiros:**
   - Valor do aluguel mensal
   - Valor da caução
   - Taxa de condomínio
   - IPTU
   - Seguro do imóvel
   - Água/esgoto
   - Luz
   - Outras despesas obrigatórias
   - Multa por rescisão

2. **Prazos e Índices:**
   - Data de início
   - Data de término
   - Tipo de índice de reajuste (IPCA, INCC, IGP-M, etc)
   - Percentual de reajuste (se fixo)
   - Período de reajuste

3. **Partes:**
   - Nome do inquilino
   - Nome do proprietário
   - Endereço do imóvel

4. **Cláusulas Importantes:**
   - Restrições ao inquilino
   - Direitos e deveres
   - Multas por atraso
   - Cláusulas de rescisão
   - Renovação automática

5. **Análise de Conformidade com Lei 8.245/91:**
   - Verificar se todos os requisitos legais estão presentes
   - Identificar cláusulas abusivas
   - Alertas de conformidade

Forneça a resposta em JSON com a seguinte estrutura:
{
  "numero_contrato": "XXX",
  "valor_aluguel": 0,
  "valor_caucao": 0,
  "valor_taxa_condominio": 0,
  "valor_iptu": 0,
  "valor_seguro": 0,
  "valor_agua_esgoto": 0,
  "valor_luz": 0,
  "valor_outras_despesas": 0,
  "indice_reajuste": "IPCA",
  "percentual_reajuste": 0,
  "data_inicio": "YYYY-MM-DD",
  "data_fim": "YYYY-MM-DD",
  "periodo_reajuste": "anual",
  "nome_inquilino": "",
  "nome_proprietario": "",
  "endereco_imovel": "",
  "multa_rescisoria": 0,
  "taxa_adm": 0,
  "restricoes_importantes": [],
  "observacoes": ""
}

Também forneça:
- "alertas": lista de alertas de conformidade/risco
- "recomendacoes": lista de recomendações para o gestor
- "campos_incertos": lista de campos onde você não tem confiança total
- "resume_executivo": resumo de 2-3 frases sobre o contrato
- "nivel_confianca": número de 0 a 1 indicando confiança na extração`;

/**
 * Analisa contrato usando IA (Claude)
 */
export async function analisarContratoComIA(
  conteudo_markdown: string,
  nome_arquivo?: string
): Promise<ResultadoAnaliseContrato> {
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `${PROMPT_ANALISE_CONTRATO}\n\nArquivo: ${nome_arquivo || 'contrato.pdf'}\n\nConteúdo do contrato:\n\n${conteudo_markdown}`,
        },
      ],
    });

    const conteudo = response.content[0];
    if (conteudo.type !== 'text') {
      throw new Error('Resposta inesperada da IA');
    }

    // Extrair JSON da resposta
    const jsonMatch = conteudo.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Não foi possível extrair JSON da análise');
    }

    const analise = JSON.parse(jsonMatch[0]);

    return {
      sucesso: true,
      confianca: analise.nivel_confianca || 0.85,
      dados_extraidos: {
        numero_contrato: analise.numero_contrato,
        valor_aluguel: parseFloat(analise.valor_aluguel) || 0,
        valor_caucao: parseFloat(analise.valor_caucao) || 0,
        valor_taxa_condominio: parseFloat(analise.valor_taxa_condominio) || 0,
        valor_iptu: parseFloat(analise.valor_iptu) || 0,
        valor_seguro: parseFloat(analise.valor_seguro) || 0,
        valor_agua_esgoto: parseFloat(analise.valor_agua_esgoto) || 0,
        valor_luz: parseFloat(analise.valor_luz) || 0,
        valor_outras_despesas: parseFloat(analise.valor_outras_despesas) || 0,
        indice_reajuste: analise.indice_reajuste,
        percentual_reajuste: parseFloat(analise.percentual_reajuste) || 0,
        data_inicio: analise.data_inicio,
        data_fim: analise.data_fim,
        periodo_reajuste: analise.periodo_reajuste,
        nome_inquilino: analise.nome_inquilino,
        nome_proprietario: analise.nome_proprietario,
        endereco_imovel: analise.endereco_imovel,
        restricoes_importantes: analise.restricoes_importantes || [],
        multa_rescisoria: parseFloat(analise.multa_rescisoria) || 0,
        taxa_adm: parseFloat(analise.taxa_adm) || 0,
        observacoes: analise.observacoes,
      },
      alertas: analise.alertas || [],
      recomendacoes: analise.recomendacoes || [],
      campos_incertos: analise.campos_incertos || [],
      resume_executivo: analise.resume_executivo || '',
      analise_completa: conteudo.text,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao analisar contrato:', mensagem);
    throw new Error(`Falha na análise de IA: ${mensagem}`);
  }
}

/**
 * Calcula valores atualizados pelo IPCA
 */
export async function calcularValoresAtualizadosIPCA(
  valor_base: number,
  data_inicial: Date,
  data_final: Date = new Date(),
  tipo_indice: string = 'IPCA'
): Promise<{
  valor_inicial: number;
  valor_atualizado: number;
  percentual_acumulado: number;
  data_calculo: string;
}> {
  try {
    // Buscar índices históricos do banco de dados
    // Por enquanto, usar valores aproximados
    const meses = Math.floor(
      (data_final.getTime() - data_inicial.getTime()) / (30 * 24 * 60 * 60 * 1000)
    );

    // IPCA médio aproximado: 0.5% ao mês (simplificado)
    const taxa_mensal = 0.005;
    const percentual_acumulado = (Math.pow(1 + taxa_mensal, meses) - 1) * 100;
    const valor_atualizado = valor_base * (1 + percentual_acumulado / 100);

    return {
      valor_inicial: valor_base,
      valor_atualizado: Math.round(valor_atualizado * 100) / 100,
      percentual_acumulado: Math.round(percentual_acumulado * 100) / 100,
      data_calculo: data_final.toISOString().split('T')[0],
    };
  } catch (erro) {
    console.error('Erro ao calcular atualização IPCA:', erro);
    throw erro;
  }
}

/**
 * Gera checklist de validação
 */
export async function gerarChecklistValidacao(
  dados_extraidos: DadosExtraidosContrato
): Promise<
  Array<{
    campo: string;
    esperado: string;
    encontrado: string;
    validado: boolean;
  }>
> {
  const checklist = [
    {
      campo: 'Número do contrato',
      esperado: 'Deve existir',
      encontrado: dados_extraidos.numero_contrato || 'NÃO ENCONTRADO',
      validado: !!dados_extraidos.numero_contrato,
    },
    {
      campo: 'Valor do aluguel',
      esperado: '>0',
      encontrado: `R$ ${dados_extraidos.valor_aluguel || 0}`,
      validado: (dados_extraidos.valor_aluguel || 0) > 0,
    },
    {
      campo: 'Valor da caução',
      esperado: '>=0',
      encontrado: `R$ ${dados_extraidos.valor_caucao || 0}`,
      validado: (dados_extraidos.valor_caucao || 0) >= 0,
    },
    {
      campo: 'Data de início',
      esperado: 'Data válida',
      encontrado: dados_extraidos.data_inicio || 'NÃO ENCONTRADA',
      validado: !!dados_extraidos.data_inicio,
    },
    {
      campo: 'Data de término',
      esperado: 'Data válida',
      encontrado: dados_extraidos.data_fim || 'NÃO ENCONTRADA',
      validado: !!dados_extraidos.data_fim,
    },
    {
      campo: 'Nome do inquilino',
      esperado: 'Nome completo',
      encontrado: dados_extraidos.nome_inquilino || 'NÃO ENCONTRADO',
      validado: !!dados_extraidos.nome_inquilino,
    },
    {
      campo: 'Nome do proprietário',
      esperado: 'Nome completo',
      encontrado: dados_extraidos.nome_proprietario || 'NÃO ENCONTRADO',
      validado: !!dados_extraidos.nome_proprietario,
    },
    {
      campo: 'Tipo de índice de reajuste',
      esperado: 'IPCA, INCC, IGP-M, etc',
      encontrado: dados_extraidos.indice_reajuste || 'NÃO ESPECIFICADO',
      validado: !!dados_extraidos.indice_reajuste,
    },
  ];

  return checklist;
}

/**
 * Salva análise de contrato no banco de dados
 */
export async function salvarAnaliseContrato(
  contrato_id: string,
  resultado_analise: ResultadoAnaliseContrato,
  validado_por?: string
): Promise<void> {
  try {
    const pool = obterPool();

    await pool.query(
      `update contratos_aluguel
       set
        valor_aluguel = $1,
        valor_caucao = $2,
        valor_taxa_condominio = $3,
        valor_iptu = $4,
        valor_seguro = $5,
        valor_agua_esgoto = $6,
        valor_luz = $7,
        valor_outras_despesas = $8,
        indice_reajuste = $9,
        percentual_reajuste = $10,
        analise_ia = $11,
        dados_extraidos = $12,
        confianca_extracao = $13,
        validado_por = $14,
        data_validacao = now(),
        atualizado_em = now()
       where id = $15`,
      [
        resultado_analise.dados_extraidos.valor_aluguel,
        resultado_analise.dados_extraidos.valor_caucao,
        resultado_analise.dados_extraidos.valor_taxa_condominio,
        resultado_analise.dados_extraidos.valor_iptu,
        resultado_analise.dados_extraidos.valor_seguro,
        resultado_analise.dados_extraidos.valor_agua_esgoto,
        resultado_analise.dados_extraidos.valor_luz,
        resultado_analise.dados_extraidos.valor_outras_despesas,
        resultado_analise.dados_extraidos.indice_reajuste,
        resultado_analise.dados_extraidos.percentual_reajuste,
        JSON.stringify(resultado_analise),
        JSON.stringify(resultado_analise.dados_extraidos),
        resultado_analise.confianca,
        validado_por || null,
        contrato_id,
      ]
    );
  } catch (erro) {
    console.error('Erro ao salvar análise:', erro);
    throw erro;
  }
}
