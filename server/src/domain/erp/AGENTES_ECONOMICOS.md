# Sistema de Agentes Econômicos (Pessoas Físicas e Jurídicas)

## Visão Geral

O sistema de agentes econômicos implementa um registro unificado de pessoas física e jurídica que participam da organização financeira, imobiliária e comercial.

**Objetivos:**
- Centralizar gestão de CPF/CNPJ
- Eliminar duplicatas de entidades
- Rastrear validações e verificações
- Suportar múltiplos papéis por agente
- Compatibilidade com PostgreSQL e SQLite

## Tabelas Principais

### 1. `agentes_economicos`

Registro principal de todas as pessoas econômicas.

**Campos principais:**
- `id` (UUID): Identificador único
- `tipo_entidade`: `pessoa_fisica` ou `pessoa_juridica`
- `cpf_cnpj`: Identificador tributário (único)
- `nome`: Nome completo ou razão social
- `papel`: Papel na organização (tenant, supplier, provider, legal_party, co_owner, borrower, lender)
- `ativo`: Se o agente está ativo no sistema
- `validado`: Se passou por validação

**Campos de auditoria:**
- `criado_em`, `criado_por`: Timestamp e usuário de criação
- `atualizado_em`, `atualizado_por`: Timestamp e usuário de última atualização
- `validado_em`, `validado_por`: Timestamp e usuário de validação

**Índices:**
- Único em `cpf_cnpj` (previne duplicatas)
- Em `papel` (para filtros por papel)
- Em `ativo` (para agentes ativos)
- Em `criado_em` (para ordenação)

### 2. `agentes_papeis`

Define papéis disponíveis com suas permissões.

**Campos:**
- `id` (UUID): Identificador único
- `chave`: Identificador textual (tenant, supplier, etc)
- `nome`: Nome descritivo do papel
- `permissoes`: JSON com permissões (ler, escrever, aprovar, deletar)
- `ativo`: Se o papel está em uso

### 3. `agentes_validacoes`

Auditoria de todas as validações executadas sobre agentes.

**Tipos de validação:**
- `cpf_cnpj`: Validação de formato e dígitos verificadores
- `email`: Validação de email
- `telefone`: Validação de telefone
- `endereco`: Validação de endereço completo
- `regime_tributario`: Validação de regime tributário
- `classificacao_nfse`: Validação de código de serviço NFS-e
- `documental`: Validação de documentos (RG, IE, etc)
- `financeira`: Validação de histórico financeiro
- `manual`: Validação manual por usuário

**Resultados:**
- `aprovado`: Validação passou
- `rejeitado`: Validação falhou
- `pendente`: Validação em progresso

### 4. `agentes_duplicatas_suspeitas`

Registro e análise de possíveis duplicatas.

**Motivos:**
- `cpf_cnpj_similar`: CPF/CNPJ parecidos
- `nome_similar`: Nomes parecidos (similaridade > 80%)
- `email_identico`: Mesmo email
- `telefone_identico`: Mesmo telefone
- `endereco_identico`: Mesmo endereço
- `dados_conflitantes`: Dados conflitantes entre agentes

**Score:** 0-100, onde >= 80 indica duplicata suspeita

### 5. `agentes_vinculacoes`

Vinculações entre agentes e outras entidades do sistema.

**Tipos de vinculação:**
- `propriedade`: Properties (imóveis)
- `contrato_locacao`: Contratos de locação
- `contrato_prestacao`: Contratos de prestação de serviços
- `contrato_financeiro`: Contratos financeiros (empréstimos)
- `pagamento`: Transações de pagamento
- `recebimento`: Transações de recebimento
- `nota_fiscal`: Notas fiscais e NFS-e

## Regras de Negócio

### Pessoa Física (PF)

**Requisitos:**
- CPF com 11 dígitos
- Nome completo
- Nome da mãe (obrigatório para documentação)
- Opcional: RG (inscricao_estadual)

**Papéis típicos:**
- `tenant`: Inquilino
- `co_owner`: Co-proprietário
- `borrower`: Devedor
- `lender`: Credor

### Pessoa Jurídica (PJ)

**Requisitos:**
- CNPJ com 14 dígitos
- Razão social
- Nome fantasia (obrigatório)
- Regime tributário
- Opcional: IE (inscricao_estadual), IM (inscricao_municipal)

**Papéis típicos:**
- `supplier`: Fornecedor
- `provider`: Prestador de serviços
- `legal_party`: Parte legal/Advogado
- `co_owner`: Co-proprietário

## Validação

### Validação de CPF

```typescript
import { isValidCPF, formatCPF } from "./agentes-tipos";

const cpf = "12345678900";
if (isValidCPF(cpf)) {
  console.log(formatCPF(cpf)); // 123.456.789-00
}
```

Implementa algoritmo de dígitos verificadores conforme Receita Federal.

### Validação de CNPJ

```typescript
import { isValidCNPJ, formatCNPJ } from "./agentes-tipos";

const cnpj = "12345678000199";
if (isValidCNPJ(cnpj)) {
  console.log(formatCNPJ(cnpj)); // 12.345.678/0001-99
}
```

Implementa algoritmo de dígitos verificadores conforme Receita Federal.

### Validação de Schemas Zod

```typescript
import { AgenteEconomicoSchema } from "./agentes-tipos";

const agente = {
  tipo_entidade: "pessoa_juridica",
  cpf_cnpj: "12345678000199",
  nome: "Empresa LTDA",
  nome_fantasia: "Empresa",
  papel: "supplier",
};

try {
  const validado = AgenteEconomicoSchema.parse(agente);
} catch (error) {
  console.error(error.issues);
}
```

## Detecção de Duplicatas

### Cálculo de Score

O sistema calcula automaticamente um score de duplicata (0-100):

- **CPF/CNPJ idêntico:** 40 pontos
- **Nome similar (Levenshtein):** até 30 pontos
- **Email idêntico:** 20 pontos
- **Telefone idêntico:** 10 pontos
- **Endereço idêntico:** até 20 pontos (adicional)

**Threshold:** Score >= 80 indica duplicata suspeita

### Exemplo de Cálculo

```typescript
import { calculateDuplicataScore } from "./agentes-tipos";

const agente1: AgenteEconomico = { /* ... */ };
const agente2: AgenteEconomico = { /* ... */ };

const score = calculateDuplicataScore(agente1, agente2);
if (score >= 80) {
  // Registrar como duplicata suspeita
  console.log(`Duplicata suspeita com score ${score}`);
}
```

## Operações Comuns

### Criar Agente

```typescript
import { CriarAgenteEconomicoSchema } from "./agentes-tipos";

const novoAgente = CriarAgenteEconomicoSchema.parse({
  tipo_entidade: "pessoa_juridica",
  cpf_cnpj: "12345678000199",
  nome: "Empresa LTDA",
  nome_fantasia: "Empresa",
  papel: "supplier",
  email: "contato@empresa.com",
  regime_tributario: "lucro_real",
  ativo: true,
  criado_por: "user-uuid",
  atualizado_por: "user-uuid",
});
```

### Buscar Agente por CPF/CNPJ

```sql
SELECT * FROM agentes_economicos 
WHERE cpf_cnpj = '12345678000199' AND ativo = true;
```

### Listar Fornecedores/Prestadores

```sql
SELECT * FROM agentes_economicos 
WHERE papel IN ('supplier', 'provider') 
  AND ativo = true
ORDER BY nome;
```

### Verificar Duplicatas

```sql
SELECT * FROM agentes_duplicatas_suspeitas 
WHERE status = 'pendente' 
  AND score >= 80
ORDER BY score DESC;
```

### Registrar Validação

```typescript
import { ValidacaoAgenteSchema, TipoValidacao, ResultadoValidacao } from "./agentes-tipos";

const validacao = ValidacaoAgenteSchema.parse({
  agente_id: "uuid-agente",
  tipo_validacao: TipoValidacao.CPF_CNPJ,
  resultado: ResultadoValidacao.APROVADO,
  executado_por: "user-uuid",
});

// INSERT INTO agentes_validacoes (...) VALUES (...)
```

## Integração com Outras Tabelas

### Proprietários (Properties)

```sql
-- Vinculação: Agente como proprietário
INSERT INTO agentes_vinculacoes (agente_id, tipo_vinculacao, entidade_id, tipo_relacionamento)
VALUES ('uuid-agente', 'propriedade', 'uuid-propriedade', 'proprietario');
```

### Inquilinos (Contratos de Locação)

```sql
-- Vinculação: Agente como inquilino
INSERT INTO agentes_vinculacoes (agente_id, tipo_vinculacao, entidade_id, tipo_relacionamento)
VALUES ('uuid-agente', 'contrato_locacao', 'uuid-contrato', 'inquilino');
```

### Fornecedores (Contas a Pagar)

```sql
-- Vinculação: Agente como fornecedor
INSERT INTO agentes_vinculacoes (agente_id, tipo_vinculacao, entidade_id, tipo_relacionamento)
VALUES ('uuid-agente', 'pagamento', 'uuid-pagamento', 'fornecedor');
```

## Views Úteis

### Agentes com Validação Recente

```sql
SELECT * FROM agentes_com_validacao_recente 
WHERE rn = 1  -- Apenas a validação mais recente
  AND tipo_entidade = 'pessoa_juridica';
```

### Agentes Duplicados por CPF/CNPJ

```sql
SELECT * FROM agentes_duplicados_por_cpf 
ORDER BY quantidade_duplicatas DESC;
```

### Estatísticas de Agentes

```sql
SELECT * FROM agentes_estatisticas 
WHERE total > 0;
```

## Funções Utilitárias

### Formatação

```typescript
import { formatCPF, formatCNPJ, formatCPFCNPJ } from "./agentes-tipos";

// CPF
formatCPF("12345678900");    // "123.456.789-00"

// CNPJ
formatCNPJ("12345678000199"); // "12.345.678/0001-99"

// Auto-detecta tipo
formatCPFCNPJ("12345678900");    // "123.456.789-00"
formatCPFCNPJ("12345678000199"); // "12.345.678/0001-99"
```

### Limpeza

```typescript
import { cleanCPFCNPJ, detectTipoEntidade } from "./agentes-tipos";

const cpfLimpo = cleanCPFCNPJ("123.456.789-00");  // "12345678900"
const tipo = detectTipoEntidade("12345678900");    // PESSOA_FISICA
```

### Similaridade

```typescript
import { calculateSimilarity } from "./agentes-tipos";

const score = calculateSimilarity("Empresa LTDA", "Empresa Ltda."); // ~95
```

## Migrações

### PostgreSQL

- Arquivo: `migrations-phase18-agentes-economicos.sql`
- Recursos: Gen_random_uuid, JSONB, CHECK constraints
- Compatibilidade: PostgreSQL 10+

### SQLite

- Arquivo: `migrations-phase18-agentes-economicos-sqlite.sql`
- Adaptações: TEXT para UUID, JSON em texto, CHECK constraints
- Compatibilidade: SQLite 3.8.0+

## Auditoria

Todas as operações são rastreadas:

- **Criação:** `criado_por`, `criado_em`
- **Atualização:** `atualizado_por`, `atualizado_em`
- **Validação:** `validado_por`, `validado_em`
- **Análise de duplicata:** `analisado_por`, `analisado_em`

## Perguntas Frequentes

**P: Posso ter um agente com múltiplos papéis?**
R: Atualmente, um agente tem um papel principal. Para suportar múltiplos papéis, seria necessário criar uma tabela de relacionamento `agentes_papeis_assigments`.

**P: Como atualizo um agente existente?**
R: Use `AtualizarAgenteEconomicoSchema.parse()` e execute UPDATE. O sistema registra `atualizado_por` e `atualizado_em`.

**P: O que fazer quando duplicatas são confirmadas?**
R: Registre em `agentes_duplicatas_suspeitas` com `status = 'confirmada'` e considere mesclar os registros (status = 'mesclada').

**P: Como validar documentos (RG/CNPJ)?**
R: Crie um registro em `agentes_validacoes` com `tipo_validacao = 'documental'` e anexe detalhes em `detalhes` (JSON).

## Roadmap

- [ ] Suporte a múltiplos papéis por agente
- [ ] Integração com API da Receita Federal
- [ ] Validação de endereço via CEP
- [ ] Score de confiabilidade do agente
- [ ] Histórico de relacionamentos
- [ ] Dashboard de duplicatas
- [ ] Export de dados tributários
