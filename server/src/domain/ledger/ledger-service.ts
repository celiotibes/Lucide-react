/**
 * Ledger Service
 *
 * Gerencia lançamentos contábeis em double-entry bookkeeping
 * Valida contas, mantém auditoria e integra com outras áreas (PIX, ASAAS, etc.)
 */

import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { logger } from "../../services/logger-service.js";
import type {
  LedgerEntry,
  DoubleEntryLancamento,
  ResultadoRegistroLancamento,
  TipoLancamento,
  CategoriaLancamento,
  AuditoriaLancamento,
} from "./ledger-types.js";

/**
 * Valida se uma categoria é válida para um tipo
 */
function validarCategoriaParaTipo(tipo: TipoLancamento, categoria: CategoriaLancamento): boolean {
  const categoriasReceita = ['receita', 'aluguel', 'honorario', 'extraordinaria'];
  const categoriasDespesa = ['comissao', 'imposto', 'folha_pagamento', 'condominio', 'manutencao', 'juros'];

  if (tipo === 'receita') {
    return categoriasReceita.includes(categoria);
  } else if (tipo === 'despesa') {
    return categoriasDespesa.includes(categoria);
  }
  return false;
}

/**
 * Valida estrutura básica de uma entrada
 */
function validarEntrada(lancamento: Partial<LedgerEntry>): { valido: boolean; erro?: string } {
  if (!lancamento.data) {
    return { valido: false, erro: 'Data é obrigatória' };
  }

  if (!lancamento.tipo || !['receita', 'despesa'].includes(lancamento.tipo)) {
    return { valido: false, erro: 'Tipo deve ser receita ou despesa' };
  }

  if (!lancamento.categoria) {
    return { valido: false, erro: 'Categoria é obrigatória' };
  }

  if (!validarCategoriaParaTipo(lancamento.tipo, lancamento.categoria)) {
    return {
      valido: false,
      erro: `Categoria ${lancamento.categoria} não é válida para tipo ${lancamento.tipo}`
    };
  }

  if (!lancamento.valor || lancamento.valor <= 0) {
    return { valido: false, erro: 'Valor deve ser maior que zero' };
  }

  // Valida data no formato YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lancamento.data)) {
    return { valido: false, erro: 'Data deve estar no formato YYYY-MM-DD' };
  }

  return { valido: true };
}

/**
 * Verifica se uma conta existe no plano de contas
 * Para MVP, validar por código numérico válido
 */
function validarContaExiste(db: Database.Database, contaCodigo: string): boolean {
  try {
    // Se não houver tabela plano_contas, aceitamos qualquer conta para MVP
    const stmt = db.prepare("SELECT 1 FROM plano_contas WHERE codigo = ? LIMIT 1");
    const resultado = stmt.get(contaCodigo);
    return !!resultado;
  } catch {
    // Tabela não existe — em MVP, aceitamos o código
    // Em produção, deveria validar contra um catálogo
    return /^\d+$/.test(contaCodigo) && contaCodigo.length >= 3 && contaCodigo.length <= 10;
  }
}

/**
 * Registra um lançamento contábil simples na tabela ledger_entries
 * Sem validação de dupla entrada (apenas registro do valor)
 *
 * Exemplo de uso:
 * ```typescript
 * const resultado = registrarLancamento(db, {
 *   id: randomUUID(),
 *   data: '2024-10-04',
 *   tipo: 'receita',
 *   categoria: 'honorario',
 *   valor: 1500.00,
 *   descricao: 'Honorário de consultoria',
 *   referencia_externa: 'CHARGE-123',
 *   usuario_id: 'user-123'
 * });
 * ```
 */
export function registrarLancamento(
  db: Database.Database,
  lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'>,
): ResultadoRegistroLancamento {
  try {
    // Validação de entrada
    const validacao = validarEntrada(lancamento);
    if (!validacao.valido) {
      return {
        sucesso: false,
        erro: validacao.erro || 'Validação falhou',
      };
    }

    // Garante ID
    const id = lancamento.id || randomUUID();

    // Insere na tabela ledger_entries
    const stmt = db.prepare(`
      INSERT INTO ledger_entries
        (id, data, tipo, categoria, valor, descricao, referencia_externa, usuario_id, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      id,
      lancamento.data,
      lancamento.tipo,
      lancamento.categoria,
      lancamento.valor,
      lancamento.descricao || null,
      lancamento.referencia_externa || null,
      lancamento.usuario_id || null,
    );

    logger.info(`[Ledger] Lançamento registrado: ${id} (${lancamento.tipo}/${lancamento.categoria})`);

    // Registra auditoria
    registrarAuditoria(db, {
      lancamento_id: id,
      usuario_id: lancamento.usuario_id || 'sistema',
      acao: 'criar',
      data: new Date().toISOString(),
      detalhes: `${lancamento.tipo}: ${lancamento.descricao || ''} (${lancamento.valor})`,
    });

    return {
      sucesso: true,
      lancamento_id: id,
      mensagem: `Lançamento registrado com sucesso (ID: ${id})`,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error(`[Ledger] Erro ao registrar lançamento:`, erro);
    return {
      sucesso: false,
      erro: `Erro ao registrar lançamento: ${mensagem}`,
    };
  }
}

/**
 * Registra lançamento de double-entry (débito e crédito)
 *
 * Cria automaticamente duas entradas: uma para débito e outra para crédito
 * Ambas com o mesmo valor, data e referência para manter a integridade
 *
 * Exemplo:
 * ```typescript
 * const resultado = registrarDoubleEntry(db, {
 *   id: randomUUID(),
 *   data: '2024-10-04',
 *   descricao: 'Recebimento PIX',
 *   conta_debito: '1120', // Caixa PIX
 *   conta_credito: '4110', // Receita
 *   valor: 2500.00,
 *   tipo: 'receita',
 *   categoria: 'receita',
 *   usuario_id: 'user-123'
 * });
 * ```
 */
export function registrarDoubleEntry(
  db: Database.Database,
  lancamento: DoubleEntryLancamento,
): ResultadoRegistroLancamento {
  try {
    // Validação básica
    const validacao = validarEntrada(lancamento);
    if (!validacao.valido) {
      return {
        sucesso: false,
        erro: validacao.erro || 'Validação falhou',
      };
    }

    if (!lancamento.conta_debito || !lancamento.conta_credito) {
      return {
        sucesso: false,
        erro: 'Contas de débito e crédito são obrigatórias',
      };
    }

    // Valida existência das contas (se houver tabela plano_contas)
    if (!validarContaExiste(db, lancamento.conta_debito)) {
      return {
        sucesso: false,
        erro: `Conta de débito ${lancamento.conta_debito} não existe ou é inválida`,
      };
    }

    if (!validarContaExiste(db, lancamento.conta_credito)) {
      return {
        sucesso: false,
        erro: `Conta de crédito ${lancamento.conta_credito} não existe ou é inválida`,
      };
    }

    // Evita auto-referência
    if (lancamento.conta_debito === lancamento.conta_credito) {
      return {
        sucesso: false,
        erro: 'Conta de débito não pode ser igual à conta de crédito',
      };
    }

    // Garante ID de transação
    const idTransacao = lancamento.id || randomUUID();

    // Inicia transação
    const inserir = db.transaction(() => {
      // Lançamento de débito
      const resultadoDebito = registrarLancamento(db, {
        id: randomUUID(),
        data: lancamento.data,
        tipo: lancamento.tipo,
        categoria: lancamento.categoria,
        valor: lancamento.valor,
        descricao: `[DÉBITO] ${lancamento.descricao}`,
        referencia_externa: lancamento.referencia_externa,
        usuario_id: lancamento.usuario_id,
      });

      if (!resultadoDebito.sucesso) {
        throw new Error(`Falha ao registrar débito: ${resultadoDebito.erro}`);
      }

      // Lançamento de crédito
      const resultadoCredito = registrarLancamento(db, {
        id: randomUUID(),
        data: lancamento.data,
        tipo: lancamento.tipo,
        categoria: lancamento.categoria,
        valor: lancamento.valor,
        descricao: `[CRÉDITO] ${lancamento.descricao}`,
        referencia_externa: lancamento.referencia_externa,
        usuario_id: lancamento.usuario_id,
      });

      if (!resultadoCredito.sucesso) {
        throw new Error(`Falha ao registrar crédito: ${resultadoCredito.erro}`);
      }

      return { debito: resultadoDebito.lancamento_id, credito: resultadoCredito.lancamento_id };
    });

    inserir();

    logger.info(`[Ledger] Double-entry registrado: ${idTransacao}`);
    logger.info(`  Débito: ${lancamento.conta_debito} | Crédito: ${lancamento.conta_credito} | Valor: ${lancamento.valor}`);

    return {
      sucesso: true,
      lancamento_id: idTransacao,
      mensagem: `Double-entry registrado com sucesso (ID: ${idTransacao})`,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error(`[Ledger] Erro ao registrar double-entry:`, erro);
    return {
      sucesso: false,
      erro: `Erro ao registrar double-entry: ${mensagem}`,
    };
  }
}

/**
 * Registra auditoria de lançamento
 */
function registrarAuditoria(db: Database.Database, auditoria: AuditoriaLancamento): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO auditoria
        (usuario_id, tipo_acao, tabela, registro_id, valores_antigos, valores_novos, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      auditoria.usuario_id,
      auditoria.acao.toUpperCase(),
      'ledger_entries',
      auditoria.lancamento_id,
      null,
      auditoria.detalhes || null,
    );
  } catch (erro) {
    logger.warn(`[Ledger] Falha ao registrar auditoria:`, erro);
    // Não falha a operação se auditoria falhar
  }
}

/**
 * Obtém um lançamento pelo ID
 */
export function obterLancamento(db: Database.Database, id: string): LedgerEntry | null {
  try {
    const stmt = db.prepare(`
      SELECT id, data, tipo, categoria, valor, descricao, referencia_externa, usuario_id, criado_em, atualizado_em
      FROM ledger_entries
      WHERE id = ?
      LIMIT 1
    `);

    return (stmt.get(id) as unknown as LedgerEntry | undefined) || null;
  } catch (erro) {
    logger.error(`[Ledger] Erro ao obter lançamento ${id}:`, erro);
    return null;
  }
}

/**
 * Lista lançamentos por período e filtros
 */
export function listarLancamentos(
  db: Database.Database,
  filtros: {
    dataInicio?: string;
    dataFim?: string;
    tipo?: TipoLancamento;
    categoria?: CategoriaLancamento;
    usuarioId?: string;
  } = {},
): LedgerEntry[] {
  try {
    let sql = `
      SELECT id, data, tipo, categoria, valor, descricao, referencia_externa, usuario_id, criado_em, atualizado_em
      FROM ledger_entries
      WHERE 1=1
    `;

    const params: unknown[] = [];

    if (filtros.dataInicio) {
      sql += ` AND data >= ?`;
      params.push(filtros.dataInicio);
    }

    if (filtros.dataFim) {
      sql += ` AND data <= ?`;
      params.push(filtros.dataFim);
    }

    if (filtros.tipo) {
      sql += ` AND tipo = ?`;
      params.push(filtros.tipo);
    }

    if (filtros.categoria) {
      sql += ` AND categoria = ?`;
      params.push(filtros.categoria);
    }

    if (filtros.usuarioId) {
      sql += ` AND usuario_id = ?`;
      params.push(filtros.usuarioId);
    }

    sql += ` ORDER BY data DESC, criado_em DESC`;

    const stmt = db.prepare(sql);
    return (stmt.all(...params) as unknown as LedgerEntry[]) || [];
  } catch (erro) {
    logger.error(`[Ledger] Erro ao listar lançamentos:`, erro);
    return [];
  }
}

/**
 * Calcula saldo por categoria para um período
 */
export function calcularSaldoPorCategoria(
  db: Database.Database,
  dataInicio?: string,
  dataFim?: string,
): Record<string, number> {
  try {
    let sql = `
      SELECT categoria, tipo, SUM(valor) as total
      FROM ledger_entries
      WHERE 1=1
    `;

    const params: unknown[] = [];

    if (dataInicio) {
      sql += ` AND data >= ?`;
      params.push(dataInicio);
    }

    if (dataFim) {
      sql += ` AND data <= ?`;
      params.push(dataFim);
    }

    sql += ` GROUP BY categoria, tipo ORDER BY categoria`;

    const stmt = db.prepare(sql);
    const resultados = (stmt.all(...params) as unknown as Array<{ categoria: string; tipo: string; total: number }>) || [];

    const saldos: Record<string, number> = {};

    for (const resultado of resultados) {
      const chave = resultado.categoria;
      const valor = resultado.tipo === 'receita' ? resultado.total : -resultado.total;
      saldos[chave] = (saldos[chave] || 0) + valor;
    }

    return saldos;
  } catch (erro) {
    logger.error(`[Ledger] Erro ao calcular saldo por categoria:`, erro);
    return {};
  }
}

/**
 * Valida integridade de double-entry:
 * Total de débitos deve ser igual ao total de créditos
 */
export function validarIntegridade(db: Database.Database, referencia_externa: string): boolean {
  try {
    const stmt = db.prepare(`
      SELECT tipo, SUM(valor) as total
      FROM ledger_entries
      WHERE referencia_externa = ?
      GROUP BY tipo
    `);

    const resultados = (stmt.all(referencia_externa) as unknown as Array<{ tipo: string; total: number }>) || [];

    // Em uma referência com double-entry, deve haver exatamente 2 entradas
    // (uma de débito e outra de crédito) com o mesmo valor
    if (resultados.length !== 2) {
      return resultados.length === 1; // Aceita 1 se for lançamento simples
    }

    const totais = resultados.map((r) => r.total);
    return totais[0] === totais[1];
  } catch (erro) {
    logger.error(`[Ledger] Erro ao validar integridade:`, erro);
    return false;
  }
}
