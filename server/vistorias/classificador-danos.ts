import Anthropic from '@anthropic-ai/sdk';

interface DanoClassificado {
  descricaoOriginal: string;
  tipo: string;
  severidade: 'leve' | 'média' | 'grave';
  responsabilidade: 'inquilino' | 'proprietário' | 'desgaste_natural' | 'indeterminado';
  estimativaReparo: 'baixa' | 'média' | 'alta';
  confianca: number;
  justificativa: string;
  recomendacoes?: string[];
}

const client = new Anthropic();

/**
 * Sistema de prompt para classificação de danos
 * Usa Claude Haiku para análise rápida e barata offline
 */
const SYSTEM_PROMPT = `Você é um perito imobiliário especializado em classificação de danos em imóveis alugados.
Análise cada descrição de dano conforme Lei 8.245/91 (Lei do Inquilinato Brasileiro).

Classifique o dano em:
- TIPO: escolha entre 'infiltração', 'pintura', 'vidro', 'piso', 'porta', 'canalização', 'elétrica', 'estrutural', 'outro'
- SEVERIDADE: 'leve' (reparo cosmético < R$500), 'média' (reparo estrutural R$500-2000), 'grave' (reparo estrutural > R$2000)
- RESPONSABILIDADE:
  - 'inquilino': dano causado por uso inadequado/abuso (Lei 8.245/91, §1º, art. 23)
  - 'proprietário': desgaste natural ou falha estrutural (responsabilidade do locador)
  - 'desgaste_natural': envelhecimento normal (< 5 anos de uso)
  - 'indeterminado': impossível determinar pela descrição
- ESTIMATIVA: 'baixa' (< R$500), 'média' (R$500-2000), 'alta' (> R$2000)

Responda em JSON estruturado. Seja conservador na classificação ('inquilino' requer evidência clara).`;

export async function classificarDanoComIA(descricaoDano: string): Promise<DanoClassificado> {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classifique este dano relatado: "${descricaoDano}"`,
        },
      ],
    });

    const conteudo = message.content[0];
    if (conteudo.type !== 'text') {
      throw new Error('Resposta inesperada do modelo');
    }

    // Parser JSON da resposta
    const textoResposta = conteudo.text;
    const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Resposta não contém JSON válido');
    }

    const resultado = JSON.parse(jsonMatch[0]);

    return {
      descricaoOriginal: descricaoDano,
      tipo: resultado.tipo || 'outro',
      severidade: resultado.severidade || 'média',
      responsabilidade: resultado.responsabilidade || 'indeterminado',
      estimativaReparo: resultado.estimativaReparo || 'média',
      confianca: Math.min(100, Math.max(0, resultado.confianca || 70)),
      justificativa: resultado.justificativa || '',
      recomendacoes: resultado.recomendacoes || [],
    };
  } catch (erro) {
    // Fallback para classificação simples offline
    console.error('Erro ao chamar Claude API:', erro);
    return classificarDanoOffline(descricaoDano);
  }
}

/**
 * Classificação offline sem dependência de API (fallback)
 */
function classificarDanoOffline(descricao: string): DanoClassificado {
  const descricaoLower = descricao.toLowerCase();

  let tipo = 'outro';
  let severidade: 'leve' | 'média' | 'grave' = 'média';
  let responsabilidade: 'inquilino' | 'proprietário' | 'desgaste_natural' | 'indeterminado' =
    'indeterminado';

  // Tipo
  if (descricaoLower.includes('infiltração') || descricaoLower.includes('vazamento')) {
    tipo = 'infiltração';
    responsabilidade = 'proprietário'; // Infiltração é estrutural
    severidade = 'grave';
  } else if (descricaoLower.includes('pintura')) {
    tipo = 'pintura';
    responsabilidade = 'desgaste_natural';
    severidade = 'leve';
  } else if (descricaoLower.includes('vidro')) {
    tipo = 'vidro';
    responsabilidade = 'inquilino';
    severidade = 'leve';
  } else if (descricaoLower.includes('piso')) {
    tipo = 'piso';
    severidade = 'média';
  } else if (descricaoLower.includes('porta')) {
    tipo = 'porta';
    severidade = 'média';
  } else if (descricaoLower.includes('luz') || descricaoLower.includes('tomada')) {
    tipo = 'elétrica';
    responsabilidade = 'proprietário';
    severidade = 'média';
  }

  return {
    descricaoOriginal: descricao,
    tipo,
    severidade,
    responsabilidade,
    estimativaReparo:
      severidade === 'leve' ? 'baixa' : severidade === 'média' ? 'média' : 'alta',
    confianca: 50, // Confiança baixa para fallback
    justificativa: 'Classificação offline (API não disponível)',
  };
}

/**
 * Classifica lote de danos
 */
export async function classificarLoteDanos(descricoes: string[]): Promise<DanoClassificado[]> {
  const resultados: DanoClassificado[] = [];

  for (const descricao of descricoes) {
    try {
      const classificacao = await classificarDanoComIA(descricao);
      resultados.push(classificacao);
    } catch (erro) {
      console.error(`Erro ao classificar dano: ${erro}`);
      resultados.push(classificarDanoOffline(descricao));
    }
  }

  return resultados;
}

/**
 * Agrupa danos por responsabilidade para análise de cobrança
 */
export function agruparPorResponsabilidade(
  danos: DanoClassificado[]
): Map<string, DanoClassificado[]> {
  const agrupados = new Map<string, DanoClassificado[]>();

  for (const dano of danos) {
    if (!agrupados.has(dano.responsabilidade)) {
      agrupados.set(dano.responsabilidade, []);
    }
    agrupados.get(dano.responsabilidade)!.push(dano);
  }

  return agrupados;
}

/**
 * Calcula estimativa total de reparo
 */
export function calcularEstimativaTotal(danos: DanoClassificado[]): {
  baixa: number;
  media: number;
  alta: number;
  total: number;
} {
  const estimativas = {
    baixa: 0,
    media: 0,
    alta: 0,
  };

  // Valores médios (simplificados - em produção usar tabela SINDUSCON)
  const valoresMedios = {
    baixa: 250,
    media: 1000,
    alta: 3000,
  };

  for (const dano of danos) {
    const chave = dano.estimativaReparo as keyof typeof estimativas;
    estimativas[chave] += valoresMedios[chave];
  }

  return {
    ...estimativas,
    total: Object.values(estimativas).reduce((a, b) => a + b, 0),
  };
}

/**
 * Filtra danos por responsabilidade do inquilino (para cobrança)
 */
export function filtrarDanosInquilino(danos: DanoClassificado[]): DanoClassificado[] {
  return danos.filter((d) => d.responsabilidade === 'inquilino' && d.confianca >= 60);
}
