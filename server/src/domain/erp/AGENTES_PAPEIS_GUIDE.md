# Guia Completo - Sistema de Papéis de Agentes Econômicos

## Índice

1. [Visão Geral](#visão-geral)
2. [Papéis Disponíveis](#papéis-disponíveis)
3. [Requisitos por Papel](#requisitos-por-papel)
4. [Matriz de Permissões](#matriz-de-permissões)
5. [Validações Específicas](#validações-específicas)
6. [Usando a API](#usando-a-api)
7. [Exemplos Práticos](#exemplos-práticos)
8. [Implementação no Código](#implementação-no-código)

## Visão Geral

O sistema de papéis de agentes define os diferentes tipos de atores que podem existir no sistema ERP e suas responsabilidades, requisitos e permissões.

### Características Principais

- **7 papéis predefinidos** com configurações específicas
- **Matriz de permissões** baseada em papel de usuário × papel de agente
- **Validações específicas por papel** (campos obrigatórios, regime tributário)
- **Nível de risco** (baixo, médio, alto) para orientar validações
- **Tipos de transação típicos** por papel
- **Requisitos de documentação** variáveis

## Papéis Disponíveis

### 1. TENANT (Inquilino)

```typescript
PapelAgente.TENANT
```

**Descrição**: Pessoa ou empresa que aluga propriedade ou espaço

**Características**:
- Nível de risco: **BAIXO**
- Requer validação manual: ✓
- Requer documentação: ✓
- Regime tributário padrão: Nenhum (pode ser PF ou PJ)

**Campos Obrigatórios**:
- cpf_cnpj
- nome
- email
- endereco

**Tipos de Transação Típicos**:
- aluguel
- taxa_condominio
- utilidades

**Validações Específicas**:
- Validação de CPF/CNPJ
- Email válido
- Endereço completo

---

### 2. SUPPLIER (Fornecedor)

```typescript
PapelAgente.SUPPLIER
```

**Descrição**: Pessoa ou empresa que fornece produtos ou materiais

**Características**:
- Nível de risco: **MÉDIO**
- Requer validação manual: ✓
- Requer documentação: ✓
- Regime tributário padrão: LUCRO_REAL

**Campos Obrigatórios**:
- cpf_cnpj
- nome
- regime_tributario
- email
- telefone

**Tipos de Transação Típicos**:
- compra
- nota_fiscal_entrada
- devolucao

**Validações Específicas**:
- Regime tributário obrigatório
- Inscrição estadual (se aplicável)
- Dados bancários para pagamento

---

### 3. PROVIDER (Prestador de Serviço)

```typescript
PapelAgente.PROVIDER
```

**Descrição**: Pessoa ou empresa que fornece serviços

**Características**:
- Nível de risco: **BAIXO**
- Requer validação manual: ✗
- Requer documentação: ✗
- Regime tributário padrão: SIMPLES

**Campos Obrigatórios**:
- cpf_cnpj
- nome
- email
- telefone

**Tipos de Transação Típicos**:
- prestacao_servico
- consulta
- manutencao

**Validações Específicas**:
- Telefone obrigatório (contato)
- Classificação NFSe para alguns estados

---

### 4. LEGAL_PARTY (Parte Legal)

```typescript
PapelAgente.LEGAL_PARTY
```

**Descrição**: Advogado, tribunal, ou parte envolvida em processo legal

**Características**:
- Nível de risco: **ALTO**
- Requer validação manual: ✓
- Requer documentação: ✓
- Regime tributário padrão: Nenhum

**Campos Obrigatórios**:
- cpf_cnpj
- nome
- email

**Tipos de Transação Típicos**:
- honorario_advocaticio
- custas_judiciais
- pericia

**Validações Específicas**:
- Verificação de número OAB (se advogado)
- Validação contra banco de dados de órgãos judiciais

---

### 5. CO_OWNER (Co-proprietário)

```typescript
PapelAgente.CO_OWNER
```

**Descrição**: Proprietário conjunto de imóvel ou empresa

**Características**:
- Nível de risco: **ALTO**
- Requer validação manual: ✓
- Requer documentação: ✓
- Regime tributário padrão: LUCRO_REAL

**Campos Obrigatórios**:
- cpf_cnpj
- nome
- email
- endereco
- regime_tributario

**Tipos de Transação Típicos**:
- rateio_despesa
- fundo_reserva
- manutencao_comum

**Validações Específicas**:
- Percentual de participação
- Compatibilidade com escritura

---

### 6. BORROWER (Tomador/Devedor)

```typescript
PapelAgente.BORROWER
```

**Descrição**: Pessoa ou empresa que toma empréstimo

**Características**:
- Nível de risco: **ALTO**
- Requer validação manual: ✓
- Requer documentação: ✓
- Regime tributário padrão: Nenhum

**Campos Obrigatórios**:
- cpf_cnpj
- nome
- email
- endereco

**Tipos de Transação Típicos**:
- amortizacao
- juros
- garantia

**Validações Específicas**:
- Dados bancários para débitos
- Análise de crédito (recomendado)

---

### 7. LENDER (Credor/Financiador)

```typescript
PapelAgente.LENDER
```

**Descrição**: Banco ou instituição financeira que concede empréstimo

**Características**:
- Nível de risco: **MÉDIO**
- Requer validação manual: ✓
- Requer documentação: ✓
- Regime tributário padrão: LUCRO_REAL

**Campos Obrigatórios**:
- cpf_cnpj
- nome
- regime_tributario
- email

**Tipos de Transação Típicos**:
- juros_recebido
- multa
- comissao

**Validações Específicas**:
- Validação contra banco central
- Dados de contato da instituição

## Requisitos por Papel

### Campos Obrigatórios

Cada papel tem um conjunto específico de campos obrigatórios:

```typescript
// Exemplos
TENANT: ["cpf_cnpj", "nome", "email", "endereco"]
SUPPLIER: ["cpf_cnpj", "nome", "regime_tributario", "email", "telefone"]
PROVIDER: ["cpf_cnpj", "nome", "email", "telefone"]
```

### Regime Tributário Padrão

Alguns papéis têm regime tributário padrão:

```typescript
SUPPLIER → LUCRO_REAL
PROVIDER → SIMPLES
CO_OWNER → LUCRO_REAL
LENDER → LUCRO_REAL
```

### Validações Específicas

Diferentes papéis acionam diferentes tipos de validações:

```typescript
// SUPPLIER validações especiais
- inscricao_estadual_se_aplicavel
- dados_bancarios

// PROVIDER validações especiais
- classificacao_nfse

// LEGAL_PARTY validações especiais
- numero_oab_se_advogado
```

## Matriz de Permissões

### Papéis de Usuário

```typescript
enum PapelUsuario {
  SUPER_ADMIN = "super_admin",      // Acesso total
  ADMIN = "admin",                  // Acesso gerencial
  GERENTE = "gerente",              // Acesso operacional
  ANALISTA = "analista",            // Acesso de leitura + ações limitadas
  OPERADOR = "operador",            // Apenas leitura
  VISUALIZADOR = "visualizador",    // Leitura em papéis não críticos
}
```

### Ações Disponíveis

```typescript
enum AcaoPermissao {
  CRIAR = "criar",              // Criar novo agente
  EDITAR = "editar",            // Modificar agente existente
  VISUALIZAR = "visualizar",    // Ler dados do agente
  DELETAR = "deletar",          // Remover agente
  EXPORTAR = "exportar",        // Exportar dados
  VINCULAR = "vincular",        // Vincular a transações
  DESVINCULAR = "desvincular",  // Remover vinculação
  RECONCILIAR = "reconciliar",  // Reconciliar contas
  APROVAR = "aprovar",          // Aprovar agente/transação
  REJEITAR = "rejeitar",        // Rejeitar agente/transação
  ARQUIVAR = "arquivar",        // Arquivar agente
}
```

### Tabela de Permissões

#### SUPPLIER

| Papel de Usuário | Permissões |
|-----------------|-----------|
| SUPER_ADMIN | Todas |
| ADMIN | CRIAR, EDITAR, VISUALIZAR, EXPORTAR, VINCULAR, RECONCILIAR, APROVAR |
| GERENTE | CRIAR, EDITAR, VISUALIZAR, VINCULAR, RECONCILIAR |
| ANALISTA | VISUALIZAR, VINCULAR, EXPORTAR |
| OPERADOR | VISUALIZAR |
| VISUALIZADOR | (nenhuma) |

#### TENANT

| Papel de Usuário | Permissões |
|-----------------|-----------|
| SUPER_ADMIN | Todas |
| ADMIN | CRIAR, EDITAR, VISUALIZAR, EXPORTAR, VINCULAR, RECONCILIAR |
| GERENTE | CRIAR, EDITAR, VISUALIZAR, VINCULAR |
| ANALISTA | VISUALIZAR, VINCULAR |
| OPERADOR | VISUALIZAR |
| VISUALIZADOR | VISUALIZAR |

## Validações Específicas

### Compatibilidade Entidade-Papel

Nem todas as combinações de tipo de entidade (PF/PJ) e papel são válidas:

```typescript
// VÁLIDO
PESSOA_FISICA + TENANT ✓
PESSOA_FISICA + BORROWER ✓
PESSOA_JURIDICA + SUPPLIER ✓
PESSOA_JURIDICA + CO_OWNER ✓
PESSOA_FISICA + CO_OWNER ✓

// INVÁLIDO
PESSOA_JURIDICA + TENANT ✗
PESSOA_FISICA + SUPPLIER ✗
```

### Nível de Risco

Cada papel tem um nível de risco que determina validações adicionais:

- **BAIXO**: TENANT, PROVIDER
- **MÉDIO**: SUPPLIER, LENDER
- **ALTO**: LEGAL_PARTY, CO_OWNER, BORROWER

## Usando a API

### Endpoints Disponíveis

#### 1. Listar Todos os Papéis

```bash
GET /api/v1/agentes-papeis
```

**Resposta**:
```json
{
  "success": true,
  "data": [
    {
      "codigo": "tenant",
      "nome_pt": "Inquilino",
      "descricao_pt": "Pessoa ou empresa que aluga propriedade",
      "campos_obrigatorios": ["cpf_cnpj", "nome", "email", "endereco"],
      "regime_tributario_padrao": null,
      "requer_validacao_manual": true,
      "requer_documentacao": true,
      "nivel_risco": "baixo"
    },
    // ... mais papéis
  ],
  "count": 7
}
```

#### 2. Obter Detalhes de um Papel

```bash
GET /api/v1/agentes-papeis/supplier
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "codigo": "supplier",
    "nome_pt": "Fornecedor",
    "descricao_pt": "Pessoa ou empresa que fornece produtos",
    "campos_obrigatorios": ["cpf_cnpj", "nome", "regime_tributario", "email", "telefone"],
    "regime_tributario_padrao": "lucro_real",
    "tipos_transacao_tipicos": ["compra", "nota_fiscal_entrada", "devolucao"],
    "validacoes_especificas": ["cpf_cnpj", "email", "regime_tributario", "inscricao_estadual_se_aplicavel", "dados_bancarios"],
    "requer_validacao_manual": true,
    "requer_documentacao": true,
    "nivel_risco": "medio",
    "ativos_por_padrao": true
  }
}
```

#### 3. Obter Requisitos de um Papel

```bash
GET /api/v1/agentes-papeis/supplier/requisitos
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "papel": "supplier",
    "requisitos": {
      "campos_obrigatorios": ["cpf_cnpj", "nome", "regime_tributario", "email", "telefone"],
      "regime_tributario_padrao": "lucro_real",
      "validacoes": ["cpf_cnpj", "email", "regime_tributario", "inscricao_estadual_se_aplicavel", "dados_bancarios"],
      "requer_validacao_manual": true,
      "requer_documentacao": true
    }
  }
}
```

#### 4. Obter Permissões de um Papel

```bash
GET /api/v1/agentes-papeis/supplier/permissoes?papel_usuario=admin
```

**Resposta**:
```json
{
  "success": true,
  "data": [
    {
      "papel_agente": "supplier",
      "papel_usuario": "admin",
      "acoes": ["criar", "editar", "visualizar", "exportar", "vincular", "reconciliar", "aprovar"],
      "acoes_count": 7
    }
  ],
  "total": 1,
  "papel_agente": "supplier"
}
```

#### 5. Obter Tipos de Transação de um Papel

```bash
GET /api/v1/agentes-papeis/supplier/tipos-transacao
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "papel": "supplier",
    "tipos_transacao": ["compra", "nota_fiscal_entrada", "devolucao"],
    "total": 3
  }
}
```

#### 6. Validar Agente Contra Papel

```bash
POST /api/v1/agentes-papeis/validar
Content-Type: application/json

{
  "papel": "supplier",
  "tipo_entidade": "pessoa_juridica",
  "agente": {
    "cpf_cnpj": "12345678901234",
    "nome": "Empresa ABC",
    "regime_tributario": "lucro_real",
    "email": "contato@empresa.com",
    "telefone": "1133334444"
  }
}
```

**Resposta Sucesso**:
```json
{
  "success": true,
  "data": {
    "papel": "supplier",
    "tipo_entidade": "pessoa_juridica",
    "valido": true,
    "campos_faltantes": [],
    "campos_obrigatorios": ["cpf_cnpj", "nome", "regime_tributario", "email", "telefone"],
    "requer_validacao_manual": true,
    "requer_documentacao": true,
    "nivel_risco": "medio"
  }
}
```

**Resposta Erro**:
```json
{
  "success": false,
  "data": {
    "papel": "supplier",
    "tipo_entidade": "pessoa_juridica",
    "valido": false,
    "campos_faltantes": ["telefone"],
    "campos_obrigatorios": ["cpf_cnpj", "nome", "regime_tributario", "email", "telefone"],
    "requer_validacao_manual": true,
    "requer_documentacao": true,
    "nivel_risco": "medio"
  }
}
```

#### 7. Obter Matriz Completa de Permissões

```bash
GET /api/v1/agentes-papeis/matriz/permissoes
```

#### 8. Obter Permissões de um Papel de Usuário

```bash
GET /api/v1/agentes-papeis/papeis-usuario/admin
```

## Exemplos Práticos

### Exemplo 1: Criar Novo Fornecedor

```typescript
import {
  validarCamposObrigatorios,
  validarCompatibilidadeEntidadePapel,
  obterNivelRisco,
  PapelAgente,
  TipoEntidade,
} from "./agentes-papeis.js";

const novoFornecedor = {
  cpf_cnpj: "12345678901234",
  nome: "Distribuidor XYZ",
  regime_tributario: "lucro_real",
  email: "vendas@distribuidor.com",
  telefone: "1133334444",
};

// 1. Validar campos obrigatórios
const faltantes = validarCamposObrigatorios(
  novoFornecedor,
  PapelAgente.SUPPLIER
);
if (faltantes.length > 0) {
  console.error("Campos faltantes:", faltantes);
  return;
}

// 2. Validar compatibilidade
const compativel = validarCompatibilidadeEntidadePapel(
  TipoEntidade.PESSOA_JURIDICA,
  PapelAgente.SUPPLIER
);
if (!compativel) {
  console.error("Tipo de entidade incompatível com papel");
  return;
}

// 3. Obter informações do papel
const risco = obterNivelRisco(PapelAgente.SUPPLIER);
console.log(`Nível de risco: ${risco}`);

// Agora você pode criar o agente no banco de dados
```

### Exemplo 2: Verificar Permissões de Usuário

```typescript
import {
  temPermissao,
  PapelAgente,
  PapelUsuario,
  AcaoPermissao,
} from "./agentes-papeis.js";

function podeEditarSupplier(papelUsuario: PapelUsuario): boolean {
  return temPermissao(
    PapelAgente.SUPPLIER,
    papelUsuario,
    AcaoPermissao.EDITAR
  );
}

// Uso
if (podeEditarSupplier(PapelUsuario.GERENTE)) {
  // Permitir edição
} else {
  // Negar edição
}
```

### Exemplo 3: Fluxo Completo de Validação

```typescript
import {
  obterDefinicaoPapel,
  validarCamposObrigatorios,
  validarCompatibilidadeEntidadePapel,
  PapelAgente,
  TipoEntidade,
} from "./agentes-papeis.js";

function validarNovoAgente(
  dados: any,
  papel: PapelAgente,
  tipoEntidade: TipoEntidade
) {
  // 1. Obter definição do papel
  const definicao = obterDefinicaoPapel(papel);

  // 2. Validar compatibilidade
  if (!validarCompatibilidadeEntidadePapel(tipoEntidade, papel)) {
    return {
      valido: false,
      erro: "Tipo de entidade incompatível com o papel",
    };
  }

  // 3. Validar campos obrigatórios
  const faltantes = validarCamposObrigatorios(dados, papel);
  if (faltantes.length > 0) {
    return {
      valido: false,
      erro: "Campos obrigatórios faltando",
      detalhes: faltantes,
    };
  }

  // 4. Se é de alto risco, pode precisar de validação manual
  if (definicao.nivelRisco === "alto") {
    return {
      valido: true,
      aviso: "Requer validação manual adicional",
      requerValidacao: true,
    };
  }

  return {
    valido: true,
  };
}
```

## Implementação no Código

### Usando as Funções Utilitárias

```typescript
import {
  PapelAgente,
  TipoEntidade,
  RegimeTributario,
} from "./agentes-tipos.js";
import {
  obterDefinicaoPapel,
  validarCamposObrigatorios,
  obterPermissoes,
  temPermissao,
  listarPapeis,
  obterTiposTransacao,
  validarCompatibilidadeEntidadePapel,
  obterNivelRisco,
  PapelUsuario,
  AcaoPermissao,
} from "./agentes-papeis.js";

// Obter definição de papel
const definicao = obterDefinicaoPapel(PapelAgente.SUPPLIER);
console.log(definicao.nome_pt); // "Fornecedor"

// Validar campos
const agente = { cpf_cnpj: "123", nome: "Test" };
const faltantes = validarCamposObrigatorios(agente, PapelAgente.SUPPLIER);
// Resultado: ["regime_tributario", "email", "telefone"]

// Verificar permissão
const podeEditar = temPermissao(
  PapelAgente.SUPPLIER,
  PapelUsuario.GERENTE,
  AcaoPermissao.EDITAR
);
// Resultado: true

// Listar papéis
const todos = listarPapeis();
// Resultado: array com 7 papéis

// Tipos de transação
const tipos = obterTiposTransacao(PapelAgente.TENANT);
// Resultado: ["aluguel", "taxa_condominio", "utilidades"]
```

### Integrando com as Rotas

As rotas já estão prontas em `/src/routes/agentes-papeis-routes.ts`. Para usá-las:

```typescript
import { criarRotasAgentesPapeis } from "./routes/agentes-papeis-routes.js";
import express from "express";

const app = express();
const router = criarRotasAgentesPapeis({ authService });

app.use("/api/v1/agentes-papeis", router);
```

## Testes

O sistema inclui 43 testes automatizados:

```bash
npm test -- agentes-papeis.test.ts
```

Testes cobrem:
- Definições de papéis
- Validação de campos
- Matriz de permissões
- Tipos de transação
- Compatibilidade entidade-papel
- Nível de risco
- Testes integrados

## Referência Rápida

### Papéis e Risco

- ⚠️ Baixo: TENANT, PROVIDER
- ⚠️ Médio: SUPPLIER, LENDER
- 🔴 Alto: LEGAL_PARTY, CO_OWNER, BORROWER

### Papéis e Regime Tributário

- Obrigatório: SUPPLIER, CO_OWNER, LENDER
- Opcional: TENANT, PROVIDER, LEGAL_PARTY, BORROWER

### Papéis e Documentação

- Requer: TENANT, SUPPLIER, LEGAL_PARTY, CO_OWNER, BORROWER, LENDER
- Não requer: PROVIDER
