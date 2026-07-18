'use server';

import { obterPool } from '@/server/integracao/db';
import { z } from 'zod';

const CriarItemDeOCRSchema = z.object({
  vistoriaId: z.string(),
  ambienteId: z.string(),
  leituraOCR: z.number(),
  tipoMedidor: z.enum(['hidrômetro', 'gás', 'eletricidade', 'desconhecido']),
  confiancaOCR: z.number().min(0).max(100),
  observacoes: z.string().optional(),
});

const CriarItemDeWhatsAppSchema = z.object({
  vistoriaId: z.string(),
  ambienteId: z.string(),
  descricaoDano: z.string(),
  tiposDano: z.array(z.string()),
  confiancaRelato: z.number().min(0).max(100),
  responsabilidade: z.enum(['inquilino', 'proprietário', 'desgaste_natural', 'indeterminado']),
  severidade: z.enum(['leve', 'média', 'grave']),
  dataRelato: z.string(),
  remetente: z.string().optional(),
});

/**
 * Cria item de vistoria a partir de leitura OCR de medidor
 */
export async function criarItemDeOCR(
  input: z.infer<typeof CriarItemDeOCRSchema>
): Promise<{ success: boolean; itemId?: string; erro?: string }> {
  try {
    const validado = CriarItemDeOCRSchema.parse(input);
    const pool = obterPool();

    // Validar vistoria e ambiente
    const vistoriaResult = await pool.query(
      `select id from vistorias where id = $1`,
      [validado.vistoriaId]
    );

    if (vistoriaResult.rows.length === 0) {
      return { success: false, erro: 'Vistoria não encontrada' };
    }

    const ambienteResult = await pool.query(
      `select id from ambientes_vistoria where id = $1 and vistoria_id = $2`,
      [validado.ambienteId, validado.vistoriaId]
    );

    if (ambienteResult.rows.length === 0) {
      return { success: false, erro: 'Ambiente não encontrado' };
    }

    // Criar item de vistoria para o medidor
    const descricao = `Leitura de ${validado.tipoMedidor} via OCR: ${validado.leituraOCR}m³/kWh`;

    const itemResult = await pool.query(
      `insert into itens_vistoria (id, vistoria_id, ambiente_id, descricao, estado, observacoes, metadados)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        `ocr-${Date.now()}`,
        validado.vistoriaId,
        validado.ambienteId,
        descricao,
        'bom',
        validado.observacoes,
        JSON.stringify({
          origem: 'ocr',
          tipoMedidor: validado.tipoMedidor,
          leitura: validado.leituraOCR,
          confiancaOCR: validado.confiancaOCR,
        }),
      ]
    );

    return {
      success: true,
      itemId: itemResult.rows[0].id,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { success: false, erro: mensagem };
  }
}

/**
 * Cria item de vistoria a partir de relato de dano do WhatsApp
 */
export async function criarItemDeWhatsApp(
  input: z.infer<typeof CriarItemDeWhatsAppSchema>
): Promise<{ success: boolean; itemId?: string; erro?: string }> {
  try {
    const validado = CriarItemDeWhatsAppSchema.parse(input);
    const pool = obterPool();

    // Validar vistoria e ambiente
    const vistoriaResult = await pool.query(
      `select id from vistorias where id = $1`,
      [validado.vistoriaId]
    );

    if (vistoriaResult.rows.length === 0) {
      return { success: false, erro: 'Vistoria não encontrada' };
    }

    const ambienteResult = await pool.query(
      `select id from ambientes_vistoria where id = $1 and vistoria_id = $2`,
      [validado.ambienteId, validado.vistoriaId]
    );

    if (ambienteResult.rows.length === 0) {
      return { success: false, erro: 'Ambiente não encontrado' };
    }

    // Mapear severidade para estado
    const estadoMap = {
      leve: 'bom',
      média: 'regular',
      grave: 'danificado',
    };

    const estado = estadoMap[validado.severidade] || 'regular';

    // Criar item de vistoria
    const itemResult = await pool.query(
      `insert into itens_vistoria (id, vistoria_id, ambiente_id, descricao, estado, observacoes, metadados)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        `whatsapp-${Date.now()}`,
        validado.vistoriaId,
        validado.ambienteId,
        `Dano relatado: ${validado.descricaoDano}`,
        estado,
        `Relato de ${validado.remetente} em ${validado.dataRelato}`,
        JSON.stringify({
          origem: 'whatsapp',
          descricaoDano: validado.descricaoDano,
          tiposDano: validado.tiposDano,
          confiancaRelato: validado.confiancaRelato,
          responsabilidade: validado.responsabilidade,
          dataRelato: validado.dataRelato,
          remetente: validado.remetente,
        }),
      ]
    );

    // Se responsabilidade é inquilino, registrar para possível cobrança
    if (validado.responsabilidade === 'inquilino') {
      await pool.query(
        `insert into itens_fechamento (id, vistoria_id, descricao, tipo, origem, valor, metadados)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `cobranca-whatsapp-${Date.now()}`,
          validado.vistoriaId,
          `Dano do inquilino (WhatsApp): ${validado.descricaoDano}`,
          'debito',
          'estimativa',
          0, // Será preenchido manualmente após orçamento
          JSON.stringify({
            origem: 'whatsapp_relato',
            itemVistoriaId: itemResult.rows[0].id,
            severidade: validado.severidade,
            confianca: validado.confiancaRelato,
            statusOrcamento: 'pendente',
          }),
        ]
      );
    }

    return {
      success: true,
      itemId: itemResult.rows[0].id,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { success: false, erro: mensagem };
  }
}

/**
 * Importa lote de danos do WhatsApp e cria items em lote
 */
export async function importarDanosEmLote(
  vistoriaId: string,
  danos: Array<{
    ambienteId: string;
    descricaoDano: string;
    tiposDano: string[];
    confiancaRelato: number;
    responsabilidade: string;
    severidade: string;
    dataRelato: string;
    remetente?: string;
  }>
): Promise<{ success: boolean; itemsCriados: number; erros: string[] }> {
  const erros: string[] = [];
  let itemsCriados = 0;

  for (const dano of danos) {
    try {
      const resultado = await criarItemDeWhatsApp({
        vistoriaId,
        ambienteId: dano.ambienteId,
        descricaoDano: dano.descricaoDano,
        tiposDano: dano.tiposDano,
        confiancaRelato: dano.confiancaRelato,
        responsabilidade: dano.responsabilidade as any,
        severidade: dano.severidade as any,
        dataRelato: dano.dataRelato,
        remetente: dano.remetente,
      });

      if (resultado.success) {
        itemsCriados++;
      } else {
        erros.push(`Dano "${dano.descricaoDano}": ${resultado.erro}`);
      }
    } catch (erro) {
      erros.push(`Erro ao importar dano: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  return {
    success: erros.length === 0,
    itemsCriados,
    erros,
  };
}
