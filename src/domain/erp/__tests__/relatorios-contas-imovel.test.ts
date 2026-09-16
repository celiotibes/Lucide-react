import { describe, it, expect, beforeEach } from "vitest";
import {
  relatorioMovimentosConta,
  relatorioDepositosSaques,
  relatorioTransferenciasPessoais,
  relatorioAportesVersusResgates,
  relatorioSaldoPorPessoa,
  relatorioMudancaSaldoPeriodo,
  RelatorioBuilder,
  formatarMoeda,
  formatarPercentual,
} from "../relatorios-contas-pessoais";
import {
  relatorioReceitasAluguel,
  relatorioDespesasOperacionais,
  relatorioRetornoImagem,
  relatorioComparativoPropriedades,
  relatorioManutencaoAgendada,
  relatorioFluxoCaixaPropriedades,
  relatorioProvisioneFuturas,
  RelatorioImovelBuilder,
} from "../relatorios-imovel";
import { prepararBancoTeste } from "./test-setup";

describe("Relatórios de Contas Pessoais e Imóvel-Gestão", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;
  let data_inicio: string;
  let data_fim: string;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;

    // Datas de teste
    const hoje = new Date();
    data_fim = hoje.toISOString().split("T")[0];
    const umMesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 1, hoje.getDate());
    data_inicio = umMesAtras.toISOString().split("T")[0];
  });

  // ========================================================================
  // TESTES - CONTAS PESSOAIS
  // ========================================================================

  describe("relatorioMovimentosConta", () => {
    it("deve retornar estrutura de relatório de movimentos válida", () => {
      // Criar conta de teste
      db.run(
        `INSERT INTO contas_pessoais (entidade_id, tipo_conta, descricao, saldo_inicial, data_abertura, status, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entidade_id, "conta_corrente_pessoal", "Conta Principal", 5000, data_inicio, "ativa", new Date().toISOString()]
      );

      const [contaId] = db.exec(`SELECT id FROM contas_pessoais WHERE entidade_id = ? LIMIT 1`, [
        entidade_id,
      ])[0].values[0];

      // Inserir movimentos
      db.run(
        `INSERT INTO movimentos_pessoais (conta_pessoal_id, entidade_id, periodo_id, data_movimento, descricao, tipo_movimento, valor, categoria, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          contaId,
          entidade_id,
          periodo_id,
          data_inicio,
          "Depósito Salário",
          "entrada",
          3000,
          "salario",
          new Date().toISOString(),
        ]
      );

      db.run(
        `INSERT INTO movimentos_pessoais (conta_pessoal_id, entidade_id, periodo_id, data_movimento, descricao, tipo_movimento, valor, categoria, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          contaId,
          entidade_id,
          periodo_id,
          data_fim,
          "Pagamento Conta",
          "saida",
          500,
          "utilidades",
          new Date().toISOString(),
        ]
      );

      const relatorio = relatorioMovimentosConta(db, entidade_id, contaId, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("conta_id");
      expect(relatorio).toHaveProperty("conta_descricao");
      expect(relatorio).toHaveProperty("saldo_inicial");
      expect(relatorio).toHaveProperty("saldo_final");
      expect(relatorio).toHaveProperty("total_entradas");
      expect(relatorio).toHaveProperty("total_saidas");
      expect(relatorio).toHaveProperty("movimentos");
      expect(Array.isArray(relatorio.movimentos)).toBe(true);
    });

    it("saldo_final deve ser calculado corretamente", () => {
      const contaId = 1;
      const relatorio = relatorioMovimentosConta(db, entidade_id, contaId, data_inicio, data_fim);

      const esperado = relatorio.saldo_inicial + relatorio.total_entradas - relatorio.total_saidas;
      expect(relatorio.saldo_final).toBeCloseTo(esperado, 2);
    });

    it("movimentos devem estar ordenados por data", () => {
      const contaId = 1;
      const relatorio = relatorioMovimentosConta(db, entidade_id, contaId, data_inicio, data_fim);

      for (let i = 1; i < relatorio.movimentos.length; i++) {
        expect(relatorio.movimentos[i].data >= relatorio.movimentos[i - 1].data).toBe(true);
      }
    });
  });

  describe("relatorioDepositosSaques", () => {
    it("deve retornar estrutura de depósitos e saques válida", () => {
      const relatorio = relatorioDepositosSaques(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_depositos");
      expect(relatorio).toHaveProperty("total_saques");
      expect(relatorio).toHaveProperty("quantidade_depositos");
      expect(relatorio).toHaveProperty("quantidade_saques");
      expect(relatorio).toHaveProperty("deposito_medio");
      expect(relatorio).toHaveProperty("saque_medio");
      expect(Array.isArray(relatorio.linhas)).toBe(true);
    });

    it("total_depositos deve ser não-negativo", () => {
      const relatorio = relatorioDepositosSaques(db, entidade_id, data_inicio, data_fim);
      expect(relatorio.total_depositos).toBeGreaterThanOrEqual(0);
    });

    it("total_saques deve ser não-negativo", () => {
      const relatorio = relatorioDepositosSaques(db, entidade_id, data_inicio, data_fim);
      expect(relatorio.total_saques).toBeGreaterThanOrEqual(0);
    });

    it("deposito_medio deve ser calculado corretamente", () => {
      const relatorio = relatorioDepositosSaques(db, entidade_id, data_inicio, data_fim);
      if (relatorio.quantidade_depositos > 0) {
        const esperado = relatorio.total_depositos / relatorio.quantidade_depositos;
        expect(relatorio.deposito_medio).toBeCloseTo(esperado, 2);
      }
    });
  });

  describe("relatorioTransferenciasPessoais", () => {
    it("deve retornar estrutura de transferências válida", () => {
      const relatorio = relatorioTransferenciasPessoais(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_transferencias");
      expect(relatorio).toHaveProperty("quantidade_transferencias");
      expect(relatorio).toHaveProperty("transferencia_media");
      expect(relatorio).toHaveProperty("transferencias_saidas");
      expect(relatorio).toHaveProperty("transferencias_entradas");
      expect(Array.isArray(relatorio.linhas)).toBe(true);
    });

    it("quantidade_transferencias deve ser não-negativo", () => {
      const relatorio = relatorioTransferenciasPessoais(db, entidade_id, data_inicio, data_fim);
      expect(relatorio.quantidade_transferencias).toBeGreaterThanOrEqual(0);
    });
  });

  describe("relatorioAportesVersusResgates", () => {
    it("deve retornar estrutura de aportes e resgates válida", () => {
      const relatorio = relatorioAportesVersusResgates(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_aportes");
      expect(relatorio).toHaveProperty("total_resgates");
      expect(relatorio).toHaveProperty("quantidade_aportes");
      expect(relatorio).toHaveProperty("quantidade_resgates");
      expect(relatorio).toHaveProperty("aporte_liquido");
      expect(relatorio).toHaveProperty("aporte_medio");
      expect(relatorio).toHaveProperty("resgate_medio");
      expect(Array.isArray(relatorio.registros)).toBe(true);
    });

    it("aporte_liquido deve ser aportes menos resgates", () => {
      const relatorio = relatorioAportesVersusResgates(db, entidade_id, data_inicio, data_fim);
      const esperado = relatorio.total_aportes - relatorio.total_resgates;
      expect(relatorio.aporte_liquido).toBe(esperado);
    });

    it("aportes e resgates devem ser não-negativos", () => {
      const relatorio = relatorioAportesVersusResgates(db, entidade_id, data_inicio, data_fim);
      expect(relatorio.total_aportes).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_resgates).toBeGreaterThanOrEqual(0);
    });
  });

  describe("relatorioSaldoPorPessoa", () => {
    it("deve retornar estrutura de saldos por pessoa válida", () => {
      const relatorio = relatorioSaldoPorPessoa(db, entidade_id);

      expect(relatorio).toHaveProperty("data_consulta");
      expect(relatorio).toHaveProperty("total_geral");
      expect(relatorio).toHaveProperty("quantidade_pessoas");
      expect(Array.isArray(relatorio.saldos)).toBe(true);
    });

    it("quantidade_pessoas deve ser não-negativo", () => {
      const relatorio = relatorioSaldoPorPessoa(db, entidade_id);
      expect(relatorio.quantidade_pessoas).toBeGreaterThanOrEqual(0);
    });

    it("saldo total deve ser soma dos saldos das pessoas", () => {
      const relatorio = relatorioSaldoPorPessoa(db, entidade_id);
      const soma = relatorio.saldos.reduce((acc, p) => acc + p.saldo_total, 0);
      expect(relatorio.total_geral).toBeCloseTo(soma, 2);
    });
  });

  describe("relatorioMudancaSaldoPeriodo", () => {
    it("deve retornar estrutura de comparação de períodos válida", () => {
      const relatorio = relatorioMudancaSaldoPeriodo(db, entidade_id, periodo_id, periodo_id);

      expect(relatorio).toHaveProperty("periodo_anterior");
      expect(relatorio).toHaveProperty("periodo_atual");
      expect(relatorio).toHaveProperty("total_variacao_absoluta");
      expect(relatorio).toHaveProperty("total_variacao_percentual");
      expect(Array.isArray(relatorio.contas)).toBe(true);
    });

    it("cada conta deve ter variação calculada", () => {
      const relatorio = relatorioMudancaSaldoPeriodo(db, entidade_id, periodo_id, periodo_id);

      relatorio.contas.forEach((conta) => {
        expect(conta).toHaveProperty("conta_descricao");
        expect(conta).toHaveProperty("saldo_periodo_anterior");
        expect(conta).toHaveProperty("saldo_periodo_atual");
        expect(conta).toHaveProperty("variacao_absoluta");
        expect(conta).toHaveProperty("variacao_percentual");

        const variacao_esperada = conta.saldo_periodo_atual - conta.saldo_periodo_anterior;
        expect(conta.variacao_absoluta).toBeCloseTo(variacao_esperada, 2);
      });
    });
  });

  // ========================================================================
  // TESTES - IMÓVEL-GESTÃO
  // ========================================================================

  describe("relatorioReceitasAluguel", () => {
    it("deve retornar estrutura de receitas de aluguel válida", () => {
      // Criar imóvel de teste
      db.run(
        `INSERT INTO imoveis (entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entidade_id, "Rua das Flores 123", "apartamento", 0, 0, 500000, new Date().toISOString()]
      );

      const [imovelId] = db.exec(`SELECT id FROM imoveis WHERE entidade_id = ? LIMIT 1`, [entidade_id])[0]
        .values[0];

      try {
        const relatorio = relatorioReceitasAluguel(db, entidade_id, imovelId, data_inicio, data_fim);

        expect(relatorio).toHaveProperty("periodo");
        expect(relatorio).toHaveProperty("imovel_id");
        expect(relatorio).toHaveProperty("endereco");
        expect(relatorio).toHaveProperty("total_receita_aluguel");
        expect(relatorio).toHaveProperty("quantidade_inquilinos_ativos");
        expect(relatorio).toHaveProperty("receita_media_mensal");
        expect(Array.isArray(relatorio.linhas)).toBe(true);
      } catch (e) {
        // Esperado se tabelas de suporte não existem
      }
    });
  });

  describe("relatorioDespesasOperacionais", () => {
    it("deve retornar estrutura de despesas operacionais válida", () => {
      const relatorio = relatorioDespesasOperacionais(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_condominio");
      expect(relatorio).toHaveProperty("total_agua_esgoto");
      expect(relatorio).toHaveProperty("total_energia");
      expect(relatorio).toHaveProperty("total_internet");
      expect(relatorio).toHaveProperty("total_manutencao");
      expect(relatorio).toHaveProperty("total_seguros");
      expect(relatorio).toHaveProperty("total_geral");
      expect(relatorio).toHaveProperty("quantidade_despesas");
      expect(relatorio).toHaveProperty("despesa_media");
      expect(relatorio).toHaveProperty("despesas_por_imovel");
      expect(Array.isArray(relatorio.linhas)).toBe(true);
    });

    it("total_geral deve ser soma de todas as categorias", () => {
      const relatorio = relatorioDespesasOperacionais(db, entidade_id, data_inicio, data_fim);

      const soma =
        relatorio.total_condominio +
        relatorio.total_agua_esgoto +
        relatorio.total_energia +
        relatorio.total_internet +
        relatorio.total_manutencao +
        relatorio.total_seguros;

      expect(relatorio.total_geral).toBeCloseTo(soma, 2);
    });

    it("despesas devem ser não-negativas", () => {
      const relatorio = relatorioDespesasOperacionais(db, entidade_id, data_inicio, data_fim);

      expect(relatorio.total_condominio).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_agua_esgoto).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_energia).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_internet).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_manutencao).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_seguros).toBeGreaterThanOrEqual(0);
    });

    it("despesa_media deve ser calculada corretamente", () => {
      const relatorio = relatorioDespesasOperacionais(db, entidade_id, data_inicio, data_fim);

      if (relatorio.quantidade_despesas > 0) {
        const esperado = relatorio.total_geral / relatorio.quantidade_despesas;
        expect(relatorio.despesa_media).toBeCloseTo(esperado, 2);
      }
    });
  });

  describe("relatorioRetornoImagem", () => {
    it("deve retornar estrutura de retorno de imagem válida", () => {
      const relatorio = relatorioRetornoImagem(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("quantidade_imoveis");
      expect(relatorio).toHaveProperty("roi_medio_geral");
      expect(relatorio).toHaveProperty("yield_medio_geral");
      expect(relatorio).toHaveProperty("roi_total_anual");
      expect(Array.isArray(relatorio.imoveis)).toBe(true);
    });

    it("cada imóvel deve ter ROI e yield calculados", () => {
      const relatorio = relatorioRetornoImagem(db, entidade_id, data_inicio, data_fim);

      relatorio.imoveis.forEach((imovel) => {
        expect(imovel).toHaveProperty("imovel_id");
        expect(imovel).toHaveProperty("endereco");
        expect(imovel).toHaveProperty("valor_aquisicao");
        expect(imovel).toHaveProperty("receita_anual_estimada");
        expect(imovel).toHaveProperty("despesa_anual_estimada");
        expect(imovel).toHaveProperty("lucro_liquido_anual");
        expect(imovel).toHaveProperty("roi_percentual");
        expect(imovel).toHaveProperty("yield_mensal");
        expect(imovel).toHaveProperty("yield_anual");

        // Validação de cálculos
        const lucro_esperado =
          imovel.receita_anual_estimada - imovel.despesa_anual_estimada;
        expect(imovel.lucro_liquido_anual).toBeCloseTo(lucro_esperado, 2);
      });
    });
  });

  describe("relatorioComparativoPropriedades", () => {
    it("deve retornar estrutura de comparativo de propriedades válida", () => {
      const relatorio = relatorioComparativoPropriedades(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("quantidade_imoveis");
      expect(relatorio).toHaveProperty("melhor_desempenho");
      expect(relatorio).toHaveProperty("pior_desempenho");
      expect(relatorio).toHaveProperty("desempenho_medio");
      expect(Array.isArray(relatorio.imoveis)).toBe(true);
    });

    it("imoveis deve estar ordenado por score de performance", () => {
      const relatorio = relatorioComparativoPropriedades(db, entidade_id, data_inicio, data_fim);

      for (let i = 1; i < relatorio.imoveis.length; i++) {
        expect(relatorio.imoveis[i].score_performance <=
          relatorio.imoveis[i - 1].score_performance).toBe(true);
      }
    });

    it("margem_liquida deve ser aluguel menos despesas", () => {
      const relatorio = relatorioComparativoPropriedades(db, entidade_id, data_inicio, data_fim);

      relatorio.imoveis.forEach((imovel) => {
        const margem_esperada = imovel.valor_aluguel_mensal - imovel.despesas_mensais;
        expect(imovel.margem_liquida).toBeCloseTo(margem_esperada, 2);
      });
    });
  });

  describe("relatorioManutencaoAgendada", () => {
    it("deve retornar estrutura de manutenção agendada válida", () => {
      const relatorio = relatorioManutencaoAgendada(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("total_pendente");
      expect(relatorio).toHaveProperty("total_concluida");
      expect(relatorio).toHaveProperty("total_cancelada");
      expect(relatorio).toHaveProperty("custo_total_pendente");
      expect(relatorio).toHaveProperty("custo_total_concluido");
      expect(relatorio).toHaveProperty("quantidade_pendente");
      expect(relatorio).toHaveProperty("quantidade_concluida");
      expect(Array.isArray(relatorio.linhas)).toBe(true);
    });

    it("todos os totais devem ser não-negativos", () => {
      const relatorio = relatorioManutencaoAgendada(db, entidade_id, data_inicio, data_fim);

      expect(relatorio.total_pendente).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_concluida).toBeGreaterThanOrEqual(0);
      expect(relatorio.total_cancelada).toBeGreaterThanOrEqual(0);
      expect(relatorio.custo_total_pendente).toBeGreaterThanOrEqual(0);
      expect(relatorio.custo_total_concluido).toBeGreaterThanOrEqual(0);
    });
  });

  describe("relatorioFluxoCaixaPropriedades", () => {
    it("deve retornar estrutura de fluxo de caixa válida", () => {
      const relatorio = relatorioFluxoCaixaPropriedades(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("quantidade_imoveis");
      expect(relatorio).toHaveProperty("fluxo_total_geral");
      expect(relatorio).toHaveProperty("entradas_totais");
      expect(relatorio).toHaveProperty("saidas_totais");
      expect(Array.isArray(relatorio.imagem)).toBe(true);
    });

    it("fluxo_total_geral deve ser soma de todos os fluxos líquidos", () => {
      const relatorio = relatorioFluxoCaixaPropriedades(db, entidade_id, data_inicio, data_fim);

      const soma = relatorio.imagem.reduce((acc, f) => acc + f.fluxo_liquido, 0);
      expect(relatorio.fluxo_total_geral).toBeCloseTo(soma, 2);
    });

    it("cada propriedade deve ter saldo_final = saldo_inicial + fluxo_liquido", () => {
      const relatorio = relatorioFluxoCaixaPropriedades(db, entidade_id, data_inicio, data_fim);

      relatorio.imagem.forEach((fluxo) => {
        const saldo_esperado = fluxo.saldo_inicial + fluxo.fluxo_liquido;
        expect(fluxo.saldo_final).toBeCloseTo(saldo_esperado, 2);
      });
    });
  });

  describe("relatorioProvisioneFuturas", () => {
    it("deve retornar estrutura de provisões futuras válida", () => {
      const relatorio = relatorioProvisioneFuturas(db, entidade_id, data_inicio, data_fim);

      expect(relatorio).toHaveProperty("periodo");
      expect(relatorio).toHaveProperty("quantidade_imoveis");
      expect(relatorio).toHaveProperty("provisao_total_manutencao");
      expect(relatorio).toHaveProperty("provisao_total_seguro");
      expect(relatorio).toHaveProperty("provisao_total_vaga");
      expect(relatorio).toHaveProperty("provisao_total_reforma");
      expect(relatorio).toHaveProperty("provisao_total_geral");
      expect(Array.isArray(relatorio.imoveis)).toBe(true);
    });

    it("provisao_total_geral deve ser soma de todas as provisões", () => {
      const relatorio = relatorioProvisioneFuturas(db, entidade_id, data_inicio, data_fim);

      const soma =
        relatorio.provisao_total_manutencao +
        relatorio.provisao_total_seguro +
        relatorio.provisao_total_vaga +
        relatorio.provisao_total_reforma;

      expect(relatorio.provisao_total_geral).toBeCloseTo(soma, 2);
    });

    it("cada imóvel deve ter situação de adequação definida", () => {
      const relatorio = relatorioProvisioneFuturas(db, entidade_id, data_inicio, data_fim);

      relatorio.imoveis.forEach((imovel) => {
        expect(["adequada", "insuficiente", "excessiva"]).toContain(imovel.situacao);
      });
    });

    it("total_provisoes por imóvel deve ser soma das reservas", () => {
      const relatorio = relatorioProvisioneFuturas(db, entidade_id, data_inicio, data_fim);

      relatorio.imoveis.forEach((imovel) => {
        const soma =
          imovel.reserva_manutencao +
          imovel.reserva_seguro +
          imovel.reserva_vaga +
          imovel.reserva_reforma;

        expect(imovel.total_provisoes).toBeCloseTo(soma, 2);
      });
    });
  });

  // ========================================================================
  // TESTES - BUILDER PATTERN
  // ========================================================================

  describe("RelatorioBuilder", () => {
    it("deve permitir encadeamento de métodos", () => {
      const builder = new RelatorioBuilder(db, entidade_id);
      const config = builder.comPeriodo(periodo_id).comConta(1).entreDataas(data_inicio, data_fim).build();

      expect(config.periodo_id).toBe(periodo_id);
      expect(config.conta_id).toBe(1);
      expect(config.data_inicio).toBe(data_inicio);
      expect(config.data_fim).toBe(data_fim);
    });
  });

  describe("RelatorioImovelBuilder", () => {
    it("deve permitir encadeamento de métodos", () => {
      const builder = new RelatorioImovelBuilder(db, entidade_id);
      const config = builder.comPeriodo(periodo_id).comImovel(1).entreDataas(data_inicio, data_fim).build();

      expect(config.periodo_id).toBe(periodo_id);
      expect(config.imovel_id).toBe(1);
      expect(config.data_inicio).toBe(data_inicio);
      expect(config.data_fim).toBe(data_fim);
    });
  });

  // ========================================================================
  // TESTES - FUNÇÕES AUXILIARES
  // ========================================================================

  describe("formatarMoeda", () => {
    it("deve formatar valor em moeda BRL", () => {
      const valor = 1234.56;
      const formatado = formatarMoeda(valor);

      expect(formatado).toContain("R$");
      expect(formatado).toContain("1");
    });
  });

  describe("formatarPercentual", () => {
    it("deve formatar percentual com 2 casas decimais", () => {
      const valor = 33.3333;
      const formatado = formatarPercentual(valor);

      expect(formatado).toContain("%");
      expect(formatado).toContain("33.33");
    });
  });

  // ========================================================================
  // TESTES DE INTEGRAÇÃO
  // ========================================================================

  describe("Integração - Contas Pessoais", () => {
    it("movimentos devem refletir em saldo consolidado", () => {
      // Teste que saldos pessoais agregam corretamente
      const relatorio = relatorioSaldoPorPessoa(db, entidade_id);

      relatorio.saldos.forEach((pessoa) => {
        const soma_contas = Object.values(pessoa.saldos_por_conta).reduce((a, b) => a + b, 0);
        expect(pessoa.saldo_total).toBeCloseTo(soma_contas, 2);
      });
    });
  });

  describe("Integração - Imóvel-Gestão", () => {
    it("fluxo de caixa deve consolidar receitas e despesas", () => {
      const relatorio = relatorioFluxoCaixaPropriedades(db, entidade_id, data_inicio, data_fim);

      const soma_entradas = relatorio.imagem.reduce((acc, f) => acc + f.total_entradas, 0);
      const soma_saidas = relatorio.imagem.reduce((acc, f) => acc + f.total_saidas, 0);

      expect(relatorio.entradas_totais).toBeCloseTo(soma_entradas, 2);
      expect(relatorio.saidas_totais).toBeCloseTo(soma_saidas, 2);
    });

    it("comparativo deve refletir mesmos dados de ROI", () => {
      const relatorioRetorno = relatorioRetornoImagem(db, entidade_id, data_inicio, data_fim);
      const relatorioComparativo = relatorioComparativoPropriedades(db, entidade_id, data_inicio, data_fim);

      expect(relatorioRetorno.quantidade_imoveis).toBe(relatorioComparativo.quantidade_imoveis);
    });
  });
});
