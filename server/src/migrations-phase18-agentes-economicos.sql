/**
 * Fase 18: Sistema de Agentes Econômicos (Pessoas Físicas e Jurídicas)
 *
 * Implementa sistema unificado de gestão de pessoas econômicas:
 * - Pessoas Físicas (CPF): inquilinos, fiadores, devedores
 * - Pessoas Jurídicas (CNPJ): fornecedores, prestadores, co-proprietários
 *
 * Características principais:
 * - Tabela unificada agentes_economicos com tipo de entidade discriminado
 * - Papéis flexíveis: tenant, supplier, provider, legal_party, co_owner, borrower, lender
 * - Validação de CPF/CNPJ única
 * - Regime tributário e classificação NFS-e
 * - Auditoria completa (criado_por, atualizado_por)
 * - Suporte para validações e duplicatas suspeitas
 *
 * Tabelas:
 * - agentes_economicos: Registro principal de pessoas
 * - agentes_papeis: Definições de papéis com permissões
 * - agentes_validacoes: Auditoria de validações/verificações
 * - agentes_duplicatas_suspeitas: Registro de possíveis duplicatas
 *
 * Aplicada em TODO boot (idempotente — todas as tabelas usam IF NOT EXISTS).
 */

-- =====================================================================
-- Tabela 1: AGENTES_ECONOMICOS - Registro principal
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_economicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação da entidade
  tipo_entidade TEXT NOT NULL CHECK (tipo_entidade IN ('pessoa_fisica', 'pessoa_juridica')),
  cpf_cnpj VARCHAR(20) NOT NULL UNIQUE,  -- CPF: 11 dígitos, CNPJ: 14 dígitos
  nome VARCHAR(255) NOT NULL,

  -- Dados específicos por tipo
  nome_fantasia VARCHAR(255),  -- Apenas para pessoa jurídica
  pessoa_fisica_pf_nome_mae VARCHAR(255),  -- Apenas para pessoa física

  -- Papel(s) na organização (pode ter múltiplos papéis separados por vírgula)
  papel TEXT NOT NULL CHECK (papel IN ('tenant', 'supplier', 'provider', 'legal_party', 'co_owner', 'borrower', 'lender')),

  -- Informações fiscais
  regime_tributario TEXT CHECK (regime_tributario IN ('simples', 'lucro_real', 'lucro_presumido', 'MEI', 'outro', NULL)),
  inscricao_estadual VARCHAR(20),  -- RG para PF, IE para PJ
  inscricao_municipal VARCHAR(20),
  classificacao_nfse VARCHAR(20),  -- Código de serviço para NFS-e

  -- Contato
  email VARCHAR(255),
  telefone VARCHAR(20),
  celular VARCHAR(20),

  -- Endereço
  endereco_logradouro VARCHAR(255),
  endereco_numero VARCHAR(10),
  endereco_complemento VARCHAR(255),
  endereco_bairro VARCHAR(100),
  endereco_cidade VARCHAR(100),
  endereco_estado VARCHAR(2),
  endereco_cep VARCHAR(10),
  endereco_pais VARCHAR(50) DEFAULT 'Brasil',

  -- Status
  ativo BOOLEAN NOT NULL DEFAULT true,

  -- Campos de auditoria
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por UUID NOT NULL,  -- FK para usuarios.id
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por UUID NOT NULL,  -- FK para usuarios.id

  -- Metadados
  observacoes TEXT,
  tags VARCHAR(255),  -- Tags para busca e categorização (separadas por vírgula)

  -- Validação
  validado BOOLEAN DEFAULT false,
  validado_em TIMESTAMP,
  validado_por UUID,  -- FK para usuarios.id

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

-- Índice parcial para agentes ativos
CREATE INDEX IF NOT EXISTS idx_agentes_economicos_ativos
  ON agentes_economicos(id) WHERE ativo = true;

-- Índice para busca de fornecedores/prestadores
CREATE INDEX IF NOT EXISTS idx_agentes_economicos_suppliers
  ON agentes_economicos(papel) WHERE papel IN ('supplier', 'provider');


-- =====================================================================
-- Tabela 2: AGENTES_PAPEIS - Definições de papéis
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_papeis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação do papel
  chave VARCHAR(50) NOT NULL UNIQUE,  -- tenant, supplier, provider, etc
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,

  -- Permissões (em JSON para flexibilidade)
  permissoes JSONB,  -- Ex: {"ler": true, "escrever": false, "aprovar": false}

  -- Status
  ativo BOOLEAN NOT NULL DEFAULT true,

  -- Auditoria
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por UUID NOT NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por UUID NOT NULL,

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referência ao agente
  agente_id UUID NOT NULL,

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
  detalhes JSONB,  -- Armazena dados específicos da validação

  -- Auditoria
  executado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executado_por UUID NOT NULL,

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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referências aos agentes
  agente_id_1 UUID NOT NULL,
  agente_id_2 UUID NOT NULL,

  -- Score de similaridade (0-100)
  score DECIMAL(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),

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
  score_cpf DECIMAL(5, 2),
  score_nome DECIMAL(5, 2),
  score_email DECIMAL(5, 2),
  score_telefone DECIMAL(5, 2),
  score_endereco DECIMAL(5, 2),

  -- Status de análise
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmada', 'refutada', 'mesclada')),
  analisado_em TIMESTAMP,
  analisado_por UUID,
  decisao TEXT,

  -- Auditoria
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por UUID NOT NULL,

  FOREIGN KEY (agente_id_1) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (agente_id_2) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (analisado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,

  -- Garante que não há duplicatas reflexivas (agente_id_1 = agente_id_2)
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referência ao agente
  agente_id UUID NOT NULL,

  -- Tipo de vinculação (pode estar vinculado a múltiplas tabelas)
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
  entidade_id UUID NOT NULL,
  entidade_nome VARCHAR(255),  -- Desnormalizado para referência rápida

  -- Tipo de relacionamento
  tipo_relacionamento TEXT,  -- proprietário, inquilino, fiador, fornecedor, etc

  -- Status
  ativo BOOLEAN NOT NULL DEFAULT true,

  -- Auditoria
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por UUID NOT NULL,

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


-- =====================================================================
-- Constraints de integridade
-- =====================================================================

-- Garante que CPF/CNPJ tem o formato correto
ALTER TABLE agentes_economicos ADD CONSTRAINT check_cpf_cnpj_format
  CHECK (
    (tipo_entidade = 'pessoa_fisica' AND LENGTH(cpf_cnpj) = 11) OR
    (tipo_entidade = 'pessoa_juridica' AND LENGTH(cpf_cnpj) = 14)
  );

-- Garante que pessoa jurídica tem nome_fantasia
ALTER TABLE agentes_economicos ADD CONSTRAINT check_pj_nome_fantasia
  CHECK (
    (tipo_entidade = 'pessoa_juridica' AND nome_fantasia IS NOT NULL) OR
    tipo_entidade = 'pessoa_fisica'
  );

-- Garante que pessoa física tem nome da mãe
ALTER TABLE agentes_economicos ADD CONSTRAINT check_pf_nome_mae
  CHECK (
    (tipo_entidade = 'pessoa_fisica' AND pessoa_fisica_pf_nome_mae IS NOT NULL) OR
    tipo_entidade = 'pessoa_juridica'
  );

-- Garante que validado_em é preenchido quando validado = true
ALTER TABLE agentes_economicos ADD CONSTRAINT check_validacao_timestamp
  CHECK (
    (validado = false AND validado_em IS NULL) OR
    (validado = true AND validado_em IS NOT NULL)
  );


-- =====================================================================
-- Views úteis
-- =====================================================================

-- View: Agentes com informações de validação mais recente
CREATE OR REPLACE VIEW agentes_com_validacao_recente AS
SELECT
  a.id,
  a.tipo_entidade,
  a.cpf_cnpj,
  a.nome,
  a.papel,
  a.ativo,
  a.validado,
  v.tipo_validacao,
  v.resultado,
  v.executado_em,
  ROW_NUMBER() OVER (PARTITION BY a.id ORDER BY v.executado_em DESC) as rn
FROM agentes_economicos a
LEFT JOIN agentes_validacoes v ON a.id = v.agente_id;


-- View: Agentes duplicados por CPF/CNPJ
CREATE OR REPLACE VIEW agentes_duplicados_por_cpf AS
SELECT
  a1.id as agente_1_id,
  a1.cpf_cnpj,
  a1.nome as agente_1_nome,
  a2.id as agente_2_id,
  a2.nome as agente_2_nome,
  COUNT(*) as quantidade_duplicatas
FROM agentes_economicos a1
JOIN agentes_economicos a2 ON
  a1.cpf_cnpj = a2.cpf_cnpj AND
  a1.id < a2.id AND
  a1.ativo = true AND
  a2.ativo = true
LEFT JOIN agentes_duplicatas_suspeitas d ON
  (d.agente_id_1 = a1.id AND d.agente_id_2 = a2.id) OR
  (d.agente_id_1 = a2.id AND d.agente_id_2 = a1.id)
GROUP BY a1.id, a1.cpf_cnpj, a1.nome, a2.id, a2.nome;


-- View: Estatísticas de agentes
CREATE OR REPLACE VIEW agentes_estatisticas AS
SELECT
  tipo_entidade,
  papel,
  COUNT(*) as total,
  COUNT(CASE WHEN ativo THEN 1 END) as ativos,
  COUNT(CASE WHEN validado THEN 1 END) as validados,
  COUNT(CASE WHEN NOT validado THEN 1 END) as nao_validados
FROM agentes_economicos
GROUP BY tipo_entidade, papel;
