import Tesseract from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

export interface ResultadoOCRMedidor {
  sucesso: boolean;
  leitura?: number;
  confianca?: number;
  texto_bruto?: string;
  erro?: string;
  tipo_medidor?: 'hidrômetro' | 'gás' | 'eletricidade' | 'desconhecido';
}

export interface ConfiguracaoOCR {
  linguagem?: string;
  tesseractPath?: string;
  confiancaMinimaPercentual?: number;
  validarDigitos?: boolean;
}

const CONFIG_PADRAO: ConfiguracaoOCR = {
  linguagem: 'por', // Português
  confiancaMinimaPercentual: 70,
  validarDigitos: true,
};

/**
 * Extrai leitura de medidor de uma imagem usando OCR (Tesseract)
 * Funciona offline e não requer API key
 */
export async function extrairLeituraMedidor(
  caminhoImagem: string,
  config: ConfiguracaoOCR = {}
): Promise<ResultadoOCRMedidor> {
  const configuracao = { ...CONFIG_PADRAO, ...config };

  try {
    // Validar arquivo
    if (!fs.existsSync(caminhoImagem)) {
      return {
        sucesso: false,
        erro: `Arquivo não encontrado: ${caminhoImagem}`,
      };
    }

    // Executar OCR com Tesseract
    const resultado = await Tesseract.recognize(caminhoImagem, configuracao.linguagem);

    const textoExtraido = resultado.data.text.trim();
    const confianca = resultado.data.confidence;

    if (confianca < (configuracao.confiancaMinimaPercentual || 70)) {
      return {
        sucesso: false,
        texto_bruto: textoExtraido,
        confianca,
        erro: `Confiança insuficiente (${confianca}% < ${configuracao.confiancaMinimaPercentual}%)`,
      };
    }

    // Tentar extrair número do texto
    const numeroExtraido = extrairNumeroMedidor(textoExtraido);

    if (!numeroExtraido) {
      return {
        sucesso: false,
        texto_bruto: textoExtraido,
        confianca,
        erro: 'Nenhum número válido encontrado no texto OCR',
      };
    }

    const tipoMedidor = detectarTipoMedidor(textoExtraido);

    return {
      sucesso: true,
      leitura: numeroExtraido,
      confianca,
      texto_bruto: textoExtraido,
      tipo_medidor: tipoMedidor,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return {
      sucesso: false,
      erro: `Erro ao processar OCR: ${mensagem}`,
    };
  }
}

/**
 * Extrai o principal número do texto OCR (assumindo medidor com 5-8 dígitos)
 */
function extrairNumeroMedidor(texto: string): number | null {
  // Padrão: procurar sequências de 5-8 dígitos (números típicos de medidor)
  const padrao = /\b\d{5,8}\b/g;
  const correspondencias = texto.match(padrao);

  if (!correspondencias || correspondencias.length === 0) {
    // Tentar padrão com decimais (ex: 1234.56 ou 1234,56)
    const padraoDecimal = /\d{4,7}[.,]\d{2}/g;
    const correspondenciasDecimais = texto.match(padraoDecimal);

    if (correspondenciasDecimais && correspondenciasDecimais.length > 0) {
      const numeroStr = correspondenciasDecimais[0].replace(',', '.').replace('.', '');
      return parseInt(numeroStr, 10);
    }

    return null;
  }

  // Retornar o primeiro número encontrado (maior confiança)
  return parseInt(correspondencias[0], 10);
}

/**
 * Detecta o tipo de medidor baseado no texto OCR
 */
function detectarTipoMedidor(texto: string): 'hidrômetro' | 'gás' | 'eletricidade' | 'desconhecido' {
  const textoLower = texto.toLowerCase();

  if (textoLower.includes('água') || textoLower.includes('hidrômetro') || textoLower.includes('m³')) {
    return 'hidrômetro';
  }

  if (
    textoLower.includes('gás') ||
    textoLower.includes('combustível') ||
    textoLower.includes('m³ gás')
  ) {
    return 'gás';
  }

  if (
    textoLower.includes('kwh') ||
    textoLower.includes('eletricidade') ||
    textoLower.includes('energia')
  ) {
    return 'eletricidade';
  }

  return 'desconhecido';
}

/**
 * Valida leitura de medidor (deve ser número positivo e dentro de range razoável)
 */
export function validarLeituraMedidor(
  leitura: number,
  leituraAnterior?: number,
  limiteMaximoVariacao: number = 1000
): { valida: boolean; avisos?: string[] } {
  const avisos: string[] = [];

  if (leitura < 0) {
    return { valida: false, avisos: ['Leitura não pode ser negativa'] };
  }

  if (leitura > 9999999) {
    avisos.push('Leitura muito alta - verifique se OCR foi preciso');
  }

  if (leituraAnterior !== undefined) {
    if (leitura < leituraAnterior) {
      avisos.push('Leitura inferior à anterior - possível erro de OCR ou medidor reiniciado');
    } else {
      const variacao = leitura - leituraAnterior;
      if (variacao > limiteMaximoVariacao) {
        avisos.push(
          `Variação muito grande (${variacao}) - verifique se OCR foi preciso`
        );
      }
    }
  }

  return {
    valida: true,
    avisos: avisos.length > 0 ? avisos : undefined,
  };
}

/**
 * Processa lote de imagens de medidores
 */
export async function processarLoteMedidores(
  caminhos: string[],
  config?: ConfiguracaoOCR
): Promise<Map<string, ResultadoOCRMedidor>> {
  const resultados = new Map<string, ResultadoOCRMedidor>();

  for (const caminho of caminhos) {
    try {
      const resultado = await extrairLeituraMedidor(caminho, config);
      resultados.set(caminho, resultado);
    } catch (erro) {
      resultados.set(caminho, {
        sucesso: false,
        erro: `Erro ao processar ${caminho}: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
    }
  }

  return resultados;
}
