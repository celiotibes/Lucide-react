import type { Database } from "sql.js";
import { executar } from "../../db/connection";
import { gerarCronogramaSAC } from "../financiamento/amortizacao";
import { registrarReajuste } from "../contratos/reajustes";
import { garantirPlanoDeContasPadrao } from "../planoDeContas";

// Gerador determinístico (sem dependência externa) — mesma seed sempre produz o mesmo dataset,
// o que torna os testes e capturas de tela reprodutíveis.
function criarGeradorAleatorio(seed: number) {
  let estado = seed;
  return () => {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const aleatorio = criarGeradorAleatorio(42);
const entre = (min: number, max: number) => min + aleatorio() * (max - min);
const inteiroEntre = (min: number, max: number) => Math.floor(entre(min, max + 1));
const escolher = <T,>(itens: readonly T[]): T => itens[inteiroEntre(0, itens.length - 1)];

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}
function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return formatarData(data);
}
function somarDias(dataIso: string, dias: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setDate(data.getDate() + dias);
  return formatarData(data);
}
function diferencaEmMeses(dataInicioIso: string, dataFimIso: string): number {
  const inicio = new Date(dataInicioIso + "T00:00:00");
  const fim = new Date(dataFimIso + "T00:00:00");
  return (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
}

const NOMES_LOCATARIOS = [
  "Ana Paula Ferreira", "Bruno Costa Lima", "Carla Menezes", "Diego Alves Souza", "Elaine Rocha",
  "Fábio Nunes", "Gabriela Torres", "Henrique Barbosa", "Isabela Cardoso", "João Vitor Ramos",
  "Karina Duarte", "Lucas Pereira", "Mariana Teixeira", "Nelson Araújo", "Otávio Machado",
  "Patrícia Gonçalves", "Rafael Moraes", "Sandra Vieira", "Tiago Correia", "Vanessa Lopes",
];

export interface ResultadoSeed {
  imoveis: number;
  contratos: number;
  transacoes: number;
  caucoes: number;
}

export function gerarDadosSimulados(db: Database, hoje: string = "2026-07-06"): ResultadoSeed {
  const dataInicioJanela = somarMeses(hoje, -36);

  // 1. Plano de contas
  garantirPlanoDeContasPadrao(db);

  // 2. Contas bancárias
  const bancos = [
    ["Banco do Brasil", "corrente"], ["Caixa Econômica Federal", "corrente"], ["Itaú Unibanco", "corrente"],
    ["Bradesco", "corrente"], ["Nubank", "corrente"], ["Banco Inter", "poupanca"],
  ] as const;
  const contaIds: number[] = [];
  bancos.forEach(([banco, tipo], indice) => {
    executar(
      db,
      "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo, ativa_desde) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [indice + 1, banco, "0001", `${10000 + indice}-${indice}`, "Titular Pessoa Física", tipo, dataInicioJanela],
    );
    contaIds.push(indice + 1);
  });

  // 3. Imóveis: 8 kitnets num mesmo edifício em Florianópolis + 2 apartamentos financiados
  // em Curitiba, mais um apto de uso pessoal (residência própria) — para demonstrar o
  // agrupamento por cidade e a exclusão de despesa pessoal do DRE da atividade de locação.
  const imoveis: { id: number; tipo: string; financiado: number }[] = [];
  for (let i = 1; i <= 8; i++) {
    const id = i;
    executar(
      db,
      "INSERT INTO imoveis (id, apelido, tipo, cidade, endereco, fracao_ideal, area_m2, financiado) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
      [id, `Kitnet ${100 + i} - Ed. Aurora`, "kitnet", "Florianópolis", "Rua das Acácias, 200", 0.08, 28],
    );
    imoveis.push({ id, tipo: "kitnet", financiado: 0 });
  }
  const apto1 = 9, apto2 = 10;
  executar(db, "INSERT INTO imoveis (id, apelido, tipo, cidade, endereco, fracao_ideal, area_m2, financiado) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", [
    apto1, "Apto 302 - Ed. Bela Vista", "apartamento", "Curitiba", "Av. Central, 850", 1, 72,
  ]);
  executar(db, "INSERT INTO imoveis (id, apelido, tipo, cidade, endereco, fracao_ideal, area_m2, financiado) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", [
    apto2, "Apto 501 - Ed. Central", "apartamento", "Curitiba", "Rua XV de Novembro, 430", 1, 85,
  ]);
  imoveis.push({ id: apto1, tipo: "apartamento", financiado: 1 }, { id: apto2, tipo: "apartamento", financiado: 1 });

  const apto3 = 12; // residência própria (uso pessoal) — não entra em contratos/DRE da atividade
  executar(
    db,
    "INSERT INTO imoveis (id, apelido, tipo, cidade, endereco, fracao_ideal, area_m2, financiado, uso_pessoal) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)",
    [apto3, "Apto Residencial (uso próprio)", "apartamento", "Curitiba", "Rua das Araucárias, 120", 1, 95],
  );

  // 4. Financiamentos (taxas ilustrativas — o financiamento 1 é deliberadamente
  // sobrecobrado nas transações abaixo, para popular o detector de anatocismo)
  executar(
    db,
    "INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [1, apto1, "Caixa Econômica Federal", "SAC", 320000, 0.75, somarMeses(hoje, -84), 360],
  );
  executar(
    db,
    "INSERT INTO financiamentos (id, imovel_id, instituicao, sistema, valor_contratado, taxa_juros_mensal, data_contrato, parcelas_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [2, apto2, "Banco do Brasil", "SAC", 410000, 0.8, somarMeses(hoje, -60), 360],
  );

  // 5. Obras
  const obras = [
    { imovel: 3, descricao: "Reforma banheiro Kitnet 103", natureza: "capex", valor: 8500 },
    { imovel: 1, descricao: "Pintura geral fachada Ed. Aurora", natureza: "manutencao", valor: 6200 },
    { imovel: apto1, descricao: "Troca de piso sala e quartos", natureza: "capex", valor: 15000 },
    { imovel: 5, descricao: "Reparo elétrico emergencial", natureza: "manutencao", valor: 900 },
  ];
  const obrasComData = obras.map((obra, indice) => {
    const inicio = somarMeses(hoje, -inteiroEntre(4, 30));
    executar(
      db,
      "INSERT INTO obras (id, imovel_id, descricao, data_inicio, data_fim, natureza, valor_total) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [indice + 1, obra.imovel, obra.descricao, inicio, somarDias(inicio, 20), obra.natureza, obra.valor],
    );
    return { ...obra, inicio };
  });

  // 6. Prestadores
  const prestadores = [
    { nome: "Maria Faxineira Serviços", servico: "faxina" },
    { nome: "José Santos - Portaria", servico: "portaria" },
    { nome: "Gestão Imóveis Airbnb Ltda", servico: "gestao_airbnb" },
    { nome: "Construtora Reforma Rápida", servico: "obra" },
    { nome: "Contador Silva & Associados", servico: "contabilidade" },
  ];
  prestadores.forEach((p, indice) => {
    executar(db, "INSERT INTO prestadores (id, nome, cpf_cnpj, servico) VALUES (?, ?, ?, ?)", [
      indice + 1, p.nome, `${inteiroEntre(10, 99)}.${inteiroEntre(100, 999)}.${inteiroEntre(100, 999)}/0001-${inteiroEntre(10, 99)}`, p.servico,
    ]);
  });

  // 7. Contratos de locação: turnover sequencial por imóvel ao longo dos 36 meses
  let proximoContratoId = 1;
  let contadorLocatario = 0;
  const proximoNomeLocatario = () => NOMES_LOCATARIOS[contadorLocatario++ % NOMES_LOCATARIOS.length];

  const contratos: {
    id: number; imovelId: number; tipo: "residencial_fixo" | "airbnb_temporada";
    valor: number; diaVencimento: number; inicio: string; fim: string | null; locatario: string;
  }[] = [];

  for (const imovel of imoveis.slice(0, 8)) {
    let cursorData = dataInicioJanela;
    const valorBase = imovel.tipo === "kitnet" ? entre(900, 1400) : entre(2200, 3200);
    while (cursorData < hoje) {
      const duracaoMeses = inteiroEntre(6, 18);
      const fimContrato = somarMeses(cursorData, duracaoMeses);
      const encerrado = fimContrato < hoje;
      contratos.push({
        id: proximoContratoId++,
        imovelId: imovel.id,
        tipo: "residencial_fixo",
        valor: Math.round(valorBase * entre(0.95, 1.15)),
        diaVencimento: inteiroEntre(1, 10),
        inicio: cursorData,
        fim: encerrado ? fimContrato : null,
        locatario: proximoNomeLocatario(),
      });

      // vacância curta entre contratos, coberta por temporada Airbnb
      if (encerrado && aleatorio() < 0.4) {
        const vacanciaFim = somarDias(fimContrato, inteiroEntre(10, 40));
        if (vacanciaFim < hoje) {
          contratos.push({
            id: proximoContratoId++,
            imovelId: imovel.id,
            tipo: "airbnb_temporada",
            valor: Math.round(valorBase * 0.6),
            diaVencimento: 0,
            inicio: fimContrato,
            fim: vacanciaFim,
            locatario: "Hóspedes Airbnb (temporada)",
          });
        }
        cursorData = vacanciaFim;
      } else {
        cursorData = fimContrato;
      }
    }
  }
  // apartamentos: locação longa, 1 contrato cobrindo quase toda a janela
  for (const apto of [apto1, apto2]) {
    contratos.push({
      id: proximoContratoId++,
      imovelId: apto,
      tipo: "residencial_fixo",
      valor: Math.round(entre(3200, 4200)),
      diaVencimento: inteiroEntre(1, 10),
      inicio: somarMeses(hoje, -inteiroEntre(20, 34)),
      fim: null,
      locatario: proximoNomeLocatario(),
    });
  }

  for (const contrato of contratos) {
    executar(
      db,
      `INSERT INTO contratos_locacao
       (id, imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio, data_fim, indice_reajuste, multa_percentual, juros_mensal_percentual, percentual_reajuste_primeira_renovacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'igpm', 2.0, 1.0, 5.0)`,
      [contrato.id, contrato.imovelId, contrato.locatario, contrato.tipo, contrato.valor, contrato.diaVencimento || null, contrato.inicio, contrato.fim],
    );
  }
  // registra um reajuste real (1ª renovação, percentual fixo) nos contratos de
  // apartamento que já passaram de 12 meses — popula o histórico de reajustes
  // com um caso não-hipotético para a tela de Reajustes e rescisão.
  for (const contrato of contratos.filter((c) => c.imovelId === apto1 || c.imovelId === apto2)) {
    if (diferencaEmMeses(contrato.inicio, hoje) >= 12) {
      const dataVigencia = somarMeses(contrato.inicio, 12);
      registrarReajuste(db, contrato.id, dataVigencia, Math.round(contrato.valor * 1.05), "fixo", "1ª renovação — percentual fixo pré-acordado");
    }
  }

  // Contrato "kitnet estudantil" — modelo com múltiplos locatários solidários,
  // valor único decomposto (aluguel efetivo x rateio de custeio) e encargos em
  // duas faixas, espelhando um contrato real de locação compartilhada.
  const imovelEstudantilId = 11;
  executar(
    db,
    "INSERT INTO imoveis (id, apelido, tipo, endereco, fracao_ideal, area_m2, financiado) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [imovelEstudantilId, "Kitnet 16 - Residencial Estudantil", "kitnet", "Servidão Exemplo, 25", 0.1, 26],
  );
  const contratoEstudantilId = proximoContratoId++;
  executar(
    db,
    `INSERT INTO contratos_locacao
     (id, imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio, data_fim, indice_reajuste,
      percentual_aluguel_efetivo, multa_percentual, multa_ate_dias, multa_percentual_substitutiva,
      juros_mensal_percentual, indice_correcao_mora, honorarios_percentual, dias_gatilho_judicial,
      percentual_reajuste_primeira_renovacao)
     VALUES (?, ?, ?, 'residencial_fixo', ?, 10, ?, NULL, 'ipca', 55, 2.0, 5, 10.0, 1.0, 'ipca', 20.0, 40, 6.0)`,
    [contratoEstudantilId, imovelEstudantilId, "Locatário Principal (exemplo)", 2490, somarMeses(hoje, -4)],
  );
  const partesEstudantil = [
    { nome: "Locatário Principal (exemplo)", papel: "locatario" },
    { nome: "Locatário Secundário (exemplo)", papel: "locatario" },
    { nome: "Responsável Financeiro 1 (exemplo)", papel: "responsavel_solidario" },
    { nome: "Responsável Financeiro 2 (exemplo)", papel: "responsavel_solidario" },
  ] as const;
  for (const parte of partesEstudantil) {
    executar(db, "INSERT INTO contrato_locatarios (contrato_id, nome, papel) VALUES (?, ?, ?)", [contratoEstudantilId, parte.nome, parte.papel]);
  }

  // 8. Índices econômicos simulados (ilustrativos — substituir pelos valores reais do BACEN/IBGE)
  let mesIndice = somarMeses(dataInicioJanela, -2);
  let contadorMes = 0;
  while (mesIndice <= hoje) {
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('poupanca', ?, ?)", [mesIndice, +entre(0.45, 0.72).toFixed(3)]);
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('igpm', ?, ?)", [mesIndice, +entre(-0.3, 1.1).toFixed(3)]);
    executar(db, "INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('ipca', ?, ?)", [mesIndice, +entre(0.1, 0.6).toFixed(3)]);
    contadorMes++;
    mesIndice = somarMeses(dataInicioJanela, contadorMes - 2);
  }

  // 9. Transações: pagamentos de contratos residenciais, com ruído (pontual, atrasado, faltante)
  let proximaTransacaoId = 1;
  let totalTransacoes = 0;
  const inserirTransacao = (
    contaId: number, data: string, valor: number, descricao: string,
    planoConta: string | null, imovelId: number | null, contratoId: number | null, prestadorId: number | null,
  ) => {
    executar(
      db,
      `INSERT INTO transacoes
       (id, conta_id, data, valor, descricao_original, fitid, plano_conta_codigo, imovel_id, contrato_id, prestador_id, categorizado_por, revisado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [proximaTransacaoId, contaId, data, valor, descricao, `seed-${proximaTransacaoId}`, planoConta, imovelId, contratoId, prestadorId, planoConta ? "regra" : null],
    );
    proximaTransacaoId++;
    totalTransacoes++;
  };

  let contratosInadimplentesForcados = 0;
  for (const contrato of contratos) {
    if (contrato.tipo === "airbnb_temporada") {
      inserirTransacao(
        escolher(contaIds), contrato.fim ?? hoje, contrato.valor,
        `AIRBNB PAYOUTS - IMOVEL ${contrato.imovelId}`, "1.2.01", contrato.imovelId, contrato.id, null,
      );
      continue;
    }

    let mes = contrato.inicio.slice(0, 8) + "01";
    const fim = contrato.fim ?? hoje;
    while (mes <= fim) {
      const dataVencimento = `${mes.slice(0, 8)}${String(contrato.diaVencimento).padStart(2, "0")}`;
      const sorte = aleatorio();

      // força 2 casos de inadimplência recente para popular a tela de aging
      const forcarInadimplencia = contratosInadimplentesForcados < 2 && mes >= somarMeses(hoje, -2) && contrato.id % 7 === 0;

      if (forcarInadimplencia) {
        contratosInadimplentesForcados++;
        // não gera transação: competência fica em aberto de propósito
      } else if (sorte < 0.05) {
        // pagamento faltante em mês passado — vira exceção histórica, não necessariamente inadimplência atual
      } else if (sorte < 0.15) {
        const atraso = inteiroEntre(5, 20);
        inserirTransacao(
          escolher(contaIds), somarDias(dataVencimento, atraso), contrato.valor,
          `PIX RECEBIDO ${contrato.locatario}`, "1.1.01", contrato.imovelId, contrato.id, null,
        );
      } else {
        inserirTransacao(escolher(contaIds), dataVencimento, contrato.valor, `PIX RECEBIDO ${contrato.locatario}`, "1.1.01", contrato.imovelId, contrato.id, null);
      }
      mes = somarMeses(mes, 1);
    }
  }

  // Pagamentos do contrato "kitnet estudantil": mês -4 e -3 em dia, mês -2 pago com
  // ~45 dias de atraso (dispara a multa substitutiva de 10% e os honorários, já que
  // dias_gatilho_judicial=40 nesse contrato), meses -1 e atual ficam em aberto de
  // propósito para popular a tela de inadimplência com um caso multi-locatário real.
  inserirTransacao(escolher(contaIds), `${somarMeses(hoje, -4).slice(0, 8)}10`, 2490, "PIX RECEBIDO LOCATARIO PRINCIPAL EXEMPLO", "1.1.01", imovelEstudantilId, contratoEstudantilId, null);
  inserirTransacao(escolher(contaIds), `${somarMeses(hoje, -3).slice(0, 8)}10`, 2490, "PIX RECEBIDO LOCATARIO PRINCIPAL EXEMPLO", "1.1.01", imovelEstudantilId, contratoEstudantilId, null);
  inserirTransacao(escolher(contaIds), somarDias(`${somarMeses(hoje, -2).slice(0, 8)}10`, 45), 2490, "PIX RECEBIDO LOCATARIO PRINCIPAL EXEMPLO (ATRASADO)", "1.1.01", imovelEstudantilId, contratoEstudantilId, null);
  for (let m = 4; m >= 1; m--) {
    const mes = somarMeses(hoje, -m);
    inserirTransacao(escolher(contaIds), mes, -entre(220, 320), "BOLETO CONDOMINIO KITNET 16 RESIDENCIAL ESTUDANTIL", "2.1.01", imovelEstudantilId, null, null);
    inserirTransacao(escolher(contaIds), mes, -entre(80, 150), "PIX PRESTADOR LIMPEZA AREAS COMUNS KITNET 16", "2.1.04", imovelEstudantilId, null, 1);
  }

  // despesas recorrentes: condomínio/IPTU por imóvel, financiamento, prestadores
  for (const imovel of imoveis) {
    let mes = dataInicioJanela;
    while (mes <= hoje) {
      inserirTransacao(escolher(contaIds), mes, -entre(180, 420), `BOLETO CONDOMINIO IMOVEL ${imovel.id}`, "2.1.01", imovel.id, null, null);
      mes = somarMeses(mes, 1);
    }
  }
  // Financiamento 1 (apto1) é lançado com juros ~22% acima do cronograma SAC teórico
  // de propósito — para o detector de anatocismo ter algo real para encontrar.
  const financiamentosSeed = [
    { imovelId: apto1, valorContratado: 320000, taxa: 0.75, parcelasTotal: 360, dataContrato: somarMeses(hoje, -84), fatorSobrecobranca: 1.22 },
    { imovelId: apto2, valorContratado: 410000, taxa: 0.8, parcelasTotal: 360, dataContrato: somarMeses(hoje, -60), fatorSobrecobranca: 1.0 },
  ];
  for (const f of financiamentosSeed) {
    const cronograma = gerarCronogramaSAC(f.valorContratado, f.taxa, f.parcelasTotal, f.dataContrato);
    for (const parcela of cronograma) {
      if (parcela.data < dataInicioJanela || parcela.data > hoje) continue;
      inserirTransacao(escolher(contaIds), parcela.data, -(parcela.juros * f.fatorSobrecobranca), `TED FINANCIAMENTO IMOVEL ${f.imovelId} JUROS`, "2.1.05", f.imovelId, null, null);
      inserirTransacao(escolher(contaIds), parcela.data, -parcela.amortizacao, `TED FINANCIAMENTO IMOVEL ${f.imovelId} AMORTIZACAO`, "2.1.06", f.imovelId, null, null);
    }
  }
  let mesPrestador = dataInicioJanela;
  while (mesPrestador <= hoje) {
    inserirTransacao(escolher(contaIds), mesPrestador, -entre(300, 600), "PIX FAXINA MENSAL ED AURORA", "2.1.04", 1, null, 1);
    inserirTransacao(escolher(contaIds), mesPrestador, -entre(400, 700), "PIX PORTARIA ED AURORA", "2.1.04", 1, null, 2);
    mesPrestador = somarMeses(mesPrestador, 1);
  }

  // obras (despesa pontual, na mesma data cadastrada em `obras`)
  for (const obra of obrasComData) {
    inserirTransacao(escolher(contaIds), obra.inicio, -obra.valor, `PAGAMENTO OBRA ${obra.descricao}`, obra.natureza === "capex" ? "2.1.03" : "2.1.02", obra.imovel, null, 4);
  }

  // pessoal: salário e transferências, deliberadamente misturado nas mesmas contas
  let mesSalario = dataInicioJanela;
  while (mesSalario <= hoje) {
    inserirTransacao(contaIds[0], somarDias(mesSalario, 4), 23400, "CREDITO FOLHA PAGAMENTO SIAPE", "1.9.01", null, null, null);
    mesSalario = somarMeses(mesSalario, 1);
  }

  // transações "mistério" sem categoria — fila de revisão manual
  for (let i = 0; i < 18; i++) {
    const data = somarDias(dataInicioJanela, inteiroEntre(0, 1080));
    const valor = aleatorio() < 0.5 ? -entre(50, 900) : entre(50, 900);
    inserirTransacao(
      escolher(contaIds), data, Math.round(valor * 100) / 100,
      escolher(["PIX RECEBIDO 47.XXX.XXX/0001-XX", "TED DESTINO NAO IDENTIFICADO", "COMPRA CARTAO DEBITO ESTABELECIMENTO DIVERSO", "SAQUE CAIXA ELETRONICO", "PIX ENVIADO CONTATO NAO CADASTRADO"]),
      null, null, null, null,
    );
  }

  // Anomalias propositais — provam que a auditoria forense (duplicatas/outliers) funciona de verdade.
  const contaFixa = contaIds[0];
  const dataDuplicata = somarMeses(hoje, -3);
  inserirTransacao(contaFixa, dataDuplicata, -540, "PIX PORTARIA ED AURORA REFORCO", "2.1.04", 1, null, 2);
  inserirTransacao(contaFixa, dataDuplicata, -540, "PIX PORTARIA ED AURORA REFORCO", "2.1.04", 1, null, 2);
  inserirTransacao(contaFixa, somarMeses(hoje, -5), -8900, "PIX GESTAO AIRBNB TAXA EXTRAORDINARIA", "2.1.04", 1, null, 3);

  // Despesas do apto de uso pessoal (apto3) — devem aparecer na tela de imóveis/transações,
  // mas ficar de fora do DRE da atividade de locação por padrão (não é o negócio).
  let mesApto3 = somarMeses(hoje, -11);
  while (mesApto3 <= hoje) {
    inserirTransacao(contaIds[2], somarDias(mesApto3, 8), -620, "BOLETO CONDOMINIO ED RESIDENCIAL PROPRIO", "2.1.01", apto3, null, null);
    mesApto3 = somarMeses(mesApto3, 1);
  }
  inserirTransacao(contaIds[2], somarMeses(hoje, -6), -1840, "IPTU 2026 RESIDENCIA PROPRIA COTA UNICA", "2.1.01", apto3, null, null);

  // 10. Cauções — algumas contratos residenciais recebem depósito caução
  let proximaCaucaoId = 1;
  let totalCaucoes = 0;
  const contratosResidenciais = [...contratos.filter((c) => c.tipo === "residencial_fixo")].sort(() => aleatorio() - 0.5);
  for (let i = 0; i < 6 && i < contratosResidenciais.length; i++) {
    const contrato = contratosResidenciais[i];
    const indice = escolher(["poupanca", "igpm", "nenhum"] as const);
    const jaDevolvido = contrato.fim !== null && aleatorio() < 0.6;
    executar(
      db,
      `INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao, data_devolucao, valor_devolvido, deducoes_descricao, deducoes_valor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        proximaCaucaoId, contrato.id, contrato.valor * 2, contrato.inicio, indice,
        jaDevolvido ? contrato.fim : null,
        jaDevolvido ? contrato.valor * 2 * 0.92 : null,
        jaDevolvido ? "desconto por reparo de pintura" : null,
        jaDevolvido ? contrato.valor * 0.16 : 0,
      ],
    );
    proximaCaucaoId++;
    totalCaucoes++;
  }

  return { imoveis: imoveis.length, contratos: contratos.length, transacoes: totalTransacoes, caucoes: totalCaucoes };
}

export function limparBanco(db: Database): void {
  const tabelas = [
    // tabelas com FK para outras vêm primeiro (ordem importa mesmo com PRAGMA foreign_keys
    // ligado, porque o SQLite valida a FK no momento do DELETE, não no fim da transação)
    "documento_transacoes", "documento_imoveis", "documentos",
    "rateios", "regras_categorizacao", "transacoes",
    "caucoes", "contrato_reajustes", "contrato_locatarios", "contratos_locacao",
    "obras", "financiamentos", "prestadores", "imoveis",
    "plano_de_contas", "contas_bancarias", "indices_economicos",
  ];
  for (const tabela of tabelas) executar(db, `DELETE FROM ${tabela}`);
}
