# Reconstrução Contábil a partir de Dados Importados
## Sistema de Zero Tolerância para Perícia Judicial

**Data:** 2026-10-03  
**Status:** Especificação Técnica Completa  
**Contexto:** Integração com sistema de análise de margens de propriedades imobiliárias

---

## 📋 Sumário Executivo

Este documento descreve a arquitetura completa de um sistema de **reconstrução contábil** que:

1. **Ingere dados brutos** de múltiplas fontes (banco, NF, recibos, contratos)
2. **Reconcilia cruzadamente** para identificar transações duplicadas/relacionadas
3. **Segregar custos** por categoria contábil (IPTU, condomínio, manutenção, juros, multas)
4. **Gera registros contábeis diários** com rastreabilidade completa
5. **Valida para perícia judicial** com zero tolerância de erros

**Requisito crítico:** Cada transação deve ser rastreável até sua origem, com audit trail completo e hash criptográfico para detectar alterações.

---

## 1️⃣ FLUXO DE RECONCILIAÇÃO DE DADOS

### 1.1 Arquitetura de Ingestão de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                    MÚLTIPLAS FONTES DE DADOS                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  BANCO DE DADOS  │  │  NOTAS FISCAIS   │  │    RECIBOS   │  │
│  │   (Extratos)     │  │  (XML/PDF/JSON)  │  │  (Digitais)  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬──────┘  │
│           │                     │                     │         │
│           └─────────────────────┼─────────────────────┘         │
│                                 │                               │
│                         ┌───────▼────────┐                      │
│                         │  PARSER LAYER  │                      │
│                         │  (Normalização)│                      │
│                         └───────┬────────┘                      │
│                                 │                               │
│  ┌──────────────────┐  ┌────────▼──────────┐  ┌──────────────┐ │
│  │   CONTRATOS      │  │  VALIDAÇÃO BÁSICA │  │ CUSTODIA.DB  │ │
│  │ (PDF/JSON/scan)  │  │  (Tipagem, limpe) │  │  (STAGING)   │ │
│  └──────────────────┘  └────────┬──────────┘  └──────────────┘ │
│                                 │                               │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
                                  ▼
                   ┌───────────────────────────┐
                   │  RECONCILIACAO CRUZADA    │
                   │  (PHASE 11 - Core)        │
                   └───────────────────────────┘
```

### 1.2 Tabelas de Staging (Custodia)

```sql
-- Tabela de Custódia de Dados Brutos
CREATE TABLE IF NOT EXISTS transacoes_custodia (
  id TEXT PRIMARY KEY,
  
  -- Metadados da Importação
  fonte_tipo TEXT NOT NULL,  -- 'banco', 'nf', 'recibo', 'contrato'
  fonte_identificador TEXT NOT NULL,  -- ID na fonte original (ex: movId do banco)
  data_importacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  arquivo_origem TEXT,  -- nome do arquivo importado
  
  -- Dados Normalizados
  data_transacao DATE NOT NULL,
  valor_bruto DECIMAL(15, 2) NOT NULL,
  
  -- Classificação Preliminar
  tipo_preliminar TEXT,  -- 'receita', 'despesa', 'transferencia', 'ajuste'
  categoria_preliminar TEXT,  -- será refinada na reconciliação
  
  -- Metadados de Qualidade
  descricao_original TEXT,
  descricao_normalizada TEXT,
  confianca_match DECIMAL(3, 2),  -- 0.00 a 1.00
  
  -- Status
  status TEXT DEFAULT 'pendente',  -- pendente, reconciliado, rejeitado, manual
  motivo_rejeicao TEXT,
  
  -- Rastreabilidade
  hash_sha256 TEXT UNIQUE NOT NULL,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_custodia_fonte ON transacoes_custodia(fonte_tipo, fonte_identificador);
CREATE INDEX idx_custodia_status ON transacoes_custodia(status);
CREATE INDEX idx_custodia_data ON transacoes_custodia(data_transacao);
CREATE INDEX idx_custodia_hash ON transacoes_custodia(hash_sha256);
```

### 1.3 Algoritmo de Reconciliação Cruzada

#### **Etapa 1: Identificação de Transações Relacionadas**

```typescript
interface TransacaoReconciliacao {
  id: string;
  data: Date;
  valor: number;
  descricao: string;
  fontePrimaria: string;
  fontesSecundarias: string[];  // fontes que referem a mesma transação
  scoreRelacao: number;  // 0-100
  tipoRelacao: 'identica' | 'parcial' | 'complementar' | 'nenhuma';
}

/**
 * Identifica transações que se referem à mesma operação real
 * Usa múltiplas estratégias de matching:
 * 1. Matching exato (data + valor)
 * 2. Matching fuzzy (data ±2 dias, valor ±5%)
 * 3. Matching por descrição (Levenshtein distance)
 * 4. Matching por metadata (contrato, NF, etc)
 */
function identificarTransacoesRelacionadas(
  db: Database,
  dataInicio: Date,
  dataFim: Date
): TransacaoReconciliacao[] {
  
  // Estratégia 1: Matches exatos (data + valor)
  const matchesExatos = db
    .prepare(`
      SELECT 
        t1.id as id_1,
        t2.id as id_2,
        t1.valor,
        t1.data_transacao,
        100 as score
      FROM transacoes_custodia t1
      JOIN transacoes_custodia t2 
        ON t1.data_transacao = t2.data_transacao
        AND t1.valor = t2.valor
        AND t1.fonte_tipo != t2.fonte_tipo
        AND t1.status = 'pendente'
        AND t2.status = 'pendente'
      WHERE t1.data_transacao BETWEEN ? AND ?
      ORDER BY t1.data_transacao
    `)
    .all(dataInicio, dataFim);
  
  // Estratégia 2: Fuzzy matching (data ±2 dias, valor ±5%)
  const matchesFuzzy = db
    .prepare(`
      SELECT 
        t1.id as id_1,
        t2.id as id_2,
        ABS(t1.valor - t2.valor) as diferenca_valor,
        CAST((100 - ABS(t1.valor - t2.valor) / t1.valor * 100) as INTEGER) as score
      FROM transacoes_custodia t1
      JOIN transacoes_custodia t2 
        ON ABS(JULIANDAY(t1.data_transacao) - JULIANDAY(t2.data_transacao)) <= 2
        AND ABS(t1.valor - t2.valor) / GREATEST(ABS(t1.valor), 1) <= 0.05
        AND t1.fonte_tipo != t2.fonte_tipo
        AND t1.status = 'pendente'
        AND t2.status = 'pendente'
      WHERE t1.data_transacao BETWEEN ? AND ?
        AND score >= 85
      ORDER BY t1.data_transacao
    `)
    .all(dataInicio, dataFim);
  
  // Estratégia 3: Fuzzy matching por descrição
  // (usa Levenshtein distance para descrições similares)
  const matchesDescricao = encontrarMatchesDescricao(db, dataInicio, dataFim);
  
  // Consolidar matches (evitar duplicatas)
  return consolidarMatches([matchesExatos, matchesFuzzy, matchesDescricao]);
}

/**
 * Calcula Levenshtein distance entre duas strings
 * Retorna 0-100 (100 = idênticas)
 */
function calcularSimilaridade(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 100;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let j = 0; j <= s2.length; j++) {
    let lastValue = j;
    for (let i = 1; i <= s1.length; i++) {
      const newValue = costs[j] ?? (j === 0 ? i : 0);
      costs[j - 1] = Math.min(
        lastValue + (s1[i - 1] === s2[j - 1] ? 0 : 1),
        costs[j] ?? 0 + 1,
        (newValue ?? 0) + 1
      );
      lastValue = newValue;
    }
  }
  return costs[s2.length] ?? 0;
}
```

#### **Etapa 2: Detecção de Duplicatas**

```typescript
interface DuplicataDetectada {
  ids: string[];
  tipo: 'exata' | 'provavel' | 'investigacao';
  score: number;  // 0-100
  motivo: string;
  acaoRecomendada: 'mesclar' | 'rejeitar_uma' | 'manual';
}

function detectarDuplicatas(
  db: Database,
  transacao: Transacao
): DuplicataDetectada[] {
  
  const duplicatas: DuplicataDetectada[] = [];
  
  // Tipo 1: Duplicata exata (mesmos dados, mesma fonte)
  const exatas = db.prepare(`
    SELECT id, hash_sha256
    FROM transacoes_custodia
    WHERE hash_sha256 = ?
      AND id != ?
      AND status != 'rejeitado'
  `).all(transacao.hash_sha256, transacao.id);
  
  if (exatas.length > 0) {
    duplicatas.push({
      ids: exatas.map(r => r.id),
      tipo: 'exata',
      score: 100,
      motivo: 'Hash SHA256 idêntico - possível duplicação de arquivo',
      acaoRecomendada: 'mesclar'
    });
  }
  
  // Tipo 2: Duplicata provável (mesma fonte, mesmo ID externo)
  const provaveis = db.prepare(`
    SELECT id, fonte_identificador
    FROM transacoes_custodia
    WHERE fonte_tipo = ?
      AND fonte_identificador = ?
      AND id != ?
      AND status != 'rejeitado'
  `).all(transacao.fonte_tipo, transacao.fonte_identificador, transacao.id);
  
  if (provaveis.length > 0) {
    duplicatas.push({
      ids: provaveis.map(r => r.id),
      tipo: 'exata',
      score: 100,
      motivo: 'Mesmo ID de fonte - duplicação de importação',
      acaoRecomendada: 'mesclar'
    });
  }
  
  // Tipo 3: Possível duplicata entre fontes diferentes
  const possiveis = db.prepare(`
    SELECT 
      id, 
      fonte_tipo, 
      fonte_identificador,
      ABS(valor_bruto - ?) / ? * 100 as diferenca_pct,
      ABS(JULIANDAY(data_transacao) - JULIANDAY(?)) as dias_diferenca
    FROM transacoes_custodia
    WHERE fonte_tipo != ?
      AND id != ?
      AND ABS(valor_bruto - ?) / ? <= 0.02  -- ±2%
      AND ABS(JULIANDAY(data_transacao) - JULIANDAY(?)) <= 1
      AND status != 'rejeitado'
  `).all(
    transacao.valor_bruto,
    transacao.valor_bruto,
    transacao.data_transacao,
    transacao.fonte_tipo,
    transacao.id,
    transacao.valor_bruto,
    transacao.valor_bruto,
    transacao.data_transacao
  );
  
  if (possiveis.length > 0) {
    duplicatas.push({
      ids: possiveis.map(r => r.id),
      tipo: 'provavel',
      score: 85,
      motivo: 'Transações de fontes diferentes com valores/datas muito próximos',
      acaoRecomendada: 'manual'
    });
  }
  
  return duplicatas;
}
```

#### **Etapa 3: Validação de Completude**

```typescript
interface ValidacaoCompletude {
  transacaoId: string;
  completa: boolean;
  camposFaltantes: string[];
  erros: string[];
  avisos: string[];
  porcentagemCompletude: number;
}

function validarCompletude(transacao: Transacao): ValidacaoCompletude {
  const resultado: ValidacaoCompletude = {
    transacaoId: transacao.id,
    completa: true,
    camposFaltantes: [],
    erros: [],
    avisos: [],
    porcentagemCompletude: 100
  };
  
  // Campos obrigatórios
  const camposObrigatorios = [
    'data_transacao',
    'valor_bruto',
    'fonte_tipo',
    'fonte_identificador',
    'descricao_normalizada'
  ];
  
  for (const campo of camposObrigatorios) {
    if (!transacao[campo as keyof Transacao]) {
      resultado.camposFaltantes.push(campo);
      resultado.erros.push(`Campo obrigatório ausente: ${campo}`);
      resultado.completa = false;
    }
  }
  
  // Validações secundárias
  if (!transacao.hash_sha256) {
    resultado.avisos.push('Hash SHA256 não calculado - será gerado automaticamente');
  }
  
  if (!transacao.categoria_preliminar) {
    resultado.avisos.push('Categoria preliminar não definida - necessário refinamento');
  }
  
  // Valor deve ser positivo
  if (transacao.valor_bruto <= 0) {
    resultado.erros.push('Valor deve ser maior que zero');
    resultado.completa = false;
  }
  
  // Data não pode ser no futuro
  if (new Date(transacao.data_transacao) > new Date()) {
    resultado.erros.push('Data da transação não pode estar no futuro');
    resultado.completa = false;
  }
  
  // Calcular percentual de completude
  const camposPreenchidos = Object.keys(transacao).filter(
    k => transacao[k as keyof Transacao] && 
    camposObrigatorios.includes(k)
  ).length;
  
  resultado.porcentagemCompletude = Math.round(
    (camposPreenchidos / camposObrigatorios.length) * 100
  );
  
  return resultado;
}
```

### 1.4 Geração de Alertas para Discrepâncias

```typescript
enum SeveridadeAlerta {
  BAIXA = 'baixa',
  MEDIA = 'media',
  ALTA = 'alta',
  CRITICA = 'critica'
}

interface AlertaDiscrepancia {
  id: string;
  tipoAlerta: string;
  severidade: SeveridadeAlerta;
  descricao: string;
  transacoesAfetadas: string[];
  dadoContexto: Record<string, any>;
  recomendacao: string;
  data_criacao: Date;
  resolvido: boolean;
  resolucao_data?: Date;
}

function gerarAlertasDiscrepancias(
  db: Database,
  transacao: Transacao,
  contexto: any
): AlertaDiscrepancia[] {
  
  const alertas: AlertaDiscrepancia[] = [];
  
  // ALERTA 1: Valor muito diferente de média histórica
  const mediaHistorica = calcularMediaHistorica(db, transacao);
  if (Math.abs(transacao.valor_bruto - mediaHistorica) > mediaHistorica * 0.5) {
    alertas.push({
      id: `alerta_${transacao.id}_desvio_valor`,
      tipoAlerta: 'DESVIO_VALOR',
      severidade: SeveridadeAlerta.MEDIA,
      descricao: `Valor R$ ${transacao.valor_bruto.toFixed(2)} desvio de 50% da média histórica (R$ ${mediaHistorica.toFixed(2)})`,
      transacoesAfetadas: [transacao.id],
      dadoContexto: { valor_transacao: transacao.valor_bruto, media: mediaHistorica },
      recomendacao: 'Verificar se valor está correto; possível erro de importação',
      data_criacao: new Date(),
      resolvido: false
    });
  }
  
  // ALERTA 2: Transação muito próxima temporalmente de outra (possível duplicação)
  const proximasTemporalmente = db.prepare(`
    SELECT id, valor_bruto, data_transacao
    FROM transacoes_custodia
    WHERE ABS(JULIANDAY(data_transacao) - JULIANDAY(?)) <= 0.5
      AND id != ?
      AND fonte_tipo != ?
    LIMIT 5
  `).all(transacao.data_transacao, transacao.id, transacao.fonte_tipo);
  
  if (proximasTemporalmente.length > 0) {
    alertas.push({
      id: `alerta_${transacao.id}_proximidade_temporal`,
      tipoAlerta: 'POSSIVEL_DUPLICACAO',
      severidade: SeveridadeAlerta.MEDIA,
      descricao: `Transação está a menos de 12 horas de ${proximasTemporalmente.length} outra(s) transação(ões)`,
      transacoesAfetadas: [transacao.id, ...proximasTemporalmente.map(r => r.id)],
      dadoContexto: { 
        transacoes_proximas: proximasTemporalmente.map(r => ({
          id: r.id,
          valor: r.valor_bruto,
          data: r.data_transacao
        }))
      },
      recomendacao: 'Revisar se são referências à mesma transação em fontes diferentes',
      data_criacao: new Date(),
      resolvido: false
    });
  }
  
  // ALERTA 3: Descrição vaga ou incompleta
  if (!transacao.descricao_normalizada || transacao.descricao_normalizada.length < 10) {
    alertas.push({
      id: `alerta_${transacao.id}_descricao_vaga`,
      tipoAlerta: 'DESCRICAO_INCOMPLETA',
      severidade: SeveridadeAlerta.BAIXA,
      descricao: 'Descrição muito curta ou vaga',
      transacoesAfetadas: [transacao.id],
      dadoContexto: { descricao: transacao.descricao_normalizada },
      recomendacao: 'Enriquecer descrição para facilitar categorização e auditoria',
      data_criacao: new Date(),
      resolvido: false
    });
  }
  
  // ALERTA 4: Categoria preliminar mapeada manualmente (requer validação)
  if (contexto.categoria_mapeada_manualmente) {
    alertas.push({
      id: `alerta_${transacao.id}_categoria_manual`,
      tipoAlerta: 'CATEGORIA_MANUAL',
      severidade: SeveridadeAlerta.BAIXA,
      descricao: 'Categoria foi atribuída manualmente',
      transacoesAfetadas: [transacao.id],
      dadoContexto: { categoria: transacao.categoria_preliminar },
      recomendacao: 'Validar categoria em conciliação mensal',
      data_criacao: new Date(),
      resolvido: false
    });
  }
  
  // ALERTA 5: Valor parcial detectado (nota fiscal vs pagamento)
  const nfs = db.prepare(`
    SELECT id, valor_bruto, descricao_original
    FROM transacoes_custodia
    WHERE fonte_tipo = 'nf'
      AND id != ?
      AND ABS(JULIANDAY(data_transacao) - JULIANDAY(?)) <= 30
  `).all(transacao.id, transacao.data_transacao);
  
  for (const nf of nfs) {
    if (Math.abs(transacao.valor_bruto - nf.valor_bruto) < nf.valor_bruto * 0.1 &&
        Math.abs(transacao.valor_bruto - nf.valor_bruto) > 0) {
      alertas.push({
        id: `alerta_${transacao.id}_pagamento_parcial`,
        tipoAlerta: 'PAGAMENTO_PARCIAL',
        severidade: SeveridadeAlerta.MEDIA,
        descricao: `Transação pode ser pagamento parcial da NF: ${nf.descricao_original}`,
        transacoesAfetadas: [transacao.id, nf.id],
        dadoContexto: { valor_nf: nf.valor_bruto, valor_pagamento: transacao.valor_bruto },
        recomendacao: 'Validar se é pagamento parcial ou juros/multa acumulados',
        data_criacao: new Date(),
        resolvido: false
      });
    }
  }
  
  return alertas;
}
```

---

## 2️⃣ SEGREGAÇÃO DE CUSTOS

### 2.1 Plano de Contas (Chart of Accounts)

```sql
-- Tabela de Plano de Contas
CREATE TABLE IF NOT EXISTS plano_contas (
  id TEXT PRIMARY KEY,  -- ex: '1010' ou '5.1.1.1'
  codigo_contabil TEXT UNIQUE NOT NULL,  -- formato contábil
  descricao TEXT NOT NULL,
  natureza TEXT NOT NULL,  -- 'ativo', 'passivo', 'receita', 'despesa'
  classificacao TEXT NOT NULL,  -- ex: 'curto_prazo', 'operacional'
  hierarquia_nivel INT,  -- 1=grupo, 2=subgrupo, 3=conta, 4=subconta
  pai_id TEXT,  -- referência à conta pai
  ativo BOOLEAN DEFAULT TRUE,
  permissao_lancamento BOOLEAN DEFAULT TRUE,  -- pode receber lançamentos diretos?
  descricao_detalhada TEXT,
  
  -- Específico para imóveis
  imivel_id TEXT,  -- se específico de um imóvel
  
  -- Auditoria
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (imivel_id) REFERENCES imoveis(id)
);

CREATE INDEX idx_pc_codigo ON plano_contas(codigo_contabil);
CREATE INDEX idx_pc_natureza ON plano_contas(natureza);
CREATE INDEX idx_pc_ativo ON plano_contas(ativo);
```

### 2.2 Estrutura de Plano de Contas Padrão para Imóvel

```
RECEITAS (Nível 1)
├─ 4.1 - Receita de Aluguel
│  ├─ 4.1.1 - Aluguel Normal
│  ├─ 4.1.2 - Aluguel em Atraso
│  └─ 4.1.3 - Ajustes de Aluguel
├─ 4.2 - Outras Receitas
│  ├─ 4.2.1 - Juros Recebidos
│  ├─ 4.2.2 - Multa Recebida
│  └─ 4.2.3 - Reembolso de Despesas
└─ 4.3 - Receitas de Alienação
   └─ 4.3.1 - Ganho na Venda

DESPESAS OPERACIONAIS (Nível 1)
├─ 5.1 - Despesas com Imóvel
│  ├─ 5.1.1 - IPTU
│  ├─ 5.1.2 - Condomínio
│  ├─ 5.1.3 - Seguro
│  ├─ 5.1.4 - Manutenção
│  ├─ 5.1.5 - Limpeza
│  └─ 5.1.6 - Outras Despesas Imóvel
├─ 5.2 - Despesas com Viabilização
│  ├─ 5.2.1 - Reforma
│  ├─ 5.2.2 - Limpeza Inicial
│  └─ 5.2.3 - Adequações
├─ 5.3 - Despesas Financeiras
│  ├─ 5.3.1 - Juros Pagos
│  ├─ 5.3.2 - Multa por Atraso
│  ├─ 5.3.3 - Taxa Bancária
│  └─ 5.3.4 - IOF/Imposto
├─ 5.4 - Despesas Administrativas
│  ├─ 5.4.1 - Honorários (Gestão/Administração)
│  ├─ 5.4.2 - Custos de Cobrança
│  └─ 5.4.3 - Outras Despesas Admin
└─ 5.5 - Despesas Fiscais
   ├─ 5.5.1 - IRPF Retido
   ├─ 5.5.2 - ISSQN
   └─ 5.5.3 - Outras Contribuições

ATIVOS (Nível 1)
├─ 1.1 - Ativo Circulante
│  ├─ 1.1.1 - Caixa
│  ├─ 1.1.2 - Bancos
│  └─ 1.1.3 - Contas a Receber
└─ 1.2 - Ativo Permanente
   ├─ 1.2.1 - Imóvel
   └─ 1.2.2 - Benfeitorias

PASSIVOS (Nível 1)
├─ 2.1 - Passivo Circulante
│  └─ 2.1.1 - Contas a Pagar
└─ 2.2 - Passivo Não-Circulante
   ├─ 2.2.1 - Empréstimo
   └─ 2.2.2 - Financiamento

PATRIMÔNIO (Nível 1)
├─ 3.1 - Capital
└─ 3.2 - Lucros Acumulados
```

### 2.3 Regras de Segregação de Custos

```typescript
interface RegraSegregacao {
  id: string;
  descricao: string;
  condicoes: CondicaoSegregacao[];
  contaBuscada: string;  // ID da conta no plano de contas
  percentualAlocacao?: number;  // se for rateio
  tipoRateio?: 'fixo' | 'proporcional_receita' | 'proporcional_area';
  ativo: boolean;
}

interface CondicaoSegregacao {
  campo: 'descricao' | 'valor' | 'data' | 'fonte_identificador' | 'categoria_preliminar';
  operador: 'contem' | 'iguala' | 'comeca_com' | 'termina_com' | 'entre' | 'regex';
  valor: string | number | [number, number];
  caseSensitive?: boolean;
}

// Exemplos de Regras
const regrasSegregacaoExemplos: RegraSegregacao[] = [
  {
    id: 'regra_iptu',
    descricao: 'Identifica pagamentos de IPTU',
    condicoes: [
      { campo: 'descricao', operador: 'regex', valor: '(IPTU|IMPOSTO.*TERRITORIAL)', caseSensitive: false },
      { campo: 'categoria_preliminar', operador: 'iguala', valor: 'imposto' }
    ],
    contaBuscada: '5.1.1',  // IPTU
    ativo: true
  },
  
  {
    id: 'regra_condominio',
    descricao: 'Identifica despesas de condomínio',
    condicoes: [
      { campo: 'descricao', operador: 'regex', valor: '(CONDOMÍNIO|COND\\.|SÍNDICO)', caseSensitive: false },
    ],
    contaBuscada: '5.1.2',
    ativo: true
  },
  
  {
    id: 'regra_juros_atraso',
    descricao: 'Identifica juros e multa por atraso',
    condicoes: [
      { campo: 'descricao', operador: 'regex', valor: '(JUROS|MULTA|MORA|JURO DE MORA)', caseSensitive: false }
    ],
    contaBuscada: '5.3.2',
    ativo: true
  },
  
  {
    id: 'regra_reforma',
    descricao: 'Identifica gastos com reforma/manutenção',
    condicoes: [
      { campo: 'descricao', operador: 'regex', valor: '(REFORMA|MANUTENÇÃO|CONSERTO|REPARO|VIDRO|TINTA)', caseSensitive: false },
      { campo: 'valor', operador: 'entre', valor: [100, 50000] }
    ],
    contaBuscada: '5.1.4',
    ativo: true
  },
  
  {
    id: 'regra_seguro',
    descricao: 'Identifica prêmios de seguro',
    condicoes: [
      { campo: 'descricao', operador: 'regex', valor: '(SEGURO|APÓLICE)', caseSensitive: false }
    ],
    contaBuscada: '5.1.3',
    ativo: true
  }
];

function aplicarRegraSegregacao(
  transacao: Transacao,
  regras: RegraSegregacao[]
): { contaBuscada: string; regra: RegraSegregacao } | null {
  
  for (const regra of regras.filter(r => r.ativo)) {
    let todasAsCondicoesSatisfeitas = true;
    
    for (const condicao of regra.condicoes) {
      const valor = transacao[condicao.campo as keyof Transacao];
      
      if (!avaliarCondicao(valor, condicao)) {
        todasAsCondicoesSatisfeitas = false;
        break;
      }
    }
    
    if (todasAsCondicoesSatisfeitas) {
      return { contaBuscada: regra.contaBuscada, regra };
    }
  }
  
  return null;
}

function avaliarCondicao(valor: any, condicao: CondicaoSegregacao): boolean {
  const v = condicao.caseSensitive !== false ? 
    String(valor).toLowerCase() : 
    String(valor);
  
  switch (condicao.operador) {
    case 'contem':
      return v.includes(String(condicao.valor).toLowerCase());
    case 'iguala':
      return v === String(condicao.valor).toLowerCase();
    case 'comeca_com':
      return v.startsWith(String(condicao.valor).toLowerCase());
    case 'termina_com':
      return v.endsWith(String(condicao.valor).toLowerCase());
    case 'entre':
      const [min, max] = condicao.valor as [number, number];
      return Number(valor) >= min && Number(valor) <= max;
    case 'regex':
      return new RegExp(condicao.valor as string).test(String(valor));
    default:
      return false;
  }
}
```

### 2.4 Cálculo de Percentuais de Despesa

```typescript
interface RelatorioDespesaPorCategoria {
  periodo: string;  // YYYY-MM
  imovelId: string;
  receita_bruta: number;
  receita_liquida: number;  // após abatimentos
  
  despesas: {
    categoria: string;
    conta: string;
    valor: number;
    percentual_receita_bruta: number;
    percentual_receita_liquida: number;
  }[];
  
  resumo: {
    despesa_total: number;
    percentual_total: number;  // despesa_total / receita_bruta
    margem_liquida: number;  // (receita_liquida - despesa_total) / receita_liquida
    margem_bruta: number;   // (receita_bruta - despesa_total) / receita_bruta
  };
  
  analise_detalhada: {
    maiores_despesas: Array<{ categoria: string; valor: number; pct: number }>;
    variacao_vs_mes_anterior: Record<string, number>;  // pct de variação
  };
}

function calcularPercentuaisDespesa(
  db: Database,
  imovelId: string,
  ano: number,
  mes: number
): RelatorioDespesaPorCategoria {
  
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const dataFim = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  // 1. Obter receitas
  const receitas = db.prepare(`
    SELECT 
      SUM(CASE WHEN lc.natureza = 'receita' THEN l.valor ELSE 0 END) as receita_bruta,
      SUM(CASE WHEN lc.natureza = 'receita' AND lc.codigo_contabil = '4.1.1' 
        THEN l.valor ELSE 0 END) as aluguel_puro,
      SUM(CASE WHEN lc.natureza = 'receita' AND lc.codigo_contabil != '4.1.1' 
        THEN l.valor ELSE 0 END) as outras_receitas
    FROM lancamentos l
    JOIN plano_contas lc ON l.conta_id = lc.id
    WHERE l.imovel_id = ?
      AND l.data_lancamento BETWEEN ? AND ?
      AND l.tipo_lancamento = 'receita'
  `).get(imovelId, dataInicio, dataFim) as any;
  
  // 2. Obter despesas por categoria
  const despesas = db.prepare(`
    SELECT 
      lc.codigo_contabil,
      lc.descricao as categoria,
      SUM(l.valor) as valor,
      COUNT(*) as quantidade_lancamentos
    FROM lancamentos l
    JOIN plano_contas lc ON l.conta_id = lc.id
    WHERE l.imovel_id = ?
      AND l.data_lancamento BETWEEN ? AND ?
      AND lc.natureza = 'despesa'
    GROUP BY lc.codigo_contabil, lc.descricao
    ORDER BY valor DESC
  `).all(imovelId, dataInicio, dataFim) as any[];
  
  const receita_bruta = receitas?.receita_bruta || 0;
  const receita_liquida = receita_bruta - (receitas?.outras_receitas || 0);
  
  // 3. Calcular percentuais
  const despesasComPercentual = despesas.map(d => ({
    categoria: d.categoria,
    conta: d.codigo_contabil,
    valor: d.valor,
    percentual_receita_bruta: receita_bruta > 0 ? (d.valor / receita_bruta) * 100 : 0,
    percentual_receita_liquida: receita_liquida > 0 ? (d.valor / receita_liquida) * 100 : 0
  }));
  
  const despesa_total = despesasComPercentual.reduce((sum, d) => sum + d.valor, 0);
  
  // 4. Variação vs mês anterior
  const mesPrevio = mes === 1 ? 12 : mes - 1;
  const anoPrevio = mes === 1 ? ano - 1 : ano;
  const dataInicioPrevio = `${anoPrevio}-${String(mesPrevio).padStart(2, '0')}-01`;
  const dataFimPrevio = `${anoPrevio}-${String(mesPrevio).padStart(2, '0')}-31`;
  
  const despesasPrevias = db.prepare(`
    SELECT 
      lc.codigo_contabil,
      SUM(l.valor) as valor
    FROM lancamentos l
    JOIN plano_contas lc ON l.conta_id = lc.id
    WHERE l.imovel_id = ?
      AND l.data_lancamento BETWEEN ? AND ?
      AND lc.natureza = 'despesa'
    GROUP BY lc.codigo_contabil
  `).all(imovelId, dataInicioPrevio, dataFimPrevio) as any[];
  
  const variacaoMap = new Map(despesasPrevias.map(d => [d.codigo_contabil, d.valor]));
  
  const variacao_vs_mes_anterior: Record<string, number> = {};
  for (const d of despesasComPercentual) {
    const valorPrevio = variacaoMap.get(d.conta) || 0;
    if (valorPrevio > 0) {
      variacao_vs_mes_anterior[d.conta] = ((d.valor - valorPrevio) / valorPrevio) * 100;
    } else if (d.valor > 0) {
      variacao_vs_mes_anterior[d.conta] = 100;  // nova categoria
    }
  }
  
  // 5. Maiores despesas
  const maiores_despesas = despesasComPercentual
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
    .map(d => ({
      categoria: d.categoria,
      valor: d.valor,
      pct: d.percentual_receita_bruta
    }));
  
  return {
    periodo: `${ano}-${String(mes).padStart(2, '0')}`,
    imovelId,
    receita_bruta,
    receita_liquida,
    despesas: despesasComPercentual,
    resumo: {
      despesa_total,
      percentual_total: receita_bruta > 0 ? (despesa_total / receita_bruta) * 100 : 0,
      margem_liquida: receita_liquida > 0 ? ((receita_liquida - despesa_total) / receita_liquida) * 100 : 0,
      margem_bruta: receita_bruta > 0 ? ((receita_bruta - despesa_total) / receita_bruta) * 100 : 0
    },
    analise_detalhada: {
      maiores_despesas,
      variacao_vs_mes_anterior
    }
  };
}
```

---

## 3️⃣ REGISTROS CONTÁBEIS DIÁRIOS

### 3.1 Estrutura de Lançamento Contábil

```sql
-- Tabela Principal de Lançamentos Contábeis
CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY,  -- UUID v4
  
  -- Referência
  imovel_id TEXT NOT NULL,
  numero_diario INTEGER NOT NULL,  -- sequencial do diário
  
  -- Data e Período
  data_lancamento DATE NOT NULL,  -- quando foi lançado
  data_transacao DATE NOT NULL,  -- quando ocorreu a transação
  ano_contabil INTEGER NOT NULL,
  mes_contabil INTEGER NOT NULL,
  dia_contabil INTEGER NOT NULL,
  
  -- Contas contábeis
  conta_debito_id TEXT NOT NULL,
  conta_credito_id TEXT NOT NULL,
  
  -- Movimento
  valor DECIMAL(15, 2) NOT NULL,
  tipo_lancamento TEXT NOT NULL,  -- 'receita', 'despesa', 'transferencia', 'ajuste'
  
  -- Descrição
  descricao TEXT NOT NULL,
  descricao_detalhada TEXT,  -- espaço para observações
  
  -- Rastreabilidade
  origem_transacao_id TEXT,  -- referência à transacao_custodia ou lancamento anterior
  origem_tipo TEXT,  -- 'banco', 'nf', 'recibo', 'contrato', 'manual', 'ajuste'
  documento_referencia TEXT,  -- ex: NF-e number, número do recibo
  
  -- Validação para Perícia
  hash_lancamento TEXT UNIQUE NOT NULL,  -- SHA256(conta_d|conta_c|valor|data|descricao)
  assinatura_digital TEXT,  -- HMAC SHA256 com chave secreta
  
  -- Metadata
  criado_por TEXT,  -- usuário ou sistema que fez o lançamento
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_por TEXT,
  
  -- Status
  status TEXT DEFAULT 'rascunho',  -- rascunho, conciliado, cancelado, ajustado
  motivo_cancelamento TEXT,
  data_cancelamento DATETIME,
  
  -- Auditoria
  versao INT DEFAULT 1,
  
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id),
  FOREIGN KEY (conta_debito_id) REFERENCES plano_contas(id),
  FOREIGN KEY (conta_credito_id) REFERENCES plano_contas(id),
  FOREIGN KEY (origem_transacao_id) REFERENCES transacoes_custodia(id)
);

-- Índices para Performance
CREATE INDEX idx_lancamentos_imovel_data ON lancamentos(imovel_id, data_lancamento);
CREATE INDEX idx_lancamentos_periodo ON lancamentos(ano_contabil, mes_contabil);
CREATE INDEX idx_lancamentos_conta ON lancamentos(conta_debito_id, conta_credito_id);
CREATE INDEX idx_lancamentos_origem ON lancamentos(origem_transacao_id);
CREATE INDEX idx_lancamentos_hash ON lancamentos(hash_lancamento);
CREATE INDEX idx_lancamentos_status ON lancamentos(status);
CREATE INDEX idx_lancamentos_numero_diario ON lancamentos(numero_diario);

-- Tabela de Audit Trail (Histórico de Alterações)
CREATE TABLE IF NOT EXISTS lancamentos_historico (
  id TEXT PRIMARY KEY,
  lancamento_id TEXT NOT NULL,
  
  -- Ação
  tipo_acao TEXT NOT NULL,  -- 'criacao', 'edicao', 'cancelamento', 'restauracao'
  descricao_acao TEXT,
  
  -- Valores Anteriores
  dados_anteriores JSON,  -- snapshot completo antes da mudança
  dados_novos JSON,  -- snapshot após a mudança
  
  -- Quem fez
  usuario_id TEXT,
  data_acao DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_origem TEXT,
  
  -- Validação
  hash_anterior TEXT,
  hash_novo TEXT,
  
  FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id)
);

CREATE INDEX idx_lancamentos_hist_lancamento ON lancamentos_historico(lancamento_id);
CREATE INDEX idx_lancamentos_hist_data ON lancamentos_historico(data_acao);
```

### 3.2 Conversão de Transação Bancária para Lançamento Contábil

```typescript
interface ConversaoResult {
  lancamento: Lancamento;
  erros: string[];
  avisos: string[];
  sucesso: boolean;
}

function converterTransacaoBancariaEmLancamento(
  transacao: Transacao,
  imovelId: string,
  db: Database,
  numeroSequencialDiario: number
): ConversaoResult {
  
  const resultado: ConversaoResult = {
    lancamento: {} as Lancamento,
    erros: [],
    avisos: [],
    sucesso: false
  };
  
  try {
    // Passo 1: Validação básica
    const validacao = validarCompletude(transacao);
    if (!validacao.completa) {
      resultado.erros.push(...validacao.erros);
      return resultado;
    }
    
    // Passo 2: Determinar contas contábeis
    const regras = carregarRegrasSegregacao(db);
    const match = aplicarRegraSegregacao(transacao, regras);
    
    if (!match) {
      resultado.avisos.push('Nenhuma regra de segregação aplicável - categoria manual será necessária');
    }
    
    const contaDespesa = match?.contaBuscada || '5.1.6';  // default: Outras Despesas
    
    // Passo 3: Determinar contas de débito/crédito
    let contaDebito: string;
    let contaCredito: string;
    
    if (transacao.tipo_preliminar === 'receita') {
      contaDebito = '1.1.2';  // Banco
      contaCredito = match?.contaBuscada || '4.1.3';  // Receita ou Ajuste
    } else if (transacao.tipo_preliminar === 'despesa') {
      contaDebito = match?.contaBuscada || '5.1.6';  // Despesa
      contaCredito = '1.1.2';  // Banco
    } else {
      contaDebito = '1.1.2';  // Banco
      contaCredito = '1.1.2';  // Banco (transferência interna)
    }
    
    // Passo 4: Validar contas existem
    const contaDebitoExiste = db.prepare('SELECT id FROM plano_contas WHERE id = ?').get(contaDebito);
    const contaCreditoExiste = db.prepare('SELECT id FROM plano_contas WHERE id = ?').get(contaCredito);
    
    if (!contaDebitoExiste) {
      resultado.erros.push(`Conta de débito ${contaDebito} não existe no plano de contas`);
      return resultado;
    }
    if (!contaCreditoExiste) {
      resultado.erros.push(`Conta de crédito ${contaCredito} não existe no plano de contas`);
      return resultado;
    }
    
    // Passo 5: Criar lançamento
    const lancamento: Lancamento = {
      id: crypto.randomUUID(),
      imovel_id: imovelId,
      numero_diario: numeroSequencialDiario,
      data_lancamento: new Date(),
      data_transacao: new Date(transacao.data_transacao),
      ano_contabil: new Date(transacao.data_transacao).getFullYear(),
      mes_contabil: new Date(transacao.data_transacao).getMonth() + 1,
      dia_contabil: new Date(transacao.data_transacao).getDate(),
      conta_debito_id: contaDebito,
      conta_credito_id: contaCredito,
      valor: transacao.valor_bruto,
      tipo_lancamento: transacao.tipo_preliminar || 'ajuste',
      descricao: transacao.descricao_normalizada,
      descricao_detalhada: `Origem: ${transacao.fonte_tipo} | ${transacao.fonte_identificador}`,
      origem_transacao_id: transacao.id,
      origem_tipo: transacao.fonte_tipo,
      documento_referencia: transacao.fonte_identificador,
      status: 'rascunho',
      criado_por: 'sistema_importacao'
    };
    
    // Passo 6: Calcular hash para auditoria
    lancamento.hash_lancamento = calcularHashLancamento(lancamento);
    lancamento.assinatura_digital = calcularAssinaturaDigital(lancamento);
    
    resultado.lancamento = lancamento;
    resultado.sucesso = true;
    
  } catch (erro) {
    resultado.erros.push(`Erro ao converter transação: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  
  return resultado;
}

function calcularHashLancamento(lancamento: Lancamento): string {
  const crypto = require('crypto');
  const dadosParaHash = `${lancamento.conta_debito_id}|${lancamento.conta_credito_id}|${lancamento.valor}|${lancamento.data_transacao}|${lancamento.descricao}`;
  return crypto.createHash('sha256').update(dadosParaHash).digest('hex');
}

function calcularAssinaturaDigital(lancamento: Lancamento): string {
  const crypto = require('crypto');
  const chaveSecreta = process.env.CHAVE_ASSINATURA_LANCAMENTOS || 'chave-padrao-insegura';
  const dadosParaAssinatura = lancamento.hash_lancamento;
  return crypto.createHmac('sha256', chaveSecreta).update(dadosParaAssinatura).digest('hex');
}
```

### 3.3 Rastreamento de Origem de Cada Lançamento

```typescript
interface CadeiaRastreabilidade {
  transacao_id: string;
  lancamentos: Array<{
    id: string;
    numero_diario: number;
    data_lancamento: Date;
    contas: string;
    valor: number;
  }>;
  origem_original: {
    tipo: string;
    identificador: string;
    data: Date;
    descricao: string;
  };
  transformacoes: Array<{
    etapa: string;
    data: Date;
    usuario: string;
    detalhes: string;
  }>;
  validacoes: Array<{
    tipo: string;
    resultado: boolean;
    data: Date;
    observacao: string;
  }>;
}

function rastrearOrigem(
  db: Database,
  lancamentoId: string
): CadeiaRastreabilidade {
  
  const lancamento = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(lancamentoId) as any;
  const transacao = db.prepare('SELECT * FROM transacoes_custodia WHERE id = ?')
    .get(lancamento.origem_transacao_id) as any;
  const historico = db.prepare(
    'SELECT * FROM lancamentos_historico WHERE lancamento_id = ? ORDER BY data_acao'
  ).all(lancamentoId) as any[];
  
  const cadeia: CadeiaRastreabilidade = {
    transacao_id: lancamento.origem_transacao_id,
    lancamentos: [{
      id: lancamento.id,
      numero_diario: lancamento.numero_diario,
      data_lancamento: lancamento.data_lancamento,
      contas: `${lancamento.conta_debito_id} / ${lancamento.conta_credito_id}`,
      valor: lancamento.valor
    }],
    origem_original: {
      tipo: transacao.fonte_tipo,
      identificador: transacao.fonte_identificador,
      data: transacao.data_transacao,
      descricao: transacao.descricao_normalizada
    },
    transformacoes: historico.map(h => ({
      etapa: h.tipo_acao,
      data: h.data_acao,
      usuario: h.usuario_id,
      detalhes: h.descricao_acao
    })),
    validacoes: []  // popular com base em validacoes salvas
  };
  
  return cadeia;
}
```

### 3.4 Geração de Diário, Razão e Balancete

```typescript
interface RelatorioContabil {
  tipo: 'diario' | 'razao' | 'balancete';
  periodo: string;
  imovelId: string;
  dataGeracao: Date;
  hash_arquivo: string;
}

interface EntradaDiario {
  numero_sequencial: number;
  data: Date;
  descricao: string;
  conta_debito: string;
  conta_credito: string;
  valor: number;
  referencia: string;
}

function gerarDiario(
  db: Database,
  imovelId: string,
  ano: number,
  mes: number
): { dados: EntradaDiario[]; pdf: Buffer } {
  
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const dataFim = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  const lancamentos = db.prepare(`
    SELECT 
      numero_diario,
      data_lancamento,
      descricao,
      conta_debito_id,
      conta_credito_id,
      valor,
      documento_referencia
    FROM lancamentos
    WHERE imovel_id = ?
      AND data_lancamento BETWEEN ? AND ?
    ORDER BY data_lancamento, numero_diario
  `).all(imovelId, dataInicio, dataFim) as any[];
  
  const dados: EntradaDiario[] = lancamentos.map((l, idx) => ({
    numero_sequencial: idx + 1,
    data: new Date(l.data_lancamento),
    descricao: l.descricao,
    conta_debito: l.conta_debito_id,
    conta_credito: l.conta_credito_id,
    valor: l.valor,
    referencia: l.documento_referencia
  }));
  
  // Gerar PDF usando PDFKit ou similar
  const pdf = gerarPDFDiario(dados, imovelId, ano, mes);
  
  return { dados, pdf };
}

interface SaldoConta {
  codigo: string;
  descricao: string;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_final: number;
}

function gerarRazao(
  db: Database,
  imovelId: string,
  ano: number,
  mes: number
): { por_conta: Record<string, SaldoConta[]>; saldo_total: number } {
  
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const dataFim = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  const contas = db.prepare(`
    SELECT DISTINCT 
      COALESCE(conta_debito_id, conta_credito_id) as conta_id
    FROM lancamentos
    WHERE imovel_id = ?
  `).all(imovelId) as any[];
  
  const razao: Record<string, SaldoConta[]> = {};
  let saldo_total = 0;
  
  for (const { conta_id } of contas) {
    const detalhes = db.prepare(`
      SELECT 
        SUM(CASE WHEN conta_debito_id = ? THEN valor ELSE 0 END) as total_debitos,
        SUM(CASE WHEN conta_credito_id = ? THEN valor ELSE 0 END) as total_creditos
      FROM lancamentos
      WHERE imovel_id = ?
        AND data_lancamento BETWEEN ? AND ?
    `).get(conta_id, conta_id, imovelId, dataInicio, dataFim) as any;
    
    const contaInfo = db.prepare('SELECT codigo_contabil, descricao FROM plano_contas WHERE id = ?')
      .get(conta_id) as any;
    
    const entrada: SaldoConta = {
      codigo: contaInfo?.codigo_contabil || conta_id,
      descricao: contaInfo?.descricao || 'Sem descrição',
      saldo_anterior: 0,  // calculado em contexto completo
      debitos: detalhes?.total_debitos || 0,
      creditos: detalhes?.total_creditos || 0,
      saldo_final: (detalhes?.total_debitos || 0) - (detalhes?.total_creditos || 0)
    };
    
    if (!razao[contaInfo?.codigo_contabil || 'outros']) {
      razao[contaInfo?.codigo_contabil || 'outros'] = [];
    }
    razao[contaInfo?.codigo_contabil || 'outros'].push(entrada);
    
    saldo_total += entrada.saldo_final;
  }
  
  return { por_conta: razao, saldo_total };
}

interface BalanceteLinhaContabil {
  codigo: string;
  descricao: string;
  saldo_devedor: number;
  saldo_credor: number;
}

function gerarBalancete(
  db: Database,
  imovelId: string,
  ano: number,
  mes: number
): {
  linhas: BalanceteLinhaContabil[];
  total_devedor: number;
  total_credor: number;
  equilibrio: boolean;
} {
  
  const dataFim = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  const contas = db.prepare(`
    SELECT 
      pc.codigo_contabil,
      pc.descricao,
      SUM(CASE WHEN l.conta_debito_id = pc.id THEN l.valor ELSE 0 END) as debitos,
      SUM(CASE WHEN l.conta_credito_id = pc.id THEN l.valor ELSE 0 END) as creditos
    FROM plano_contas pc
    LEFT JOIN lancamentos l ON pc.id IN (l.conta_debito_id, l.conta_credito_id)
      AND l.imovel_id = ?
      AND l.data_lancamento <= ?
    WHERE pc.ativo = TRUE
    GROUP BY pc.id
    ORDER BY pc.codigo_contabil
  `).all(imovelId, dataFim) as any[];
  
  const linhas: BalanceteLinhaContabil[] = contas.map(c => {
    const saldo_devedor = Math.max(0, (c.debitos || 0) - (c.creditos || 0));
    const saldo_credor = Math.max(0, (c.creditos || 0) - (c.debitos || 0));
    
    return {
      codigo: c.codigo_contabil,
      descricao: c.descricao,
      saldo_devedor,
      saldo_credor
    };
  });
  
  const total_devedor = linhas.reduce((sum, l) => sum + l.saldo_devedor, 0);
  const total_credor = linhas.reduce((sum, l) => sum + l.saldo_credor, 0);
  
  return {
    linhas,
    total_devedor,
    total_credor,
    equilibrio: Math.abs(total_devedor - total_credor) < 0.01
  };
}
```

---

## 4️⃣ PROCESSAMENTO PERIÓDICO

### 4.1 Reconciliação Mensal de Contas

```typescript
interface ConciliamentoMensal {
  id: string;
  imovel_id: string;
  periodo: string;  // YYYY-MM
  data_realizacao: Date;
  status: 'em_progresso' | 'concluido' | 'com_discrepancias';
  
  saldo_contabil: number;
  saldo_extrato_banco: number;
  diferenca: number;
  
  reconciliados: number;  // quantidade de lançamentos reconciliados
  pendentes: number;
  discrepancias: number;
  
  detalhes_discrepancia: Array<{
    tipo: string;
    descricao: string;
    valor: number;
    recomendacao: string;
  }>;
}

function executarConciliamentoMensal(
  db: Database,
  imovelId: string,
  ano: number,
  mes: number
): ConciliamentoMensal {
  
  const periodo = `${ano}-${String(mes).padStart(2, '0')}`;
  const dataInicio = `${periodo}-01`;
  const dataFim = `${periodo}-31`;
  
  // 1. Saldo contábil
  const saldo_contabil = db.prepare(`
    SELECT 
      SUM(CASE WHEN conta_debito_id = '1.1.2' THEN valor ELSE 0 END) -
      SUM(CASE WHEN conta_credito_id = '1.1.2' THEN valor ELSE 0 END) as saldo
    FROM lancamentos
    WHERE imovel_id = ?
      AND data_lancamento <= ?
  `).get(imovelId, dataFim) as any;
  
  // 2. Saldo do extrato bancário (se integração disponível)
  const transacoesBanco = db.prepare(`
    SELECT 
      SUM(CASE WHEN tipo_preliminar = 'receita' THEN valor_bruto ELSE 0 END) -
      SUM(CASE WHEN tipo_preliminar = 'despesa' THEN valor_bruto ELSE 0 END) as saldo
    FROM transacoes_custodia
    WHERE fonte_tipo = 'banco'
      AND status IN ('reconciliado', 'pendente')
      AND data_transacao BETWEEN ? AND ?
  `).get(dataInicio, dataFim) as any;
  
  const saldo_contabil_valor = saldo_contabil?.saldo || 0;
  const saldo_extrato = transacoesBanco?.saldo || 0;
  const diferenca = saldo_contabil_valor - saldo_extrato;
  
  // 3. Itens não reconciliados
  const nao_reconciliados = db.prepare(`
    SELECT COUNT(*) as qtd
    FROM transacoes_custodia
    WHERE fonte_tipo = 'banco'
      AND status = 'pendente'
      AND data_transacao BETWEEN ? AND ?
  `).get(dataInicio, dataFim) as any;
  
  // 4. Diferenças detectadas
  const discrepancias = detectarDiscrepanciasReconciliacao(
    db, imovelId, saldo_contabil_valor, saldo_extrato, dataInicio, dataFim
  );
  
  const conciliamento: ConciliamentoMensal = {
    id: crypto.randomUUID(),
    imovel_id: imovelId,
    periodo,
    data_realizacao: new Date(),
    status: discrepancias.length === 0 ? 'concluido' : 'com_discrepancias',
    saldo_contabil: saldo_contabil_valor,
    saldo_extrato_banco: saldo_extrato,
    diferenca,
    reconciliados: 0,  // a calcular baseado em status
    pendentes: nao_reconciliados?.qtd || 0,
    discrepancias: discrepancias.length,
    detalhes_discrepancia: discrepancias
  };
  
  // 5. Salvar conciliamento
  db.prepare(`
    INSERT INTO conciliamentos_mensais 
    (id, imovel_id, periodo, saldo_contabil, saldo_extrato, diferenca, status, data_realizacao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conciliamento.id,
    imovelId,
    periodo,
    saldo_contabil_valor,
    saldo_extrato,
    diferenca,
    conciliamento.status,
    conciliamento.data_realizacao
  );
  
  return conciliamento;
}

function detectarDiscrepanciasReconciliacao(
  db: Database,
  imovelId: string,
  saldo_contabil: number,
  saldo_extrato: number,
  dataInicio: string,
  dataFim: string
): Array<{tipo: string; descricao: string; valor: number; recomendacao: string}> {
  
  const discrepancias: Array<{tipo: string; descricao: string; valor: number; recomendacao: string}> = [];
  
  // Tipo 1: Diferença geral
  if (Math.abs(saldo_contabil - saldo_extrato) > 0.01) {
    discrepancias.push({
      tipo: 'DIFERENCA_SALDO',
      descricao: `Diferença entre saldo contábil (R$ ${saldo_contabil.toFixed(2)}) e extrato (R$ ${saldo_extrato.toFixed(2)})`,
      valor: Math.abs(saldo_contabil - saldo_extrato),
      recomendacao: 'Revisar lançamentos não reconciliados; verificar se há transações pendentes no banco'
    });
  }
  
  // Tipo 2: Transações no extrato sem lançamento contábil
  const sem_lancamento = db.prepare(`
    SELECT 
      COUNT(*) as qtd,
      SUM(valor_bruto) as valor_total
    FROM transacoes_custodia tc
    WHERE fonte_tipo = 'banco'
      AND status = 'pendente'
      AND data_transacao BETWEEN ? AND ?
      AND NOT EXISTS (
        SELECT 1 FROM lancamentos l
        WHERE l.origem_transacao_id = tc.id
      )
  `).get(dataInicio, dataFim) as any;
  
  if ((sem_lancamento?.qtd || 0) > 0) {
    discrepancias.push({
      tipo: 'LANCAMENTO_PENDENTE',
      descricao: `${sem_lancamento.qtd} transação(ões) do banco sem lançamento contábil (Total: R$ ${(sem_lancamento.valor_total || 0).toFixed(2)})`,
      valor: sem_lancamento.valor_total || 0,
      recomendacao: 'Converter transações pendentes em lançamentos contábeis'
    });
  }
  
  return discrepancias;
}
```

### 4.2 Validação de Saldo de Caixa vs Extratos

```typescript
interface ValidacaoCaixa {
  data: Date;
  saldo_contabil_caixa: number;
  saldo_fisico_caixa?: number;  // se informado manualmente
  saldo_bancos: number;
  diferenca_caixa?: number;
  diferenca_bancos?: number;
  conclusoes: string[];
  acoes_recomendadas: string[];
}

function validarSaldoCaixa(
  db: Database,
  imovelId: string,
  dataAtual: Date
): ValidacaoCaixa {
  
  const resultado: ValidacaoCaixa = {
    data: dataAtual,
    saldo_contabil_caixa: 0,
    saldo_bancos: 0,
    conclusoes: [],
    acoes_recomendadas: []
  };
  
  // Saldo contábil de caixa (conta 1.1.1)
  const saldo_caixa = db.prepare(`
    SELECT 
      SUM(CASE WHEN conta_debito_id = '1.1.1' THEN valor ELSE 0 END) -
      SUM(CASE WHEN conta_credito_id = '1.1.1' THEN valor ELSE 0 END) as saldo
    FROM lancamentos
    WHERE imovel_id = ?
      AND data_lancamento <= ?
  `).get(imovelId, dataAtual) as any;
  
  // Saldo contábil de bancos (conta 1.1.2)
  const saldo_bancos = db.prepare(`
    SELECT 
      SUM(CASE WHEN conta_debito_id = '1.1.2' THEN valor ELSE 0 END) -
      SUM(CASE WHEN conta_credito_id = '1.1.2' THEN valor ELSE 0 END) as saldo
    FROM lancamentos
    WHERE imovel_id = ?
      AND data_lancamento <= ?
  `).get(imovelId, dataAtual) as any;
  
  resultado.saldo_contabil_caixa = saldo_caixa?.saldo || 0;
  resultado.saldo_bancos = saldo_bancos?.saldo || 0;
  
  // Validações
  if (resultado.saldo_contabil_caixa < 0) {
    resultado.conclusoes.push('Caixa em negativo (descoberto)');
    resultado.acoes_recomendadas.push('Investigar saídas de caixa; conferir se há lançamentos em dobro');
  }
  
  if (resultado.saldo_bancos < 0) {
    resultado.conclusoes.push('Bancos em negativo');
    resultado.acoes_recomendadas.push('Verificar se há créditos não lançados ou empréstimos não registrados');
  }
  
  // Integração com Pluggy para validação
  if (process.env.PLUGGY_ENABLED === 'true') {
    // Buscar saldo do Pluggy e comparar
    const saldo_pluggy = buscarSaldoBancoPluggy(imovelId);
    if (saldo_pluggy && Math.abs(resultado.saldo_bancos - saldo_pluggy) > 1) {
      resultado.conclusoes.push(`Diferença entre saldo contábil (R$ ${resultado.saldo_bancos.toFixed(2)}) e Pluggy (R$ ${saldo_pluggy.toFixed(2)})`);
      resultado.acoes_recomendadas.push('Reconciliar com extratos bancários via Pluggy');
    }
  }
  
  return resultado;
}
```

### 4.3 Fechamento de Período Contábil

```typescript
interface FechamentoPeriodo {
  id: string;
  imovel_id: string;
  periodo: string;
  status: 'aberto' | 'em_processamento' | 'fechado' | 'reaberto';
  
  data_abertura: Date;
  data_fechamento?: Date;
  
  // Validações pré-fechamento
  validacoes: {
    lancamentos_balanceados: boolean;
    reconciliacao_completa: boolean;
    transacoes_pendentes_resolvidas: boolean;
  };
  
  // Dados do período
  saldo_inicial: number;
  movimentacao_liquida: number;
  saldo_final: number;
  
  // Documentos
  diario_gerado: boolean;
  razao_gerado: boolean;
  balancete_gerado: boolean;
  
  hash_fechamento: string;
}

function executarFechamentoPeriodo(
  db: Database,
  imovelId: string,
  ano: number,
  mes: number
): FechamentoPeriodo {
  
  const periodo = `${ano}-${String(mes).padStart(2, '0')}`;
  
  // 1. Validar pré-requisitos
  const balancete = gerarBalancete(db, imovelId, ano, mes);
  const validacoes_prototipo = {
    lancamentos_balanceados: balancete.equilibrio,
    reconciliacao_completa: false,
    transacoes_pendentes_resolvidas: false
  };
  
  // Verificar se há transações pendentes
  const pendentes = db.prepare(`
    SELECT COUNT(*) as qtd FROM transacoes_custodia
    WHERE status = 'pendente'
      AND data_transacao <= ?
  `).get(`${periodo}-31`) as any;
  
  validacoes_prototipo.transacoes_pendentes_resolvidas = (pendentes?.qtd || 0) === 0;
  
  // 2. Gerar documentos
  const { pdf: diario_pdf } = gerarDiario(db, imovelId, ano, mes);
  const razao = gerarRazao(db, imovelId, ano, mes);
  
  // 3. Calcular saldos
  const saldo_inicial = obterSaldoInicial(db, imovelId, ano, mes);
  const movimentacao = db.prepare(`
    SELECT 
      SUM(CASE WHEN conta_debito_id != conta_credito_id THEN valor ELSE 0 END) as liquida
    FROM lancamentos
    WHERE imovel_id = ?
      AND ano_contabil = ? AND mes_contabil = ?
  `).get(imovelId, ano, mes) as any;
  
  const fechamento: FechamentoPeriodo = {
    id: crypto.randomUUID(),
    imovel_id: imovelId,
    periodo,
    status: validacoes_prototipo.lancamentos_balanceados ? 'em_processamento' : 'aberto',
    data_abertura: new Date(`${periodo}-01`),
    validacoes: validacoes_prototipo,
    saldo_inicial,
    movimentacao_liquida: movimentacao?.liquida || 0,
    saldo_final: saldo_inicial + (movimentacao?.liquida || 0),
    diario_gerado: true,
    razao_gerado: true,
    balancete_gerado: true,
    hash_fechamento: ''
  };
  
  // 4. Hash do fechamento (para auditoria)
  fechamento.hash_fechamento = calcularHashFechamento(fechamento);
  fechamento.status = 'fechado';
  fechamento.data_fechamento = new Date();
  
  // 5. Registrar fechamento
  db.prepare(`
    INSERT INTO fechamentos_periodos 
    (id, imovel_id, periodo, status, saldo_inicial, saldo_final, hash_fechamento, data_fechamento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fechamento.id,
    imovelId,
    periodo,
    fechamento.status,
    fechamento.saldo_inicial,
    fechamento.saldo_final,
    fechamento.hash_fechamento,
    fechamento.data_fechamento
  );
  
  // 6. Bloquear período (impedir novas edições)
  db.prepare(`
    UPDATE lancamentos
    SET status = 'conciliado'
    WHERE imovel_id = ? AND ano_contabil = ? AND mes_contabil = ? AND status = 'rascunho'
  `).run(imovelId, ano, mes);
  
  return fechamento;
}

function calcularHashFechamento(fechamento: FechamentoPeriodo): string {
  const crypto = require('crypto');
  const dados = `${fechamento.imovel_id}|${fechamento.periodo}|${fechamento.saldo_final}|${fechamento.movimentacao_liquida}`;
  return crypto.createHash('sha256').update(dados).digest('hex');
}
```

### 4.4 Geração de Relatórios (DRE, Fluxo)

```typescript
interface RelatoriosDRE {
  periodo: string;
  imovel_id: string;
  
  receitas: {
    aluguel: number;
    juros_multas: number;
    outras: number;
    total: number;
  };
  
  despesas: {
    operacionais: number;  // IPTU, condomínio, etc
    financeiras: number;   // juros, multas pagas
    administrativas: number;
    total: number;
  };
  
  lucro: {
    bruto: number;
    operacional: number;
    liquido: number;
    margemm_liquida_pct: number;
  };
}

function gerarDRE(
  db: Database,
  imovelId: string,
  ano: number,
  mes: number
): RelatoriosDRE {
  
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const dataFim = `${ano}-${String(mes).padStart(2, '0')}-31`;
  
  // Receitas
  const receitas_aluguel = obterSaldoContaMes(db, imovelId, '4.1.1', dataInicio, dataFim);
  const receitas_juros = obterSaldoContaMes(db, imovelId, '4.2.1', dataInicio, dataFim);
  const receitas_outras = obterSaldoContaMes(db, imovelId, '4.2.3', dataInicio, dataFim);
  const total_receitas = receitas_aluguel + receitas_juros + receitas_outras;
  
  // Despesas operacionais
  const iptu = obterSaldoContaMes(db, imovelId, '5.1.1', dataInicio, dataFim);
  const condominio = obterSaldoContaMes(db, imovelId, '5.1.2', dataInicio, dataFim);
  const manutencao = obterSaldoContaMes(db, imovelId, '5.1.4', dataInicio, dataFim);
  const op_outras = obterSaldoContaMes(db, imovelId, '5.1.6', dataInicio, dataFim);
  const total_op = iptu + condominio + manutencao + op_outras;
  
  // Despesas financeiras
  const juros_pagos = obterSaldoContaMes(db, imovelId, '5.3.1', dataInicio, dataFim);
  const multas_pagas = obterSaldoContaMes(db, imovelId, '5.3.2', dataInicio, dataFim);
  const total_fin = juros_pagos + multas_pagas;
  
  // Despesas administrativas
  const admin = obterSaldoContaMes(db, imovelId, '5.4.1', dataInicio, dataFim);
  
  const total_despesas = total_op + total_fin + admin;
  const lucro_bruto = total_receitas - total_op;
  const lucro_operacional = lucro_bruto - total_fin;
  const lucro_liquido = lucro_operacional - admin;
  
  return {
    periodo: `${ano}-${String(mes).padStart(2, '0')}`,
    imovel_id: imovelId,
    receitas: {
      aluguel: receitas_aluguel,
      juros_multas: receitas_juros,
      outras: receitas_outras,
      total: total_receitas
    },
    despesas: {
      operacionais: total_op,
      financeiras: total_fin,
      administrativas: admin,
      total: total_despesas
    },
    lucro: {
      bruto: lucro_bruto,
      operacional: lucro_operacional,
      liquido: lucro_liquido,
      margemm_liquida_pct: total_receitas > 0 ? (lucro_liquido / total_receitas) * 100 : 0
    }
  };
}
```

---

## 5️⃣ TRATAMENTO DE PENDÊNCIAS

### 5.1 Informações Incompletas na Importação

```typescript
enum NivelIncompletude {
  CRITICA = 'critica',      // não pode processar
  ALTA = 'alta',            // requer ação urgente
  MEDIA = 'media',          // requer ação, mas com prazo
  BAIXA = 'baixa',          // nice-to-have
}

interface PendenciaImportacao {
  id: string;
  transacao_id: string;
  tipo: string;  // 'categoria_indefinida', 'descricao_vaga', 'valor_discordante', etc
  nivel: NivelIncompletude;
  descricao: string;
  campo_faltante: string;
  valor_sugerido?: any;
  alternativas: any[];
  data_criacao: Date;
  data_vencimento?: Date;  // prazо para resolver
  resolvido: boolean;
  resolucao_data?: Date;
  usuario_resolveu?: string;
}

function identificarPendencias(
  db: Database,
  transacao: Transacao
): PendenciaImportacao[] {
  
  const pendencias: PendenciaImportacao[] = [];
  
  // CRITICA 1: Sem categoria definida
  if (!transacao.categoria_preliminar) {
    const alternativas = gerarAlternativasCategoria(db, transacao);
    pendencias.push({
      id: `pend_categoria_${transacao.id}`,
      transacao_id: transacao.id,
      tipo: 'categoria_indefinida',
      nivel: NivelIncompletude.CRITICA,
      descricao: 'Categoria contábil não definida - impossível criar lançamento',
      campo_faltante: 'categoria_preliminar',
      alternativas,
      data_criacao: new Date(),
      data_vencimento: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),  // 3 dias
      resolvido: false
    });
  }
  
  // ALTA 2: Valor discordante entre fontes
  const discordancia = verificarDiscordanciaValor(db, transacao);
  if (discordancia && discordancia.diferenca_pct > 10) {
    pendencias.push({
      id: `pend_valor_${transacao.id}`,
      transacao_id: transacao.id,
      tipo: 'valor_discordante',
      nivel: NivelIncompletude.ALTA,
      descricao: `Valor difere ${discordancia.diferenca_pct.toFixed(2)}% de outra fonte`,
      campo_faltante: 'valor_bruto',
      valor_sugerido: discordancia.valor_correto,
      alternativas: [
        { valor: transacao.valor_bruto, fonte: transacao.fonte_tipo },
        { valor: discordancia.valor_outra_fonte, fonte: discordancia.outra_fonte }
      ],
      data_criacao: new Date(),
      data_vencimento: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      resolvido: false
    });
  }
  
  // MEDIA 3: Descrição muito vaga
  if (!transacao.descricao_normalizada || transacao.descricao_normalizada.length < 20) {
    const descricoes_sugeridas = buscarDescricoesSimilares(db, transacao.descricao_original);
    pendencias.push({
      id: `pend_descricao_${transacao.id}`,
      transacao_id: transacao.id,
      tipo: 'descricao_vaga',
      nivel: NivelIncompletude.MEDIA,
      descricao: 'Descrição muito vaga - prejudica auditoria e rastreabilidade',
      campo_faltante: 'descricao_normalizada',
      valor_sugerido: descricoes_sugeridas[0],
      alternativas: descricoes_sugeridas,
      data_criacao: new Date(),
      data_vencimento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      resolvido: false
    });
  }
  
  // BAIXA 4: Falta referência de documento
  if (!transacao.fonte_identificador || transacao.fonte_identificador === 'N/A') {
    pendencias.push({
      id: `pend_doc_${transacao.id}`,
      transacao_id: transacao.id,
      tipo: 'falta_documento_ref',
      nivel: NivelIncompletude.BAIXA,
      descricao: 'Falta referência de documento (NF, recibo, etc) - desejável para perícia',
      campo_faltante: 'documento_referencia',
      data_criacao: new Date(),
      resolvido: false
    });
  }
  
  return pendencias;
}

function gerarAlternativasCategoria(
  db: Database,
  transacao: Transacao
): any[] {
  
  const regras = carregarRegrasSegregacao(db);
  const candidatos: any[] = [];
  
  for (const regra of regras) {
    const score = calcularScoreRegra(transacao, regra);
    if (score > 0) {
      candidatos.push({
        categoria: regra.contaBuscada,
        regra: regra.descricao,
        score: Math.round(score * 100),
        confianca: score > 0.7 ? 'alta' : score > 0.5 ? 'media' : 'baixa'
      });
    }
  }
  
  return candidatos.sort((a, b) => b.score - a.score).slice(0, 3);
}
```

### 5.2 Fluxo para Resolver Ambiguidades

```typescript
interface FluxoResolucaoPendencia {
  pendencia_id: string;
  transacao_id: string;
  etapas: Array<{
    numero: number;
    descricao: string;
    acao: string;  // 'revisar', 'aprovar', 'rejeitar', 'desfazer'
    responsavel?: string;
    data?: Date;
    resultado?: any;
  }>;
  resolucao_final: 'resolvido' | 'nao_resolvido' | 'escalonado';
  escalonamento?: {
    motivo: string;
    destinatario: string;
    prioridade: 'normal' | 'urgente';
  };
}

function iniciarFluxoResolucao(
  db: Database,
  pendenciaId: string,
  usuarioId: string
): FluxoResolucaoPendencia {
  
  const pendencia = db.prepare('SELECT * FROM pendencias WHERE id = ?').get(pendenciaId) as any;
  
  const fluxo: FluxoResolucaoPendencia = {
    pendencia_id: pendenciaId,
    transacao_id: pendencia.transacao_id,
    etapas: [
      {
        numero: 1,
        descricao: 'Pendência criada',
        acao: 'criacao',
        data: new Date()
      },
      {
        numero: 2,
        descricao: 'Aguardando revisão do usuário',
        acao: 'revisar',
        responsavel: usuarioId
      }
    ],
    resolucao_final: 'nao_resolvido'
  };
  
  // Se pendência CRÍTICA, marcar para escalonamento
  if (pendencia.nivel === 'critica') {
    fluxo.etapas.push({
      numero: 3,
      descricao: 'Pendência crítica - escalonada para supervisor',
      acao: 'escalonamento'
    });
    
    fluxo.escalonamento = {
      motivo: `Pendência crítica: ${pendencia.tipo}`,
      destinatario: 'supervisor',
      prioridade: 'urgente'
    };
  }
  
  return fluxo;
}

function aprovarResolucaoPendencia(
  db: Database,
  pendenciaId: string,
  valores_aprovados: any,
  usuarioId: string
): void {
  
  const pendencia = db.prepare('SELECT * FROM pendencias WHERE id = ?').get(pendenciaId) as any;
  
  // Aplicar resolução
  if (pendencia.tipo === 'categoria_indefinida') {
    db.prepare('UPDATE transacoes_custodia SET categoria_preliminar = ? WHERE id = ?')
      .run(valores_aprovados.categoria, pendencia.transacao_id);
  } else if (pendencia.tipo === 'valor_discordante') {
    db.prepare('UPDATE transacoes_custodia SET valor_bruto = ? WHERE id = ?')
      .run(valores_aprovados.valor, pendencia.transacao_id);
  } else if (pendencia.tipo === 'descricao_vaga') {
    db.prepare('UPDATE transacoes_custodia SET descricao_normalizada = ? WHERE id = ?')
      .run(valores_aprovados.descricao, pendencia.transacao_id);
  }
  
  // Marcar pendência como resolvida
  db.prepare(`
    UPDATE pendencias
    SET resolvido = TRUE, resolucao_data = ?, usuario_resolveu = ?
    WHERE id = ?
  `).run(new Date(), usuarioId, pendenciaId);
}
```

---

## 6️⃣ VALIDAÇÕES PARA PERÍCIA

### 6.1 Regime de Zero Tolerância

```typescript
interface ValidacaoPericia {
  lancamento_id: string;
  periodo: string;
  validacoes: {
    nome: string;
    passou: boolean;
    severidade: 'erro' | 'aviso' | 'info';
    descricao: string;
    critico: boolean;  // impede aprovação
  }[];
  resultado_final: 'APROVADO_PERIZIA' | 'REJEITADO_PERIZIA' | 'CONDICIONAL';
  erros_criticos: string[];
  avisos: string[];
  assinatura_pericia?: string;
  data_validacao: Date;
}

function validarParaPerizia(
  db: Database,
  lancamentoId: string
): ValidacaoPericia {
  
  const lancamento = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(lancamentoId) as any;
  const transacao_origem = db.prepare('SELECT * FROM transacoes_custodia WHERE id = ?')
    .get(lancamento.origem_transacao_id) as any;
  
  const validacoes: ValidacaoPericia['validacoes'] = [];
  const erros_criticos: string[] = [];
  
  // V1: Rastreabilidade completa
  if (!lancamento.origem_transacao_id) {
    validacoes.push({
      nome: 'RASTREABILIDADE_COMPLETA',
      passou: false,
      severidade: 'erro',
      descricao: 'Lançamento sem origem rastreável',
      critico: true
    });
    erros_criticos.push('Lançamento sem origem - não pode ser incluído em perícia');
  } else {
    validacoes.push({
      nome: 'RASTREABILIDADE_COMPLETA',
      passou: true,
      severidade: 'info',
      descricao: 'Lançamento rastreável até transação de origem',
      critico: false
    });
  }
  
  // V2: Contas válidas e ativas
  const conta_d = db.prepare('SELECT ativo FROM plano_contas WHERE id = ?').get(lancamento.conta_debito_id) as any;
  const conta_c = db.prepare('SELECT ativo FROM plano_contas WHERE id = ?').get(lancamento.conta_credito_id) as any;
  
  if (!conta_d?.ativo || !conta_c?.ativo) {
    validacoes.push({
      nome: 'CONTAS_ATIVAS',
      passou: false,
      severidade: 'erro',
      descricao: 'Uma ou ambas as contas não estão ativas',
      critico: true
    });
    erros_criticos.push('Conta inativa detectada');
  } else {
    validacoes.push({
      nome: 'CONTAS_ATIVAS',
      passou: true,
      severidade: 'info',
      descricao: 'Ambas as contas estão ativas',
      critico: false
    });
  }
  
  // V3: Integridade de dados (hash)
  const hash_calc = calcularHashLancamento(lancamento);
  if (hash_calc !== lancamento.hash_lancamento) {
    validacoes.push({
      nome: 'INTEGRIDADE_HASH',
      passou: false,
      severidade: 'erro',
      descricao: 'Hash do lançamento não corresponde - dados foram alterados',
      critico: true
    });
    erros_criticos.push('Hash inválido - possível alteração de dados');
  } else {
    validacoes.push({
      nome: 'INTEGRIDADE_HASH',
      passou: true,
      severidade: 'info',
      descricao: 'Hash íntegro - dados não foram alterados',
      critico: false
    });
  }
  
  // V4: Lançamento balanceado
  if (Math.abs(lancamento.valor) < 0.01) {
    validacoes.push({
      nome: 'VALOR_POSITIVO',
      passou: false,
      severidade: 'erro',
      descricao: 'Valor deve ser positivo',
      critico: true
    });
    erros_criticos.push('Valor inválido (zero ou negativo)');
  } else {
    validacoes.push({
      nome: 'VALOR_POSITIVO',
      passou: true,
      severidade: 'info',
      descricao: `Valor válido: R$ ${lancamento.valor.toFixed(2)}`,
      critico: false
    });
  }
  
  // V5: Datas coerentes
  const data_lancamento = new Date(lancamento.data_lancamento);
  const data_transacao = new Date(lancamento.data_transacao);
  
  if (data_lancamento < data_transacao) {
    validacoes.push({
      nome: 'DATAS_COERENTES',
      passou: false,
      severidade: 'aviso',
      descricao: 'Data do lançamento anterior à data da transação',
      critico: false
    });
  } else {
    validacoes.push({
      nome: 'DATAS_COERENTES',
      passou: true,
      severidade: 'info',
      descricao: 'Datas coerentes',
      critico: false
    });
  }
  
  // V6: Documentação de origem
  if (!lancamento.documento_referencia || lancamento.documento_referencia === 'N/A') {
    validacoes.push({
      nome: 'DOCUMENTO_REFERENCIA',
      passou: false,
      severidade: 'aviso',
      descricao: 'Sem referência de documento (desejável)',
      critico: false
    });
  } else {
    validacoes.push({
      nome: 'DOCUMENTO_REFERENCIA',
      passou: true,
      severidade: 'info',
      descricao: `Documento: ${lancamento.documento_referencia}`,
      critico: false
    });
  }
  
  // V7: Registrado em diário
  const em_diario = db.prepare(
    'SELECT COUNT(*) as qtd FROM lancamentos WHERE numero_diario = ? AND id != ?'
  ).get(lancamento.numero_diario, lancamentoId) as any;
  
  if (!lancamento.numero_diario || em_diario.qtd === 0) {
    validacoes.push({
      nome: 'NUMERO_DIARIO',
      passou: false,
      severidade: 'aviso',
      descricao: 'Lançamento não registrado em sequência de diário',
      critico: false
    });
  } else {
    validacoes.push({
      nome: 'NUMERO_DIARIO',
      passou: true,
      severidade: 'info',
      descricao: `Registrado no diário com número: ${lancamento.numero_diario}`,
      critico: false
    });
  }
  
  // V8: Sem alterações posteriores (imutabilidade relativa)
  const historico = db.prepare(
    'SELECT COUNT(*) as qtd FROM lancamentos_historico WHERE lancamento_id = ? AND tipo_acao IN ("edicao", "cancelamento")'
  ).get(lancamentoId) as any;
  
  if ((historico?.qtd || 0) > 0) {
    validacoes.push({
      nome: 'IMUTABILIDADE',
      passou: false,
      severidade: 'aviso',
      descricao: 'Lançamento foi alterado após criação - audit trail disponível',
      critico: false
    });
  } else {
    validacoes.push({
      nome: 'IMUTABILIDADE',
      passou: true,
      severidade: 'info',
      descricao: 'Lançamento não foi alterado desde criação',
      critico: false
    });
  }
  
  // Resultado final
  let resultado_final: 'APROVADO_PERIZIA' | 'REJEITADO_PERIZIA' | 'CONDICIONAL' = 'APROVADO_PERIZIA';
  
  if (erros_criticos.length > 0) {
    resultado_final = 'REJEITADO_PERIZIA';
  } else if (validacoes.some(v => !v.passou && v.severidade === 'aviso')) {
    resultado_final = 'CONDICIONAL';
  }
  
  const avisos = validacoes.filter(v => v.severidade === 'aviso').map(v => v.descricao);
  
  return {
    lancamento_id: lancamentoId,
    periodo: `${lancamento.ano_contabil}-${String(lancamento.mes_contabil).padStart(2, '0')}`,
    validacoes,
    resultado_final,
    erros_criticos,
    avisos,
    data_validacao: new Date()
  };
}
```

### 6.2 Checksum e Hash para Detectar Alterações

```typescript
interface AuditHash {
  entidade_id: string;
  entidade_tipo: string;  // 'lancamento', 'transacao', 'fechamento'
  hash_sha256: string;
  hash_timestamp: Date;
  assinatura_hmac: string;
  chave_versao: number;
  
  verificacoes: Array<{
    data_verificacao: Date;
    resultado: 'ok' | 'alterado' | 'erro';
    hash_encontrado: string;
    detalhes: string;
  }>;
}

function calcularHashSHA256(dados: any): string {
  const crypto = require('crypto');
  const stringificado = JSON.stringify(dados, null, 0);  // sem espaços extras
  return crypto.createHash('sha256').update(stringificado).digest('hex');
}

function calcularAssinaturaHMAC(hash: string, chaveSecreta: string): string {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', chaveSecreta).update(hash).digest('hex');
}

function verificarIntegridade(
  entidadeId: string,
  entidadeTipo: string,
  dadosAtuais: any,
  hashAnterior: string,
  assinaturaAnterior: string
): {ok: boolean; alteracoes: string[]} {
  
  const chaveSecreta = process.env.CHAVE_ASSINATURA || 'chave-padrao';
  const hashAtual = calcularHashSHA256(dadosAtuais);
  const assinaturaAtual = calcularAssinaturaHMAC(hashAtual, chaveSecreta);
  
  const resultado = {
    ok: hashAtual === hashAnterior && assinaturaAtual === assinaturaAnterior,
    alteracoes: [] as string[]
  };
  
  if (hashAtual !== hashAnterior) {
    resultado.alteracoes.push('Dados foram modificados (hash diferente)');
  }
  
  if (assinaturaAtual !== assinaturaAnterior) {
    resultado.alteracoes.push('Assinatura HMAC inválida (possível alteração não autorizada)');
  }
  
  return resultado;
}
```

### 6.3 Audit Trail Completo

```sql
-- Tabela de Audit Trail
CREATE TABLE IF NOT EXISTS audit_trail (
  id TEXT PRIMARY KEY,
  
  -- Entidade afetada
  entidade_tipo TEXT NOT NULL,  -- 'lancamento', 'transacao', 'pendencia'
  entidade_id TEXT NOT NULL,
  
  -- Ação
  tipo_acao TEXT NOT NULL,  -- 'criacao', 'leitura', 'edicao', 'delecao', 'cancelamento'
  descricao TEXT,
  
  -- Mudança (antes/depois)
  campo_afetado TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  
  -- Quem fez
  usuario_id TEXT,
  ip_origem TEXT,
  user_agent TEXT,
  sessao_id TEXT,
  
  -- Integridade
  hash_anterior TEXT,
  hash_novo TEXT,
  assinatura HMAC TEXT,
  
  -- Temporal
  data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  data_hora_servidor DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Metadata
  app_versao TEXT,
  ambiente TEXT  -- 'producao', 'staging', 'desenvolvimento'
);

CREATE INDEX idx_audit_entidade ON audit_trail(entidade_tipo, entidade_id);
CREATE INDEX idx_audit_usuario ON audit_trail(usuario_id);
CREATE INDEX idx_audit_data ON audit_trail(data_hora);
CREATE INDEX idx_audit_acao ON audit_trail(tipo_acao);
```

---

## 📊 FLUXOGRAMA COMPLETO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FLUXO COMPLETO DE RECONSTRUÇÃO CONTÁBIL                │
└─────────────────────────────────────────────────────────────────────────────┘

FASE 1: INGESTÃO E NORMALIZACAO
┌─────────────────────────────────┐
│  Dados Brutos de Múltiplas      │
│  Fontes (Banco, NF, Recibos)    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Parser e Normalizador          │
│  (Tipagem, limpeza de dados)    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Tabela de Custodia (STAGING)   │
│  transacoes_custodia.db         │
└────────────┬────────────────────┘
             │
             ▼

FASE 2: RECONCILIAÇÃO E VALIDAÇÃO
┌─────────────────────────────────┐
│  1. Identificar Transações      │
│     Relacionadas                │
│  2. Detectar Duplicatas         │
│  3. Validar Completude          │
│  4. Gerar Alertas               │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Pendências Resolvidas?         │
│  ├─ SIM → Prosseguir            │
│  └─ NÃO → Fluxo de Resolução   │
└────────────┬────────────────────┘
             │
             ▼

FASE 3: SEGREGAÇÃO DE CUSTOS
┌─────────────────────────────────┐
│  1. Aplicar Regras de Segregação│
│  2. Gerar Alternativas (fuzzy)  │
│  3. Atribuir Categoria          │
│  4. Calcular Percentuais        │
└────────────┬────────────────────┘
             │
             ▼

FASE 4: GERAÇÃO DE LANÇAMENTOS
┌─────────────────────────────────┐
│  1. Converter para Lançamento   │
│  2. Validar Contas Contábeis    │
│  3. Calcular Hash + Assinatura  │
│  4. Gravar em lancamentos.db    │
└────────────┬────────────────────┘
             │
             ▼

FASE 5: RASTREABILIDADE
┌─────────────────────────────────┐
│  Cadeia Completa:               │
│  Transacao → Lançamento         │
│  → Diário → Razão → Balancete   │
└────────────┬────────────────────┘
             │
             ▼

FASE 6: PROCESSAMENTO PERIÓDICO
┌─────────────────────────────────────────┐
│  CONCILIAÇÃO MENSAL                     │
│  ├─ Saldo Contábil vs Extrato Banco     │
│  ├─ Itens Não Reconciliados             │
│  └─ Discrepâncias Detectadas            │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  FECHAMENTO DO PERÍODO                  │
│  ├─ Gerar Diário, Razão, Balancete      │
│  ├─ Validar Balanceamento               │
│  ├─ Bloquear Período                    │
│  └─ Hash de Fechamento                  │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  RELATÓRIOS (DRE, Fluxo)                │
│  ├─ Receitas vs Despesas                │
│  ├─ Margens por Propriedade             │
│  └─ Análise de Tendências               │
└────────────┬────────────────────────────┘
             │
             ▼

FASE 7: VALIDAÇÃO PARA PERÍCIA
┌─────────────────────────────────────────┐
│  REGIME DE ZERO TOLERÂNCIA              │
│  ├─ Rastreabilidade Completa            │
│  ├─ Integridade de Hash                 │
│  ├─ Audit Trail                         │
│  ├─ Imutabilidade (com histórico)       │
│  ├─ Documentação de Origem              │
│  └─ Resultado: APROVADO/CONDICIONAL/   │
│     REJEITADO                           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  ASSINATURA DIGITAL PARA PERÍCIA        │
│  ├─ HMAC SHA-256 de período             │
│  ├─ Timestamp autenticado               │
│  └─ Certificado Digital (opcional)      │
└─────────────────────────────────────────┘
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Phase 11: Core Reconstruction Logic
- [ ] Schema: `transacoes_custodia` (staging)
- [ ] Schema: `lancamentos` (contábil)
- [ ] Schema: `plano_contas` (chart of accounts)
- [ ] Schema: `pendencias` (unresolved items)
- [ ] Schema: `audit_trail` (legal compliance)

### Reconciliation Module
- [ ] `identificarTransacoesRelacionadas()` - matching algorithm
- [ ] `detectarDuplicatas()` - duplicate detection
- [ ] `validarCompletude()` - data completeness
- [ ] `gerarAlertasDiscrepancias()` - discrepancy alerts

### Segregation Module
- [ ] Plano de Contas padrão (propriedade imóvel)
- [ ] `aplicarRegraSegregacao()` - cost classification
- [ ] `calcularPercentuaisDespesa()` - ratio analysis
- [ ] Fuzzy matching for categories

### Accounting Module
- [ ] `converterTransacaoBancariaEmLancamento()` - conversion
- [ ] `rastrearOrigem()` - traceability
- [ ] `gerarDiario()`, `gerarRazao()`, `gerarBalancete()` - reports
- [ ] Hash e assinatura digital

### Periodic Module
- [ ] `executarConciliamentoMensal()` - monthly reconciliation
- [ ] `validarSaldoCaixa()` - cash validation
- [ ] `executarFechamentoPeriodo()` - period closure
- [ ] `gerarDRE()` - income statement

### Compliance Module
- [ ] `validarParaPerizia()` - judicial validation
- [ ] `calcularHashSHA256()`, `calcularAssinaturaHMAC()`
- [ ] `verificarIntegridade()` - integrity check
- [ ] Audit trail logging

---

## 📝 CONCLUSÃO

Este design oferece um sistema **robusto e auditável** de reconstrução contábil com:

1. **Rastreabilidade 100%** - cada lançamento liga à transação original
2. **Zero tolerância de erros** - validações críticas bloqueiam processamento
3. **Integridade matemática** - balancetes sempre balanceados
4. **Compliance judicial** - hash, assinatura, audit trail
5. **Flexibilidade operacional** - fluxo de resolução de pendências
6. **Análise de margem** - segregação de custos por propriedade

**Pronto para perícia? SIM** - com audit trail completo e assinatura digital.
