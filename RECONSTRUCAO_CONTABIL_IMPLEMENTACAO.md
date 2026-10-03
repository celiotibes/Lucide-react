# Reconstrução Contábil - Guia de Implementação
## Phase 11 - Código e Schemas Prontos para Deploy

**Status:** Especificação executável  
**Compatibilidade:** SQLite 3 + TypeScript/Node.js  
**Tempo estimado:** 4-6 semanas (desenvolvimento + testes)

---

## 1️⃣ MIGRAÇÃO SQL - `migrations-phase11-reconstrucao-contabil.sql`

```sql
-- ===================================================================
-- PHASE 11: RECONSTRUÇÃO CONTÁBIL COM ZERO TOLERÂNCIA PARA PERÍCIA
-- ===================================================================
-- Execução: Idempotente (CREATE TABLE IF NOT EXISTS)
-- Requer: Phase 2-10 já executados
-- ===================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. TABELA DE CUSTÓDIA (STAGING DE TRANSAÇÕES)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transacoes_custodia (
  id TEXT PRIMARY KEY,
  
  -- Metadados da Importação
  fonte_tipo TEXT NOT NULL CHECK(fonte_tipo IN ('banco', 'nf', 'recibo', 'contrato', 'outro')),
  fonte_identificador TEXT NOT NULL,
  data_importacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  arquivo_origem TEXT,
  
  -- Dados Normalizados
  data_transacao DATE NOT NULL,
  valor_bruto DECIMAL(15, 2) NOT NULL CHECK(valor_bruto >= 0),
  
  -- Classificação
  tipo_preliminar TEXT CHECK(tipo_preliminar IN ('receita', 'despesa', 'transferencia', 'ajuste')),
  categoria_preliminar TEXT,
  
  -- Descrição
  descricao_original TEXT,
  descricao_normalizada TEXT,
  confianca_match DECIMAL(3, 2) CHECK(confianca_match >= 0 AND confianca_match <= 1),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'reconciliado', 'rejeitado', 'manual')),
  motivo_rejeicao TEXT,
  
  -- Integridade para Perícia
  hash_sha256 TEXT UNIQUE NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(fonte_tipo, fonte_identificador)
);

CREATE INDEX idx_custodia_fonte ON transacoes_custodia(fonte_tipo, fonte_identificador);
CREATE INDEX idx_custodia_status ON transacoes_custodia(status);
CREATE INDEX idx_custodia_data ON transacoes_custodia(data_transacao);
CREATE INDEX idx_custodia_hash ON transacoes_custodia(hash_sha256);


-- ─────────────────────────────────────────────────────────────────
-- 2. PLANO DE CONTAS (CHART OF ACCOUNTS)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plano_contas (
  id TEXT PRIMARY KEY,
  codigo_contabil TEXT UNIQUE NOT NULL,
  descricao TEXT NOT NULL,
  natureza TEXT NOT NULL CHECK(natureza IN ('ativo', 'passivo', 'receita', 'despesa', 'patrimonio')),
  classificacao TEXT,
  hierarquia_nivel INT DEFAULT 3,
  pai_id TEXT,
  
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  permissao_lancamento BOOLEAN DEFAULT TRUE,
  descricao_detalhada TEXT,
  
  -- Específico para imóvel
  imovel_id TEXT,
  
  -- Auditoria
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (pai_id) REFERENCES plano_contas(id),
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id)
);

CREATE INDEX idx_pc_codigo ON plano_contas(codigo_contabil);
CREATE INDEX idx_pc_natureza ON plano_contas(natureza);
CREATE INDEX idx_pc_ativo ON plano_contas(ativo);
CREATE INDEX idx_pc_imovel ON plano_contas(imovel_id);


-- ─────────────────────────────────────────────────────────────────
-- 3. LANÇAMENTOS CONTÁBEIS (DIÁRIO)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY,
  
  -- Referência
  imovel_id TEXT NOT NULL,
  numero_diario INTEGER NOT NULL,
  
  -- Temporal
  data_lancamento DATE NOT NULL,
  data_transacao DATE NOT NULL,
  ano_contabil INTEGER NOT NULL,
  mes_contabil INTEGER NOT NULL CHECK(mes_contabil >= 1 AND mes_contabil <= 12),
  dia_contabil INTEGER NOT NULL CHECK(dia_contabil >= 1 AND dia_contabil <= 31),
  
  -- Contas
  conta_debito_id TEXT NOT NULL,
  conta_credito_id TEXT NOT NULL,
  
  -- Valor
  valor DECIMAL(15, 2) NOT NULL CHECK(valor > 0),
  tipo_lancamento TEXT NOT NULL CHECK(tipo_lancamento IN ('receita', 'despesa', 'transferencia', 'ajuste')),
  
  -- Descrição
  descricao TEXT NOT NULL,
  descricao_detalhada TEXT,
  
  -- Rastreabilidade
  origem_transacao_id TEXT,
  origem_tipo TEXT CHECK(origem_tipo IN ('banco', 'nf', 'recibo', 'contrato', 'manual', 'ajuste')),
  documento_referencia TEXT,
  
  -- Integridade para Perícia (CRÍTICO)
  hash_lancamento TEXT UNIQUE NOT NULL,
  assinatura_digital TEXT NOT NULL,
  
  -- Quem fez
  criado_por TEXT NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho', 'conciliado', 'cancelado', 'ajustado')),
  motivo_cancelamento TEXT,
  data_cancelamento DATETIME,
  
  -- Auditoria
  versao INT DEFAULT 1,
  
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id),
  FOREIGN KEY (conta_debito_id) REFERENCES plano_contas(id),
  FOREIGN KEY (conta_credito_id) REFERENCES plano_contas(id),
  FOREIGN KEY (origem_transacao_id) REFERENCES transacoes_custodia(id)
);

CREATE INDEX idx_lancamentos_imovel_data ON lancamentos(imovel_id, data_lancamento);
CREATE INDEX idx_lancamentos_periodo ON lancamentos(ano_contabil, mes_contabil);
CREATE INDEX idx_lancamentos_conta ON lancamentos(conta_debito_id, conta_credito_id);
CREATE INDEX idx_lancamentos_origem ON lancamentos(origem_transacao_id);
CREATE INDEX idx_lancamentos_hash ON lancamentos(hash_lancamento);
CREATE INDEX idx_lancamentos_status ON lancamentos(status);


-- ─────────────────────────────────────────────────────────────────
-- 4. AUDIT TRAIL (RASTREAMENTO COMPLETO)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lancamentos_historico (
  id TEXT PRIMARY KEY,
  lancamento_id TEXT NOT NULL,
  
  -- Ação
  tipo_acao TEXT NOT NULL CHECK(tipo_acao IN ('criacao', 'edicao', 'cancelamento', 'restauracao')),
  descricao_acao TEXT,
  
  -- Valores
  dados_anteriores JSON,
  dados_novos JSON,
  
  -- Auditoria
  usuario_id TEXT,
  data_acao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_origem TEXT,
  
  -- Integridade
  hash_anterior TEXT,
  hash_novo TEXT,
  
  FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id)
);

CREATE INDEX idx_lancamentos_hist_lancamento ON lancamentos_historico(lancamento_id);
CREATE INDEX idx_lancamentos_hist_data ON lancamentos_historico(data_acao);


-- ─────────────────────────────────────────────────────────────────
-- 5. PENDÊNCIAS (ITENS INCOMPLETOS)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pendencias (
  id TEXT PRIMARY KEY,
  transacao_id TEXT NOT NULL,
  
  -- Tipo de pendência
  tipo TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK(nivel IN ('critica', 'alta', 'media', 'baixa')),
  descricao TEXT NOT NULL,
  campo_faltante TEXT,
  
  -- Resolução
  valor_sugerido TEXT,
  alternativas JSON,
  
  -- Status
  resolvido BOOLEAN NOT NULL DEFAULT FALSE,
  data_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_vencimento DATETIME,
  resolucao_data DATETIME,
  usuario_resolveu TEXT,
  
  FOREIGN KEY (transacao_id) REFERENCES transacoes_custodia(id)
);

CREATE INDEX idx_pendencias_transacao ON pendencias(transacao_id);
CREATE INDEX idx_pendencias_nivel ON pendencias(nivel);
CREATE INDEX idx_pendencias_resolvido ON pendencias(resolvido);


-- ─────────────────────────────────────────────────────────────────
-- 6. REGRAS DE SEGREGAÇÃO (CATEGORIZAÇÃO AUTOMÁTICA)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS regras_segregacao (
  id TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  conta_id TEXT NOT NULL,
  
  -- Condições (JSON)
  condicoes JSON NOT NULL,
  
  -- Tipo de alocação
  percentual_alocacao DECIMAL(5, 2),
  tipo_rateio TEXT CHECK(tipo_rateio IN ('fixo', 'proporcional_receita', 'proporcional_area')),
  
  -- Status
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem_prioridade INT DEFAULT 999,
  
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (conta_id) REFERENCES plano_contas(id)
);

CREATE INDEX idx_regras_ativo ON regras_segregacao(ativo);
CREATE INDEX idx_regras_ordem ON regras_segregacao(ordem_prioridade);


-- ─────────────────────────────────────────────────────────────────
-- 7. CONCILIAÇÃO MENSAL
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conciliamentos_mensais (
  id TEXT PRIMARY KEY,
  imovel_id TEXT NOT NULL,
  periodo TEXT NOT NULL,  -- YYYY-MM
  
  saldo_contabil DECIMAL(15, 2) NOT NULL,
  saldo_extrato_banco DECIMAL(15, 2),
  diferenca DECIMAL(15, 2),
  
  status TEXT NOT NULL CHECK(status IN ('em_progresso', 'concluido', 'com_discrepancias')),
  
  reconciliados INT DEFAULT 0,
  pendentes INT DEFAULT 0,
  discrepancias INT DEFAULT 0,
  
  data_realizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id),
  UNIQUE(imovel_id, periodo)
);

CREATE INDEX idx_concil_imovel_periodo ON conciliamentos_mensais(imovel_id, periodo);


-- ─────────────────────────────────────────────────────────────────
-- 8. FECHAMENTO DE PERÍODO
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fechamentos_periodos (
  id TEXT PRIMARY KEY,
  imovel_id TEXT NOT NULL,
  periodo TEXT NOT NULL,  -- YYYY-MM
  
  status TEXT NOT NULL CHECK(status IN ('aberto', 'em_processamento', 'fechado', 'reaberto')),
  
  saldo_inicial DECIMAL(15, 2),
  movimentacao_liquida DECIMAL(15, 2),
  saldo_final DECIMAL(15, 2),
  
  -- Documentos
  diario_gerado BOOLEAN DEFAULT FALSE,
  razao_gerado BOOLEAN DEFAULT FALSE,
  balancete_gerado BOOLEAN DEFAULT FALSE,
  
  -- Integridade
  hash_fechamento TEXT UNIQUE NOT NULL,
  
  data_abertura DATETIME NOT NULL,
  data_fechamento DATETIME,
  
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id),
  UNIQUE(imovel_id, periodo)
);

CREATE INDEX idx_fechamentos_periodo ON fechamentos_periodos(imovel_id, periodo);


-- ─────────────────────────────────────────────────────────────────
-- 9. ALERTA DE DISCREPÂNCIAS
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alertas_discrepancias (
  id TEXT PRIMARY KEY,
  transacao_id TEXT,
  lancamento_id TEXT,
  
  tipo_alerta TEXT NOT NULL,
  severidade TEXT NOT NULL CHECK(severidade IN ('baixa', 'media', 'alta', 'critica')),
  descricao TEXT NOT NULL,
  
  dados_contexto JSON,
  recomendacao TEXT,
  
  resolvido BOOLEAN NOT NULL DEFAULT FALSE,
  data_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolucao_data DATETIME,
  
  FOREIGN KEY (transacao_id) REFERENCES transacoes_custodia(id),
  FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id)
);

CREATE INDEX idx_alertas_severidade ON alertas_discrepancias(severidade);
CREATE INDEX idx_alertas_resolvido ON alertas_discrepancias(resolvido);


-- ─────────────────────────────────────────────────────────────────
-- 10. VALIDAÇÃO PARA PERÍCIA
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validacoes_perizia (
  id TEXT PRIMARY KEY,
  lancamento_id TEXT NOT NULL,
  periodo TEXT NOT NULL,  -- YYYY-MM
  
  -- Resultado
  resultado_final TEXT NOT NULL CHECK(resultado_final IN ('APROVADO_PERIZIA', 'REJEITADO_PERIZIA', 'CONDICIONAL')),
  
  -- Detalhes
  validacoes_executadas JSON NOT NULL,
  erros_criticos JSON,
  avisos JSON,
  
  -- Assinatura
  assinatura_pericia TEXT,
  
  -- Timestamp
  data_validacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id),
  UNIQUE(lancamento_id)
);

CREATE INDEX idx_validacoes_resultado ON validacoes_perizia(resultado_final);
CREATE INDEX idx_validacoes_periodo ON validacoes_perizia(periodo);


-- ─────────────────────────────────────────────────────────────────
-- 11. SEED DATA: PLANO DE CONTAS PADRÃO PARA IMÓVEL
-- ─────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO plano_contas (id, codigo_contabil, descricao, natureza, hierarquia_nivel, ativo) VALUES
  -- RECEITAS
  ('pc_4_1', '4.1', 'Receitas', 'receita', 1, 1),
  ('pc_4_1_1', '4.1.1', 'Aluguel Normal', 'receita', 2, 1),
  ('pc_4_1_2', '4.1.2', 'Aluguel em Atraso', 'receita', 2, 1),
  ('pc_4_1_3', '4.1.3', 'Ajustes de Aluguel', 'receita', 2, 1),
  ('pc_4_2', '4.2', 'Outras Receitas', 'receita', 1, 1),
  ('pc_4_2_1', '4.2.1', 'Juros Recebidos', 'receita', 2, 1),
  ('pc_4_2_2', '4.2.2', 'Multa Recebida', 'receita', 2, 1),
  
  -- DESPESAS OPERACIONAIS
  ('pc_5_1', '5.1', 'Despesas com Imóvel', 'despesa', 1, 1),
  ('pc_5_1_1', '5.1.1', 'IPTU', 'despesa', 2, 1),
  ('pc_5_1_2', '5.1.2', 'Condomínio', 'despesa', 2, 1),
  ('pc_5_1_3', '5.1.3', 'Seguro', 'despesa', 2, 1),
  ('pc_5_1_4', '5.1.4', 'Manutenção', 'despesa', 2, 1),
  ('pc_5_1_5', '5.1.5', 'Limpeza', 'despesa', 2, 1),
  ('pc_5_1_6', '5.1.6', 'Outras Despesas Imóvel', 'despesa', 2, 1),
  
  -- DESPESAS FINANCEIRAS
  ('pc_5_3', '5.3', 'Despesas Financeiras', 'despesa', 1, 1),
  ('pc_5_3_1', '5.3.1', 'Juros Pagos', 'despesa', 2, 1),
  ('pc_5_3_2', '5.3.2', 'Multa por Atraso', 'despesa', 2, 1),
  ('pc_5_3_3', '5.3.3', 'Taxa Bancária', 'despesa', 2, 1),
  
  -- DESPESAS ADMINISTRATIVAS
  ('pc_5_4', '5.4', 'Despesas Administrativas', 'despesa', 1, 1),
  ('pc_5_4_1', '5.4.1', 'Honorários (Gestão)', 'despesa', 2, 1),
  ('pc_5_4_2', '5.4.2', 'Custos de Cobrança', 'despesa', 2, 1),
  
  -- ATIVOS
  ('pc_1_1', '1.1', 'Ativo Circulante', 'ativo', 1, 1),
  ('pc_1_1_1', '1.1.1', 'Caixa', 'ativo', 2, 1),
  ('pc_1_1_2', '1.1.2', 'Bancos', 'ativo', 2, 1),
  ('pc_1_1_3', '1.1.3', 'Contas a Receber', 'ativo', 2, 1),
  
  -- PASSIVOS
  ('pc_2_1', '2.1', 'Passivo Circulante', 'passivo', 1, 1),
  ('pc_2_1_1', '2.1.1', 'Contas a Pagar', 'passivo', 2, 1),
  
  -- PATRIMÔNIO
  ('pc_3_1', '3.1', 'Capital', 'patrimonio', 1, 1);


-- ─────────────────────────────────────────────────────────────────
-- 12. SEED DATA: REGRAS DE SEGREGAÇÃO PADRÃO
-- ─────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO regras_segregacao (id, descricao, conta_id, condicoes, ativo, ordem_prioridade) VALUES
  ('regra_iptu', 'Identifica IPTU', 'pc_5_1_1', 
   '{"campo":"descricao","operador":"regex","valor":"(IPTU|IMPOSTO.*TERRITORIAL)"}', 1, 10),
  
  ('regra_condominio', 'Identifica condomínio', 'pc_5_1_2',
   '{"campo":"descricao","operador":"regex","valor":"(CONDOMÍNIO|COND\\.|SÍNDICO)"}', 1, 20),
  
  ('regra_juros_atraso', 'Identifica juros e multa', 'pc_5_3_2',
   '{"campo":"descricao","operador":"regex","valor":"(JUROS|MULTA|MORA|JURO DE MORA)"}', 1, 30),
  
  ('regra_reforma', 'Identifica reforma/manutenção', 'pc_5_1_4',
   '{"campo":"descricao","operador":"regex","valor":"(REFORMA|MANUTENÇÃO|CONSERTO|REPARO)"}', 1, 40),
  
  ('regra_seguro', 'Identifica seguro', 'pc_5_1_3',
   '{"campo":"descricao","operador":"regex","valor":"(SEGURO|APÓLICE)"}', 1, 50);

-- ===================================================================
-- FIM DA MIGRAÇÃO - TABELAS PRONTAS PARA OPERAÇÃO
-- ===================================================================
```

---

## 2️⃣ CÓDIGO TYPESCRIPT - `domain/reconstrucao-contabil/index.ts`

```typescript
/**
 * DOMÍNIO: RECONSTRUÇÃO CONTÁBIL
 * Arquivo: domain/reconstrucao-contabil/index.ts
 * 
 * Responsabilidades:
 * - Reconciliação de transações
 * - Segregação de custos
 * - Geração de lançamentos
 * - Validação para perícia
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface Transacao {
  id: string;
  fonte_tipo: 'banco' | 'nf' | 'recibo' | 'contrato' | 'outro';
  fonte_identificador: string;
  data_transacao: Date;
  valor_bruto: number;
  tipo_preliminar?: 'receita' | 'despesa' | 'transferencia' | 'ajuste';
  categoria_preliminar?: string;
  descricao_original: string;
  descricao_normalizada?: string;
  confianca_match?: number;
  status: 'pendente' | 'reconciliado' | 'rejeitado' | 'manual';
  hash_sha256: string;
}

export interface Lancamento {
  id: string;
  imovel_id: string;
  numero_diario: number;
  data_lancamento: Date;
  data_transacao: Date;
  ano_contabil: number;
  mes_contabil: number;
  dia_contabil: number;
  conta_debito_id: string;
  conta_credito_id: string;
  valor: number;
  tipo_lancamento: string;
  descricao: string;
  descricao_detalhada?: string;
  origem_transacao_id?: string;
  origem_tipo?: string;
  documento_referencia?: string;
  hash_lancamento: string;
  assinatura_digital: string;
  status: 'rascunho' | 'conciliado' | 'cancelado' | 'ajustado';
  criado_por: string;
}

export interface Pendencia {
  id: string;
  transacao_id: string;
  tipo: string;
  nivel: 'critica' | 'alta' | 'media' | 'baixa';
  descricao: string;
  campo_faltante?: string;
  resolvido: boolean;
}

export interface ResultadoReconciliacao {
  transacao_id: string;
  transacoes_relacionadas: string[];
  eh_duplicata: boolean;
  score_confianca: number;
  pendencias: Pendencia[];
  pronto_para_lancamento: boolean;
}

// ─────────────────────────────────────────────────────────────────
// SERVIÇO: RECONCILIAÇÃO
// ─────────────────────────────────────────────────────────────────

export class ReconciliadorTransacoes {
  constructor(private db: Database.Database) {}

  /**
   * Identifica transações que se referem à mesma operação
   */
  public identificarTransacoesRelacionadas(
    transacao: Transacao,
    tolerancia_dias: number = 2,
    tolerancia_valor_pct: number = 0.05
  ): string[] {
    
    const relatives: string[] = [];
    
    // Match exato (data + valor)
    const exatos = this.db.prepare(`
      SELECT id FROM transacoes_custodia
      WHERE data_transacao = ?
        AND valor_bruto = ?
        AND fonte_tipo != ?
        AND id != ?
        AND status != 'rejeitado'
    `).all(
      transacao.data_transacao,
      transacao.valor_bruto,
      transacao.fonte_tipo,
      transacao.id
    ) as Array<{id: string}>;
    
    relatives.push(...exatos.map(e => e.id));
    
    // Match fuzzy (±2 dias, ±5%)
    const diferenca_max = transacao.valor_bruto * tolerancia_valor_pct;
    const fuzzy = this.db.prepare(`
      SELECT id FROM transacoes_custodia
      WHERE ABS(JULIANDAY(data_transacao) - JULIANDAY(?)) <= ?
        AND ABS(valor_bruto - ?) <= ?
        AND fonte_tipo != ?
        AND id != ?
        AND status != 'rejeitado'
    `).all(
      transacao.data_transacao,
      tolerancia_dias,
      transacao.valor_bruto,
      diferenca_max,
      transacao.fonte_tipo,
      transacao.id
    ) as Array<{id: string}>;
    
    fuzzy.forEach(f => {
      if (!relatives.includes(f.id)) {
        relatives.push(f.id);
      }
    });
    
    return relatives;
  }

  /**
   * Detecta duplicatas (mesmos dados em múltiplas fontes)
   */
  public detectarDuplicatas(transacao: Transacao): {
    eh_duplicata: boolean;
    score: number;
    tipo: 'exata' | 'provavel' | 'nenhuma';
  } {
    
    // Tipo 1: Hash idêntico (duplicata exata)
    const hash_dup = this.db.prepare(`
      SELECT COUNT(*) as qtd FROM transacoes_custodia
      WHERE hash_sha256 = ? AND id != ? AND status != 'rejeitado'
    `).get(transacao.hash_sha256, transacao.id) as {qtd: number};
    
    if (hash_dup.qtd > 0) {
      return { eh_duplicata: true, score: 100, tipo: 'exata' };
    }
    
    // Tipo 2: Mesmo ID de fonte (duplicata de importação)
    const fonte_dup = this.db.prepare(`
      SELECT COUNT(*) as qtd FROM transacoes_custodia
      WHERE fonte_tipo = ? AND fonte_identificador = ? AND id != ? AND status != 'rejeitado'
    `).get(transacao.fonte_tipo, transacao.fonte_identificador, transacao.id) as {qtd: number};
    
    if (fonte_dup.qtd > 0) {
      return { eh_duplicata: true, score: 100, tipo: 'exata' };
    }
    
    return { eh_duplicata: false, score: 0, tipo: 'nenhuma' };
  }

  /**
   * Valida completude de dados
   */
  public validarCompletude(transacao: Transacao): {
    completa: boolean;
    erros: string[];
    avisos: string[];
    percentual_completude: number;
  } {
    
    const erros: string[] = [];
    const avisos: string[] = [];
    
    // Campos obrigatórios
    if (!transacao.data_transacao) erros.push('Data da transação obrigatória');
    if (!transacao.valor_bruto || transacao.valor_bruto <= 0) erros.push('Valor deve ser positivo');
    if (!transacao.fonte_tipo) erros.push('Tipo de fonte obrigatório');
    if (!transacao.descricao_normalizada) avisos.push('Descrição normalizadafaltando');
    if (!transacao.categoria_preliminar) avisos.push('Categoria preliminar não definida');
    
    // Validações secundárias
    if (!transacao.hash_sha256) {
      avisos.push('Hash não calculado - será feito na importação');
    }
    
    const percentual_completude = [
      !!transacao.data_transacao,
      !!transacao.valor_bruto,
      !!transacao.fonte_tipo,
      !!transacao.fonte_identificador,
      !!transacao.descricao_normalizada,
      !!transacao.categoria_preliminar
    ].filter(Boolean).length / 6 * 100;
    
    return {
      completa: erros.length === 0,
      erros,
      avisos,
      percentual_completude: Math.round(percentual_completude)
    };
  }

  /**
   * Executa reconciliação completa
   */
  public reconciliar(transacao: Transacao): ResultadoReconciliacao {
    
    const validacao = this.validarCompletude(transacao);
    const relacionadas = this.identificarTransacoesRelacionadas(transacao);
    const duplicata = this.detectarDuplicatas(transacao);
    
    const pendencias: Pendencia[] = [];
    
    if (!validacao.completa) {
      validacao.erros.forEach(e => {
        pendencias.push({
          id: `pend_${transacao.id}_${Date.now()}`,
          transacao_id: transacao.id,
          tipo: 'validacao_basica',
          nivel: 'critica',
          descricao: e,
          resolvido: false
        });
      });
    }
    
    if (duplicata.eh_duplicata) {
      pendencias.push({
        id: `pend_${transacao.id}_dup`,
        transacao_id: transacao.id,
        tipo: 'duplicata',
        nivel: 'alta',
        descricao: 'Transação duplicada detectada',
        resolvido: false
      });
    }
    
    if (!transacao.categoria_preliminar) {
      pendencias.push({
        id: `pend_${transacao.id}_cat`,
        transacao_id: transacao.id,
        tipo: 'categoria_indefinida',
        nivel: 'critica',
        descricao: 'Categoria contábil não definida',
        campo_faltante: 'categoria_preliminar',
        resolvido: false
      });
    }
    
    return {
      transacao_id: transacao.id,
      transacoes_relacionadas: relacionadas,
      eh_duplicata: duplicata.eh_duplicata,
      score_confianca: duplicata.score,
      pendencias,
      pronto_para_lancamento: pendencias.filter(p => p.nivel === 'critica').length === 0
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// SERVIÇO: SEGREGAÇÃO DE CUSTOS
// ─────────────────────────────────────────────────────────────────

export class SegregadorCustos {
  constructor(private db: Database.Database) {}

  /**
   * Aplica regra de segregação à transação
   */
  public aplicarRegra(transacao: Transacao): {
    conta_id: string;
    regra_id: string;
    score: number;
  } | null {
    
    const regras = this.db.prepare(`
      SELECT id, conta_id, condicoes FROM regras_segregacao
      WHERE ativo = TRUE
      ORDER BY ordem_prioridade ASC
    `).all() as Array<{id: string; conta_id: string; condicoes: string}>;
    
    for (const regra of regras) {
      const condicoes = JSON.parse(regra.condicoes);
      if (this.avaliarCondicao(transacao, condicoes)) {
        return {
          conta_id: regra.conta_id,
          regra_id: regra.id,
          score: 95
        };
      }
    }
    
    return null;
  }

  /**
   * Avalia se condição da regra é satisfeita
   */
  private avaliarCondicao(transacao: Transacao, condicao: any): boolean {
    
    const valor = transacao[condicao.campo as keyof Transacao];
    const v = String(valor).toLowerCase();
    
    switch (condicao.operador) {
      case 'regex':
        return new RegExp(condicao.valor, 'i').test(v);
      case 'contem':
        return v.includes(String(condicao.valor).toLowerCase());
      case 'iguala':
        return v === String(condicao.valor).toLowerCase();
      default:
        return false;
    }
  }

  /**
   * Calcula percentuais de despesa por categoria
   */
  public calcularPercentuaisDespesa(
    imovel_id: string,
    ano: number,
    mes: number
  ): {
    receita_bruta: number;
    despesas_por_categoria: Array<{categoria: string; valor: number; pct: number}>;
    total_despesas: number;
    margem_liquida_pct: number;
  } {
    
    const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const dataFim = `${ano}-${String(mes).padStart(2, '0')}-31`;
    
    // Receitas
    const receita = this.db.prepare(`
      SELECT SUM(valor) as total FROM lancamentos
      WHERE imovel_id = ? AND data_lancamento BETWEEN ? AND ?
        AND conta_debito_id = '1.1.2'
    `).get(imovel_id, dataInicio, dataFim) as {total: number | null};
    
    const receita_bruta = receita.total || 0;
    
    // Despesas por categoria
    const despesas = this.db.prepare(`
      SELECT 
        pc.descricao,
        SUM(l.valor) as valor
      FROM lancamentos l
      JOIN plano_contas pc ON l.conta_debito_id = pc.id
      WHERE l.imovel_id = ? AND l.data_lancamento BETWEEN ? AND ?
        AND pc.natureza = 'despesa'
      GROUP BY pc.descricao
      ORDER BY valor DESC
    `).all(imovel_id, dataInicio, dataFim) as Array<{descricao: string; valor: number}>;
    
    const despesas_por_categoria = despesas.map(d => ({
      categoria: d.descricao,
      valor: d.valor,
      pct: receita_bruta > 0 ? (d.valor / receita_bruta) * 100 : 0
    }));
    
    const total_despesas = despesas.reduce((sum, d) => sum + d.valor, 0);
    
    return {
      receita_bruta,
      despesas_por_categoria,
      total_despesas,
      margem_liquida_pct: receita_bruta > 0 ? ((receita_bruta - total_despesas) / receita_bruta) * 100 : 0
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// SERVIÇO: LANÇAMENTOS CONTÁBEIS
// ─────────────────────────────────────────────────────────────────

export class GeradorLancamentos {
  constructor(
    private db: Database.Database,
    private segregador: SegregadorCustos
  ) {}

  /**
   * Converte transação em lançamento contábil
   */
  public converterEmLancamento(
    transacao: Transacao,
    imovel_id: string,
    numero_diario: number,
    usuario_id: string = 'sistema'
  ): Lancamento {
    
    // Determinar contas
    let conta_debito: string;
    let conta_credito: string;
    
    if (transacao.tipo_preliminar === 'receita') {
      conta_debito = '1.1.2';  // Banco
      const regra = this.segregador.aplicarRegra(transacao);
      conta_credito = regra?.conta_id || '4.1.3';  // Receita default
    } else {
      const regra = this.segregador.aplicarRegra(transacao);
      conta_debito = regra?.conta_id || '5.1.6';  // Despesa default
      conta_credito = '1.1.2';  // Banco
    }
    
    const data_transacao = new Date(transacao.data_transacao);
    
    const lancamento: Lancamento = {
      id: crypto.randomUUID(),
      imovel_id,
      numero_diario,
      data_lancamento: new Date(),
      data_transacao: data_transacao,
      ano_contabil: data_transacao.getFullYear(),
      mes_contabil: data_transacao.getMonth() + 1,
      dia_contabil: data_transacao.getDate(),
      conta_debito_id: conta_debito,
      conta_credito_id: conta_credito,
      valor: transacao.valor_bruto,
      tipo_lancamento: transacao.tipo_preliminar || 'ajuste',
      descricao: transacao.descricao_normalizada || transacao.descricao_original,
      descricao_detalhada: `Origem: ${transacao.fonte_tipo} | ${transacao.fonte_identificador}`,
      origem_transacao_id: transacao.id,
      origem_tipo: transacao.fonte_tipo,
      documento_referencia: transacao.fonte_identificador,
      status: 'rascunho',
      criado_por: usuario_id,
      hash_lancamento: '',
      assinatura_digital: ''
    };
    
    // Calcular hash e assinatura
    lancamento.hash_lancamento = this.calcularHashLancamento(lancamento);
    lancamento.assinatura_digital = this.calcularAssinaturaDigital(lancamento.hash_lancamento);
    
    return lancamento;
  }

  /**
   * Calcula SHA256 do lançamento
   */
  private calcularHashLancamento(lancamento: Lancamento): string {
    const dados = `${lancamento.conta_debito_id}|${lancamento.conta_credito_id}|${lancamento.valor}|${lancamento.data_transacao}|${lancamento.descricao}`;
    return crypto.createHash('sha256').update(dados).digest('hex');
  }

  /**
   * Calcula assinatura HMAC
   */
  private calcularAssinaturaDigital(hash: string): string {
    const chave = process.env.CHAVE_ASSINATURA_LANCAMENTOS || 'chave-padrao';
    return crypto.createHmac('sha256', chave).update(hash).digest('hex');
  }

  /**
   * Grava lançamento no banco
   */
  public gravarLancamento(lancamento: Lancamento): string {
    
    const stmt = this.db.prepare(`
      INSERT INTO lancamentos (
        id, imovel_id, numero_diario, data_lancamento, data_transacao,
        ano_contabil, mes_contabil, dia_contabil, conta_debito_id, conta_credito_id,
        valor, tipo_lancamento, descricao, descricao_detalhada, origem_transacao_id,
        origem_tipo, documento_referencia, hash_lancamento, assinatura_digital,
        criado_por, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      lancamento.id,
      lancamento.imovel_id,
      lancamento.numero_diario,
      lancamento.data_lancamento,
      lancamento.data_transacao,
      lancamento.ano_contabil,
      lancamento.mes_contabil,
      lancamento.dia_contabil,
      lancamento.conta_debito_id,
      lancamento.conta_credito_id,
      lancamento.valor,
      lancamento.tipo_lancamento,
      lancamento.descricao,
      lancamento.descricao_detalhada,
      lancamento.origem_transacao_id,
      lancamento.origem_tipo,
      lancamento.documento_referencia,
      lancamento.hash_lancamento,
      lancamento.assinatura_digital,
      lancamento.criado_por,
      lancamento.status
    );
    
    return lancamento.id;
  }
}

// ─────────────────────────────────────────────────────────────────
// SERVIÇO: VALIDAÇÃO PARA PERÍCIA
// ─────────────────────────────────────────────────────────────────

export class ValidadorPericia {
  constructor(private db: Database.Database) {}

  /**
   * Valida lançamento para perícia
   */
  public validarParaPerizia(lancamento_id: string): {
    aprovado: boolean;
    resultado: 'APROVADO_PERIZIA' | 'REJEITADO_PERIZIA' | 'CONDICIONAL';
    erros: string[];
    avisos: string[];
  } {
    
    const lancamento = this.db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(lancamento_id) as any;
    const erros: string[] = [];
    const avisos: string[] = [];
    
    if (!lancamento) {
      return { aprovado: false, resultado: 'REJEITADO_PERIZIA', erros: ['Lançamento não encontrado'], avisos: [] };
    }
    
    // V1: Rastreabilidade
    if (!lancamento.origem_transacao_id) {
      erros.push('Sem origem rastreável');
    }
    
    // V2: Hash integridade
    const hash_calc = this.calcularHashLancamento(lancamento);
    if (hash_calc !== lancamento.hash_lancamento) {
      erros.push('Hash inválido - dados foram alterados');
    }
    
    // V3: Contas ativas
    const contaD = this.db.prepare('SELECT ativo FROM plano_contas WHERE id = ?').get(lancamento.conta_debito_id) as any;
    const contaC = this.db.prepare('SELECT ativo FROM plano_contas WHERE id = ?').get(lancamento.conta_credito_id) as any;
    
    if (!contaD?.ativo || !contaC?.ativo) {
      erros.push('Uma ou ambas as contas não estão ativas');
    }
    
    // V4: Valor positivo
    if (lancamento.valor <= 0) {
      erros.push('Valor deve ser positivo');
    }
    
    // V5: Datas coerentes
    if (new Date(lancamento.data_lancamento) < new Date(lancamento.data_transacao)) {
      avisos.push('Data de lançamento anterior à data da transação');
    }
    
    // Resultado final
    let resultado: 'APROVADO_PERIZIA' | 'REJEITADO_PERIZIA' | 'CONDICIONAL';
    if (erros.length > 0) {
      resultado = 'REJEITADO_PERIZIA';
    } else if (avisos.length > 0) {
      resultado = 'CONDICIONAL';
    } else {
      resultado = 'APROVADO_PERIZIA';
    }
    
    return {
      aprovado: resultado === 'APROVADO_PERIZIA',
      resultado,
      erros,
      avisos
    };
  }

  private calcularHashLancamento(lancamento: any): string {
    const dados = `${lancamento.conta_debito_id}|${lancamento.conta_credito_id}|${lancamento.valor}|${lancamento.data_transacao}|${lancamento.descricao}`;
    return crypto.createHash('sha256').update(dados).digest('hex');
  }
}

// ─────────────────────────────────────────────────────────────────
// ORQUESTRADOR
// ─────────────────────────────────────────────────────────────────

export class ReconstrucaoContabilOrquestrador {
  private reconciliador: ReconciliadorTransacoes;
  private segregador: SegregadorCustos;
  private gerador: GeradorLancamentos;
  private validador: ValidadorPericia;

  constructor(private db: Database.Database) {
    this.reconciliador = new ReconciliadorTransacoes(db);
    this.segregador = new SegregadorCustos(db);
    this.gerador = new GeradorLancamentos(db, this.segregador);
    this.validador = new ValidadorPericia(db);
  }

  /**
   * Pipeline completo: Transação → Lançamento
   */
  public processoCompleto(
    transacao: Transacao,
    imovel_id: string,
    usuario_id: string = 'sistema'
  ): {
    sucesso: boolean;
    lancamento_id?: string;
    pendencias: Pendencia[];
    erro?: string;
  } {
    
    try {
      // Passo 1: Reconciliar
      const resultado_reconciliacao = this.reconciliador.reconciliar(transacao);
      
      if (!resultado_reconciliacao.pronto_para_lancamento) {
        return {
          sucesso: false,
          pendencias: resultado_reconciliacao.pendencias,
          erro: 'Transação possui pendências críticas'
        };
      }
      
      // Passo 2: Gerar lançamento
      const numero_diario = this.obterProximoNumeroDiario(imovel_id);
      const lancamento = this.gerador.converterEmLancamento(
        transacao,
        imovel_id,
        numero_diario,
        usuario_id
      );
      
      // Passo 3: Validar para perícia
      const validacao = this.validador.validarParaPerizia(lancamento.id);
      if (!validacao.aprovado && validacao.resultado === 'REJEITADO_PERIZIA') {
        return {
          sucesso: false,
          pendencias: [],
          erro: `Lançamento rejeitado para perícia: ${validacao.erros.join('; ')}`
        };
      }
      
      // Passo 4: Gravar
      const lancamento_id = this.gerador.gravarLancamento(lancamento);
      
      // Passo 5: Marcar transação como reconciliada
      this.db.prepare('UPDATE transacoes_custodia SET status = ? WHERE id = ?')
        .run('reconciliado', transacao.id);
      
      return {
        sucesso: true,
        lancamento_id,
        pendencias: []
      };
      
    } catch (erro) {
      return {
        sucesso: false,
        pendencias: [],
        erro: `Erro ao processar: ${erro instanceof Error ? erro.message : String(erro)}`
      };
    }
  }

  private obterProximoNumeroDiario(imovel_id: string): number {
    const resultado = this.db.prepare(
      'SELECT MAX(numero_diario) as max_num FROM lancamentos WHERE imovel_id = ?'
    ).get(imovel_id) as {max_num: number | null};
    
    return (resultado.max_num || 0) + 1;
  }
}
```

---

## 3️⃣ ARQUIVO EXTERNO: `server/src/migrations-phase11-reconstrucao-contabil.sql`

Copie o SQL acima na seção **1️⃣ MIGRAÇÃO SQL** como arquivo separado.

---

## 4️⃣ USO NO SERVIDOR - `server/src/rotas/reconstrucao-contabil-routes.ts`

```typescript
import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { 
  ReconstrucaoContabilOrquestrador,
  Transacao
} from '../domain/reconstrucao-contabil/index.js';

export function criarRotasReconstrucaoContabil(db: Database.Database): Router {
  const router = Router();
  const orquestrador = new ReconstrucaoContabilOrquestrador(db);

  /**
   * POST /api/reconstrucao/processar-transacao
   * Processa uma transação do staging até lançamento
   */
  router.post('/processar-transacao', (req: Request, res: Response) => {
    try {
      const { transacao_id, imovel_id, usuario_id } = req.body;

      const transacao = db.prepare(
        'SELECT * FROM transacoes_custodia WHERE id = ?'
      ).get(transacao_id) as any;

      if (!transacao) {
        return res.status(404).json({ erro: 'Transação não encontrada' });
      }

      const resultado = orquestrador.processoCompleto(
        transacao,
        imovel_id,
        usuario_id || 'sistema'
      );

      if (resultado.sucesso) {
        return res.json({
          sucesso: true,
          lancamento_id: resultado.lancamento_id
        });
      } else {
        return res.status(400).json({
          sucesso: false,
          erro: resultado.erro,
          pendencias: resultado.pendencias
        });
      }

    } catch (erro) {
      console.error('Erro em reconstrucao-contabil:', erro);
      res.status(500).json({ erro: 'Erro interno do servidor' });
    }
  });

  return router;
}
```

---

## 5️⃣ TESTES UNITÁRIOS - `server/src/__tests__/reconstrucao-contabil.test.ts`

```typescript
import { describe, it, beforeEach, expect, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { ReconstrucaoContabilOrquestrador } from '../domain/reconstrucao-contabil/index.js';

describe('Reconstrução Contábil', () => {
  let db: Database.Database;
  let orquestrador: ReconstrucaoContabilOrquestrador;

  beforeEach(() => {
    // DB em memória para testes
    db = new Database(':memory:');
    
    // Carregar schemas
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, '../migrations-phase11-reconstrucao-contabil.sql'),
      'utf-8'
    );
    db.exec(schemaSQL);

    orquestrador = new ReconstrucaoContabilOrquestrador(db);
  });

  afterEach(() => {
    db.close();
  });

  it('deve reconciliar transações duplicadas', () => {
    // TODO: Implementar teste
  });

  it('deve validar completude de dados', () => {
    // TODO: Implementar teste
  });

  it('deve gerar lançamento contábil válido', () => {
    // TODO: Implementar teste
  });

  it('deve rejeitar lançamento sem perícia', () => {
    // TODO: Implementar teste
  });
});
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Criar arquivo `migrations-phase11-reconstrucao-contabil.sql`
- [ ] Criar arquivo `domain/reconstrucao-contabil/index.ts`
- [ ] Atualizar `database-init.ts` para incluir nova migração
- [ ] Criar rotas HTTP em `reconstrucao-contabil-routes.ts`
- [ ] Escrever testes unitários
- [ ] Integrar com importer de banco (Pluggy)
- [ ] Integrar com importador de NF-e
- [ ] Dashboard de pendências
- [ ] Relatório de validação para perícia

---

## 📊 PRÓXIMOS PASSOS

1. **Integração com Pluggy**: Ler extratos bancários e gerar `transacoes_custodia`
2. **Integração com NF-e**: Parser XML para `transacoes_custodia`
3. **Dashboard**: Visualizar pendências e status de reconciliação
4. **Auditoria**: Implementar audit trail completo
5. **Geração de Relatórios**: PDF de diário, razão, balancete
6. **Perícia**: Exportar pacote digital assinado para análise judicial

---

**Fim da documentação de implementação.**
