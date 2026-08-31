-- ============================================================================
-- INICIALIZAÇÃO: Prestadores de Serviço — Paulo Bruxel e Cristiano R. Souza
-- ============================================================================
-- Script para popular prestadores_servico, contratos_prestador, regras_prestador
-- com dados de Paulo (Zelador) e Cristiano (Serviços Gerais).
--
-- Contexto:
-- - Paulo: Zelador/Administrador, contrato fixo mensal, IPCA reajuste (4,64% em 07/2026)
-- - Cristiano: Serviços Gerais, contrato fixo semanal, IPCA reajuste (aguardando confirmação)
-- - Ambos trabalham para todos os imóveis de Florianópolis
-- - Data: julho 2026 (pagamento de Paulo em 10/08/2026)

-- ============================================================================
-- PARTE 1: VERIFICAR/CRIAR PERSONAS
-- ============================================================================

-- Verificar se Paulo Bruxel existe em personas
-- Se não, criar.
INSERT INTO pessoas (nome, cpf_cnpj, tipo_pessoa, email, telefone, papel)
VALUES (
  'Paulo Bruxel',
  '31.744.230-072',
  'pessoa_fisica',
  'paulobruxel3012@gmail.com',
  NULL,
  'prestador'
)
ON CONFLICT (cpf_cnpj) DO NOTHING;

-- Verificar se Cristiano Rodrigues de Souza existe em personas
INSERT INTO pessoas (nome, cpf_cnpj, tipo_pessoa, email, telefone, papel)
VALUES (
  'Cristiano Rodrigues de Souza',
  '013.878.680-12',
  'pessoa_fisica',
  'souzacarolaine185@gmail.com',
  NULL,
  'prestador'
)
ON CONFLICT (cpf_cnpj) DO NOTHING;

-- ============================================================================
-- PARTE 2: CRIAR PRESTADORES DE SERVIÇO
-- ============================================================================

-- Paulo Bruxel (Zelador/Administrador)
INSERT INTO prestadores_servico (
  pessoa_id,
  nome_completo,
  cpf_cnpj,
  tipo,
  categoria,
  chave_pix,
  instituicao_bancaria,
  tipo_conta,
  agencia,
  conta,
  email,
  status
)
SELECT
  p.id,
  p.nome,
  p.cpf_cnpj,
  'fixo',
  'zelador',
  NULL,
  'CAIXA',
  'corrente',
  '3524',
  '212585',
  p.email,
  'ativo'
FROM pessoas p
WHERE p.cpf_cnpj = '31.744.230-072'
  AND NOT EXISTS (
    SELECT 1 FROM prestadores_servico ps
    WHERE ps.cpf_cnpj = p.cpf_cnpj
  );

-- Cristiano Rodrigues de Souza (Serviços Gerais)
INSERT INTO prestadores_servico (
  pessoa_id,
  nome_completo,
  cpf_cnpj,
  tipo,
  categoria,
  chave_pix,
  email,
  status
)
SELECT
  p.id,
  p.nome,
  p.cpf_cnpj,
  'fixo',
  'servicos_gerais',
  'souzacarolaine185@gmail.com',
  p.email,
  'ativo'
FROM pessoas p
WHERE p.cpf_cnpj = '013.878.680-12'
  AND NOT EXISTS (
    SELECT 1 FROM prestadores_servico ps
    WHERE ps.cpf_cnpj = p.cpf_cnpj
  );

-- ============================================================================
-- PARTE 3: CRIAR CONTRATOS COM VALORES ATUALIZADOS
-- ============================================================================

-- Contrato de Paulo (Zelador) — Vigente a partir de 01/01/2026, reajuste 07/2026
INSERT INTO contratos_prestador (
  prestador_id,
  data_inicio,
  data_fim,
  tipo_contrato,
  tipo_remuneracao,
  valor_base,
  valor_hora,
  reajuste_indice,
  data_base_reajuste,
  percentual_reajuste_ultimo,
  data_ultimo_reajuste,
  frequencia_fechamento,
  dia_fechamento_mes
)
SELECT
  ps.id,
  '2026-01-01'::date,
  NULL,
  'fixo',
  'diaria_fixa',
  121.63,  -- Diária atualizada com IPCA 4,64% (era 116,24)
  14.53,   -- Valor da hora (mesmo)
  'ipca',
  '2025-07-01'::date,
  4.64,    -- Percentual último reajuste
  '2026-07-01'::date,
  'mensal',
  10
FROM prestadores_servico ps
JOIN pessoas p ON ps.pessoa_id = p.id
WHERE p.cpf_cnpj = '31.744.230-072'
  AND NOT EXISTS (
    SELECT 1 FROM contratos_prestador cp
    WHERE cp.prestador_id = ps.id
      AND cp.data_inicio = '2026-01-01'::date
  );

-- Contrato de Cristiano (Serviços Gerais) — Vigente a partir de 01/01/2026
INSERT INTO contratos_prestador (
  prestador_id,
  data_inicio,
  data_fim,
  tipo_contrato,
  tipo_remuneracao,
  valor_base,
  valor_hora,
  reajuste_indice,
  data_base_reajuste,
  percentual_reajuste_ultimo,
  data_ultimo_reajuste,
  frequencia_fechamento,
  dia_fechamento_semana
)
SELECT
  ps.id,
  '2026-01-01'::date,
  NULL,
  'fixo',
  'diaria_fixa',
  200.00,  -- Diária de Cristiano
  25.00,   -- Valor da hora para extras (200.00 / 8)
  'ipca',
  '2025-07-01'::date,
  NULL,    -- Percentual de reajuste (aguardar confirmação)
  NULL,    -- Data do reajuste (se houver)
  'semanal',
  5  -- Fechamento nas sextas (1=segunda, 5=sexta)
FROM prestadores_servico ps
JOIN pessoas p ON ps.pessoa_id = p.id
WHERE p.cpf_cnpj = '013.878.680-12'
  AND NOT EXISTS (
    SELECT 1 FROM contratos_prestador cp
    WHERE cp.prestador_id = ps.id
      AND cp.data_inicio = '2026-01-01'::date
  );

-- ============================================================================
-- PARTE 4: CRIAR REGRAS ESPECÍFICAS (JSON)
-- ============================================================================

-- Regras de Paulo (Zelador)
INSERT INTO regras_prestador (contrato_id, regras)
SELECT
  cp.id,
  jsonb_build_object(
    'diaria', 121.63,
    'valor_hora', 14.53,
    'combustivel_diario_litros', 3,
    'combustivel_valor_litro', 7.20,
    'combustivel_base_mensal_litros', 25,
    'combustivel_base_mensal', 219.59,
    'adicional_comunicacao', 244.10,
    'adicional_comunicacao_notas', '2 diárias / mês (ref. comunicação por telefone/WhatsApp)',
    'gatilho_combustivel_crise', 7.00,
    'percentual_crise', 20,
    'observacoes', 'Reajuste IPCA 4,64% aplicado em 07/2026 (efeito em pagamento 10/08/2026)'
  )
FROM contratos_prestador cp
JOIN prestadores_servico ps ON cp.prestador_id = ps.id
JOIN pessoas p ON ps.pessoa_id = p.id
WHERE p.cpf_cnpj = '31.744.230-072'
  AND cp.data_inicio = '2026-01-01'::date
  AND NOT EXISTS (
    SELECT 1 FROM regras_prestador rp
    WHERE rp.contrato_id = cp.id
  );

-- Regras de Cristiano (Serviços Gerais)
INSERT INTO regras_prestador (contrato_id, regras)
SELECT
  cp.id,
  jsonb_build_object(
    'diaria', 200.00,
    'valor_hora', 25.00,
    'horario_inicio', '08:00',
    'horario_saida', '17:00',
    'intervalo_almoco_minutos', 60,
    'kit_pos_hospedagem_dentro_8h', 30.00,
    'kit_extraordinario_dia_semana', 40.00,
    'kit_extraordinario_fim_semana', 60.00,
    'kit_emergencia_domingo_feriado', 80.00,
    'deslocamento_corrego_grande', 20.00,
    'deslocamento_suprimentos_ate_5km', 20.00,
    'emergencia_deslocamento', 20.00,
    'emergencia_percentual_extra', 20,
    'emergencia_minimo', 50.00,
    'observacoes', 'Reajuste IPCA aguardando confirmação. Ajudante: R$ 100,00 / diária quando autorizado.'
  )
FROM contratos_prestador cp
JOIN prestadores_servico ps ON cp.prestador_id = ps.id
JOIN pessoas p ON ps.pessoa_id = p.id
WHERE p.cpf_cnpj = '013.878.680-12'
  AND cp.data_inicio = '2026-01-01'::date
  AND NOT EXISTS (
    SELECT 1 FROM regras_prestador rp
    WHERE rp.contrato_id = cp.id
  );

-- ============================================================================
-- PARTE 5: ALOCAR PRESTADORES A RESIDENCIAIS
-- ============================================================================

-- Paulo trabalha para todas as residenciais de Florianópolis
INSERT INTO alocacao_prestador_residencial (prestador_id, residencial_id, data_inicio, ativo)
SELECT DISTINCT
  ps.id,
  r.id,
  '2026-01-01'::date,
  true
FROM prestadores_servico ps
JOIN pessoas p ON ps.pessoa_id = p.id
CROSS JOIN residenciais r
JOIN cidades c ON r.cidade_id = c.id
WHERE p.cpf_cnpj = '31.744.230-072'
  AND c.nome = 'Florianópolis'
  AND NOT EXISTS (
    SELECT 1 FROM alocacao_prestador_residencial apr
    WHERE apr.prestador_id = ps.id
      AND apr.residencial_id = r.id
  );

-- Cristiano trabalha para todas as residenciais de Florianópolis
INSERT INTO alocacao_prestador_residencial (prestador_id, residencial_id, data_inicio, ativo)
SELECT DISTINCT
  ps.id,
  r.id,
  '2026-01-01'::date,
  true
FROM prestadores_servico ps
JOIN pessoas p ON ps.pessoa_id = p.id
CROSS JOIN residenciais r
JOIN cidades c ON r.cidade_id = c.id
WHERE p.cpf_cnpj = '013.878.680-12'
  AND c.nome = 'Florianópolis'
  AND NOT EXISTS (
    SELECT 1 FROM alocacao_prestador_residencial apr
    WHERE apr.prestador_id = ps.id
      AND apr.residencial_id = r.id
  );

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

SELECT
  'Prestadores Criados' as verificacao,
  COUNT(*) as total
FROM prestadores_servico;

SELECT
  'Contratos Criados' as verificacao,
  COUNT(*) as total
FROM contratos_prestador;

SELECT
  'Regras Criadas' as verificacao,
  COUNT(*) as total
FROM regras_prestador;

SELECT
  'Alocações Criadas' as verificacao,
  COUNT(*) as total
FROM alocacao_prestador_residencial;
