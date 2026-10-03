# Validação de Período Fechado e Mecanismo de Reversão

## Objetivo

Implementar duas funcionalidades críticas para integridade contábil:

1. **Validação de Período Fechado**: Bloquear adição de lançamentos em períodos já encerrados
2. **Mecanismo de Reversão para Retificações**: Corrigir valores sem duplicação no ledger

---

## PARTE 1: Validação de Período Fechado

### O Problema

Antes dessa implementação:
- Usuários podiam adicionar lançamentos retroativamente em períodos já fechados
- Isso violava a integridade contábil (períodos fechados devem ser imutáveis)
- Não havia proteção após `encerrarPeriodo()`

### A Solução

Arquivo: `ledger-period-validation.ts`

**Três funções principais:**

#### 1. `validarPeriodoAberto(db, periodo_id)`
Retorna: `{ aberto: boolean, periodo?: {...}, erro?: string }`

```typescript
const validacao = validarPeriodoAberto(db, periodo_id);
if (!validacao.aberto) {
  console.log(validacao.erro); // "Período 2025/12 está fechado"
}
```

#### 2. `assegurarPeriodoAberto(db, periodo_id)`
Lança exceção `PeriodoFechadoError` se período estiver fechado.

```typescript
try {
  assegurarPeriodoAberto(db, periodo_id);
  // Período está aberto, pode prosseguir
} catch (error) {
  if (error instanceof PeriodoFechadoError) {
    // Período está fechado - mostrar mensagem ao usuário
    console.error(error.message);
  }
}
```

#### 3. `obterDescricaoPeriodo(db, periodo_id)`
Retorna string formatada: `"Janeiro/2025 [ABERTO]"` ou `"Dezembro/2024 [FECHADO]"`

### Integração com `registrarLancamentoContabil()`

A função foi modificada para SEMPRE validar o período ANTES do INSERT:

```typescript
export function registrarLancamentoContabil(
  db: Database,
  lancamento: LancamentoContabil,
): number {
  // VALIDAÇÃO 1: Verificar se período está aberto
  assegurarPeriodoAberto(db, lancamento.periodo_id);
  
  // ... resto do código
}
```

**Fluxo de execução:**

1. Usuário tenta registrar lançamento → `registrarLancamentoContabil()`
2. Primeira coisa: valida período
3. Se fechado → lança `PeriodoFechadoError` com mensagem clara
4. Se aberto → continua com INSERT normalmente

### Mensagem de Erro ao Usuário

```
Período Janeiro/2025 está fechado. Impossível adicionar lançamentos.
Somente operações de auditoria são permitidas.
```

### Teste de Cobertura

```typescript
it("deve bloquear registro em período fechado", () => {
  // Fechar período
  encerrarPeriodo(db, periodo_id, 1, "Teste");

  // Tentar registrar em período fechado
  expect(() => {
    registrarLancamentoContabil(db, {...});
  }).toThrow(PeriodoFechadoError);
});
```

---

## PARTE 2: Mecanismo de Reversão para Retificações

### O Problema

Antes dessa implementação:
- Retificações duplicavam valores no ledger
- Exemplo: Apontamento original de R$ 210 → corrigir para R$ 250 resultava em:
  - Débito: 210 (original) + 250 (novo) = 460 ❌ ERRADO
  - Correto seria: 250

### A Solução

Função: `registrarRetificacao(db, retificacao)`

**Fluxo de reversão:**

1. **PASSO 1**: Encontrar lançamento original
   - Exemplo: Débito de 210

2. **PASSO 2**: Criar lançamento REVERSO (inverte débito ↔ crédito)
   - Original: `Débito 210`
   - Reverso: `Crédito 210` (anula o débito original)

3. **PASSO 3**: Registrar novo lançamento com valor correto
   - Novo: `Débito 250`

4. **RESULTADO FINAL**: 210 - 210 + 250 = **250** ✓ CORRETO

### Interface `RetificacaoContabil`

```typescript
interface RetificacaoContabil {
  apontamento_id?: number;
  retificacao_id?: number;
  conta_id: number;
  valor_anterior: number;      // 210
  valor_novo: number;          // 250
  entidade_id: number;
  periodo_id: number;
  data_lancamento: string;
  origem_modulo: '...' | 'apontamento-prestador';
  motivo_retificacao: string;  // "Ajuste de remuneração"
  retificada_por: number;      // usuario_id
}
```

### Exemplo de Uso

```typescript
import { registrarRetificacao } from './ledger';

const resultado = registrarRetificacao(db, {
  retificacao_id: 100,
  apontamento_id: 5,
  conta_id: 123,
  valor_anterior: 210.00,
  valor_novo: 250.00,
  entidade_id: 1,
  periodo_id: 2,
  data_lancamento: '2026-01-10',
  origem_modulo: 'apontamento-prestador',
  motivo_retificacao: 'Correção de horas trabalhadas',
  retificada_por: 1,
});

if (resultado.sucesso) {
  console.log(`✓ Retificação: R$${valor_anterior} → R$${valor_novo}`);
  console.log(`  Lançamento reverso ID: ${resultado.ledger_reverso_id}`);
  console.log(`  Novo lançamento ID: ${resultado.ledger_novo_id}`);
} else {
  console.error(`✗ ${resultado.mensagem}`);
}
```

### Rastreamento: Tabela `retificacao_ledger_mapping`

Cada retificação cria registros em 3 entradas:

**Tabela `ledger_entries`:**
```
ID | Origem | Descrição | Débito | Crédito
1  | APT-001| Original  | 210    | NULL
2  | RETIF-REVERSO | Anula original | NULL | 210
3  | RETIF-001 | Novo valor | 250 | NULL
```

**Tabela `retificacao_ledger_mapping`:**
```
retificacao_id | ledger_entry_reverso_id | ledger_entry_novo_id | criado_em
100            | 2                       | 3                    | 2026-01-16
```

### Validações Aplicadas

1. **Período deve estar aberto** (antes de qualquer lançamento)
2. **Conta deve existir**
3. **Entidade deve existir**
4. **Valores devem ser positivos** (validação contábil)

### Tratamento de Erros

```typescript
{
  sucesso: false,
  mensagem: "Período Janeiro/2025 está fechado. Impossível adicionar lançamentos."
}
```

---

## Dados de Teste

### Cenário 1: Validação de Período Fechado

**Setup:**
- Criar período aberto
- Registrar lançamento simples → ✓ Sucesso
- Fechar período
- Tentar registrar outro lançamento → ✗ `PeriodoFechadoError`

**Resultado Esperado:**
```
✓ Lançamento em período aberto: ID 1
✗ Erro ao tentar período fechado: "Período janeiro/2025 está fechado..."
```

### Cenário 2: Retificação com Reversão

**Setup:**
- Período: janeiro/2025 (aberto)
- Conta: 5.1.01 (Remuneração)
- Apontamento original: R$ 210,00 (débito)

**Operação:**
```typescript
// Registrar original
registrarLancamentoContabil(db, {
  conta_id: 123,
  valor_debito: 210,
  descricao: "Apontamento original",
  origem_modulo: "apontamento-prestador",
  // ...
});

// Retificar para 250
registrarRetificacao(db, {
  valor_anterior: 210,
  valor_novo: 250,
  motivo_retificacao: "Ajuste de horas",
  // ...
});
```

**Resultado no Ledger:**
- Lançamento 1: Débito 210 (original)
- Lançamento 2: Crédito 210 (reverso)
- Lançamento 3: Débito 250 (novo)
- **Saldo final: 250** ✓

**Não Duplicado:**
- ❌ Errado: 210 + 250 = 460
- ✓ Correto: 210 - 210 + 250 = 250

---

## Impacto no Restante do Sistema

### Módulos Afetados

1. **`apontamento-prestador.ts`**
   - Ao registrar retificação, usar `registrarRetificacao()`
   - Passou a suportar `origem_modulo: 'apontamento-prestador'`

2. **API/Controllers**
   - Catch `PeriodoFechadoError` e retornar HTTP 400/403
   - Mensagem clara ao usuário

3. **UI/Frontend**
   - Desabilitar botão "Adicionar lançamento" se período fechado
   - Mostrar badge [FECHADO] no período

### Exemplo: Handler HTTP

```typescript
POST /api/lancamentos
{
  "periodo_id": 2,
  "conta_id": 123,
  "valor_debito": 1000,
  // ...
}

// Resposta se período fechado:
{
  "erro": "PeriodoFechadoError",
  "mensagem": "Período Janeiro/2025 está fechado. Impossível adicionar lançamentos.",
  "status": 403
}
```

---

## Migração SQL

**Arquivo:** `server/migrations/002_retificacao_ledger_mapping.sql`

Cria tabela `retificacao_ledger_mapping` com:
- Referências para ledger_entries (reverso e novo)
- Índices para performance
- Comentários de auditoria

---

## Testes Unitários

**Arquivo:** `__tests__/ledger-period-validation.test.ts`

**Cobertura:**
1. ✓ Validação de período aberto vs fechado
2. ✓ PeriodoFechadoError com mensagem correta
3. ✓ Descrição formatada do período
4. ✓ Bloqueio de registro em período fechado
5. ✓ Retificação com reversão (débito e crédito)
6. ✓ Rastreamento em `retificacao_ledger_mapping`
7. ✓ Bloqueio de retificação em período fechado
8. ✓ Mensagens de retificação corretas

---

## Checklist de Implementação

- [x] Criar `ledger-period-validation.ts`
- [x] Validar período antes de INSERT em `registrarLancamentoContabil()`
- [x] Criar `registrarRetificacao()` com mecanismo de reversão
- [x] Criar tabela `retificacao_ledger_mapping`
- [x] Testes de validação de período fechado
- [x] Testes de retificação com reversão
- [x] Tratar erros de período fechado
- [x] Documentação completa (este arquivo)

---

## Próximos Passos

1. **Integração UI**
   - Mostrar status do período (aberto/fechado)
   - Desabilitar formulário de lançamentos se fechado
   - Botão "Retificar" para apontamentos incorretos

2. **Integração com apontamento-prestador**
   - Ao corrigir valor de apontamento, chamar `registrarRetificacao()`
   - Guardar referência no histórico

3. **Auditoria**
   - Relatório de retificações por período
   - Rastreamento de quem fez cada retificação

4. **Performance**
   - Verificar índices em `retificacao_ledger_mapping`
   - Considerar cache de períodos abertos/fechados

---

## Referências

- `src/domain/erp/ledger.ts` - Ledger integrado
- `src/domain/erp/ledger-period-validation.ts` - Validação
- `server/migrations/002_retificacao_ledger_mapping.sql` - Schema
- `src/domain/erp/__tests__/ledger-period-validation.test.ts` - Testes
