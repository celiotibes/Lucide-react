// Auditoria de geração solar com créditos de compensação (net metering,
// Lei 14.300/2022, REN ANEEL 1.059/2023) — mecanismo de monetização que
// ficou em aberto desde `docs/10-auditoria-contrato-real.md` até você
// descrever o fluxo real: geração monitorada via API do ShinePhone
// (Growatt), cruzada com a fatura de Geração Distribuída (GD) da Celesc,
// para isolar quanto do consumo é de área comum — a parte que nenhum
// inquilino paga individualmente.
//
// As duas fórmulas conferem contabilmente:
//
//   1. Consumo Próprio Instantâneo = Energia Gerada Total − Energia
//      Injetada. Correto: um sistema solar sempre atende a carga local
//      primeiro e só exporta o excedente — o que não foi injetado foi
//      necessariamente consumido no local no mesmo instante.
//
//   2. Total Consumido no Período = Consumo Próprio Instantâneo +
//      Energia Consumida da Rede Celesc. Soma tudo que o prédio
//      realmente usou, venha da própria geração ou da rede.
//
//   3. Área Comum = Total Consumido − Σ Energia Cobrada dos Inquilinos.
//      Correto SE os medidores individuais dos inquilinos medem consumo
//      real no ponto de uso (o que já é o caso, `leituras_energia`) — a
//      diferença entre "tudo que o prédio usou" e "o que foi cobrado
//      unidade por unidade" só pode ser área comum (iluminação,
//      elevador, bomba, portão) ou perda de medição.
//
//   4. Resultado Financeiro = valor total cobrado dos inquilinos menos o
//      valor total da energia usada pelo prédio (gerada + da rede,
//      convertida pela tarifa vigente) — positivo = a operação cobrou
//      mais do que o custo real de energia; negativo = a administração
//      absorveu parte do custo sem repassar.
//
// IMPORTANTE: `energiaConsumidaRedeKwh` precisa ser o valor FÍSICO bruto
// de energia importada da rede (linha própria na fatura Celesc GD, ex.
// "Energia Ativa Fornecida"), não o consumo líquido já compensado pelos
// créditos de injeção que aparece como base do valor cobrado em R$ — os
// dois são números diferentes sob o regime de compensação. Ainda não
// vimos uma fatura real de GD da Celesc para confirmar o rótulo exato do
// campo (`docs/30`, pendente).

export interface EntradaAuditoriaEnergiaSolar {
  energiaGeradaTotalKwh: number;
  energiaInjetadaKwh: number;
  energiaConsumidaRedeKwh: number;
  totalCobradoInquilinosKwh: number;
  totalCobradoInquilinosValor: number;
  tarifaCelescVigente: number; // R$/kWh
}

export interface ResultadoAuditoriaEnergiaSolar {
  consumoProprioInstantaneoKwh: number;
  totalConsumidoKwh: number;
  areaComumKwh: number;
  areaComumValor: number;
  resultadoFinanceiroValor: number;
  /** true quando a área comum calculada dá negativa — sinal de dado inconsistente (leitura/fatura errada), não de área comum "negativa" de verdade. */
  inconsistente: boolean;
}

export function calcularAuditoriaEnergiaSolar(
  entrada: EntradaAuditoriaEnergiaSolar,
): ResultadoAuditoriaEnergiaSolar {
  if (entrada.energiaGeradaTotalKwh < 0 || entrada.energiaInjetadaKwh < 0 || entrada.energiaConsumidaRedeKwh < 0) {
    throw new Error('Valores de energia não podem ser negativos');
  }
  if (entrada.energiaInjetadaKwh > entrada.energiaGeradaTotalKwh) {
    throw new Error('Energia injetada não pode ser maior que a energia gerada total');
  }
  if (entrada.totalCobradoInquilinosKwh < 0 || entrada.totalCobradoInquilinosValor < 0) {
    throw new Error('Total cobrado dos inquilinos não pode ser negativo');
  }
  if (entrada.tarifaCelescVigente <= 0) {
    throw new Error('tarifaCelescVigente deve ser positiva');
  }

  const consumoProprioInstantaneoKwh = arredondar(entrada.energiaGeradaTotalKwh - entrada.energiaInjetadaKwh);
  const totalConsumidoKwh = arredondar(consumoProprioInstantaneoKwh + entrada.energiaConsumidaRedeKwh);
  const areaComumKwhBruto = arredondar(totalConsumidoKwh - entrada.totalCobradoInquilinosKwh);

  const inconsistente = areaComumKwhBruto < 0;
  const areaComumKwh = Math.max(0, areaComumKwhBruto);
  const areaComumValor = arredondar(areaComumKwh * entrada.tarifaCelescVigente);

  const valorTotalEnergiaUsada = arredondar(totalConsumidoKwh * entrada.tarifaCelescVigente);
  const resultadoFinanceiroValor = arredondar(entrada.totalCobradoInquilinosValor - valorTotalEnergiaUsada);

  return {
    consumoProprioInstantaneoKwh,
    totalConsumidoKwh,
    areaComumKwh,
    areaComumValor,
    resultadoFinanceiroValor,
    inconsistente,
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
