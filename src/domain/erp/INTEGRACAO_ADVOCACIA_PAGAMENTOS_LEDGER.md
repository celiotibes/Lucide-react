# Integração Advocacia e Pagamentos com Ledger

Este documento descreve a integração entre os módulos de advocacia e pagamentos com o sistema de ledger contábil centralizado.

## Visão Geral

### Objetivo
Sincronizar automaticamente despesas legais (advocacia) e pagamentos confirmados com o ledger contábil, garantindo que:
- Despesas legais apareçam na DRE (Demonstração de Resultado do Exercício)
- Pagamentos confirmados atualizem corretamente o fluxo de caixa
- Provisões de processos legais com risco elevado sejam registradas
- Rastreamento completo de provenance para auditoria

### Arquitetura

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Advocacia     │         │   Pagamentos     │         │    Ledger       │
│   (Processos)   │         │   (Confirmados)  │         │   (Contábil)    │
└────────┬────────┘         └─────────┬────────┘         └────────┬────────┘
         │                            │                            │
         └────────────┬───────────────┘                            │
                      │                                            │
              ┌───────▼─────────────────────────────────────────────┐
              │  Integração com Ledger (este documento)            │
              │  - Mapeamento de contas contábeis                  │
              │  - Hash de provenance (evita duplicação)           │
              │  - Rastreamento de tentativas                      │
              │  - Sincronização (automática ou manual)            │
              └────────────────────────────────────────────────────┘
```

## PARTE 1: Integração de Advocacia

### Fluxo de Sincronização de Despesas Legal

1. **Registrar Despesa Legal** (`registrarDespesaLegal`)
   - Insere em `despesas_legais` com `origem_modulo='advocacia'` e `tentativas=0`
   - Opcionalmente, chama sincronização com ledger

2. **Sincronizar com Ledger** (`registrarDespesaLegalNoLedger`)
   - Validar dados da despesa
   - Gerar hash de provenance (evita duplicação)
   - Registrar lançamento contábil dupla entrada:
     - **Débito**: Conta de despesa específica (6.3.01, 6.3.02, etc.)
     - **Crédito**: Contas a Pagar (3.1.02)
   - Atualizar `despesas_legais.ledger_entry_id` com ID do lançamento
   - Registrar sincronização bem-sucedida em `sincronizacoes_advocacia_ledger`

3. **Processar em Lote** (`sincronizarDespesasAdvocaciaParaLedger`)
   - Encontra todas as despesas com `ledger_entry_id IS NULL`
   - Sincroniza até 100 por vez (limite configurável)
   - Incrementa `tentativas` em cada execução
   - Desiste após 3 tentativas falhas

### Mapeamento de Despesas para Contas Contábeis

| Tipo de Despesa | Conta Débito | Conta Crédito | Descrição |
|-----------------|--------------|---------------|-----------|
| Honorários Advocatícios | 6.3.01 | 3.1.02 | Despesa com Honorários Advocatícios |
| Custas Judiciais | 6.3.02 | 3.1.02 | Despesa com Custas Judiciais |
| Perícia | 6.3.03 | 3.1.02 | Despesa com Perícia |
| Outro | 6.3.04 | 3.1.02 | Outras Despesas com Processos Legais |

### Provisão de Processos Legais

A provisão é calculada automaticamente para processos com risco > "baixo":

```typescript
const MAPEAMENTO_RISCO = {
  'baixo': 0.0,      // Sem provisionamento
  'médio': 0.25,     // 25% do valor da causa
  'alto': 0.5,       // 50% do valor da causa
  'crítico': 0.75    // 75% do valor da causa
};

// Exemplo: Processo com valor R$ 100.000 e risco ALTO
// Provisão = 100.000 * 0.5 = R$ 50.000
```

**Lançamento Contábil da Provisão:**
- **Débito**: 6.4.01 (Provisão para Processos Legais)
- **Crédito**: 3.1.01 (Provisão para Riscos Legais)

### Uso

```typescript
import {
  registrarDespesaLegalNoLedger,
  registrarProvisoesProcessos,
  sincronizarDespesasAdvocaciaParaLedger,
} from './advocacia-ledger-integration';

// Sincronizar uma despesa específica
const resultado = registrarDespesaLegalNoLedger(db, despesaId, {
  processo_id: 123,
  entidade_id: 1,
  periodo_id: 5,
  data_lancamento: '2026-01-20',
  tipo_despesa: 'honorarios_advocaticios',
  valor_despesa: 2000,
  descricao: 'Honorários janeiro',
  beneficiario: 'Advogado Silva',
  referencia_documento: 'HON_001'
});

// Sincronizar provisões do período
const prov = registrarProvisoesProcessos(db, entidade_id, periodo_id);
console.log(`Processados: ${prov.processados}, Sucessos: ${prov.sucessos}`);

// Sincronizar todas as despesas pendentes
const sync = sincronizarDespesasAdvocaciaParaLedger(db, entidade_id, periodo_id);
```

## PARTE 2: Integração de Pagamentos

### Fluxo de Sincronização de Pagamentos

1. **Confirmar Pagamento** (`confirmarPagamento`)
   - Atualiza status para 'pago' com `data_conclusao`
   - Opcionalmente, sincroniza imediatamente com ledger

2. **Sincronizar com Ledger** (`registrarLancamentoPagamento`)
   - Validar dados do pagamento
   - Gerar hash de provenance (evita duplicação)
   - Registrar lançamento contábil dupla entrada:
     - **Débito**: Conta específica do tipo de pagamento
     - **Crédito**: Caixa (1.1.01)
   - Atualizar `pagamentos.ledger_entry_id` com ID do lançamento
   - Registrar sincronização bem-sucedida em `sincronizacoes_pagamentos_ledger`

3. **Processar em Lote** (`sincronizarPagamentosParaLedger`)
   - Encontra todos os pagamentos com status 'pago' e `ledger_entry_id IS NULL`
   - Sincroniza até 100 por vez (limite configurável)
   - Incrementa `tentativas` em cada execução
   - Desiste após 3 tentativas falhas

### Mapeamento de Tipos de Pagamento para Contas Contábeis

| Tipo de Pagamento | Conta Débito | Conta Crédito | Descrição |
|-------------------|--------------|---------------|-----------|
| Remuneração Pessoal | 3.1.05 | 1.1.01 | Remuneração a Pagar / Caixa |
| Fornecedor | 3.1.02 | 1.1.01 | Contas a Pagar / Caixa |
| Serviço | 3.1.02 | 1.1.01 | Contas a Pagar / Caixa |
| Despesa Operacional | 6.2.01 | 1.1.01 | Despesa Operacional / Caixa |
| Aluguel | 6.1.01 | 1.1.01 | Despesa com Aluguel / Caixa |
| Utilidade | 6.2.02 | 1.1.01 | Despesa com Utilidades / Caixa |
| Outro | 3.1.02 | 1.1.01 | Contas a Pagar / Caixa (padrão) |

### Uso

```typescript
import {
  registrarLancamentoPagamento,
  sincronizarPagamentoImediato,
  sincronizarPagamentosParaLedger,
  obterMapeamentoPagamento,
} from './pagamentos-ledger-integration';

// Sincronizar pagamento específico imediatamente
const resultado = sincronizarPagamentoImediato(
  db,
  paymentId,
  entidade_id,
  periodo_id
);

// Sincronizar pagamento com dados
const sync = registrarLancamentoPagamento(db, paymentId, {
  entidade_id: 1,
  periodo_id: 5,
  valor: 3000,
  tipo_pagamento: 'servico',
  metodo_pagamento: 'transferencia',
  beneficiario: 'Empresa X',
  referencia: 'SERV_001',
  descricao: 'Pagamento de serviço',
  data_conclusao: '2026-01-25'
});

// Sincronizar pagamentos em lote
const batch = sincronizarPagamentosParaLedger(db, entidade_id, periodo_id, 100);
console.log(`Processados: ${batch.processados}, Sucessos: ${batch.sucessos}`);
```

## Estrutura de Dados

### Tabela: `sincronizacoes_advocacia_ledger`

```sql
CREATE TABLE sincronizacoes_advocacia_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  despesa_legal_id INTEGER,          -- Referência à despesa (nullable para provisões)
  processo_id INTEGER,               -- Referência ao processo
  ledger_entry_id INTEGER NOT NULL,  -- ID do lançamento no ledger
  tipo_registro TEXT NOT NULL,       -- 'despesa_legal' ou 'provisao_processo'
  tipo_despesa TEXT NOT NULL,        -- Tipo específico (honorarios, custas, etc)
  origem_modulo TEXT DEFAULT 'advocacia',
  status TEXT NOT NULL,              -- 'sucesso', 'erro', 'duplicado'
  hash_provenance TEXT NOT NULL UNIQUE,  -- Hash para evitar duplicação
  mensagem_erro TEXT,                -- Se status='erro'
  tentativas INTEGER DEFAULT 1,      -- Número de tentativas
  criado_em TEXT NOT NULL
);
```

### Tabela: `sincronizacoes_pagamentos_ledger`

```sql
CREATE TABLE sincronizacoes_pagamentos_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT NOT NULL UNIQUE,   -- ID do pagamento
  ledger_entry_id INTEGER,           -- ID do lançamento no ledger
  tipo_pagamento TEXT NOT NULL,      -- Tipo do pagamento
  valor REAL NOT NULL,               -- Valor sincronizado
  status TEXT NOT NULL,              -- 'sucesso', 'erro', 'duplicado'
  hash_provenance TEXT NOT NULL UNIQUE,  -- Hash para evitar duplicação
  mensagem_erro TEXT,                -- Se status='erro'
  tentativas INTEGER DEFAULT 1,      -- Número de tentativas
  criado_em TEXT NOT NULL
);
```

### Alterações em Tabelas Existentes

**`despesas_legais`** - Novas colunas:
- `origem_modulo TEXT DEFAULT 'advocacia'` - Rastreamento de origem
- `ledger_entry_id INTEGER` - Referência para o lançamento contábil
- `tentativas INTEGER DEFAULT 0` - Contador de tentativas de sincronização

**`pagamentos`** - Novas colunas:
- `ledger_entry_id INTEGER` - Referência para o lançamento contábil
- `tentativas INTEGER DEFAULT 0` - Contador de tentativas de sincronização

## Rastreamento e Auditoria

### Hash de Provenance
Ambas as integrações usam hash SHA-256 para evitar processamento duplicado:

```typescript
// Advocacia
const hashProvenance = gerarHashProvenance(
  despesaLegalId,
  tipoDespesa,
  valor,
  dataLancamento
);

// Pagamentos
const hashProvenance = gerarHashProvenance(
  paymentId,
  valor,
  dataConfirmacao
);
```

### Rastreamento de Tentativas
- Cada falha incrementa o contador `tentativas`
- Desistência após 3 tentativas
- Logs detalhados em `sincronizacoes_*_ledger.mensagem_erro`

## Relatórios

### Advocacia
```typescript
const relatorio = gerarRelatorioSincronizacaoAdvocacia(db, entidadeId, periodoId);
// Retorna:
// - total_processados
// - despesas_sincronizadas
// - provisoes_registradas
// - sucessos / erros / duplicados
// - ultimos_30_dias (últimas 50 sincronizações)
```

### Pagamentos
```typescript
const relatorio = gerarRelatorioSincronizacaoPagamentos(db, entidadeId, periodoId);
// Retorna:
// - total_processados
// - pagamentos_sincronizados
// - valor_total_sincronizado
// - sucessos / erros / duplicados
// - ultimos_30_dias (últimas 50 sincronizações)
```

## Verificação de Integridade

```typescript
import { verificarStatusMigracao } from './migracao-advocacia-pagamentos-ledger';

const status = verificarStatusMigracao(db);
// Verifica:
// - Tabelas de sincronização existem
// - Colunas necessárias foram adicionadas
// - Contas contábeis estão criadas
```

## Impacto na DRE e Fluxo de Caixa

### Despesas Legais (Advocacia)
- Aparecem como **Despesas Operacionais** (6.3.xx)
- Reduzem o resultado do exercício
- Aumentam **Contas a Pagar** (3.1.02) no passivo

### Provisões
- Aparecem como **Despesas Operacionais** (6.4.01)
- Reduzem o resultado do exercício
- Aparecem como **Provisão para Riscos** (3.1.01) no passivo
- Reversão ocorre ao final do processo (caso ganhado) ou conclusão

### Pagamentos
- Reduzem **Caixa** (1.1.01) no ativo
- Afetam contas específicas (remuneração, despesa, etc)
- Podem reduzir contas a pagar quando pagam dívidas
- Atualizam fluxo de caixa em tempo real

## Testes

Testes unitários e de integração estão em:
- `src/domain/erp/__tests__/advocacia-ledger-integration.test.ts`
- `src/domain/erp/__tests__/pagamentos-ledger-integration.test.ts`

Executar:
```bash
npm test advocacia-ledger-integration
npm test pagamentos-ledger-integration
```

## Troubleshooting

| Problema | Causa | Solução |
|----------|-------|---------|
| Despesa não aparece em DRE | `ledger_entry_id` é NULL | Executar `sincronizarDespesasAdvocaciaParaLedger()` |
| Pagamento duplicado no ledger | Hash não foi verificado | Verificar `sincronizacoes_pagamentos_ledger` para duplicado |
| Saldo errado após sincronização | Dupla entrada incompleta | Verificar `ledger_entries` para lançamentos orfãos |
| Provisão não foi calculada | Processo com risco baixo | Provisões são geradas apenas para risco >= médio |

## Migrations

Executar migração:
```typescript
import { migrarAdvocaciaEPagamentosParaLedger } from './migracao-advocacia-pagamentos-ledger';

const resultado = migrarAdvocaciaEPagamentosParaLedger(db);
console.log('Tabelas criadas:', resultado.tabelas_criadas);
console.log('Colunas adicionadas:', resultado.colunas_adicionadas);
console.log('Contas criadas:', resultado.contas_criadas);
```
