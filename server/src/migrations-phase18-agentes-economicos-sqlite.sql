/**
 * Fase 18: Sistema de Agentes Econômicos (Pessoas Físicas e Jurídicas) - SQLite
 *
 * Versão SQLite da Fase 18 com adaptações para compatibilidade:
 * - Sem suporte a JSONB (usa TEXT com JSON)
 * - Sem gen_random_uuid() (usa UUID textual)
 * - Sem CHECK constraints avançados
 *
 * Mantém mesma estrutura e índices para portabilidade.
 */

-- =====================================================================
-- Tabela 1: AGENTES_ECONOMICOS - Registro principal
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_economicos (
  id TEXT PRIMARY KEY,  -- UUID como texto

  -- Identificação da entidade
  tipo_entidade TEXT NOT NULL CHECK (tipo_entidade IN ('pessoa_fisica', 'pessoa_juridica')),
  cpf_cnpj TEXT NOT NULL UNIQUE,  -- CPF: 11 dígitos, CNPJ: 14 dígitos
  nome TEXT NOT NULL,

  -- Dados específicos por tipo
  nome_fantasia TEXT,  -- Apenas para pessoa jurídica
  pessoa_fisica_pf_nome_mae TEXT,  -- Apenas para pessoa física

  -- Papel(s) na organização (pode ter múltiplos papéis separados por vírgula)
  papel TEXT NOT NULL CHECK (papel IN ('tenant', 'supplier', 'provider', 'legal_party', 'co_owner', 'borrower', 'lender')),

  -- Informações fiscais
  regime_tributario TEXT CHECK (regime_tributario IN ('simples', 'lucro_real', 'lucro_presumido', 'MEI', 'outro', NULL)),
  inscricao_estadual TEXT,  -- RG para PF, IE para PJ
  inscricao_municipal TEXT,
  classificacao_nfse TEXT,  -- Código de serviço para NFS-e

  -- Contato
  email TEXT,
  telefone TEXT,
  celular TEXT,

  -- Endereço
  endereco_logradouro TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_estado TEXT,
  endereco_cep TEXT,
  endereco_pais TEXT DEFAULT 'Brasil',

  -- Status
  ativo INTEGER NOT NULL DEFAULT 1,  -- SQLite usa 0/1 para BOOLEAN

  -- Campos de auditoria
  criado_em DATETIME NOT NULL DEFAULT (datetime('now')),
  criado_por TEXT NOT NULL,  -- UUID como texto (FK para usuarios.id)
  atualizado_em DATETIME NOT NULL DEFAULT (datetime('now')),
  atualizado_por TEXT NOT NULL,  -- UUID como texto (FK para usuarios.id)

  -- Metadados
  observacoes TEXT,
  tags TEXT,  -- Tags para busca e categorização (separadas por vírgula)

  -- Validação
  validado INTEGER DEFAULT 0,  -- SQLite usa 0/1 para BOOLEAN
  validado_em DATETIME,
  validado_por TEXT,  -- UUID como texto (FK para usuarios.id)

  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  FOREIGN KEY (validado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_agentes_economicos_cpf_cnpj
  ON agentes_economicos(cpf_cnpj);

CREATE INDEX IF NOT EXISTS idx_agentes_economicos_tipo_entidade
  ON agentes_economicos(tipo_entidade);

CREATE INDEX IF NOT EXISTS idx_agentes_economicos_papel
  ON agentes_economicos(papel);

CREATE INDEX IF NOT EXISTS idx_agentes_economicos_ativo
  ON agentes_economicos(ativo);

CREATE INDEX IF NOT EXISTS idx_agentes_economicos_criado_em
  ON agentes_economicos(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agentes_economicos_nome
  ON agentes_economicos(nome);

CREATE INDEX IF NOT EXISTS idx_agentes_economicos_email
  ON agentes_economicos(email);

-- Índice parcial para agentes ativos (SQLite)
CREATE INDEX IF NOT EXISTS idx_agentes_economicos_ativos
  ON agentes_economicos(id) WHERE ativo = 1;

-- Índice para busca de fornecedores/prestadores
CREATE INDEX IF NOT EXISTS idx_agentes_economicos_suppliers
  ON agentes_economicos(papel) WHERE papel IN ('supplier', 'provider');


-- =====================================================================
-- Tabela 2: AGENTES_PAPEIS - Definições de papéis
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_papeis (
  id TEXT PRIMARY KEY,  -- UUID como texto

  -- Identificação do papel
  chave TEXT NOT NULL UNIQUE,  -- tenant, supplier, provider, etc
  nome TEXT NOT NULL,
  descricao TEXT,

  -- Permissões (em JSON como texto para compatibilidade SQLite)
  permissoes TEXT,  -- JSON serializado: {"ler": true, "escrever": false, "aprovar": false}

  -- Status
  ativo INTEGER NOT NULL DEFAULT 1,  -- SQLite usa 0/1

  -- Auditoria
  criado_em DATETIME NOT NULL DEFAULT (datetime('now')),
  criado_por TEXT NOT NULL,
  atualizado_em DATETIME NOT NULL DEFAULT (datetime('now')),
  atualizado_por TEXT NOT NULL,

  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_agentes_papeis_chave
  ON agentes_papeis(chave);

CREATE INDEX IF NOT EXISTS idx_agentes_papeis_ativo
  ON agentes_papeis(ativo);


-- =====================================================================
-- Tabela 3: AGENTES_VALIDACOES - Auditoria de validações
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_validacoes (
  id TEXT PRIMARY KEY,  -- UUID como texto

  -- Referência ao agente
  agente_id TEXT NOT NULL,

  -- Dados da validação
  tipo_validacao TEXT NOT NULL CHECK (
    tipo_validacao IN (
      'cpf_cnpj',
      'email',
      'telefone',
      'endereco',
      'regime_tributario',
      'classificacao_nfse',
      'documental',
      'financeira',
      'manual'
    )
  ),

  -- Resultado
  resultado TEXT NOT NULL CHECK (resultado IN ('aprovado', 'rejeitado', 'pendente')),
  motivo TEXT,
  detalhes TEXT,  -- JSON serializado para compatibilidade SQLite

  -- Auditoria
  executado_em DATETIME NOT NULL DEFAULT (datetime('now')),
  executado_por TEXT NOT NULL,

  FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (executado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_agentes_validacoes_agente_id
  ON agentes_validacoes(agente_id);

CREATE INDEX IF NOT EXISTS idx_agentes_validacoes_tipo
  ON agentes_validacoes(tipo_validacao);

CREATE INDEX IF NOT EXISTS idx_agentes_validacoes_resultado
  ON agentes_validacoes(resultado);

CREATE INDEX IF NOT EXISTS idx_agentes_validacoes_data
  ON agentes_validacoes(executado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agentes_validacoes_agente_tipo
  ON agentes_validacoes(agente_id, tipo_validacao);


-- =====================================================================
-- Tabela 4: AGENTES_DUPLICATAS_SUSPEITAS - Detecção de duplicatas
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_duplicatas_suspeitas (
  id TEXT PRIMARY KEY,  -- UUID como texto

  -- Referências aos agentes
  agente_id_1 TEXT NOT NULL,
  agente_id_2 TEXT NOT NULL,

  -- Score de similaridade (0-100)
  score REAL NOT NULL CHECK (score >= 0 AND score <= 100),

  -- Motivo da duplicata suspeita
  motivo TEXT NOT NULL CHECK (
    motivo IN (
      'cpf_cnpj_similar',
      'nome_similar',
      'email_identico',
      'telefone_identico',
      'endereco_identico',
      'dados_conflitantes',
      'outra'
    )
  ),

  -- Componentes do score
  score_cpf REAL,
  score_nome REAL,
  score_email REAL,
  score_telefone REAL,
  score_endereco REAL,

  -- Status de análise
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmada', 'refutada', 'mesclada')),
  analisado_em DATETIME,
  analisado_por TEXT,
  decisao TEXT,

  -- Auditoria
  criado_em DATETIME NOT NULL DEFAULT (datetime('now')),
  criado_por TEXT NOT NULL,

  FOREIGN KEY (agente_id_1) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (agente_id_2) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (analisado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,

  -- Garante que não há duplicatas reflexivas
  CHECK (agente_id_1 != agente_id_2)
);

CREATE INDEX IF NOT EXISTS idx_agentes_duplicatas_agente_1
  ON agentes_duplicatas_suspeitas(agente_id_1);

CREATE INDEX IF NOT EXISTS idx_agentes_duplicatas_agente_2
  ON agentes_duplicatas_suspeitas(agente_id_2);

CREATE INDEX IF NOT EXISTS idx_agentes_duplicatas_score
  ON agentes_duplicatas_suspeitas(score DESC);

CREATE INDEX IF NOT EXISTS idx_agentes_duplicatas_status
  ON agentes_duplicatas_suspeitas(status);

CREATE INDEX IF NOT EXISTS idx_agentes_duplicatas_motivo
  ON agentes_duplicatas_suspeitas(motivo);

-- Índice para buscar duplicatas de um agente específico
CREATE INDEX IF NOT EXISTS idx_agentes_duplicatas_agentes_par
  ON agentes_duplicatas_suspeitas(agente_id_1, agente_id_2);


-- =====================================================================
-- Tabela 5: AGENTES_VINCULACOES - Vinculações com entidades externas
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_vinculacoes (
  id TEXT PRIMARY KEY,  -- UUID como texto

  -- Referência ao agente
  agente_id TEXT NOT NULL,

  -- Tipo de vinculação
  tipo_vinculacao TEXT NOT NULL CHECK (
    tipo_vinculacao IN (
      'propriedade',        -- properties
      'contrato_locacao',   -- contratos_locacao
      'contrato_prestacao', -- contratos_prestacao
      'contrato_financeiro',-- contratos_financeiro
      'pagamento',          -- pagamentos
      'recebimento',        -- recebimentos
      'nota_fiscal',        -- notas_fiscais
      'outra'
    )
  ),

  -- ID da entidade vinculada
  entidade_id TEXT NOT NULL,
  entidade_nome TEXT,  -- Desnormalizado para referência rápida

  -- Tipo de relacionamento
  tipo_relacionamento TEXT,  -- proprietário, inquilino, fiador, fornecedor, etc

  -- Status
  ativo INTEGER NOT NULL DEFAULT 1,  -- SQLite usa 0/1

  -- Auditoria
  criado_em DATETIME NOT NULL DEFAULT (datetime('now')),
  criado_por TEXT NOT NULL,

  FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_agentes_vinculacoes_agente_id
  ON agentes_vinculacoes(agente_id);

CREATE INDEX IF NOT EXISTS idx_agentes_vinculacoes_tipo
  ON agentes_vinculacoes(tipo_vinculacao);

CREATE INDEX IF NOT EXISTS idx_agentes_vinculacoes_entidade
  ON agentes_vinculacoes(tipo_vinculacao, entidade_id);

CREATE INDEX IF NOT EXISTS idx_agentes_vinculacoes_ativo
  ON agentes_vinculacoes(ativo);
