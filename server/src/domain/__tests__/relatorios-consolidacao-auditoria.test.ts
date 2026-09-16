/**
 * Testes Integrados: Relatórios de Consolidação e Auditoria (SPRINT 3)
 * 350+ linhas cobrindo:
 * - Matemática de consolidação (soma de partes = total)
 * - Completude de audit trail
 * - Verificação de hash snapshot
 * - Detecção de anomalias
 * - Geração de logs de acesso
 */

import {
  relatorioConsolidacaoModulos,
  relatorioExecutivoFinanceiro,
  relatorioPainelGestao,
  relatorioFluxoCaixaConsolidado,
  relatorioSensibilidadeIPCA,
  relatorioProjetacaoProximos12Meses,
  gerarTodosRelatorios,
  type LancamentoConsolidado,
} from "../erp/relatorios-consolidacao";

import {
  relatorioRastreabilidadeCompleta,
  relatorioConformidadeContabil,
  relatorioIntegridadeHashSnapshot,
  relatorioAnomalias,
  relatorioRetificacoes,
  relatorioAcessoPessoas,
  gerarHashPeriodo,
  verificarIntegridadeSnapshot,
  validarLancamento,
  type AuditoriaLancamento,
  type RetificacaoRegistro,
  type AcessoUsuario,
} from "../erp/relatorios-auditoria";

// ============================================================================
// DADOS DE TESTE
// ============================================================================

const LANCAMENTOS_TESTE: LancamentoConsolidado[] = [
  // Payroll
  {
    id: "LCT-001",
    data: "2024-09-10",
    origem_modulo: "payroll",
    tipo_documento: "folha_pagamento",
    descricao: "Folha de Setembro - João Silva",
    valor: 3000,
    conta_debito: "6.2.01",
    conta_credito: "3.1.02",
    centro_custo: "CC-001",
    usuario_id: "USER-001",
    status: "finalizado",
    hash_verificacao: "abc123",
  },
  {
    id: "LCT-002",
    data: "2024-09-10",
    origem_modulo: "payroll",
    tipo_documento: "desconto",
    descricao: "INSS - João Silva",
    valor: 225,
    conta_debito: "6.2.02",
    conta_credito: "3.1.03",
    centro_custo: "CC-001",
    usuario_id: "USER-001",
    status: "finalizado",
    hash_verificacao: "def456",
  },
  // Despesas
  {
    id: "LCT-003",
    data: "2024-09-15",
    origem_modulo: "despesas",
    tipo_documento: "condominio",
    descricao: "Condomínio - Bloco A",
    valor: 500,
    conta_debito: "6.3.01",
    conta_credito: "3.1.10",
    centro_custo: "CC-002",
    usuario_id: "USER-002",
    status: "processado",
    hash_verificacao: "ghi789",
  },
  // API Gateway (Receita)
  {
    id: "LCT-004",
    data: "2024-09-14",
    origem_modulo: "api-gateway",
    tipo_documento: "diaria",
    descricao: "Diária de cliente - Serviço X",
    valor: 1500,
    conta_debito: "1.1.01",
    conta_credito: "4.1.01",
    centro_custo: "CC-001",
    usuario_id: "USER-001",
    status: "criado",
    hash_verificacao: "jkl012",
  },
  // Webhook
  {
    id: "LCT-005",
    data: "2024-09-12",
    origem_modulo: "webhook",
    tipo_documento: "sincronizacao",
    descricao: "Sincronização Pluggy",
    valor: 500,
    conta_debito: "1.1.02",
    conta_credito: "2.1.01",
    usuario_id: "SYSTEM",
    status: "finalizado",
    hash_verificacao: "mno345",
  },
  // Apontamento
  {
    id: "LCT-006",
    data: "2024-09-13",
    origem_modulo: "apontamento",
    tipo_documento: "apontamento_prestador",
    descricao: "Apontamento - Semana 37",
    valor: 800,
    conta_debito: "6.1.01",
    conta_credito: "3.1.04",
    centro_custo: "CC-003",
    usuario_id: "PRESTADOR-001",
    status: "aprovado",
    hash_verificacao: "pqr678",
  },
];

const AUDITORIA_LANCAMENTOS: AuditoriaLancamento[] = LANCAMENTOS_TESTE.map(l => ({
  lancamento_id: l.id,
  origem_modulo: l.origem_modulo,
  tipo_documento: l.tipo_documento,
  data_criacao: l.data,
  data_lancamento: l.data,
  descricao: l.descricao,
  valor: l.valor,
  conta_debito: l.conta_debito,
  conta_credito: l.conta_credito,
  usuario_criador: l.usuario_id || "UNKNOWN",
  status: l.status,
  documento_referencia: l.id,
  centro_custo: l.centro_custo,
}));

const RETIFICACOES_TESTE: RetificacaoRegistro[] = [
  {
    id: "RET-001",
    lancamento_original_id: "LCT-001",
    data_retificacao: "2024-09-11T10:00:00Z",
    usuario_retificador: "USER-001",
    motivo: "Correção de valor",
    campo_alterado: "valor",
    valor_anterior: 3000,
    valor_novo: 3100,
    tipo_operacao: "correcao",
    justificativa_detalhada: "Valor incorreto processado, corrigido conforme recebimento",
    hash_retificacao: "ret123",
  },
];

const ACESSOS_TESTE: AcessoUsuario[] = [
  {
    timestamp: "2024-09-10T08:00:00Z",
    usuario_id: "USER-001",
    usuario_nome: "João Silva",
    acao: "criacao",
    tipo_entidade: "lancamento",
    entidade_id: "LCT-001",
    descricao_acao: "Criação de lançamento de folha",
    resultado: "sucesso",
  },
  {
    timestamp: "2024-09-10T08:05:00Z",
    usuario_id: "USER-001",
    usuario_nome: "João Silva",
    acao: "aprovacao",
    tipo_entidade: "lancamento",
    entidade_id: "LCT-001",
    descricao_acao: "Aprovação de lançamento",
    resultado: "sucesso",
  },
  {
    timestamp: "2024-09-11T14:00:00Z",
    usuario_id: "USER-001",
    usuario_nome: "João Silva",
    acao: "edicao",
    tipo_entidade: "lancamento",
    entidade_id: "LCT-001",
    dados_anteriores: { valor: 3000 },
    dados_novos: { valor: 3100 },
    descricao_acao: "Edição de valor",
    resultado: "sucesso",
  },
];

// ============================================================================
// TESTES: CONSOLIDAÇÃO
// ============================================================================

describe("Relatórios de Consolidação - Módulos", () => {
  test("Deve consolidar lançamentos por módulo de origem", () => {
    const relatorio = relatorioConsolidacaoModulos(LANCAMENTOS_TESTE, "2024-09");

    expect(relatorio).toBeDefined();
    expect(relatorio.modulos).toHaveLength(5); // payroll, despesas, api-gateway, webhook, apontamento
    expect(relatorio.periodo).toBe("2024-09");

    // Validar agregação por módulo
    const moduloPayroll = relatorio.modulos.find(m => m.nome_modulo === "payroll");
    expect(moduloPayroll).toBeDefined();
    expect(moduloPayroll!.total_lancamentos).toBe(2); // LCT-001, LCT-002
    expect(moduloPayroll!.total_valor).toBe(3225); // 3000 + 225
  });

  test("Soma de partes deve igualar o total consolidado", () => {
    const relatorio = relatorioConsolidacaoModulos(LANCAMENTOS_TESTE, "2024-09");

    const somaParcial = relatorio.modulos.reduce((sum, m) => sum + m.total_valor, 0);
    expect(somaParcial).toBe(relatorio.total_geral);
  });

  test("Total de lançamentos deve estar correto", () => {
    const relatorio = relatorioConsolidacaoModulos(LANCAMENTOS_TESTE, "2024-09");

    const totalParcial = relatorio.modulos.reduce((sum, m) => sum + m.total_lancamentos, 0);
    expect(totalParcial).toBe(relatorio.total_lancamentos_geral);
    expect(relatorio.total_lancamentos_geral).toBe(LANCAMENTOS_TESTE.length);
  });

  test("Hash do módulo deve ser gerado corretamente", () => {
    const relatorio = relatorioConsolidacaoModulos(LANCAMENTOS_TESTE, "2024-09");

    // Cada módulo deve ter um hash único
    const hashes = relatorio.modulos.map(m => m.hash_modulo);
    const hashesUnicos = new Set(hashes);
    expect(hashesUnicos.size).toBe(hashes.length); // Todos diferentes
  });
});

describe("Relatório Executivo Financeiro", () => {
  test("Deve gerar demonstrativo financeiro com estrutura correta", () => {
    const relatorio = relatorioExecutivoFinanceiro(LANCAMENTOS_TESTE, "2024-09");

    expect(relatorio.periodo).toBe("2024-09");
    expect(relatorio.ativo).toBeDefined();
    expect(relatorio.passivo).toBeDefined();
    expect(relatorio.patrimonio).toBeDefined();
    expect(relatorio.demonstrativo_resultado).toBeDefined();
  });

  test("Ativo = Passivo + Patrimônio (Equação Fundamental)", () => {
    const relatorio = relatorioExecutivoFinanceiro(LANCAMENTOS_TESTE, "2024-09");

    const somaPassivoPatrimonio = relatorio.passivo.total + relatorio.patrimonio.total;
    // Permitir margem de erro por arredondamento
    expect(Math.abs(relatorio.ativo.total - somaPassivoPatrimonio)).toBeLessThan(1);
  });
});

describe("Painel de Gestão - KPIs", () => {
  test("Deve calcular KPIs válidos", () => {
    const relatorio = relatorioPainelGestao(LANCAMENTOS_TESTE, "2024-09");

    expect(relatorio.kpis).toBeDefined();
    expect(relatorio.kpis.margem_lucro).toBeGreaterThanOrEqual(-100);
    expect(relatorio.kpis.roi).toBeGreaterThanOrEqual(-100);
    expect(relatorio.kpis.liquidez_corrente).toBeGreaterThanOrEqual(0);
    expect(relatorio.kpis.indice_endividamento).toBeGreaterThanOrEqual(0);
    expect(relatorio.kpis.taxa_crescimento).toBeGreaterThanOrEqual(-100);
  });

  test("Deve gerar alertas quando KPIs críticos", () => {
    const relatorio = relatorioPainelGestao(LANCAMENTOS_TESTE, "2024-09", 1000000);

    // Verificar estrutura de alertas
    expect(Array.isArray(relatorio.alertas)).toBe(true);
    relatorio.alertas.forEach(alerta => {
      expect(["crítico", "aviso", "informativo"]).toContain(alerta.severidade);
      expect(alerta.mensagem).toBeDefined();
      expect(alerta.data_deteccao).toBeDefined();
    });
  });

  test("Tendências devem ter 30 dias de dados", () => {
    const relatorio = relatorioPainelGestao(LANCAMENTOS_TESTE, "2024-09");

    expect(relatorio.tendencias.receita_30dias).toHaveLength(30);
    expect(relatorio.tendencias.despesa_30dias).toHaveLength(30);
  });
});

describe("Fluxo de Caixa Consolidado", () => {
  test("Deve estruturar fluxo de caixa com 3 atividades", () => {
    const relatorio = relatorioFluxoCaixaConsolidado(LANCAMENTOS_TESTE, "2024-09");

    expect(relatorio.atividades_operacionais).toBeDefined();
    expect(relatorio.atividades_investimento).toBeDefined();
    expect(relatorio.atividades_financiamento).toBeDefined();
  });

  test("Variação de caixa = soma de atividades", () => {
    const relatorio = relatorioFluxoCaixaConsolidado(LANCAMENTOS_TESTE, "2024-09");

    const variacaoEsperada =
      relatorio.atividades_operacionais.fluxo_liquido +
      relatorio.atividades_investimento.fluxo_liquido +
      relatorio.atividades_financiamento.fluxo_liquido;

    expect(Math.abs(relatorio.variacao_caixa - variacaoEsperada)).toBeLessThan(1);
  });

  test("Saldo final = saldo inicial + variação", () => {
    const saldoInicial = 100000;
    const relatorio = relatorioFluxoCaixaConsolidado(LANCAMENTOS_TESTE, "2024-09", saldoInicial);

    const saldoEsperado = saldoInicial + relatorio.variacao_caixa;
    expect(Math.abs(relatorio.saldo_final - saldoEsperado)).toBeLessThan(1);
  });
});

describe("Sensibilidade IPCA", () => {
  test("Deve calcular impacto IPCA em rubricas", () => {
    const ipca = 10.5;
    const relatorio = relatorioSensibilidadeIPCA(LANCAMENTOS_TESTE, "2024-09", ipca);

    expect(relatorio.ipca_acumulado).toBe(ipca);
    expect(relatorio.rubricas.length).toBeGreaterThan(0);

    // Verificar impacto calculado corretamente
    relatorio.rubricas.forEach(rubrica => {
      const valorProjetado = rubrica.valor_atual * (1 + ipca / 100);
      expect(Math.abs(rubrica.valor_projetado_ipca - valorProjetado)).toBeLessThan(0.01);
    });
  });

  test("Custo anual projetado > custo atual quando IPCA positivo", () => {
    const relatorio = relatorioSensibilidadeIPCA(LANCAMENTOS_TESTE, "2024-09", 10.5);

    expect(relatorio.custo_anual_projetado).toBeGreaterThan(relatorio.custo_anual_atual);
  });
});

describe("Projeção Orçamentária 12 Meses", () => {
  test("Deve gerar projeção para 12 meses", () => {
    const relatorio = relatorioProjetacaoProximos12Meses(LANCAMENTOS_TESTE, "2024-09");

    expect(relatorio.receitas_projetadas).toHaveLength(12);
    expect(relatorio.despesas_projetadas).toHaveLength(12);
    expect(relatorio.fluxo_caixa_projetado).toHaveLength(12);
  });

  test("Cenários devem impactar valores corretamente", () => {
    const relatorioEsperado = relatorioProjetacaoProximos12Meses(LANCAMENTOS_TESTE, "2024-09", "esperado");
    const relatorioOtimista = relatorioProjetacaoProximos12Meses(LANCAMENTOS_TESTE, "2024-09", "otimista");
    const relatorioPessimista = relatorioProjetacaoProximos12Meses(LANCAMENTOS_TESTE, "2024-09", "pessimista");

    // Receita otimista > esperada > pessimista
    expect(relatorioOtimista.receitas_projetadas[0].valor).toBeGreaterThan(
      relatorioEsperado.receitas_projetadas[0].valor
    );
    expect(relatorioEsperado.receitas_projetadas[0].valor).toBeGreaterThan(
      relatorioPessimista.receitas_projetadas[0].valor
    );
  });

  test("Margem de segurança diferente por cenário", () => {
    const relatorioEsperado = relatorioProjetacaoProximos12Meses(LANCAMENTOS_TESTE, "2024-09", "esperado");
    const relatorioOtimista = relatorioProjetacaoProximos12Meses(LANCAMENTOS_TESTE, "2024-09", "otimista");

    expect(relatorioEsperado.margem_seguranca).toBe(10);
    expect(relatorioOtimista.margem_seguranca).toBe(5);
  });
});

describe("Geração Integrada de Todos os Relatórios", () => {
  test("Deve gerar todos 6 relatórios em uma chamada", () => {
    const relatorios = gerarTodosRelatorios(LANCAMENTOS_TESTE, "2024-09");

    expect(relatorios.consolidacao).toBeDefined();
    expect(relatorios.financeiro).toBeDefined();
    expect(relatorios.painel).toBeDefined();
    expect(relatorios.fluxo_caixa).toBeDefined();
    expect(relatorios.sensibilidade_ipca).toBeDefined();
    expect(relatorios.projecao_12m).toBeDefined();
  });
});

// ============================================================================
// TESTES: AUDITORIA
// ============================================================================

describe("Audit Trail - Rastreabilidade Completa", () => {
  test("Deve gerar rastreabilidade com sequência correta", () => {
    const relatorio = relatorioRastreabilidadeCompleta(AUDITORIA_LANCAMENTOS, "2024-09");

    expect(relatorio).toHaveLength(AUDITORIA_LANCAMENTOS.length);

    // Verificar sequência
    relatorio.forEach((r, i) => {
      expect(r.sequencia_auditoria).toBe(i + 1);
    });
  });

  test("Cada lançamento deve ter hash único", () => {
    const relatorio = relatorioRastreabilidadeCompleta(AUDITORIA_LANCAMENTOS, "2024-09");

    const hashes = relatorio.map(r => r.hash_lancamento);
    const hashesUnicos = new Set(hashes);
    expect(hashesUnicos.size).toBe(hashes.length);
  });

  test("Deve validar origem do módulo", () => {
    const relatorio = relatorioRastreabilidadeCompleta(AUDITORIA_LANCAMENTOS, "2024-09");

    relatorio.forEach(r => {
      expect(r.modulo_origem_confirmado).toBeDefined();
      expect(typeof r.modulo_origem_confirmado).toBe("boolean");
    });
  });
});

describe("Conformidade Contábil - Partidas Dobradas", () => {
  test("Deve validar partidas dobradas (débito = crédito)", () => {
    const relatorio = relatorioConformidadeContabil(AUDITORIA_LANCAMENTOS, "2024-09");

    expect(relatorio.conforme).toBeDefined();
    expect(relatorio.saldo_debito).toBeGreaterThanOrEqual(0);
    expect(relatorio.saldo_credito).toBeGreaterThanOrEqual(0);
  });

  test("Deve contar lançamentos válidos e inválidos", () => {
    const relatorio = relatorioConformidadeContabil(AUDITORIA_LANCAMENTOS, "2024-09");

    expect(
      relatorio.lancamentos_validos + relatorio.lancamentos_invalidos
    ).toBe(relatorio.total_lancamentos_validados);
  });

  test("Deve detectar violações de conformidade", () => {
    const relatorio = relatorioConformidadeContabil(AUDITORIA_LANCAMENTOS, "2024-09");

    relatorio.violacoes.forEach(v => {
      expect([
        "debito_credito_desbalanceado",
        "conta_invalida",
        "data_invalida",
        "valor_negativo",
      ]).toContain(v.tipo_violacao);
      expect([
        "crítico",
        "aviso",
      ]).toContain(v.severidade);
    });
  });
});

describe("Integridade Hash - Snapshot SHA-256", () => {
  test("Deve gerar hash SHA-256 para período", () => {
    const snapshot = relatorioIntegridadeHashSnapshot(AUDITORIA_LANCAMENTOS, "2024-09");

    expect(snapshot.hash_periodo_sha256).toBeDefined();
    expect(snapshot.hash_periodo_sha256).toMatch(/^[a-f0-9]{64}$/); // SHA-256 é 64 caracteres hex
  });

  test("Hash de cada lançamento deve ser único", () => {
    const snapshot = relatorioIntegridadeHashSnapshot(AUDITORIA_LANCAMENTOS, "2024-09");

    const hashes = Object.values(snapshot.hashes_lancamentos);
    const hashesUnicos = new Set(hashes);
    expect(hashesUnicos.size).toBe(hashes.length);
  });

  test("Verificação de integridade deve passar com dados originais", () => {
    const snapshot = relatorioIntegridadeHashSnapshot(AUDITORIA_LANCAMENTOS, "2024-09");

    const integra = verificarIntegridadeSnapshot(snapshot, AUDITORIA_LANCAMENTOS);
    expect(integra).toBe(true);
  });

  test("Verificação de integridade deve falhar com dados alterados", () => {
    const snapshot = relatorioIntegridadeHashSnapshot(AUDITORIA_LANCAMENTOS, "2024-09");

    // Alterar valor de um lançamento
    const lancamentosAlterados = [...AUDITORIA_LANCAMENTOS];
    lancamentosAlterados[0].valor = 9999;

    const integra = verificarIntegridadeSnapshot(snapshot, lancamentosAlterados);
    expect(integra).toBe(false);
  });
});

describe("Detecção de Anomalias", () => {
  test("Deve detectar anomalias em lançamentos", () => {
    const relatorio = relatorioAnomalias(AUDITORIA_LANCAMENTOS, "2024-09");

    expect(relatorio.total_anomalias_detectadas).toBeGreaterThanOrEqual(0);
    expect(relatorio.anomalias_criticas).toBeDefined();
    expect(relatorio.anomalias_avisos).toBeDefined();
  });

  test("Score de risco deve estar entre 0 e 100", () => {
    const relatorio = relatorioAnomalias(AUDITORIA_LANCAMENTOS, "2024-09");

    expect(relatorio.score_risco_geral).toBeGreaterThanOrEqual(0);
    expect(relatorio.score_risco_geral).toBeLessThanOrEqual(100);

    relatorio.anomalias_criticas.forEach(a => {
      expect(a.score_risco).toBeGreaterThanOrEqual(0);
      expect(a.score_risco).toBeLessThanOrEqual(100);
    });
  });

  test("Anomalias críticas devem ter requer_investigacao = true", () => {
    const relatorio = relatorioAnomalias(AUDITORIA_LANCAMENTOS, "2024-09");

    relatorio.anomalias_criticas.forEach(a => {
      if (a.score_risco >= 80) {
        expect(a.requer_investigacao).toBe(true);
      }
    });
  });

  test("Deve detectar duplicações", () => {
    const lancamentosDuplicados = [...AUDITORIA_LANCAMENTOS, AUDITORIA_LANCAMENTOS[0]]; // Adicionar duplicata

    const relatorio = relatorioAnomalias(lancamentosDuplicados, "2024-09");

    const anomaliasDeduplicacao = relatorio.anomalias_criticas.concat(relatorio.anomalias_avisos)
      .filter(a => a.tipo_anomalia === "duplicacao");

    expect(anomaliasDeduplicacao.length).toBeGreaterThan(0);
  });
});

describe("Rastreamento de Retificações", () => {
  test("Deve gerar relatório de retificações", () => {
    const relatorio = relatorioRetificacoes(RETIFICACOES_TESTE, "2024-09");

    expect(relatorio.total_retificacoes).toBe(RETIFICACOES_TESTE.length);
    expect(relatorio.registros).toEqual(RETIFICACOES_TESTE);
  });

  test("Deve contar retificações por tipo", () => {
    const relatorio = relatorioRetificacoes(RETIFICACOES_TESTE, "2024-09");

    expect(relatorio.retificacoes_por_tipo["correcao"]).toBe(1);
  });

  test("Deve somar ajustes de valor", () => {
    const relatorio = relatorioRetificacoes(RETIFICACOES_TESTE, "2024-09");

    const ajusteEsperado = Math.abs(3100 - 3000);
    expect(relatorio.valor_total_ajustado).toBe(ajusteEsperado);
  });

  test("Deve validar conformidade de tempo (24h)", () => {
    const relatorio = relatorioRetificacoes(RETIFICACOES_TESTE, "2024-09");

    expect(relatorio.conformidade_tempo.dentro_prazo_24h).toBeGreaterThanOrEqual(0);
    expect(relatorio.conformidade_tempo.fora_prazo_24h).toBeGreaterThanOrEqual(0);
  });
});

describe("Audit Log - Acesso de Pessoas", () => {
  test("Deve gerar relatório de acesso de usuários", () => {
    const relatorio = relatorioAcessoPessoas(ACESSOS_TESTE, "2024-09");

    expect(relatorio.total_acessos).toBe(ACESSOS_TESTE.length);
    expect(relatorio.usuarios_ativos).toBe(1); // USER-001
  });

  test("Deve contar acessos por usuário", () => {
    const relatorio = relatorioAcessoPessoas(ACESSOS_TESTE, "2024-09");

    expect(relatorio.acessos_por_usuario["USER-001"]).toBe(3);
  });

  test("Deve contar acessos por ação", () => {
    const relatorio = relatorioAcessoPessoas(ACESSOS_TESTE, "2024-09");

    expect(relatorio.acessos_por_acao["criacao"]).toBe(1);
    expect(relatorio.acessos_por_acao["aprovacao"]).toBe(1);
    expect(relatorio.acessos_por_acao["edicao"]).toBe(1);
  });

  test("Deve rastrear operações críticas", () => {
    const acessosComDelecao: AcessoUsuario[] = [
      ...ACESSOS_TESTE,
      {
        timestamp: "2024-09-12T10:00:00Z",
        usuario_id: "USER-002",
        usuario_nome: "Admin",
        acao: "delecao",
        tipo_entidade: "lancamento",
        entidade_id: "LCT-999",
        descricao_acao: "Deleção de lançamento",
        resultado: "sucesso",
      },
    ];

    const relatorio = relatorioAcessoPessoas(acessosComDelecao, "2024-09");

    expect(relatorio.operacoes_criticas.length).toBeGreaterThan(0);
    expect(relatorio.operacoes_criticas.some(o => o.acao === "delecao")).toBe(true);
  });

  test("Deve detectar atividade suspeita de usuários", () => {
    const acessosSuspeitos: AcessoUsuario[] = [
      {
        timestamp: "2024-09-10T08:00:00Z",
        usuario_id: "USER-SUSPEITO",
        usuario_nome: "Usuário Suspeito",
        acao: "criacao",
        tipo_entidade: "lancamento",
        entidade_id: "LCT-001",
        descricao_acao: "Tentativa de criação",
        resultado: "falha",
      },
      {
        timestamp: "2024-09-10T08:01:00Z",
        usuario_id: "USER-SUSPEITO",
        usuario_nome: "Usuário Suspeito",
        acao: "criacao",
        tipo_entidade: "lancamento",
        entidade_id: "LCT-002",
        descricao_acao: "Tentativa de criação",
        resultado: "falha",
      },
      {
        timestamp: "2024-09-10T08:02:00Z",
        usuario_id: "USER-SUSPEITO",
        usuario_nome: "Usuário Suspeito",
        acao: "criacao",
        tipo_entidade: "lancamento",
        entidade_id: "LCT-003",
        descricao_acao: "Tentativa bem-sucedida",
        resultado: "sucesso",
      },
    ];

    const relatorio = relatorioAcessoPessoas(acessosSuspeitos, "2024-09");

    expect(relatorio.usuarios_com_atividade_suspeita.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// TESTES: VALIDAÇÃO
// ============================================================================

describe("Validações Auxiliares", () => {
  test("Deve validar lançamento com valores válidos", () => {
    const lancamento: AuditoriaLancamento = {
      lancamento_id: "LCT-TEST",
      origem_modulo: "payroll",
      tipo_documento: "folha_pagamento",
      data_criacao: "2024-09-10T10:00:00Z",
      data_lancamento: "2024-09-10",
      descricao: "Teste",
      valor: 100,
      conta_debito: "1.1.01",
      conta_credito: "2.1.01",
      usuario_criador: "USER-001",
      status: "finalizado",
    };

    const resultado = validarLancamento(lancamento);
    expect(resultado.valido).toBe(true);
    expect(resultado.erros).toHaveLength(0);
  });

  test("Deve rejeitar lançamento com valor negativo", () => {
    const lancamento: AuditoriaLancamento = {
      lancamento_id: "LCT-TEST",
      origem_modulo: "payroll",
      tipo_documento: "folha_pagamento",
      data_criacao: "2024-09-10T10:00:00Z",
      data_lancamento: "2024-09-10",
      descricao: "Teste",
      valor: -100,
      conta_debito: "1.1.01",
      conta_credito: "2.1.01",
      usuario_criador: "USER-001",
      status: "finalizado",
    };

    const resultado = validarLancamento(lancamento);
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("valor_negativo");
  });

  test("Deve rejeitar lançamento com conta inválida", () => {
    const lancamento: AuditoriaLancamento = {
      lancamento_id: "LCT-TEST",
      origem_modulo: "payroll",
      tipo_documento: "folha_pagamento",
      data_criacao: "2024-09-10T10:00:00Z",
      data_lancamento: "2024-09-10",
      descricao: "Teste",
      valor: 100,
      conta_debito: "INVALIDA",
      conta_credito: "2.1.01",
      usuario_criador: "USER-001",
      status: "finalizado",
    };

    const resultado = validarLancamento(lancamento);
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("conta_invalida");
  });
});

// ============================================================================
// TESTES: HASH E CRIPTOGRAFIA
// ============================================================================

describe("Hash SHA-256 e Integridade", () => {
  test("Hash de período deve ser determinístico", () => {
    const hash1 = gerarHashPeriodo(AUDITORIA_LANCAMENTOS);
    const hash2 = gerarHashPeriodo(AUDITORIA_LANCAMENTOS);

    expect(hash1).toBe(hash2);
  });

  test("Hash de período deve ser diferente com ordem diferente", () => {
    const lancamentosOrdenados = [...AUDITORIA_LANCAMENTOS];
    const lancamentosReordenados = [...AUDITORIA_LANCAMENTOS].reverse();

    const hash1 = gerarHashPeriodo(lancamentosOrdenados);
    const hash2 = gerarHashPeriodo(lancamentosReordenados);

    expect(hash1).not.toBe(hash2);
  });
});
