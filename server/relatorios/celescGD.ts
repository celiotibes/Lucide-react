// Parser de texto da fatura de Geração Distribuída (GD) da Celesc —
// validado contra uma fatura real (Unidade Consumidora 313.198.011-71,
// Prof João Carlos Pottker 25, Florianópolis — a mesma "geradora" do
// Residencial João Pottker de docs/10, competência 07/2026). Segue o
// mesmo princípio de `../relatorios/ofx.ts`: opera sobre o TEXTO já
// extraído do PDF, não decide como extrair esse texto — a escolha de
// biblioteca de extração (pdf-parse, pdftotext, etc.) fica para quando
// o upload de fatura for de fato conectado (docs/30), porque adicionar
// uma dependência nova de produção é decisão de infraestrutura, mesma
// cautela já registrada para o Puppeteer em docs/27.
//
// A fatura real mostra DOIS "grandeza" para o mesmo medidor físico
// (5496999): "Energia" (o que a unidade consumiu da rede, bruto) e
// "Energia injetada" (o que foi exportado para a rede) — cada linha no
// formato "Leitura Anterior | Leitura Atual | Constante | Perdas % |
// Total Apurado". O "Total Apurado" é o kWh do período, já descontada a
// constante do medidor — é esse valor que a auditoria de docs/30 precisa,
// não a diferença bruta de leituras.
//
// VALIDADO CONTRA 1 FATURA REAL SÓ. Mesma cautela já registrada em
// docs/11 para o desconto de pontualidade: um layout confirmado por uma
// única amostra pode ter variação (ex.: unidades sem geração própria não
// têm a linha "Energia injetada", faturas com bandeira diferente da
// amarela têm outras rubricas). Testar contra mais faturas reais antes
// de confiar cegamente em produção.

export class FaturaCelescGDInvalidaError extends Error {}

export interface FaturaCelescGDExtraida {
  competencia: string; // 'YYYY-MM-01'
  vencimento: string; // 'YYYY-MM-DD'
  valorTotal: number;
  energiaConsumidaRedeKwh: number;
  energiaInjetadaKwh: number;
}

const MESES: Record<string, string> = {
  '01': '01', '02': '02', '03': '03', '04': '04', '05': '05', '06': '06',
  '07': '07', '08': '08', '09': '09', '10': '10', '11': '11', '12': '12',
};

export function parsearFaturaCelescGD(texto: string): FaturaCelescGDExtraida {
  const referencia = texto.match(/(\d{2})\/(\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})\s+R\$\s*([\d.,]+)/);
  if (!referencia) {
    throw new FaturaCelescGDInvalidaError('Não foi possível localizar referência/vencimento/total a pagar no texto da fatura');
  }
  const [, mesRef, anoRef, diaVenc, mesVenc, anoVenc, valorTotalTexto] = referencia;
  if (!MESES[mesRef]) {
    throw new FaturaCelescGDInvalidaError(`Mês de referência inválido: ${mesRef}`);
  }

  const linhaEnergia = texto.match(/\d+\s+Energia\s+Único\s+[\d.]+\s+[\d.]+\s+[\d,]+\s+[\d,]+\s+([\d.]+)/);
  if (!linhaEnergia) {
    throw new FaturaCelescGDInvalidaError('Não foi possível localizar a linha de "Energia" (consumo da rede) no texto da fatura');
  }

  const linhaInjetada = texto.match(/\d+\s+Energia injetada\s+Único\s+[\d.]+\s+[\d.]+\s+[\d,]+\s+[\d,]+\s+([\d.]+)/);
  if (!linhaInjetada) {
    throw new FaturaCelescGDInvalidaError('Não foi possível localizar a linha de "Energia injetada" no texto da fatura');
  }

  return {
    competencia: `${anoRef}-${mesRef}-01`,
    vencimento: `${anoVenc}-${mesVenc}-${diaVenc}`,
    valorTotal: paraNumeroBrasileiro(valorTotalTexto),
    energiaConsumidaRedeKwh: paraNumeroBrasileiro(linhaEnergia[1]),
    energiaInjetadaKwh: paraNumeroBrasileiro(linhaInjetada[1]),
  };
}

// Números no padrão brasileiro usam "." como separador de milhar e ","
// como decimal (ex.: "1.872" = mil oitocentos e setenta e dois, sem casa
// decimal; "328,87" = trezentos e vinte e oito reais e oitenta e sete
// centavos). A fatura mistura os dois formatos na mesma tabela, então a
// conversão precisa tratar "." como separador de milhar sempre que não
// houver vírgula decimal depois dele.
function paraNumeroBrasileiro(texto: string): number {
  const limpo = texto.trim();
  if (limpo.includes(',')) {
    return Number(limpo.replace(/\./g, '').replace(',', '.'));
  }
  return Number(limpo.replace(/\./g, ''));
}
