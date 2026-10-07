# Schema de Banco de Dados - Sistema de Papéis de Agentes

## Visão Geral

Este documento descreve o schema de banco de dados para o sistema de papéis e permissões de agentes econômicos.

## Tabelas Principais

### 1. Tabela: `agentes_papeis` (Configuração de Papéis)

Armazena as definições de papéis e suas configurações.

```sql
CREATE TABLE IF NOT EXISTS agentes_papeis (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome_pt TEXT NOT NULL,
  descricao_pt TEXT,
  
  -- Configuração de Requisitos
  campos_obrigatorios TEXT NOT NULL, -- JSON array serializado
  regime_tributario_padrao TEXT,     -- NULL ou nome do regime
  tipos_transacao_tipicos TEXT NOT NULL, -- JSON array
  validacoes_especificas TEXT NOT NULL, -- JSON array
  
  -- Configuração de Validação
  requer_validacao_manual BOOLEAN NOT NULL DEFAULT false,
  requer_documentacao BOOLEAN NOT NULL DEFAULT false,
  nivel_risco TEXT NOT NULL CHECK (nivel_risco IN ('baixo', 'medio', 'alto')),
  ativos_por_padrao BOOLEAN NOT NULL DEFAULT true,
  
  -- Auditoria
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT NOT NULL, -- UUID do usuário
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por TEXT NOT NULL,
  
  INDEX idx_codigo (codigo),
  INDEX idx_nivel_risco (nivel_risco)
);
```

### 2. Tabela: `agentes_papeis_permissoes` (Matriz de Permissões)

Armazena a matriz de permissões entre papéis de usuário e papéis de agente.

```sql
CREATE TABLE IF NOT EXISTS agentes_papeis_permissoes (
  id TEXT PRIMARY KEY,
  papel_agente TEXT NOT NULL,          -- PapelAgente enum
  papel_usuario TEXT NOT NULL,         -- PapelUsuario enum
  acoes TEXT NOT NULL,                 -- JSON array de ações
  
  -- Auditoria
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT NOT NULL,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por TEXT NOT NULL,
  
  UNIQUE (papel_agente, papel_usuario),
  FOREIGN KEY (papel_agente) REFERENCES agentes_papeis(codigo),
  INDEX idx_papel_usuario (papel_usuario),
  INDEX idx_papel_agente (papel_agente)
);
```

### 3. Tabela: `agentes_validacoes_papel` (Auditoria de Validações)

Armazena registro de cada validação de agente contra requisitos de papel.

```sql
CREATE TABLE IF NOT EXISTS agentes_validacoes_papel (
  id TEXT PRIMARY KEY,
  agente_id TEXT NOT NULL,
  papel_agente TEXT NOT NULL,
  
  -- Resultado da Validação
  valido BOOLEAN NOT NULL,
  campos_faltantes TEXT,                -- JSON array
  tipo_entidade TEXT NOT NULL,          -- 'pessoa_fisica' ou 'pessoa_juridica'
  compativel_entidade BOOLEAN NOT NULL,
  
  -- Auditoria
  executado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executado_por TEXT NOT NULL,
  
  FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id),
  FOREIGN KEY (papel_agente) REFERENCES agentes_papeis(codigo),
  INDEX idx_agente_id (agente_id),
  INDEX idx_papel_agente (papel_agente),
  INDEX idx_executado_em (executado_em)
);
```

### 4. Tabela: `agentes_historico_papeis` (Histórico de Mudanças de Papel)

Armazena o histórico de mudanças de papel de um agente.

```sql
CREATE TABLE IF NOT EXISTS agentes_historico_papeis (
  id TEXT PRIMARY KEY,
  agente_id TEXT NOT NULL,
  papel_anterior TEXT,                 -- NULL se primeiro papel
  papel_novo TEXT NOT NULL,
  motivo TEXT,
  
  -- Auditoria
  alterado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  alterado_por TEXT NOT NULL,
  
  FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id),
  FOREIGN KEY (papel_anterior) REFERENCES agentes_papeis(codigo),
  FOREIGN KEY (papel_novo) REFERENCES agentes_papeis(codigo),
  INDEX idx_agente_id (agente_id),
  INDEX idx_alterado_em (alterado_em)
);
```

## Alterações na Tabela Existente: `agentes_economicos`

Adicione as seguintes colunas se não existirem:

```sql
ALTER TABLE agentes_economicos
ADD COLUMN papel TEXT NOT NULL DEFAULT 'supplier'
  CHECK (papel IN ('tenant', 'supplier', 'provider', 'legal_party', 'co_owner', 'borrower', 'lender'));

ALTER TABLE agentes_economicos
ADD COLUMN status_agente TEXT NOT NULL DEFAULT 'ativo'
  CHECK (status_agente IN ('ativo', 'inativo', 'suspenso', 'bloqueado', 'pendente_validacao'));

ALTER TABLE agentes_economicos
ADD COLUMN validado_contra_papel_em DATETIME;

ALTER TABLE agentes_economicos
ADD COLUMN validado_contra_papel_por TEXT;

-- Criar índices
CREATE INDEX idx_papel ON agentes_economicos(papel);
CREATE INDEX idx_status_agente ON agentes_economicos(status_agente);
```

## Seeds/Dados Iniciais

Insira os papéis padrão:

```sql
-- Tenant (Inquilino)
INSERT INTO agentes_papeis (id, codigo, nome_pt, descricao_pt, campos_obrigatorios, regime_tributario_padrao, tipos_transacao_tipicos, validacoes_especificas, requer_validacao_manual, requer_documentacao, nivel_risco, ativos_por_padrao, criado_por, atualizado_por)
VALUES (
  'papel_tenant_id',
  'tenant',
  'Inquilino',
  'Pessoa ou empresa que aluga propriedade ou espaço',
  '["cpf_cnpj","nome","email","endereco"]',
  NULL,
  '["aluguel","taxa_condominio","utilidades"]',
  '["cpf_cnpj","email","endereco_completo"]',
  true,
  true,
  'baixo',
  true,
  'system_user',
  'system_user'
);

-- Supplier (Fornecedor)
INSERT INTO agentes_papeis (id, codigo, nome_pt, descricao_pt, campos_obrigatorios, regime_tributario_padrao, tipos_transacao_tipicos, validacoes_especificas, requer_validacao_manual, requer_documentacao, nivel_risco, ativos_por_padrao, criado_por, atualizado_por)
VALUES (
  'papel_supplier_id',
  'supplier',
  'Fornecedor',
  'Pessoa ou empresa que fornece produtos ou materiais',
  '["cpf_cnpj","nome","regime_tributario","email","telefone"]',
  'lucro_real',
  '["compra","nota_fiscal_entrada","devolucao"]',
  '["cpf_cnpj","email","regime_tributario","inscricao_estadual_se_aplicavel","dados_bancarios"]',
  true,
  true,
  'medio',
  true,
  'system_user',
  'system_user'
);

-- Service Provider (Prestador de Serviço)
INSERT INTO agentes_papeis (id, codigo, nome_pt, descricao_pt, campos_obrigatorios, regime_tributario_padrao, tipos_transacao_tipicos, validacoes_especificas, requer_validacao_manual, requer_documentacao, nivel_risco, ativos_por_padrao, criado_por, atualizado_por)
VALUES (
  'papel_provider_id',
  'provider',
  'Prestador de Serviço',
  'Pessoa ou empresa que fornece serviços',
  '["cpf_cnpj","nome","email","telefone"]',
  'simples',
  '["prestacao_servico","consulta","manutencao"]',
  '["cpf_cnpj","email","telefone","classificacao_nfse"]',
  false,
  false,
  'baixo',
  true,
  'system_user',
  'system_user'
);

-- Legal Party (Parte Legal)
INSERT INTO agentes_papeis (id, codigo, nome_pt, descricao_pt, campos_obrigatorios, regime_tributario_padrao, tipos_transacao_tipicos, validacoes_especificas, requer_validacao_manual, requer_documentacao, nivel_risco, ativos_por_padrao, criado_por, atualizado_por)
VALUES (
  'papel_legal_party_id',
  'legal_party',
  'Parte Legal',
  'Advogado, tribunal, ou parte envolvida em processo',
  '["cpf_cnpj","nome","email"]',
  NULL,
  '["honorario_advocaticio","custas_judiciais","pericia"]',
  '["cpf_cnpj","email","numero_oab_se_advogado"]',
  true,
  true,
  'alto',
  true,
  'system_user',
  'system_user'
);

-- Co-Owner (Co-proprietário)
INSERT INTO agentes_papeis (id, codigo, nome_pt, descricao_pt, campos_obrigatorios, regime_tributario_padrao, tipos_transacao_tipicos, validacoes_especificas, requer_validacao_manual, requer_documentacao, nivel_risco, ativos_por_padrao, criado_por, atualizado_por)
VALUES (
  'papel_coowner_id',
  'co_owner',
  'Co-proprietário',
  'Proprietário conjunto de imóvel ou empresa',
  '["cpf_cnpj","nome","email","endereco","regime_tributario"]',
  'lucro_real',
  '["rateio_despesa","fundo_reserva","manutencao_comum"]',
  '["cpf_cnpj","email","endereco","percentual_participacao"]',
  true,
  true,
  'alto',
  true,
  'system_user',
  'system_user'
);

-- Borrower (Tomador)
INSERT INTO agentes_papeis (id, codigo, nome_pt, descricao_pt, campos_obrigatorios, regime_tributario_padrao, tipos_transacao_tipicos, validacoes_especificas, requer_validacao_manual, requer_documentacao, nivel_risco, ativos_por_padrao, criado_por, atualizado_por)
VALUES (
  'papel_borrower_id',
  'borrower',
  'Tomador',
  'Pessoa ou empresa que toma empréstimo',
  '["cpf_cnpj","nome","email","endereco"]',
  NULL,
  '["amortizacao","juros","garantia"]',
  '["cpf_cnpj","email","endereco","dados_bancarios"]',
  true,
  true,
  'alto',
  true,
  'system_user',
  'system_user'
);

-- Lender (Credor)
INSERT INTO agentes_papeis (id, codigo, nome_pt, descricao_pt, campos_obrigatorios, regime_tributario_padrao, tipos_transacao_tipicos, validacoes_especificas, requer_validacao_manual, requer_documentacao, nivel_risco, ativos_por_padrao, criado_por, atualizado_por)
VALUES (
  'papel_lender_id',
  'lender',
  'Credor',
  'Banco ou instituição financeira que concede empréstimo',
  '["cpf_cnpj","nome","regime_tributario","email"]',
  'lucro_real',
  '["juros_recebido","multa","comissao"]',
  '["cpf_cnpj","email","regime_tributario","dados_bancarios"]',
  true,
  true,
  'medio',
  true,
  'system_user',
  'system_user'
);
```

## Índices Recomendados

```sql
-- Para performance de queries
CREATE INDEX idx_agentes_papel_status ON agentes_economicos(papel, status_agente);
CREATE INDEX idx_agentes_validado ON agentes_economicos(validado, papel);
CREATE INDEX idx_validacoes_papel_agente ON agentes_validacoes_papel(agente_id, papel_agente);
CREATE INDEX idx_validacoes_data ON agentes_validacoes_papel(executado_em);
CREATE INDEX idx_historico_agente ON agentes_historico_papeis(agente_id);
```

## Migração de Dados Existentes

Se você tem agentes existentes, execute:

```sql
-- Atribuir papel padrão 'supplier' a todos os agentes existentes
UPDATE agentes_economicos
SET papel = 'supplier'
WHERE papel IS NULL OR papel = '';

-- Marcar como validado os agentes existentes validados
UPDATE agentes_economicos
SET validado_contra_papel_em = atualizado_em,
    validado_contra_papel_por = atualizado_por
WHERE validado = true;
```

## Backup e Recuperação

Sempre faça backup antes de executar migrações:

```bash
# SQLite
sqlite3 seu_banco.db ".backup ./seu_banco_backup.db"

# Restaurar se necessário
sqlite3 seu_banco.db ".restore ./seu_banco_backup.db"
```

## Validação Pós-Migração

Execute estas queries para validar:

```sql
-- Verificar se todos os papéis existem
SELECT COUNT(DISTINCT codigo) FROM agentes_papeis;
-- Deve retornar 7

-- Verificar se há agentes sem papel
SELECT COUNT(*) FROM agentes_economicos WHERE papel IS NULL OR papel = '';
-- Deve retornar 0

-- Verificar integridade de permissões
SELECT COUNT(*) FROM agentes_papeis_permissoes;
-- Deve retornar vários registros

-- Verificar histórico de papéis
SELECT COUNT(*) FROM agentes_historico_papeis;
-- Pode ser 0 inicialmente
```

## Notas Importantes

1. **JSON Serialização**: Os campos JSON são armazenados como TEXT. Se usar PostgreSQL, pode usar JSONB nativo.

2. **Enum Check Constraints**: Se o banco não suportar CHECK constraints com múltiplos valores, use uma tabela separada de validação.

3. **Compatibilidade SQLite**: SQLite não suporta ALTER TABLE ADD COLUMN com CHECK. Use CREATE TABLE + INSERT + DROP + RENAME se necessário.

4. **Performance**: Considere adicionar VIEW materializada para queries frequentes de permissões.
