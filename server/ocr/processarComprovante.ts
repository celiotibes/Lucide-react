/**
 * Processamento de OCR para comprovantes de combustível e despesas
 * Extrai informações estruturadas de fotos/PDFs de comprovantes
 * Task #47
 */

import Tesseract from 'tesseract.js';

export interface DadosComprovante {
  tipo: 'combustivel' | 'alimentacao' | 'manutencao' | 'outro';
  data?: string;
  valor?: number;
  estabelecimento?: string;
  descricao?: string;
  cnpj_estabelecimento?: string;
  placa_veiculo?: string;
  tipo_combustivel?: string;
  confianca_extracao: number; // 0-100
  texto_bruto?: string;
  campos_reconhecidos: string[];
}

/**
 * Processar imagem de comprovante e extrair dados via OCR
 */
export async function processarComprovanteOCR(
  imagemUrl: string
): Promise<DadosComprovante> {
  try {
    const worker = await Tesseract.createWorker('por'); // Portuguese

    const result = await worker.recognize(imagemUrl);
    const textoBruto = result.data.text;

    await worker.terminate();

    // Analisar texto extraído
    return analisarTextoComprovante(textoBruto);
  } catch (erro) {
    console.error('Erro ao processar OCR:', erro);
    return {
      tipo: 'outro',
      confianca_extracao: 0,
      texto_bruto: '',
      campos_reconhecidos: [],
    };
  }
}

/**
 * Analisar texto extraído via OCR e extrair campos estruturados
 */
function analisarTextoComprovante(textoBruto: string): DadosComprovante {
  const dados: DadosComprovante = {
    tipo: 'outro',
    confianca_extracao: 0,
    texto_bruto: textoBruto,
    campos_reconhecidos: [],
  };

  if (!textoBruto) return dados;

  // Padrões regex para extração
  const padroesData = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /Data:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i,
  ];

  const padroesValor = [
    /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)/gi,
    /Total.*?:\s*R\$?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/i,
  ];

  const padroesPlaca = /[A-Z]{3}\s*[-]?\s*\d{4}|[A-Z]{3}\d[A-Z]\d{2}/;
  const padroesEstabelecimento = /^(?!.*\d{2}:\d{2})(?!.*[0-9]{1,3}\.[0-9]{3}).*$/m;

  // Extrair data
  for (const padrao of padroesData) {
    const match = textoBruto.match(padrao);
    if (match) {
      dados.data = match[0];
      dados.campos_reconhecidos.push('data');
      break;
    }
  }

  // Extrair valor
  for (const padrao of padroesValor) {
    const matches = textoBruto.match(padrao);
    if (matches) {
      try {
        const valorStr = matches[0]
          .replace('R$', '')
          .trim()
          .replace('.', '')
          .replace(',', '.');
        dados.valor = parseFloat(valorStr);
        dados.campos_reconhecidos.push('valor');
      } catch (e) {
        console.error('Erro ao parsear valor:', e);
      }
      break;
    }
  }

  // Detectar tipo de comprovante
  const textoLower = textoBruto.toLowerCase();
  if (
    textoLower.includes('combustível') ||
    textoLower.includes('gasolina') ||
    textoLower.includes('diesel') ||
    textoLower.includes('litros') ||
    textoLower.includes('abastecer')
  ) {
    dados.tipo = 'combustivel';
    dados.campos_reconhecidos.push('tipo_combustivel');

    // Extrair tipo de combustível
    if (textoLower.includes('gasolina')) {
      dados.tipo_combustivel = 'gasolina';
    } else if (textoLower.includes('diesel')) {
      dados.tipo_combustivel = 'diesel';
    } else if (textoLower.includes('etanol')) {
      dados.tipo_combustivel = 'etanol';
    }
  } else if (
    textoLower.includes('alimentação') ||
    textoLower.includes('refeição') ||
    textoLower.includes('restaurante')
  ) {
    dados.tipo = 'alimentacao';
  } else if (
    textoLower.includes('manutenção') ||
    textoLower.includes('reparo') ||
    textoLower.includes('peça')
  ) {
    dados.tipo = 'manutencao';
  }

  // Extrair placa de veículo
  const matchPlaca = textoBruto.match(padroesPlaca);
  if (matchPlaca) {
    dados.placa_veiculo = matchPlaca[0];
    dados.campos_reconhecidos.push('placa_veiculo');
  }

  // Extrair CNPJ
  const matchCNPJ = textoBruto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (matchCNPJ) {
    dados.cnpj_estabelecimento = matchCNPJ[0];
    dados.campos_reconhecidos.push('cnpj_estabelecimento');
  }

  // Extrair nome do estabelecimento (primeiras linhas legíveis)
  const linhas = textoBruto.split('\n').filter((l) => l.trim().length > 3);
  if (linhas.length > 0) {
    dados.estabelecimento = linhas[0].trim();
    dados.campos_reconhecidos.push('estabelecimento');
  }

  // Calcular confiança
  dados.confianca_extracao = Math.min(
    100,
    dados.campos_reconhecidos.length * 25
  );

  return dados;
}

/**
 * Validar comprovante extraído
 */
export function validarComprovante(dados: DadosComprovante): {
  valido: boolean;
  erros: string[];
} {
  const erros: string[] = [];

  if (!dados.valor || dados.valor <= 0) {
    erros.push('Valor não foi extraído corretamente');
  }

  if (!dados.data) {
    erros.push('Data não foi extraída');
  }

  if (dados.confianca_extracao < 50) {
    erros.push('Confiança de extração muito baixa (< 50%)');
  }

  return {
    valido: erros.length === 0,
    erros,
  };
}
