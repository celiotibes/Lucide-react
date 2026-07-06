/**
 * Example Router: Using ComplexityRouter for Intelligent LLM Routing
 *
 * This router demonstrates how to use llmPool with ComplexityRouter
 * for different legal automation tasks.
 */

import { Router, Request, Response } from 'express';
import { llmPool } from '@ai/llmPool';
import { logger } from '@utils/logger';

const router = Router();

// POST /llm/analyze-movement
// Example: Analyze court movement with intelligent complexity detection
router.post('/analyze-movement', async (req: Request, res: Response) => {
  try {
    const { movementText } = req.body;

    if (!movementText) {
      return res.status(400).json({ error: 'movementText is required' });
    }

    logger.info('Analyzing court movement...');

    const response = await llmPool.call(
      `Analise a seguinte movimentação processual e forneça um resumo:

${movementText}

Considere:
- Tipo de movimentação
- Implicações legais
- Prazos importantes
- Próximos passos recomendados`,
      {
        taskType: 'analyze',
        maxTokens: 1024,
        temperature: 0.3,
      }
    );

    const budget = llmPool.getCostBudgetStatus();

    res.json({
      status: 'success',
      analysis: response.content,
      metadata: {
        provider: response.provider,
        model: response.model,
        tokensUsed: response.tokensUsed,
        cached: response.cached,
        cost: response.cost?.toFixed(6),
      },
      budget: {
        percentageUsed: budget.percentageUsed.toFixed(1),
        status: budget.status,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao analisar movimentação');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao analisar',
    });
  }
});

// POST /llm/classify-document
// Example: Classify document with low complexity routing
router.post('/classify-document', async (req: Request, res: Response) => {
  try {
    const { documentContent } = req.body;

    if (!documentContent) {
      return res.status(400).json({ error: 'documentContent is required' });
    }

    logger.info('Classifying document...');

    const response = await llmPool.call(
      `Classifique o seguinte documento jurídico em uma das categorias:
- Sentença
- Recurso
- Intimação
- Ofício
- Notificação
- Outro

Documento:
${documentContent.substring(0, 1000)}

Responda apenas com a categoria.`,
      {
        taskType: 'classify',
        maxTokens: 50,
        temperature: 0.1,
      }
    );

    res.json({
      status: 'success',
      classification: response.content.trim(),
      metadata: {
        provider: response.provider,
        model: response.model,
        cached: response.cached,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao classificar documento');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao classificar',
    });
  }
});

// POST /llm/extract-data
// Example: Extract structured data from document
router.post('/extract-data', async (req: Request, res: Response) => {
  try {
    const { documentContent } = req.body;

    if (!documentContent) {
      return res.status(400).json({ error: 'documentContent is required' });
    }

    logger.info('Extracting data...');

    const response = await llmPool.call(
      `Extraia os seguintes dados do documento:
1. Número do processo
2. Partes (autor e réu)
3. Tribunal/Juízo
4. Data da decisão
5. Valor da causa

Documento:
${documentContent}

Retorne em formato JSON.`,
      {
        taskType: 'extract',
        maxTokens: 500,
        temperature: 0.1,
      }
    );

    let extractedData = {};
    try {
      // Try to parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      extractedData = { raw: response.content };
    }

    res.json({
      status: 'success',
      data: extractedData,
      metadata: {
        provider: response.provider,
        model: response.model,
        tokensUsed: response.tokensUsed,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao extrair dados');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao extrair dados',
    });
  }
});

// POST /llm/generate-petition
// Example: Generate legal petition with high quality
router.post('/generate-petition', async (req: Request, res: Response) => {
  try {
    const { caseType, parties, facts, claims } = req.body;

    if (!caseType || !parties || !facts) {
      return res
        .status(400)
        .json({ error: 'caseType, parties, and facts are required' });
    }

    logger.info('Generating petition...');

    const response = await llmPool.call(
      `Gere uma petição jurídica inicial para o seguinte caso:

Tipo de Ação: ${caseType}
Partes: ${parties}
Fatos: ${facts}
Pretensões: ${claims || 'Não especificadas'}

A petição deve incluir:
1. Qualificação das partes
2. Narração dos fatos
3. Fundamentos legais
4. Pedidos
5. Fundamentação jurídica

Use linguagem jurídica formal e precisa.`,
      {
        taskType: 'generate',
        maxTokens: 3000,
        temperature: 0.3,
      }
    );

    const budget = llmPool.getCostBudgetStatus();

    res.json({
      status: 'success',
      petition: response.content,
      metadata: {
        provider: response.provider,
        model: response.model,
        tokensUsed: response.tokensUsed,
        cached: response.cached,
      },
      budget: {
        percentageUsed: budget.percentageUsed.toFixed(1),
        status: budget.status,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao gerar petição');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar petição',
    });
  }
});

export default router;
