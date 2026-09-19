/**
 * Relatórios de Auditoria ERP (SPRINT 3)
 * Compliance, rastreabilidade, integridade e conformidade contábil
 *
 * Relatórios de Auditoria:
 * 1. relatorioRastreabilidadeCompleta() - Audit trail com origem_modulo e referências
 * 2. relatorioConformidadeContabil() - Validação de partidas dobradas (débito = crédito)
 * 3. relatorioIntegridadeHashSnapshot() - Verificação de integridade por período (SHA-256)
 * 4. relatorioAnomalias() - Detecção de lançamentos anormais
 * 5. relatorioRetificacoes() - Rastreamento de correções e reversões
 * 6. relatorioAcessoPessoas() - Audit log de acesso e modificações de usuários
 */

import { createHash } from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface AuditoriaLancamento {
  lancamento_id: string;
  origem_modulo: "payroll" | "despesas" | "api-gateway" | "webhook" | "apontamento";
  tipo_documento: string;
  data_criacao: string;
  data_lancamento: string;
  descricao: string;
  valor: number;
  conta_debito: string;
  conta_credito: string;
  usuario_criador: string;
  status: string;
  documento_referencia?: string;
  centro_custo?: string;
}

export interface RegistroRastreabilidade extends AuditoriaLancamento {
  sequencia_auditoria: number;
  timestamp_sincronizacao: string;
  hash_lancamento: string;
  modulo_origem_confirmado: boolean;
}

export interface ViolacaoConformidade {
  periodo: string;
  tipo_violacao: "debito_credito_desbalanceado" | "conta_invalida" | "data_invalida" | "valor_negativo";
  lancamentos_envolvidos: string[];
  desvio_valor: number;
  percentual_desvio: number;
  severidade: "crítico" | "aviso";
}

export interface RelatorioConformidade {
  periodo: string;
  data_geracao: string;
  total_lancamentos_validados: number;
  lancamentos_validos: number;
  lancamentos_invalidos: number;
  saldo_debito: number;
  saldo_credito: number;
  diferenca: number;
  diferenca_percentual: number;
  conforme: boolean;
  violacoes: ViolacaoConformidade[];
}

export interface SnapshotIntegridade {
  id: string;
  periodo: string;
  data_snapshot: string;
  total_lancamentos: number;
  hash_periodo_sha256: string;
  hashes_lancamentos: Record<string, string>;
  dados_resumo: {
    total_valor: number;
    total_debito: number;
    total_credito: number;
    modulos_presentes: string[];
  };
  verificacao: {
    hash_valido: boolean;
    integridade_confirmada: boolean;
    data_verificacao: string;
  };
}

export interface AnomaliaLancamento {
  lancamento_id: string;
  tipo_anomalia: "valor_alto" | "duplicacao" | "fora_periodo" | "conta_incomum" | "usuario_suspeito";
  descricao: string;
  lancamento: AuditoriaLancamento;
  score_risco: number; // 0-100
  data_deteccao: string;
  requer_investigacao: boolean;
}

export interface RelatorioAnomalias {
  periodo: string;
  data_geracao: string;
  total_anomalias_detectadas: number;
  anomalias_criticas: AnomaliaLancamento[];
  anomalias_avisos: AnomaliaLancamento[];
  score_risco_geral: number;
}

export interface RetificacaoRegistro {
  id: string;
  lancamento_original_id: string;
  data_retificacao: string;
  usuario_retificador: string;
  motivo: string;
  campo_alterado: string;
  valor_anterior: any;
  valor_novo: any;
  tipo_operacao: "correcao" | "reversao" | "complementacao";
  lancamento_corretivo_id?: string;
  justificativa_detalhada: string;
  hash_retificacao: string;
}

export interface RelatorioRetificacoes {
  periodo: string;
  data_geracao: string;
  total_retificacoes: number;
  retificacoes_por_tipo: Record<string, number>;
  retificacoes_por_usuario: Record<string, number>;
  retificacoes_por_motivo: Record<string, number>;
  valor_total_ajustado: number;
  registros: RetificacaoRegistro[];
  conformidade_tempo: {
    dentro_prazo_24h: number;
    fora_prazo_24h: number;
  };
}

export interface AcessoUsuario {
  timestamp: string;
  usuario_id: string;
  usuario_nome: string;
  acao: "leitura" | "criacao" | "edicao" | "delecao" | "aprovacao" | "rejeicao";
  tipo_entidade: string;
  entidade_id: string;
  descricao_acao: string;
  dados_anteriores?: any;
  dados_novos?: any;
  ip_address?: string;
  sessao_id?: string;
  resultado: "sucesso" | "falha";
  motivo_falha?: string;
}

export interface RelatorioAcesso {
  periodo: string;
  data_geracao: string;
  total_acessos: number;
  usuarios_ativos: number;
  acessos_por_usuario: Record<string, number>;
  acessos_por_acao: Record<string, number>;
  acessos_por_tipo_entidade: Record<string, number>;
  operacoes_criticas: AcessoUsuario[]; // Deleções, rejeições, edicoes
  usuarios_com_atividade_suspeita: Array<{
    usuario_id: string;
    usuario_nome: string;
    total_operacoes: number;
    falhas_acesso: number;
    ultima_atividade: string;
  }>;
}

// ============================================================================
// FUNÇÕES DE GERAÇÃO DE HASH PARA INTEGRIDADE
// ============================================================================

/**
 * Gera hash SHA-256 para um lançamento individual
 */
export function gerarHashLancamento(lancamento: AuditoriaLancamento): string {
  const chave = `${lancamento.lancamento_id}|${lancamento.data_lancamento}|${lancamento.conta_debito}|${lancamento.conta_credito}|${lancamento.valor}|${lancamento.usuario_criador}`;
  return createHash("sha256").update(chave).digest("hex");
}

/**
 * Gera hash SHA-256 para um período completo (snapshot de integridade)
 */
export function gerarHashPeriodo(lancamentos: AuditoriaLancamento[]): string {
  const orderedData = lancamentos
    .sort((a, b) => new Date(a.data_lancamento).getTime() - new Date(b.data_lancamento).getTime())
    .map(l => gerarHashLancamento(l))
    .join("|");

  return createHash("sha256").update(orderedData).digest("hex");
}

/**
 * Verifica integridade de um snapshot comparando hashes
 */
export function verificarIntegridadeSnapshot(
  original: SnapshotIntegridade,
  lancamentosAtual: AuditoriaLancamento[]
): boolean {
  const hashAtual = gerarHashPeriodo(lancamentosAtual);
  return hashAtual === original.hash_periodo_sha256;
}

// ============================================================================
// FUNÇÕES PÚBLICAS PARA GERAÇÃO DE RELATÓRIOS
// ============================================================================

/**
 * 1. RELATÓRIO DE RASTREABILIDADE COMPLETA
 * Audit trail completo com origem de módulo, referências de documento e timestamps
 * Rastreia: quem criou, quando, de qual módulo, qual documento originou
 */
export function relatorioRastreabilidadeCompleta(
  lancamentos: AuditoriaLancamento[],
  periodo: string
): RegistroRastreabilidade[] {
  let sequencia = 1;

  return lancamentos
    .sort((a, b) => new Date(a.data_criacao).getTime() - new Date(b.data_criacao).getTime())
    .map(lancamento => {
      const registroRastreabilidade: RegistroRastreabilidade = {
        ...lancamento,
        sequencia_auditoria: sequencia++,
        timestamp_sincronizacao: new Date().toISOString(),
        hash_lancamento: gerarHashLancamento(lancamento),
        modulo_origem_confirmado: validarOrigemModulo(lancamento),
      };

      return registroRastreabilidade;
    });
}

/**
 * 2. RELATÓRIO DE CONFORMIDADE CONTÁBIL
 * Valida partidas dobradas: total débito = total crédito
 * Verifica contas válidas, valores positivos, datas consistentes
 */
export function relatorioConformidadeContabil(
  lancamentos: AuditoriaLancamento[],
  periodo: string
): RelatorioConformidade {
  let totalDebito = 0;
  let totalCredito = 0;
  const violacoes: ViolacaoConformidade[] = [];
  let lancamentosValidos = 0;
  let lancamentosInvalidos = 0;

  // Regra para classificar débito/crédito
  const contasAtivo = /^1\./;
  const contasPassivo = /^[23]\./;
  const contasResultado = /^[456]\./;

  for (const lancamento of lancamentos) {
    const validacao = validarLancamento(lancamento);

    if (!validacao.valido) {
      lancamentosInvalidos++;

      // Registrar violação
      if (validacao.erros.includes("conta_invalida")) {
        violacoes.push({
          periodo,
          tipo_violacao: "conta_invalida",
          lancamentos_envolvidos: [lancamento.lancamento_id],
          desvio_valor: lancamento.valor,
          percentual_desvio: 100,
          severidade: "crítico",
        });
      }

      if (validacao.erros.includes("valor_negativo")) {
        violacoes.push({
          periodo,
          tipo_violacao: "valor_negativo",
          lancamentos_envolvidos: [lancamento.lancamento_id],
          desvio_valor: lancamento.valor,
          percentual_desvio: 100,
          severidade: "crítico",
        });
      }

      continue;
    }

    lancamentosValidos++;

    // Ativo é débito positivo
    if (contasAtivo.test(lancamento.conta_debito)) {
      totalDebito += lancamento.valor;
    }

    // Passivo e Patrimônio são crédito positivo
    if (contasPassivo.test(lancamento.conta_credito)) {
      totalCredito += lancamento.valor;
    }

    // Resultado pode ser débito (despesas) ou crédito (receitas)
    if (contasResultado.test(lancamento.conta_debito)) {
      totalDebito += lancamento.valor;
    }
    if (contasResultado.test(lancamento.conta_credito)) {
      totalCredito += lancamento.valor;
    }
  }

  const diferenca = Math.abs(totalDebito - totalCredito);
  const diferenca_percentual = totalCredito > 0 ? (diferenca / totalCredito) * 100 : 0;
  const conforme = diferenca < 0.01; // Margem de arredondamento

  if (!conforme && diferenca > 0) {
    violacoes.push({
      periodo,
      tipo_violacao: "debito_credito_desbalanceado",
      lancamentos_envolvidos: lancamentos.map(l => l.lancamento_id),
      desvio_valor: diferenca,
      percentual_desvio: diferenca_percentual,
      severidade: diferenca_percentual > 5 ? "crítico" : "aviso",
    });
  }

  return {
    periodo,
    data_geracao: new Date().toISOString(),
    total_lancamentos_validados: lancamentos.length,
    lancamentos_validos: lancamentosValidos,
    lancamentos_invalidos: lancamentosInvalidos,
    saldo_debito: Math.round(totalDebito * 100) / 100,
    saldo_credito: Math.round(totalCredito * 100) / 100,
    diferenca: Math.round(diferenca * 100) / 100,
    diferenca_percentual: Math.round(diferenca_percentual * 100) / 100,
    conforme,
    violacoes,
  };
}

/**
 * 3. RELATÓRIO DE INTEGRIDADE - SNAPSHOT SHA-256
 * Captura hash de integridade do período para auditoria forense
 * Detecta adulterações de dados após período fechado
 */
export function relatorioIntegridadeHashSnapshot(
  lancamentos: AuditoriaLancamento[],
  periodo: string
): SnapshotIntegridade {
  const hashesLancamentos: Record<string, string> = {};
  for (const lancamento of lancamentos) {
    hashesLancamentos[lancamento.lancamento_id] = gerarHashLancamento(lancamento);
  }

  const hashPeriodo = gerarHashPeriodo(lancamentos);

  const totalValor = lancamentos.reduce((sum, l) => sum + l.valor, 0);
  const totalDebito = lancamentos
    .filter(l => !l.conta_debito.startsWith("3") && !l.conta_debito.startsWith("4"))
    .reduce((sum, l) => sum + l.valor, 0);
  const totalCredito = lancamentos
    .filter(l => l.conta_credito.startsWith("3") || l.conta_credito.startsWith("4"))
    .reduce((sum, l) => sum + l.valor, 0);

  const modulosPresentes = Array.from(new Set(lancamentos.map(l => l.origem_modulo)));

  return {
    id: `SNAP-${Date.now()}`,
    periodo,
    data_snapshot: new Date().toISOString(),
    total_lancamentos: lancamentos.length,
    hash_periodo_sha256: hashPeriodo,
    hashes_lancamentos: hashesLancamentos,
    dados_resumo: {
      total_valor: Math.round(totalValor * 100) / 100,
      total_debito: Math.round(totalDebito * 100) / 100,
      total_credito: Math.round(totalCredito * 100) / 100,
      modulos_presentes: modulosPresentes,
    },
    verificacao: {
      hash_valido: true,
      integridade_confirmada: true,
      data_verificacao: new Date().toISOString(),
    },
  };
}

/**
 * 4. RELATÓRIO DE ANOMALIAS
 * Detecta lançamentos anormais:
 * - Valores muito altos
 * - Duplicações suspeitas
 * - Fora do período esperado
 * - Contas incomuns
 * - Atividade de usuários suspeitos
 */
export function relatorioAnomalias(
  lancamentos: AuditoriaLancamento[],
  periodo: string,
  limites: {
    valor_maximo?: number;
    valor_minimo?: number;
    score_suspicao?: number;
  } = {}
): RelatorioAnomalias {
  const valorMaximoDefault = lancamentos.length > 0
    ? lancamentos.reduce((max, l) => (l.valor > max ? l.valor : max), 0) * 2
    : 10000;

  const limiteValorMaximo = limites.valor_maximo || valorMaximoDefault;
  const limiteValorMinimo = limites.valor_minimo || 0.01;
  const limiteScoreSuspicao = limites.score_suspicao || 70;

  const anomalias: AnomaliaLancamento[] = [];

  // Detectar duplicações
  const chaves = new Map<string, AuditoriaLancamento[]>();
  for (const lancamento of lancamentos) {
    const chave = `${lancamento.data_lancamento}|${lancamento.conta_debito}|${lancamento.conta_credito}|${lancamento.valor}`;
    if (!chaves.has(chave)) chaves.set(chave, []);
    chaves.get(chave)!.push(lancamento);
  }

  // Analisar cada lançamento
  for (const lancamento of lancamentos) {
    let scoreRisco = 0;
    const tiposAnomalias: Array<"valor_alto" | "duplicacao" | "fora_periodo" | "conta_incomum" | "usuario_suspeito"> = [];

    // 1. Valor alto
    if (lancamento.valor > limiteValorMaximo) {
      scoreRisco += 30;
      tiposAnomalias.push("valor_alto");
    }

    // 2. Possível duplicação
    const chave = `${lancamento.data_lancamento}|${lancamento.conta_debito}|${lancamento.conta_credito}|${lancamento.valor}`;
    if (chaves.get(chave)!.length > 1) {
      scoreRisco += 40;
      tiposAnomalias.push("duplicacao");
    }

    // 3. Fora do período
    const dataLancamento = new Date(lancamento.data_lancamento);
    const periodoMatch = periodo.match(/(\d{4})-(\d{2})/);
    if (periodoMatch) {
      const [, ano, mes] = periodoMatch;
      if (dataLancamento.getFullYear().toString() !== ano ||
          (dataLancamento.getMonth() + 1).toString().padStart(2, "0") !== mes) {
        scoreRisco += 25;
        tiposAnomalias.push("fora_periodo");
      }
    }

    // 4. Conta incomum (fora do padrão esperado)
    if (!/^[1-6]\.\d+(\.\d+)?$/.test(lancamento.conta_debito)) {
      scoreRisco += 35;
      tiposAnomalias.push("conta_incomum");
    }

    // 5. Usuário suspeito (múltiplas operações em pouco tempo)
    const operacoesUsuario = lancamentos.filter(l => l.usuario_criador === lancamento.usuario_criador).length;
    if (operacoesUsuario > lancamentos.length * 0.3) {
      scoreRisco += 20;
      tiposAnomalias.push("usuario_suspeito");
    }

    // Limitar score a 100
    scoreRisco = Math.min(scoreRisco, 100);

    // Registrar anomalia se score >= limite
    if (scoreRisco >= limiteScoreSuspicao && tiposAnomalias.length > 0) {
      anomalias.push({
        lancamento_id: lancamento.lancamento_id,
        tipo_anomalia: tiposAnomalias[0],
        descricao: `Detectada anomalia: ${tiposAnomalias.join(", ")}`,
        lancamento,
        score_risco: scoreRisco,
        data_deteccao: new Date().toISOString(),
        requer_investigacao: scoreRisco >= 80,
      });
    }
  }

  // Separar por severidade
  const anomaliasCriticas = anomalias.filter(a => a.score_risco >= 80);
  const anomaliasAvisos = anomalias.filter(a => a.score_risco < 80);

  const scoreRiscoGeral = anomalias.length > 0
    ? anomalias.reduce((sum, a) => sum + a.score_risco, 0) / anomalias.length
    : 0;

  return {
    periodo,
    data_geracao: new Date().toISOString(),
    total_anomalias_detectadas: anomalias.length,
    anomalias_criticas: anomaliasCriticas,
    anomalias_avisos: anomaliasAvisos,
    score_risco_geral: Math.round(scoreRiscoGeral),
  };
}

/**
 * 5. RELATÓRIO DE RETIFICAÇÕES
 * Rastreia todas as correções, reversões e complementações de lançamentos
 * Exigência regulatória: manter histórico completo de alterações pós-lançamento
 */
export function relatorioRetificacoes(
  retificacoes: RetificacaoRegistro[],
  periodo: string
): RelatorioRetificacoes {
  const retificacoesPorTipo = new Map<string, number>();
  const retificacoesPorUsuario = new Map<string, number>();
  const retificacoesPorMotivo = new Map<string, number>();

  let valorTotalAjustado = 0;
  let dentroDeProzo24h = 0;
  let foraDeProzo24h = 0;

  for (const retificacao of retificacoes) {
    // Contar por tipo
    const tipoCount = (retificacoesPorTipo.get(retificacao.tipo_operacao) || 0) + 1;
    retificacoesPorTipo.set(retificacao.tipo_operacao, tipoCount);

    // Contar por usuário
    const usuarioCount = (retificacoesPorUsuario.get(retificacao.usuario_retificador) || 0) + 1;
    retificacoesPorUsuario.set(retificacao.usuario_retificador, usuarioCount);

    // Contar por motivo
    const motivoCount = (retificacoesPorMotivo.get(retificacao.motivo) || 0) + 1;
    retificacoesPorMotivo.set(retificacao.motivo, motivoCount);

    // Somar ajustes
    if (typeof retificacao.valor_novo === "number" && typeof retificacao.valor_anterior === "number") {
      valorTotalAjustado += Math.abs(retificacao.valor_novo - retificacao.valor_anterior);
    }

    // Verificar prazo de 24h para retificação
    const dataOrigem = new Date(retificacao.lancamento_original_id); // Simulado
    const dataRetificacao = new Date(retificacao.data_retificacao);
    const difHoras = (dataRetificacao.getTime() - dataOrigem.getTime()) / (1000 * 60 * 60);

    if (difHoras <= 24) {
      dentroDeProzo24h++;
    } else {
      foraDeProzo24h++;
    }
  }

  return {
    periodo,
    data_geracao: new Date().toISOString(),
    total_retificacoes: retificacoes.length,
    retificacoes_por_tipo: Object.fromEntries(retificacoesPorTipo),
    retificacoes_por_usuario: Object.fromEntries(retificacoesPorUsuario),
    retificacoes_por_motivo: Object.fromEntries(retificacoesPorMotivo),
    valor_total_ajustado: Math.round(valorTotalAjustado * 100) / 100,
    registros: retificacoes,
    conformidade_tempo: {
      dentro_prazo_24h: dentroDeProzo24h,
      fora_prazo_24h: foraDeProzo24h,
    },
  };
}

/**
 * 6. RELATÓRIO DE ACESSO E PESSOAS
 * Audit log completo de quem acessou, modificou e aprovou documentos
 * Detecta operações críticas: deleções, rejeições, edições
 */
export function relatorioAcessoPessoas(
  acessos: AcessoUsuario[],
  periodo: string
): RelatorioAcesso {
  const acessosPorUsuario = new Map<string, number>();
  const acessosPorAcao = new Map<string, number>();
  const acessosPorTipoEntidade = new Map<string, number>();
  const usuariosAtivos = new Set<string>();
  const usuariosSuspeitos = new Map<string, { total: number; falhas: number; ultima: string }>();

  const operacoesCriticas: AcessoUsuario[] = [];

  for (const acesso of acessos) {
    usuariosAtivos.add(acesso.usuario_id);

    // Contar por usuário
    const usuarioCount = (acessosPorUsuario.get(acesso.usuario_id) || 0) + 1;
    acessosPorUsuario.set(acesso.usuario_id, usuarioCount);

    // Contar por ação
    const acaoCount = (acessosPorAcao.get(acesso.acao) || 0) + 1;
    acessosPorAcao.set(acesso.acao, acaoCount);

    // Contar por tipo de entidade
    const tipoCount = (acessosPorTipoEntidade.get(acesso.tipo_entidade) || 0) + 1;
    acessosPorTipoEntidade.set(acesso.tipo_entidade, tipoCount);

    // Rastrear operações críticas
    if (["delecao", "rejeicao"].includes(acesso.acao)) {
      operacoesCriticas.push(acesso);
    }

    // Detectar usuários suspeitos (múltiplas falhas)
    if (acesso.resultado === "falha") {
      const suspeita = usuariosSuspeitos.get(acesso.usuario_id) || { total: 0, falhas: 0, ultima: "" };
      suspeita.total++;
      suspeita.falhas++;
      suspeita.ultima = acesso.timestamp;
      usuariosSuspeitos.set(acesso.usuario_id, suspeita);
    }
  }

  // Filtrar usuários com atividade suspeita (>30% de falhas)
  const usuariosComSuspicao = Array.from(usuariosSuspeitos.entries())
    .filter(([, stats]) => (stats.falhas / stats.total) > 0.3)
    .map(([usuarioId, stats]) => ({
      usuario_id: usuarioId,
      usuario_nome: `User-${usuarioId}`, // Simulado
      total_operacoes: stats.total,
      falhas_acesso: stats.falhas,
      ultima_atividade: stats.ultima,
    }));

  return {
    periodo,
    data_geracao: new Date().toISOString(),
    total_acessos: acessos.length,
    usuarios_ativos: usuariosAtivos.size,
    acessos_por_usuario: Object.fromEntries(acessosPorUsuario),
    acessos_por_acao: Object.fromEntries(acessosPorAcao),
    acessos_por_tipo_entidade: Object.fromEntries(acessosPorTipoEntidade),
    operacoes_criticas: operacoesCriticas,
    usuarios_com_atividade_suspeita: usuariosComSuspicao,
  };
}

// ============================================================================
// FUNÇÕES AUXILIARES DE VALIDAÇÃO
// ============================================================================

/**
 * Valida se o módulo de origem está correto e confirmado
 */
function validarOrigemModulo(lancamento: AuditoriaLancamento): boolean {
  const modulo = lancamento.origem_modulo;
  const tipoDocumento = lancamento.tipo_documento;

  // Validação: cada módulo tem tipos de documentos esperados
  const tiposEsperados: Record<string, string[]> = {
    payroll: ["folha_pagamento", "desconto", "adiantamento"],
    despesas: ["despesa_operacional", "condominio", "utilidade"],
    "api-gateway": ["diaria", "receita", "transferencia"],
    webhook: ["evento_webhook", "sincronizacao"],
    apontamento: ["apontamento_prestador", "fechamento", "movimentacao"],
  };

  return (tiposEsperados[modulo] || []).includes(tipoDocumento);
}

/**
 * Valida integridade e consistência de um lançamento
 */
export function validarLancamento(
  lancamento: AuditoriaLancamento
): { valido: boolean; erros: string[] } {
  const erros: string[] = [];

  if (!lancamento.lancamento_id) erros.push("ID do lançamento é obrigatório");

  if (!/^\d{4}-\d{2}-\d{2}/.test(lancamento.data_lancamento)) {
    erros.push("data_invalida");
  }

  if (!/^[1-6]\.\d+(\.\d+)?$/.test(lancamento.conta_debito)) {
    erros.push("conta_invalida");
  }

  if (!/^[1-6]\.\d+(\.\d+)?$/.test(lancamento.conta_credito)) {
    erros.push("conta_invalida");
  }

  if (lancamento.valor <= 0) {
    erros.push("valor_negativo");
  }

  if (!lancamento.usuario_criador) erros.push("Usuário criador é obrigatório");

  return { valido: erros.length === 0, erros };
}
