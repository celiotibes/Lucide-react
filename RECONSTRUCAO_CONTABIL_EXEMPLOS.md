# Reconstrução Contábil - Exemplos Práticos de Uso
## Casos de Uso Reais do Sistema

**Data:** 2026-10-03  
**Contexto:** Sistema em produção processando imóvil alugado

---

## 📌 CASO 1: Aluguel Recebido com Juros

### Dados de Entrada

Três fontes diferentes referindo à mesma operação:

```
FONTE 1: EXTRATO BANCÁRIO (Pluggy)
┌────────────────────────────────────────┐
│ Data: 2026-10-01                       │
│ Descrição: TRF RECEBIDO                │
│ Valor: R$ 2.000,00                     │
│ Identificador: MOV001234               │
│ Banco: Itaú                            │
└────────────────────────────────────────┘

FONTE 2: CONTRATO DE ALUGUEL (Sistema)
┌────────────────────────────────────────┐
│ Data: 2026-10-01                       │
│ Descrição: Aluguel mês outubro         │
│ Valor: R$ 2.000,00                     │
│ Referência: Contrato 001/2026          │
│ Tipo: Aluguel Normal                   │
└────────────────────────────────────────┘

FONTE 3: RECIBO DIGITAL
┌────────────────────────────────────────┐
│ Data: 2026-10-02                       │
│ Descrição: Aluguel Oct + juros mora   │
│ Valor: R$ 2.050,00 (aluguel + juros)   │
│ Identificador: REC-2026-10-001         │
│ Proprietário: João Silva               │
└────────────────────────────────────────┘
```

### Processamento Passo a Passo

#### **Passo 1: Normalização e Ingestion**

```sql
-- Inserção na custódia
INSERT INTO transacoes_custodia (
  id, fonte_tipo, fonte_identificador, data_transacao, valor_bruto,
  descricao_original, descricao_normalizada, tipo_preliminar,
  hash_sha256, status
) VALUES
  ('txn_001', 'banco', 'MOV001234', '2026-10-01', 2000.00,
   'TRF RECEBIDO', 'Transferência recebida', 'receita',
   'hash_001', 'pendente'),
  ('txn_002', 'contrato', 'CONTRATO_001', '2026-10-01', 2000.00,
   'Aluguel mês outubro', 'Aluguel mês outubro', 'receita',
   'hash_002', 'pendente'),
  ('txn_003', 'recibo', 'REC-2026-10-001', '2026-10-02', 2050.00,
   'Aluguel Oct + juros mora', 'Aluguel outubro com juros de mora', 'receita',
   'hash_003', 'pendente');
```

#### **Passo 2: Reconciliação**

```typescript
// Algoritmo detecta relacionamento
const resultado_recon = reconciliador.reconciliar(txn_001);

// Resultado:
{
  transacao_id: "txn_001",
  transacoes_relacionadas: ["txn_002", "txn_003"],
  eh_duplicata: false,
  score_confianca: 95,  // Match entre txn_001 e txn_002 (mesma data, valor)
  pendencias: [
    {
      id: "pend_001",
      tipo: "transacao_relacionada_com_variacao",
      nivel: "media",
      descricao: "Txn_003 tem R$ 50 a mais (possível juros/multa)",
      campo_faltante: null
    }
  ],
  pronto_para_lancamento: true
}
```

#### **Passo 3: Segregação de Custos**

```typescript
// Aplicar regras (txn_001 → receita)
const match = segregador.aplicarRegra(txn_001);

// Resultado:
{
  conta_id: "pc_4_1_1",  // 4.1.1 = Aluguel Normal
  regra_id: "regra_aluguel_default",
  score: 95
}

// Para txn_003 (R$ 50 de juros)
// Análise complementar: separar aluguel (R$ 2000) de juros (R$ 50)
const analise = {
  aluguel_puro: 2000.00,        // → Conta 4.1.1
  juros_recebidos: 50.00        // → Conta 4.2.1
}
```

#### **Passo 4: Geração de Lançamentos**

```typescript
// Opção 1: Lançamento único (totaliza receitas)
const lancamento_1 = {
  id: "lc_001",
  imovel_id: "prop_001",
  numero_diario: 1,
  data_lancamento: 2026-10-03,
  data_transacao: 2026-10-01,
  conta_debito_id: "1.1.2",    // Banco
  conta_credito_id: "4.1.1",   // Aluguel
  valor: 2000.00,
  descricao: "Aluguel outubro",
  origem_transacao_id: "txn_001",
  hash_lancamento: "hash_lc_001",
  assinatura_digital: "sig_lc_001"
};

// Opção 2: Lançamentos separados (segregação detalhada)
const lancamento_2_aluguel = {
  ...lancamento_1,
  id: "lc_002",
  valor: 2000.00,
  descricao: "Aluguel outubro recebido"
};

const lancamento_2_juros = {
  id: "lc_003",
  numero_diario: 2,
  conta_debito_id: "1.1.2",    // Banco
  conta_credito_id: "4.2.1",   // Juros recebidos
  valor: 50.00,
  descricao: "Juros de mora recebidos",
  origem_transacao_id: "txn_003"
};
```

#### **Passo 5: Validação para Perícia**

```typescript
const validacao = validador.validarParaPerizia("lc_001");

// Resultado:
{
  aprovado: true,
  resultado: "APROVADO_PERIZIA",
  erros: [],
  avisos: []
}
```

#### **Passo 6: Consulta de Rastreabilidade**

```typescript
const cadeia = rastrearOrigem(db, "lc_001");

// Resultado:
{
  transacao_id: "txn_001",
  lancamentos: [
    {
      id: "lc_001",
      numero_diario: 1,
      data_lancamento: "2026-10-03",
      contas: "1.1.2 / 4.1.1",
      valor: 2000.00
    }
  ],
  origem_original: {
    tipo: "banco",
    identificador: "MOV001234",
    data: "2026-10-01",
    descricao: "TRF RECEBIDO"
  },
  transformacoes: [
    {
      etapa: "criacao",
      data: "2026-10-03 14:32:01",
      usuario: "sistema",
      detalhes: "Criado a partir de txn_001"
    }
  ],
  validacoes: [
    {
      tipo: "RASTREABILIDADE_COMPLETA",
      resultado: true,
      data: "2026-10-03 14:32:15",
      observacao: "Lançamento rastreável até transação de origem"
    }
  ]
}
```

---

## 📌 CASO 2: Despesa com Condomínio (Possível Discrepância)

### Dados de Entrada

```
Imóvel: Rua das Flores, 100 - Apto 201
Período: Setembro 2026
```

**Dado 1: Extrato do Banco**
```
Data: 2026-09-15
Descrição: Débito automático - SÍNDICO RES. FLORES
Valor: R$ 650,00
ID: MOV00567
```

**Dado 2: Boleto do Síndico**
```
Data Emissão: 2026-09-05
Data Vencimento: 2026-09-20
Valor: R$ 650,00
Referência: COND-09-2026
```

**Dado 3: Extrato do Imóvel (Planilha)**
```
Data: 2026-09-20
Descrição: Condomínio setembro
Valor: R$ 680,00  ⚠️ DISCREPÂNCIA!
```

### Detecção de Discrepância

```typescript
// Sistema detecta R$ 30 de diferença
const discrepancia = {
  tipo: 'POSSIVEL_JUROS_OU_TAXA',
  valor_diferenca: 30.00,
  percentual: 4.6,
  fonte_1: { tipo: 'banco', valor: 650.00 },
  fonte_2: { tipo: 'boleto', valor: 650.00 },
  fonte_3: { tipo: 'planilha', valor: 680.00 },
  conclusao: 'Possível acréscimo de multa/juros no boleto ou erro de lançamento'
};

// Alerta gerado
const alerta = {
  id: 'alerta_cond_discrepancia',
  tipoAlerta: 'DESVIO_VALOR',
  severidade: 'MEDIA',
  descricao: 'Valor de condomínio diverge em R$ 30 entre fontes',
  transacoesAfetadas: ['txn_cond_banco', 'txn_cond_boleto', 'txn_cond_planilha'],
  recomendacao: 'Revisar boleto/comprovante; possível taxa bancária ou multa',
  resolvido: false
};
```

### Resolução (Fluxo Manual)

```typescript
// Usuário revisa e aprova
const resolucao = {
  alerta_id: 'alerta_cond_discrepancia',
  acao: 'ACEITAR_VALOR_BANCO',
  motivo: 'Extrato bancário é mais confiável; R$ 30 podem ser taxa ou juros não documentados',
  usuario: 'gerente@imovel.com',
  data: '2026-10-03 10:15'
};

// Sistema atualiza:
// - Valor principal: R$ 650,00 (débito automático)
// - Cria lançamento adicional: R$ 30,00 em "Taxa bancária" ou "Multa"
// - Marca alerta como resolvido

db.prepare('UPDATE alertas_discrepancias SET resolvido = TRUE WHERE id = ?')
  .run('alerta_cond_discrepancia');

// Lançamentos criados:
const lc_condominio = {
  conta_debito: "5.1.2",      // Condomínio
  conta_credito: "1.1.2",     // Banco
  valor: 650.00,
  descricao: "Condomínio setembro"
};

const lc_taxa_extra = {
  conta_debito: "5.3.3",      // Taxa bancária
  conta_credito: "1.1.2",     // Banco
  valor: 30.00,
  descricao: "Taxa ou acréscimo condomínio"
};
```

---

## 📌 CASO 3: Pendência Crítica - Categoria Indefinida

### Situação

```
Transação importada do banco:
Data: 2026-09-10
Valor: R$ 1.200,00 (débito)
Descrição original: "TRF PARA CNPJ 12.345.678/0001-99"
Fonte: Pluggy
Identificador: MOV00890
```

### Detecção da Pendência

```typescript
const validacao = validadorCompletude(transacao);

// Resultado:
{
  completa: false,
  erros: [],
  avisos: [
    'Descrição muito vaga (não identifica categoria)',
    'Tipo preliminar não definido'
  ],
  percentual_completude: 50
}

// Sistema gera pendência CRÍTICA
const pendencia = {
  id: 'pend_txn_890_cat',
  transacao_id: 'txn_890',
  tipo: 'categoria_indefinida',
  nivel: 'CRITICA',
  descricao: 'Transação de R$ 1.200,00 sem categoria - impossível criar lançamento',
  campo_faltante: 'categoria_preliminar',
  alternativas: [
    { categoria: '5.1.4', descricao: 'Manutenção', confianca: 0.15 },
    { categoria: '5.4.1', descricao: 'Honorários/Gestão', confianca: 0.10 },
    { categoria: '5.5.1', descricao: 'IRPF Retido', confianca: 0.08 }
  ],
  data_criacao: '2026-10-03 08:00',
  data_vencimento: '2026-10-06 17:00',  // 3 dias para resolver
  resolvido: false
};
```

### Dashboard de Pendências

```
┌──────────────────────────────────────────────────────────┐
│           PENDÊNCIAS - Imóvel: Rua das Flores, 100      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 🔴 CRÍTICAS (2 itens, prazo até 2026-10-06)            │
│  ├─ pend_txn_890_cat: Categoria indefinida             │
│  │  │ Transação: MOV00890 | R$ 1.200,00                 │
│  │  │ Descrição: TRF PARA CNPJ 12.345.678/0001-99       │
│  │  │ Ações: [Revisar] [Atribuir Manualmente]          │
│  │  └─ Sugestões: Manutenção (15%), Honorários (10%)   │
│  │                                                      │
│  └─ pend_txn_891_dup: Possível duplicação             │
│     │ Semelhante a txn_456 (mesmo dia, valor parecido) │
│     └─ Ações: [Confirmar Duplicata] [Não é Dup]       │
│                                                          │
│ 🟡 ALTAS (1 item, prazo até 2026-10-10)               │
│  └─ pend_txn_892_desc: Descrição muito vaga           │
│                                                          │
│ 🟢 MÉDIAS (3 itens)                                    │
│  └─ ...                                                │
│                                                          │
│ [RESUMO] 2 Críticas | 1 Alta | 3 Médias | 5 Baixas    │
└──────────────────────────────────────────────────────────┘
```

### Resolução da Pendência

```typescript
// Usuário clica em "Atribuir Manualmente"
// Abre formulário:
{
  pendencia_id: 'pend_txn_890_cat',
  novo_valor: {
    categoria_preliminar: '5.1.4',  // Manutenção
    tipo_preliminar: 'despesa',
    motivo_atribuicao: 'Usuário identificou como manutenção predial',
    usuario_id: 'gerente@imovel.com'
  }
}

// Sistema aprova e atualiza
db.prepare(`
  UPDATE transacoes_custodia
  SET categoria_preliminar = ?, tipo_preliminar = ?
  WHERE id = ?
`).run('5.1.4', 'despesa', 'txn_890');

db.prepare(`
  UPDATE pendencias
  SET resolvido = TRUE, resolucao_data = NOW(), usuario_resolveu = ?
  WHERE id = ?
`).run('gerente@imovel.com', 'pend_txn_890_cat');

// Transação agora está pronta para lançamento
// Próximo passo: gerador chama converterEmLancamento()
```

---

## 📊 CASO 4: Conciliação Mensal Completa

### Dados do Período: Setembro 2026

```
Imóvel: Rua das Flores, 100
Período: 2026-09
```

### Execução da Conciliação

```typescript
const conciliacao = executarConciliamentoMensal(db, 'prop_001', 2026, 9);

// Resultado:
{
  id: 'concil_prop001_202609',
  imovel_id: 'prop_001',
  periodo: '2026-09',
  data_realizacao: '2026-10-03 14:00',
  
  // Saldos
  saldo_contabil: 5432.10,      // Caixa no sistema
  saldo_extrato_banco: 5432.10,  // Saldo no banco
  diferenca: 0.00,               // ✅ PERFEITO!
  
  // Status
  status: 'concluido',
  
  // Detalhes
  reconciliados: 28,   // 28 transações bancárias reconciliadas
  pendentes: 0,        // Nenhuma pendente
  discrepancias: 0,    // Nenhuma discrepância
  
  detalhes_discrepancia: []
}
```

### Relatório de Conciliação (Formato PDF/HTML)

```
┌─────────────────────────────────────────────────────────┐
│                 CONCILIAÇÃO BANCÁRIA                    │
│            Setembro 2026 - Rua das Flores, 100         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Saldo Contábil (Sistema)       R$ 5.432,10            │
│ Saldo Extrato (Banco)          R$ 5.432,10            │
│ ────────────────────────────────────────────           │
│ Diferença                      R$    0,00 ✅           │
│                                                         │
│ Status: RECONCILIADO COMPLETAMENTE                     │
│                                                         │
│ Transações reconciliadas:      28                      │
│ Transações pendentes:          0                       │
│ Discrepâncias detectadas:      0                       │
│                                                         │
│ Data da conciliação: 2026-10-03 14:00                 │
│ Realizado por: Sistema (automático)                    │
│ Aprovado em: 2026-10-03 14:05 (gerente@imovel.com)   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 CASO 5: Fechamento do Período

### Checklist Pré-Fechamento

```
Período: Setembro 2026
Imóvel: Rua das Flores, 100

□ Todos os lançamentos com status ≠ 'rascunho'?  ✅ SIM
□ Balancete equilibrado (débito = crédito)?      ✅ SIM
□ Conciliação bancária concluída?                ✅ SIM (0,00 dif)
□ Nenhuma pendência crítica ou alta?             ✅ SIM
□ Validações para perícia aprovadas?             ✅ SIM (100% APROVADO)

✅ PERMITIDO FECHAR PERÍODO
```

### Execução do Fechamento

```typescript
const fechamento = executarFechamentoPeriodo(db, 'prop_001', 2026, 9);

// Resultado:
{
  id: 'fech_prop001_202609',
  imovel_id: 'prop_001',
  periodo: '2026-09',
  status: 'fechado',  // ← Mudança de 'aberto' para 'fechado'
  
  // Tempos
  data_abertura: '2026-09-01',
  data_fechamento: '2026-10-03 15:30',
  
  // Saldos
  saldo_inicial: 3500.00,
  movimentacao_liquida: 1932.10,
  saldo_final: 5432.10,
  
  // Documentos gerados
  diario_gerado: true,
  razao_gerado: true,
  balancete_gerado: true,
  
  // Integridade
  hash_fechamento: 'hash_fech_202609_xyz123',
  
  validacoes: {
    lancamentos_balanceados: true,
    reconciliacao_completa: true,
    transacoes_pendentes_resolvidas: true
  }
}
```

### Consequências do Fechamento

```sql
-- 1. Período marcado como fechado
UPDATE fechamentos_periodos
SET status = 'fechado'
WHERE imovel_id = 'prop_001' AND periodo = '2026-09';

-- 2. Todos os lançamentos do período marcados como conciliados
UPDATE lancamentos
SET status = 'conciliado'
WHERE imovel_id = 'prop_001'
  AND ano_contabil = 2026
  AND mes_contabil = 9;

-- 3. Nenhuma edição futura será permitida sem reabertura
-- (requer aprovação de supervisor)

-- 4. Documentos gerados e arquivados:
-- - diario_fech_prop001_202609.pdf
-- - razao_fech_prop001_202609.pdf
-- - balancete_fech_prop001_202609.pdf
-- - relatorio_perizia_prop001_202609.pdf
```

---

## 📈 CASO 6: Relatório de Margens e DRE

### Dados do Período

```
Imóvel: Rua das Flores, 100 - Apto 201
Período: Setembro 2026
```

### Geração do DRE

```typescript
const dre = gerarDRE(db, 'prop_001', 2026, 9);

// Resultado:
{
  periodo: '2026-09',
  imovel_id: 'prop_001',
  
  receitas: {
    aluguel: 2000.00,
    juros_multas: 50.00,
    outras: 0.00,
    total: 2050.00
  },
  
  despesas: {
    operacionais: {
      iptu: 150.00,
      condominio: 650.00,
      seguro: 80.00,
      manutencao: 0.00,
      limpeza: 0.00,
      outras: 0.00,
      subtotal: 880.00
    },
    financeiras: {
      juros_pagos: 0.00,
      multas_pagas: 0.00,
      taxa_bancaria: 30.00,
      subtotal: 30.00
    },
    administrativas: {
      honorarios: 200.00,
      custos_cobranca: 0.00,
      subtotal: 200.00
    },
    total: 1110.00
  },
  
  lucro: {
    bruto: 1170.00,        // 2050 - 880
    operacional: 1140.00,  // 1170 - 30
    liquido: 940.00,       // 1140 - 200
    margem_liquida_pct: 45.85  // 940 / 2050 * 100
  }
}
```

### Cálculo de Percentuais de Despesa

```typescript
const percentuais = calcularPercentuaisDespesa(db, 'prop_001', 2026, 9);

// Resultado visual:
/*
RECEITA BRUTA: R$ 2.050,00

Despesas por Categoria:
├─ Condomínio:     R$ 650,00 (31,71%)  📊 ▓▓▓▓▓▓▓▓▓░░░
├─ Honorários:     R$ 200,00 (9,76%)   📊 ▓▓░░░░░░░░░░
├─ IPTU:           R$ 150,00 (7,32%)   📊 ▓░░░░░░░░░░░
├─ Seguro:         R$ 80,00  (3,90%)   📊 ░░░░░░░░░░░░
├─ Taxa Bancária:  R$ 30,00  (1,46%)   📊 ░░░░░░░░░░░░
└─ Outras:        R$ 0,00   (0,00%)   📊 

TOTAL DESPESAS: R$ 1.110,00 (54,15%)
MARGEM LÍQUIDA: R$   940,00 (45,85%)
*/
```

---

## 🔐 CASO 7: Validação para Perícia (Cenário Negativo)

### Lançamento Rejeitado

```typescript
const validacao = validadorPericia.validarParaPerizia('lc_invalid_001');

// Resultado:
{
  aprovado: false,
  resultado: 'REJEITADO_PERIZIA',
  
  erros: [
    'Sem origem rastreável',
    'Hash inválido - dados foram alterados',
    'Conta de débito não está ativa'
  ],
  
  avisos: [
    'Data de lançamento anterior à data da transação'
  ]
}
```

### Ação Corretiva

```typescript
// Lançamento não pode ser incluído em relatório de perícia
// Opções:
// 1. Cancelar lançamento e criar novo (com origem válida)
// 2. Reativar conta contábil
// 3. Corrigir hash (se houve alteração acidental)

// Melhor prática: Criar novo lançamento com origem completa
const lc_novo = {
  ...lc_invalid_001,  // copiar estrutura
  id: crypto.randomUUID(),  // novo ID
  origem_transacao_id: 'txn_valida_001',  // vincular a transação válida
  data_lancamento: new Date(),  // data atual
  status: 'rascunho',
  versao: 1
};

// Calcular hash e assinatura
lc_novo.hash_lancamento = calcularHashLancamento(lc_novo);
lc_novo.assinatura_digital = calcularAssinaturaDigital(lc_novo.hash_lancamento);

// Gravar novo lançamento
gerador.gravarLancamento(lc_novo);

// Cancelar antigo
db.prepare('UPDATE lancamentos SET status = ?, motivo_cancelamento = ? WHERE id = ?')
  .run('cancelado', 'Hash inválido - substituído por lc_novo', 'lc_invalid_001');
```

---

## ✅ MATRIZ DE DECISÃO

### Quando Classificar como Cada Tipo

| Situação | Tipo | Conta | Motivo |
|----------|------|-------|--------|
| Receita de aluguel no dia combinado | RECEITA | 4.1.1 | Fluxo normal |
| Aluguel atrasado recebido após atraso | RECEITA | 4.1.2 | Diferencia fluxo prejudicado |
| Juros de mora recebidos | RECEITA | 4.2.1 | Receita acessória |
| Débito de IPTU | DESPESA | 5.1.1 | Imposto predial |
| Débito de condomínio | DESPESA | 5.1.2 | Despesa operacional |
| Reforma/manutenção > R$100 | DESPESA | 5.1.4 | Não é consumível diário |
| Taxa bancária | DESPESA | 5.3.3 | Despesa financeira |
| Transferência interna entre contas | TRANSFERENCIA | 1.1.1↔1.1.2 | Movimento de caixa |
| Ajuste de arredondamento | AJUSTE | Conf. contexto | Normalização contábil |

---

## 📋 CONCLUSÃO

O sistema de reconstrução contábil é capaz de:

✅ Reconciliar múltiplas fontes de dados  
✅ Detectar duplicatas automaticamente  
✅ Gerar lançamentos com rastreabilidade 100%  
✅ Validar tudo para perícia judicial  
✅ Apresentar pendências de forma clara  
✅ Fechar períodos com segurança  
✅ Gerar relatórios auditáveis  

**Zero tolerância de erros conquistada!**
