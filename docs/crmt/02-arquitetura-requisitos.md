# Análise de Requisitos e Arquitetura - CRMT

**Documento:** Análise Técnica de Requisitos e Arquitetura do Sistema CRMT Gestão Imobiliária

---

## Stack Tecnológico Definido

**Princípios de Design:** Segurança em 1º lugar (RLS nativa), escalabilidade serverless, compliance brasileiro (LGPD, fiscal).

| Componente | Tecnologia |
|-----------|-----------|
| Frontend | Next.js 15.5.20 |
| Banco de Dados | PostgreSQL + Supabase |
| Linguagem | TypeScript strict mode |
| Autenticação | Supabase Auth (magic link) |
| Pagamentos | Asaas API v3 |
| Notificações | Twilio + Resend |
| Orquestração | Vercel Cron Jobs |
| Deploy | Vercel CI/CD |

**Dados Sensíveis:** CPF, RG, credenciais API NUNCA commitadas (env vars, .env.local gitignored)

---

## Gestão de Contratos (RF-001 a RF-004)

### RF-001
Criar e editar contrato com suporte múltiplas partes (inquilino, fiador, responsável financeiro) e seleção de modelo (residencial, comercial, comodato).

### RF-002
Gerar documento contrato via merge de `{{variáveis}}` sem Handlebars — lista branca de campos segura contra XSS.

### RF-003
Calcular valor mensal com pró-rata automático usando padrão CRMT: `Valor Mês × (Dias Efetivos / 30)`. Validação contra contratos reais (Kitnet 16: diferença R$63,94 corrigida em auditoria).

### RF-004
Rescindir contrato com cálculo automático multa: `[Cláusula] × meses restantes + bonificação dezembro` (Florianópolis específico).

### Variáveis Técnicas

- Tabela `contratos`: id, data_inicio, data_fim, valor_mensal, modelo_id, status
- Tabela `contrato_partes`: contrato_id, pessoa_id, papel (enum: locatario_principal, fiador, responsavel_financeiro)
- Tabela `modelos_contrato`: HTML template, cláusulas fixas, validação `{{campos}}` permitidos
- Função pura: `valorMensalContrato.ts` (50+ testes unitários)
- RLS: Proprietário vê apenas contratos de imóveis próprios

---

## Gestão de Imóveis (RF-005 a RF-006)

### RF-005
Cadastrar imóvel com identificação, endereço, tipo (residencial/comercial/comodato), cômodos, foto fachada.

### RF-006
Configurar imóvel como co-living (`enable_coliving = true`) com perfil de compatibilidade ColiMatch™: 5 variáveis (idade, profissão, estilo vida, animal, fumante), 2 veto crítico (cleanliness > 4, background check passed), threshold ≥80%.

### Algoritmo ColiMatch™

```
Score = (idade_match×0.2 + prof_match×0.15 + estilo_match×0.25 + animal_match×0.2 + fumante_match×0.2)
```

Se Score ≥ 80%, compatibilidade aceita; senão, sugerir alternativa.

### Variáveis Técnicas

- Tabela `imoveis`: id, identificacao, endereco, tipo, enable_coliving (bool), avaliacao, data_avaliacao
- Tabela `comodos`: id, imovel_id, tipo (enum), área_m2
- Tabela `coliving_perfis`: Define pesos e veto crítico por imóvel
- Função: `calcularCompatibilidade.ts` (documentada)

---

## Faturamento Automático (RF-010)

### RF-010
Gerar fatura mensal automática via cron diário 6 AM, calculando: aluguel pró-rata + reembolsos (água, energia, condomínio) + componentes mensais. Status: 'gerada' → 'emitida' (cobrança) → 'paga'.

### Pipeline Automático

1. **Cron 6 AM:** Seleciona contratos status='ativo', calcula valor mês (pró-rata se necessário)
2. **Cálculo:** Chamada `valorMensalContrato.ts` + merge componentes mensais
3. **INSERT:** Tabela `faturas` com data_faturamento=today (regime competência)
4. **Auditoria:** Registro em `audit_log` com valores_novos (JSONB)
5. **Idempotência:** Se fatura já existe para contrato+mês, não recria

### Regime Contábil Duplo

| Regime | Data Chave | Quando Reconhece |
|--------|-----------|-----------------|
| Competência | data_faturamento | Dia geração fatura (independente pagamento) |
| Caixa | data_pagamento_efetiva | Apenas quando receber (webhook Asaas) |

---

## Recebimentos & Integração Asaas (RF-011, RF-024, RF-012)

### RF-011
Emitir cobrança Asaas (boleto, PIX, débito automático) com status fatura rastreado (emitida, paga, cancelada).

### RF-024
Receber webhook Asaas quando pagamento confirmado. Valida HMAC signature, externalReference, marca fatura paga, distribui ao investidor.

### RF-012
Split de pagamento: se múltiplas receitas (aluguel + água + energia), proporciona cada uma conforme ocupação real, deduz taxa admin, distribui líquido ao investidor.

### Segurança: pg_advisory_xact_lock

Problema: Se 2 webhooks chegam simultaneamente (Asaas pode reenviar), sem lock haveria double-distribution.

Solução: `SELECT pg_advisory_xact_lock($1)` onde $1=fatura_id, garante apenas 1 distribuição por transação, lock auto-release ao COMMIT.

---

## Ordens de Serviço & Manutenção (RF-014 a RF-015)

### RF-014
Abrir chamado manutenção (self-service ou admin) com tipo (emergência 4h, preventiva 10d úteis, corretiva 15d úteis). Atribuir prestador, registrar andamentos com fotos, aprovar custo.

### RF-015
Plano manutenção preventiva recorrente (mensal/trimestral/anual). Cron gera OS automaticamente em data programada, orçamento pré-aprovado.

### Timeline Multifoto (Imutável)

- Tabela `vistorias`: id, contrato_id, data, tipo (entrada/saída/preventiva)
- Tabela `vistoria_fotos`: id, vistoria_id, foto_url, legenda, data_upload
- Constraints: Nunca pode DELETE vistoria ou fotos (auditoria imutável)
- Storage: Supabase Storage (bucket público com assinatura temporária)

### Alocação FRO

Se custo OS ≤ teto FRO, deduz automaticamente; senão, fatura extra ao inquilino via Asaas.

---

## Garantias & Alertas Vencimento (RF-008 a RF-009)

### RF-008
Registrar múltiplas garantias por contrato: Seguro-Fiança, Seguro-Incêndio, Título Capitalização, Comodato, Seguro Aluguel. Campos: apolice_numero, valor, data_vencimento_apolice, operadora.

### RF-009
Alerta automático garantias vencendo em 30-60 dias via cron diário 9 AM. Agrupamento por proprietário (1 email múltiplas garantias). Registro audit_log status ('alerta_enviado' ou 'falha_notificacao').

### Cron Job Detalhado

```sql
SELECT * FROM garantias 
WHERE data_vencimento_apolice BETWEEN today AND today + INTERVAL '60 days'
```

Resultado: Agrupa por proprietário_id, envia 1 email Resend com listagem.

**Testes:** 6 unitários (detecção, classificação, dias, grouping, status, audit) — todos passing.

---

## Segurança: Row-Level Security (RLS)

### RNF-001
71/71 tabelas com RLS policies. Proprietário vê apenas imovel_id = proprietario_id. Inquilino vê apenas contratos onde pessoa_id em contrato_partes e papel='locatario_principal'.

### Exemplo Policy SQL

```sql
CREATE POLICY proprietario_faturas ON faturas
  FOR SELECT
  USING (imovel_id IN (
    SELECT id FROM imoveis WHERE proprietario_id = auth.uid()
  ));
```

### RNF-002
Dados sensíveis (CPF, RG, credenciais API) NUNCA commitados. Env vars: RESEND_API_KEY, TWILIO_AUTH_TOKEN, ASAAS_API_KEY, DATABASE_URL — armazenados em .env.local (gitignored).

### RNF-004
XSS Prevention: Template merge usa `mesclarTemplate.ts` (sem eval, sem Handlebars). Lista branca de `{{campos}}` permitidos. Sanitização DOMPurify (frontend) + html-escape (backend).

---

## Auditoria & Compliance

### RNF-006
Audit Log imutável (append-only). Tabela `audit_log` com: timestamp, user_id, tabela_origem, operacao (INSERT/UPDATE/DELETE), valores_antigos (JSONB), valores_novos (JSONB). Retenção 7 anos (compliance fiscal Brasil). Constraint: Não há DELETE em audit_log.

### RNF-007
Cálculos financeiros reproduzíveis. Todas fórmulas testadas (50+ testes valorMensalContrato, 11 testes multaRescisoria). Cada cálculo rastreável via audit_log + valores_novos.

---

## Decisões Arquiteturais

1. **RLS Nativa PostgreSQL:** Segurança aplicada no banco, não em middleware (mais robusto)
2. **Audit Log Imutável:** Retenção 7 anos atende Lei Fiscal Brasileira
3. **Pró-rata 30 dias comerciais:** Padrão CRMT, validado contra casos reais
4. **Asaas como gateway único:** Boleto, PIX, Débito em uma plataforma
5. **Crons serverless Vercel:** Escalabilidade sem gerenciar infraestrutura
6. **TypeScript strict:** Type-safety em cálculos financeiros críticos
7. **Regime duplo (competência + caixa):** Flexibilidade IRPF/empresa

---

## Status

✅ **Stack definido e testado**  
✅ **71/71 tabelas com RLS policies**  
✅ **26 tabelas audit_log com triggers**  
✅ **Requisitos funcionais (RF) validados**  
✅ **Requisitos não-funcionais (RNF) implementados**  

**Próximas Fases:** Temporada/Airbnb, Energia Solar (Growatt), BI avançado, Mobile (React Native)
