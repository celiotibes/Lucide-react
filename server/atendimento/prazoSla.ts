// Calcula o prazo de SLA de um chamado (docs/16-portal-inquilino-helpdesk.md)
// a partir do horário de abertura e da política da natureza da demanda
// (`sla_politicas`). Distinção real no pedido do cliente: "24 horas úteis
// para dúvidas... 2 horas para emergências" — note que só "úteis" aparece
// junto de "dúvidas", não de "emergências". Um vazamento grave às 22h de
// sexta não pode esperar o expediente reabrir na segunda; uma dúvida sobre
// boleto pode. Por isso duas rotas de cálculo, não uma só:
//   - `horasUteis: false` — horas corridas, relógio de parede.
//   - `horasUteis: true` — só conta expediente (seg-sex, 9h-18h — 9h de
//     capacidade por dia útil); abertura fora do expediente avança para o
//     próximo início de expediente antes de começar a contar.
//
// Datas em UTC, mesma convenção do resto do projeto (prorata.ts,
// gerarFaturaMensal.ts) — assume que os componentes de hora UTC do
// timestamp já representam o horário comercial relevante (o sistema não
// tem hoje um fuso horário de negócio configurável em lugar nenhum; mesma
// simplificação já feita nos outros módulos, não uma nova inconsistência).

const INICIO_EXPEDIENTE_HORA = 9;
const FIM_EXPEDIENTE_HORA = 18;
const MS_POR_HORA = 60 * 60 * 1000;

export interface PoliticaSla {
  prazoHoras: number;
  horasUteis: boolean;
}

export function calcularPrazoSla(abertura: Date, politica: PoliticaSla): Date {
  if (politica.prazoHoras <= 0) {
    throw new Error('prazoHoras deve ser positivo');
  }

  if (!politica.horasUteis) {
    return new Date(abertura.getTime() + politica.prazoHoras * MS_POR_HORA);
  }

  let atual = proximoInicioUtil(abertura);
  let restanteHoras = politica.prazoHoras;

  while (restanteHoras > 0) {
    const fimDoDiaAtual = comHora(atual, FIM_EXPEDIENTE_HORA);
    const horasDisponiveisHoje = (fimDoDiaAtual.getTime() - atual.getTime()) / MS_POR_HORA;

    if (restanteHoras <= horasDisponiveisHoje) {
      atual = new Date(atual.getTime() + restanteHoras * MS_POR_HORA);
      restanteHoras = 0;
    } else {
      restanteHoras -= horasDisponiveisHoje;
      atual = proximoInicioUtil(proximoDiaAsMeiaNoite(fimDoDiaAtual));
    }
  }

  return atual;
}

/** Se `data` está fora do expediente (fim de semana, antes das 9h, depois das 18h), avança para o próximo início de expediente. Dentro do expediente, devolve `data` inalterada. */
function proximoInicioUtil(data: Date): Date {
  let candidata = new Date(data);

  if (ehFimDeSemana(candidata)) {
    candidata = comHora(proximoDiaUtil(candidata), INICIO_EXPEDIENTE_HORA);
  } else if (candidata.getUTCHours() < INICIO_EXPEDIENTE_HORA) {
    candidata = comHora(candidata, INICIO_EXPEDIENTE_HORA);
  } else if (candidata.getUTCHours() >= FIM_EXPEDIENTE_HORA) {
    candidata = comHora(proximoDiaUtil(candidata), INICIO_EXPEDIENTE_HORA);
  }

  return candidata;
}

function proximoDiaUtil(data: Date): Date {
  let proximo = proximoDiaAsMeiaNoite(data);
  while (ehFimDeSemana(proximo)) {
    proximo = proximoDiaAsMeiaNoite(proximo);
  }
  return proximo;
}

function proximoDiaAsMeiaNoite(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + 1));
}

function comHora(data: Date, hora: number): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), hora, 0, 0, 0));
}

function ehFimDeSemana(data: Date): boolean {
  const dia = data.getUTCDay();
  return dia === 0 || dia === 6;
}
