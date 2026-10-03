/**
 * Data Retention Policy - Política de Retenção de Dados
 *
 * Define ciclo de vida dos dados conforme LGPD e requisitos legais:
 * - Usuários inativos 1 ano → soft delete
 * - Cobranças antigas 7 anos → archive
 * - Logs > 90 dias → compress
 * - Cleanup job executado mensalmente
 */

import type { Database } from 'sql.js';

/**
 * Definição de política de retenção para um tipo de dado
 */
export interface PoliticaRetencaoDado {
  tipo: string;
  descricao: string;
  diasRetencao: number;
  diasAteDelete: number;
  acao: 'delete' | 'archive' | 'compress' | 'anonymize';
  baseLegal: string;
}

/**
 * Políticas padrão
 */
export const POLITICAS_RETENCAO_PADRAO: PoliticaRetencaoDado[] = [
  {
    tipo: 'usuario_inativo',
    descricao: 'Usuários sem atividade por 1 ano',
    diasRetencao: 365,
    diasAteDelete: 30, // 30 dias após soft delete antes de hard delete
    acao: 'delete',
    baseLegal: 'LGPD Art. 17 (Direito de Apagar)',
  },
  {
    tipo: 'log_auditoria',
    descricao: 'Logs de auditoria e acesso',
    diasRetencao: 90,
    diasAteDelete: 0, // Hard delete imediato após retenção
    acao: 'compress',
    baseLegal: 'LGPD Art. 5 (Dados não mais necessários)',
  },
  {
    tipo: 'cobranca_antiga',
    descricao: 'Cobranças, faturas e documentos contábeis',
    diasRetencao: 7 * 365, // 7 anos (Lei 6.404/76)
    diasAteDelete: 365, // 1 ano antes de hard delete
    acao: 'archive',
    baseLegal: 'Lei 6.404/76 (Retenção Obrigatória)',
  },
  {
    tipo: 'transacao_pendente',
    descricao: 'Transações com status pendente',
    diasRetencao: 30,
    diasAteDelete: 7, // 7 dias após expiração
    acao: 'delete',
    baseLegal: 'LGPD Art. 17 (Dados Obsoletos)',
  },
  {
    tipo: 'sessao_expirada',
    descricao: 'Sessões de usuário expiradas',
    diasRetencao: 7,
    diasAteDelete: 0, // Hard delete imediato
    acao: 'delete',
    baseLegal: 'LGPD Art. 5 (Dados não mais necessários)',
  },
  {
    tipo: 'arquivo_temporario',
    descricao: 'Arquivos de backup e temporários',
    diasRetencao: 30,
    diasAteDelete: 0,
    acao: 'delete',
    baseLegal: 'LGPD Art. 5 (Dados não mais necessários)',
  },
];

/**
 * Resultado da execução de limpeza
 */
export interface ResultadoLimpeza {
  tipo: string;
  registrosProcessados: number;
  registrosDeletedos: number;
  registrosArquivados: number;
  registrosComprimidos: number;
  registrosAnonymizados: number;
  status: 'sucesso' | 'erro';
  erro?: string;
  dataExecucao: string;
  tempoMs: number;
}

/**
 * Relatório de retenção de dados
 */
export interface RelatorioRetencao {
  dataExecucao: string;
  totalRegistrosProcessados: number;
  resultadosPorTipo: ResultadoLimpeza[];
  tempoTotalMs: number;
  proximaExecucao: string;
}

/**
 * Calcula data limite para retenção
 */
export function calcularDataLimite(diasRetencao: number): Date {
  const data = new Date();
  data.setDate(data.getDate() - diasRetencao);
  return data;
}

/**
 * Deleta usuários inativos por mais de 1 ano
 */
export function deletarUsuariosInativos(db: Database): ResultadoLimpeza {
  const inicio = Date.now();

  try {
    // Soft delete: marcar como deletado
    const dataLimite = calcularDataLimite(365);
    const dataLimiteISO = dataLimite.toISOString();

    // Contar registros a processar
    const countResult = db.exec(
      `SELECT COUNT(*) FROM usuarios WHERE ativo = 1 AND last_access < ?`,
      [dataLimiteISO]
    );

    const registrosProcessados = countResult[0]?.values[0]?.[0] || 0;

    // Soft delete
    db.run(
      `UPDATE usuarios SET ativo = 0, data_delecao = ? WHERE ativo = 1 AND last_access < ?`,
      [new Date().toISOString(), dataLimiteISO]
    );

    // Anonymize: anonimizar dados pessoais após soft delete
    db.run(
      `UPDATE usuarios SET
        nome = 'Usuário Deletado',
        email = CONCAT('anonimizado_', id, '@example.com'),
        cpf = NULL,
        telefone = NULL,
        data_atualizacao = ?
       WHERE ativo = 0 AND data_delecao < ?`,
      [new Date().toISOString(), dataLimite.toISOString()]
    );

    return {
      tipo: 'usuario_inativo',
      registrosProcessados,
      registrosDeletedos: registrosProcessados,
      registrosArquivados: 0,
      registrosComprimidos: 0,
      registrosAnonymizados: registrosProcessados,
      status: 'sucesso',
      dataExecucao: new Date().toISOString(),
      tempoMs: Date.now() - inicio,
    };
  } catch (erro) {
    return {
      tipo: 'usuario_inativo',
      registrosProcessados: 0,
      registrosDeletedos: 0,
      registrosArquivados: 0,
      registrosComprimidos: 0,
      registrosAnonymizados: 0,
      status: 'erro',
      erro: String(erro),
      dataExecucao: new Date().toISOString(),
      tempoMs: Date.now() - inicio,
    };
  }
}

/**
 * Arquiva cobranças antigas (> 7 anos)
 */
export function arquivarCobrancasAntigas(db: Database): ResultadoLimpeza {
  const inicio = Date.now();

  try {
    const dataLimite = calcularDataLimite(7 * 365);
    const dataLimiteISO = dataLimite.toISOString();

    // Contar registros
    const countResult = db.exec(
      `SELECT COUNT(*) FROM cobrancas WHERE arquivado = 0 AND data_cobranca < ?`,
      [dataLimiteISO]
    );

    const registrosProcessados = countResult[0]?.values[0]?.[0] || 0;

    // Marcar como arquivado
    db.run(
      `UPDATE cobrancas SET arquivado = 1, data_arquivamento = ? WHERE arquivado = 0 AND data_cobranca < ?`,
      [new Date().toISOString(), dataLimiteISO]
    );

    return {
      tipo: 'cobranca_antiga',
      registrosProcessados,
      registrosDeletedos: 0,
      registrosArquivados: registrosProcessados,
      registrosComprimidos: 0,
      registrosAnonymizados: 0,
      status: 'sucesso',
      dataExecucao: new Date().toISOString(),
      tempoMs: Date.now() - inicio,
    };
  } catch (erro) {
    return {
      tipo: 'cobranca_antiga',
      registrosProcessados: 0,
      registrosDeletedos: 0,
      registrosArquivados: 0,
      registrosComprimidos: 0,
      registrosAnonymizados: 0,
      status: 'erro',
      erro: String(erro),
      dataExecucao: new Date().toISOString(),
      tempoMs: Date.now() - inicio,
    };
  }
}

/**
 * Comprime logs de auditoria > 90 dias
 */
export function comprimirLogsAuditoria(db: Database): ResultadoLimpeza {
  const inicio = Date.now();

  try {
    const dataLimite = calcularDataLimite(90);
    const dataLimiteISO = dataLimite.toISOString();

    // Contar registros a comprimir
    const countResult = db.exec(
      `SELECT COUNT(*) FROM auditoria_log WHERE comprimido = 0 AND criado_em < ?`,
      [dataLimiteISO]
    );

    const registrosProcessados = countResult[0]?.values[0]?.[0] || 0;

    // Marcar como comprimido (em produção, compactar arquivo real)
    db.run(
      `UPDATE auditoria_log SET comprimido = 1, data_compressao = ? WHERE comprimido = 0 AND criado_em < ?`,
      [new Date().toISOString(), dataLimiteISO]
    );

    return {
      tipo: 'log_auditoria',
      registrosProcessados,
      registrosDeletedos: 0,
      registrosArquivados: 0,
      registrosComprimidos: registrosProcessados,
      registrosAnonymizados: 0,
      status: 'sucesso',
      dataExecucao: new Date().toISOString(),
      tempoMs: Date.now() - inicio,
    };
  } catch (erro) {
    return {
      tipo: 'log_auditoria',
      registrosProcessados: 0,
      registrosDeletedos: 0,
      registrosArquivados: 0,
      registrosComprimidos: 0,
      registrosAnonymizados: 0,
      status: 'erro',
      erro: String(erro),
      dataExecucao: new Date().toISOString(),
      tempoMs: Date.now() - inicio,
    };
  }
}

/**
 * Deleta transações pendentes > 30 dias
 */
export function deletarTransacoesPendentes(db: Database): ResultadoLimpeza {
  const inicio = Date.now();

  try {
    const dataLimite = calcularDataLimite(30);
    const dataLimiteISO = dataLimite.toISOString();

    // Contar registros
    const countResult = db.exec(
      `SELECT COUNT(*) FROM transacoes WHERE status = 'pendente' AND data_criacao < ?`,
      [dataLimiteISO]
    );

    const registrosProcessados = countResult[0]?.values[0]?.[0] || 0;

    // Deletar
    db.run(
      `DELETE FROM transacoes WHERE status = 'pendente' AND data_criacao < ?`,
      [dataLimiteISO]
    );

    return {
      tipo: 'transacao_pendente',
      registrosProcessados,
      registrosDeletedos: registrosProcessados,
      registrosArquivados: 0,
      registrosComprimidos: 0,
      registrosAnonymizados: 0,
      status: 'sucesso',
      dataExecucao: new Date().toISOString(),
      tempoMs: Date.now() - inicio,
    };
  } catch (erro) {
    return {
      tipo: 'transacao_pendente',
      registrosProcessados: 0,
      registrosDeletedos: 0,
      registrosArquivados: 0,
      registrosComprimidos: 0,
      registrosAnonymizados: 0,
      status: 'erro',
      erro: String(erro),
      dataExecucao: new Date().toISOString(),
      tempoMs: Date.now() - inicio,
    };
  }
}

/**
 * Executa job de limpeza completo (executado mensalmente)
 */
export function executarLimpezaMensal(db: Database): RelatorioRetencao {
  const inicioGeral = Date.now();
  const dataExecucao = new Date();

  const resultados: ResultadoLimpeza[] = [
    deletarUsuariosInativos(db),
    arquivarCobrancasAntigas(db),
    comprimirLogsAuditoria(db),
    deletarTransacoesPendentes(db),
  ];

  const totalRegistrosProcessados = resultados.reduce(
    (acc, r) => acc + r.registrosProcessados,
    0
  );

  // Proxima execução: 1 mês
  const proximaExecucao = new Date(dataExecucao);
  proximaExecucao.setMonth(proximaExecucao.getMonth() + 1);

  return {
    dataExecucao: dataExecucao.toISOString(),
    totalRegistrosProcessados,
    resultadosPorTipo: resultados,
    tempoTotalMs: Date.now() - inicioGeral,
    proximaExecucao: proximaExecucao.toISOString(),
  };
}

/**
 * Agenda execução mensal do cleanup
 */
export function agendarLimpezaMensal(db: Database, diaDoMes: number = 1): NodeJS.Timer {
  function executarSeNecessario(): void {
    const hoje = new Date();

    // Executar se for o dia configurado
    if (hoje.getDate() === diaDoMes) {
      console.log('[CLEANUP] Executando limpeza mensal de dados...');
      const relatorio = executarLimpezaMensal(db);

      console.log(`[CLEANUP] Limpeza concluída em ${relatorio.tempoTotalMs}ms`);
      console.log(`[CLEANUP] Registros processados: ${relatorio.totalRegistrosProcessados}`);

      for (const resultado of relatorio.resultadosPorTipo) {
        console.log(
          `[CLEANUP] ${resultado.tipo}: ${resultado.registrosProcessados} registros (${resultado.status})`
        );
      }
    }
  }

  // Executar a cada 1 hora (verificar se é o dia)
  const interval = setInterval(executarSeNecessario, 60 * 60 * 1000);

  // Executar imediatamente na primeira vez
  executarSeNecessario();

  return interval;
}
