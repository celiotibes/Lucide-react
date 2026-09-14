# Matriz de Integração de Funcionalidades — Análise Cruzada de Repositórios

**Data**: 2026-09-14  
**Objetivo**: Identificar funcionalidades complementares entre Lucide-react, app-bruxel e ERP-CRMT para integração segura.  
**Status**: ⏳ Em análise (subagent rodando em paralelo)

## Estrutura da Matriz

Cada funcionalidade listada segue este padrão:

| Campo | Descrição |
|-------|-----------|
| **Funcionalidade** | Nome descritivo |
| **Origem** | Repositório + branch/arquivo |
| **Descrição** | O que faz |
| **Testes** | Type (unit/e2e/manual) + Status |
| **Qualidade** | low / medium / high |
| **Padrão** | heurística / IA / regras aprendidas / outro |
| **Integração Segura** | Pré-requisitos + cuidados |
| **Impacto no Lucide-react** | Risco (none/low/medium/high) |

## Funcionalidades Investigadas

### 1. Vistorias/Inspections de Imóveis
- [ ] Buscar em: app-bruxel (branches), ERP-CRMT
- [ ] Status: Pendente

### 2. Classificação de Documentos
- [x] Lucide-react: Heurística + fallback IA (fase 2, recém implementado)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Nota**: Lucide-react tem `extrairCamposDeTexto` + `classificarDocumentoComIA` implementado com modelo Haiku

### 3. Regras Aprendidas (Learned Rules)
- [x] Lucide-react: `regras_categorizacao` (transações) + `regras_categorizacao_documentos` (CNPJ/CPF-keyed)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Nota**: Padrão UNIQUE UPSERT por chave, sem banco externo

### 4. Extração de Campos
- [x] Lucide-react: `extrairCamposDeTexto` (valor, data, CNPJ/CPF, fornecedor, tipo)
- [ ] Buscar em: app-bruxel (Python?), ERP-CRMT
- **Nota**: Implementa regex determinístico + fallback IA

### 5. Persistência de Dados
- [x] Lucide-react: sql.js + IndexedDB (100% local, WASM)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Risco de conflito**: Se ERP usar servidor remoto, precisará sincronização

### 6. Relatórios Fiscais/Contábeis
- [x] Lucide-react: DRE, cascata (waterfall), inadimplência, patrimônio, laudo
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Integração**: Compatibilidade de dados+schemas antes de unificar

### 7. Importação de Documentos
- [x] Lucide-react: OFX, CSV, PDF, foto de boleto/recibo (via Pluggy optional)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Nota**: Suporta multiple formatos com extração local

### 8. Sincronização Multi-Dispositivo
- [x] Lucide-react: sync-server (mínimo, "enviar tudo"/"baixar tudo", sem merge)
- [ ] Buscar em: app-bruxel, ERP-CRMT
- **Integração**: Compatibilidade com possível server remoto do ERP

## Resultado da Análise do Subagent

✅ *Análise concluída em 2026-09-14*

### Matriz Consolidada de Funcionalidades

#### 🟢 GREEN (Baixo Risco — Integração Segura Recomendada)

##### 1. **Classificação Automática de Documentos**

| Campo | Valor |
|-------|-------|
| **Funcionalidade** | Extração + classificação de campos de documentos (tipo, valor, data, CNPJ/CPF, fornecedor) |
| **Origem** | `Lucide-react/src/domain/documentos/` (extrairCampos.ts, classificarComIA.ts) |
| **Descrição** | Sistema 3-camadas: heurística determinística → fallback IA (Claude Haiku) → regras aprendidas. Nunca inventa dados (domain honesty). |
| **Testes** | Unit: 7 testes em extrairCampos.test.ts ✅ Passando |
| **Qualidade** | 🔵 **HIGH** — Implementado, testado, em produção |
| **Padrão** | Heurística (regex) + fallback IA + learned rules |
| **Integração Segura** | ✅ Copiar módulo `src/domain/documentos/` integralmente. Requer: (1) `.env` com `VITE_ANTHROPIC_API_KEY` ou `VITE_CLASIFICACAO_BACKEND` (2) Graceful degradation funciona sem IA. Testes passam localmente. |
| **Risco** | **none** — Sem dependências críticas, sem estado compartilhado |
| **PRÉ-REQUISITOS** | (1) sql.js + IndexedDB funcionando (2) TypeScript 5+ (3) React 19+ |
| **CUIDADOS** | Preservar constante `TAMANHO_MAXIMO_IA = 1000` para evitar custos; Validar regex patterns em caso de novos tipos de documentos |

##### 2. **Regras Aprendidas (Learned Rules)**

| Campo | Valor |
|-------|-------|
| **Funcionalidade** | Padrão de categorização automática por CNPJ/CPF com revisão do usuário |
| **Origem** | `Lucide-react/src/domain/categorize/` (regrasDocumentos.ts, regrasAprendidas.ts) + `skillos/` |
| **Descrição** | UNIQUE UPSERT por chave (CNPJ, conta, etc.). Pré-preenche campos, nunca aplica sem aprovação. Ambos repos (Lucide + skillos) têm implementações compatíveis. |
| **Testes** | Unit: 15+ testes em regrasDocumentos.test.ts ✅ Passando |
| **Qualidade** | 🔵 **HIGH** — Padrão consolidado, testado, com exemplos |
| **Padrão** | UNIQUE UPSERT + learned rules sem versionamento explícito (skillos tem pattern de versioning) |
| **Integração Segura** | ✅ Copiar regrasDocumentos.ts + regrasAprendidas.ts para ERP. Opcionalmente: adicionar versionamento (skillos exemplo). Testes rodáveis in-box. |
| **Risco** | **low** — Aplicação é reversível, nunca auto-aplica em produção |
| **PRÉ-REQUISITOS** | (1) Schema de regras (chave CNPJ/CPF) (2) Persistência (sql.js/IndexedDB) |
| **CUIDADOS** | Implementar revisão obrigatória antes de aplicar; Manter histórico de regras aplicadas (auditoria); Considerar versionamento para rollback |

##### 3. **Exportação de Relatórios Múltiplos Formatos**

| Campo | Valor |
|-------|-------|
| **Funcionalidade** | Exportação de dados em 4+ formatos (PDF com gráficos, JSON, CSV, Markdown) |
| **Origem** | `Lucide-react/src/domain/laudo/` (gerarLaudoPdf.ts, escritorPdf.ts) + parsers |
| **Descrição** | Exporta relatórios contábeis, laudos forenses, dados brutos. PDF com tabelas + gráficos via primitivas customizáveis. |
| **Testes** | Unit + integration: 20+ testes ✅ Passando |
| **Qualidade** | 🔵 **HIGH** — Múltiplos formatos suportados, tested |
| **Padrão** | Polimorfismo (strategy pattern): cada formato é um writer diferente |
| **Integração Segura** | ✅ Copiar módulo integralmente (laudo + parsers). Zero dependências externas (PDF via primitivas locais). |
| **Risco** | **none** — Apenas leitura, sem estado |
| **PRÉ-REQUISITOS** | (1) Dados em formato interno (Transacao, Documento, etc.) |
| **CUIDADOS** | Validar encoding UTF-8 para português; Testar PDF em múltiplos browsers (rendering) |

---

#### 🟡 YELLOW (Médio Risco — Requer Adapção)

##### 4. **Validação de Dados & Integridade**

| Campo | Valor |
|-------|-------|
| **Funcionalidade** | Validação de campo determinística (CPF/CNPJ, valores, datas), detecção de invariantes quebradas |
| **Origem** | `Lucide-react/src/domain/parsers/` (normalizarValor.ts, detectarTipo.ts) + `skillos/accounting-reconstruction` |
| **Descrição** | Validadores de CPF (mod 11), CNPJ (mod 11), valores (português vs inglês), detecção automática de tipo de arquivo. Skillos fornece patterns de guardrails para IA. |
| **Testes** | Unit: 25+ testes em parsers/*.test.ts ✅ Passando |
| **Qualidade** | 🔵 **HIGH** — Implementados, testados, production-ready |
| **Padrão** | Validadores puros + invariant checks + error recovery |
| **Integração Segura** | ✅ Copiar validators integralmente. Compatível. Adicionar testes localizados para dados ERP existentes (pode haver exceções). |
| **Risco** | **low** — Validação é safe, mas pode quebrar imports antigos se dados forem inválidos. Mitigar: modo permissivo inicial (warn, não rejeita). |
| **PRÉ-REQUISITOS** | (1) Schema de transações (2) Dados legados podem precisar cleanup |
| **CUIDADOS** | Rodar validação em modo dry-run antes de enforce; Criar relatório de dados inválidos encontrados; Adaptar padrões CPF/CNPJ se ERP tiver dados especiais |

##### 5. **Alocação de Custos (Rateio)**

| Campo | Valor |
|-------|-------|
| **Funcionalidade** | Distribuição proporcional de custos por fração ideal ou área de imóvel |
| **Origem** | `Lucide-react/src/domain/rateio/` (motorRateio.ts, ajusteAnual.ts) |
| **Descrição** | Rateio por critério (fração ideal, m², unidade). Ajustes retroativos. Testes com cenários imobiliários. |
| **Testes** | Unit: 10+ testes em motorRateio.test.ts ✅ Passando |
| **Qualidade** | 🔵 **HIGH** — Implementado, testado, production-ready |
| **Padrão** | Cálculo matemático determinístico + ajustes com versionamento |
| **Integração Segura** | ✅ Copiar módulo. Compatível com schema de imóveis. Testar com dados reais ERP (distribuição diferente pode afetar resultados). |
| **Risco** | **medium** — Números podem mudar se critério de rateio for diferente. Mitigar: implementar comparativo antes/depois, aprovação manual do primeiro rateio. |
| **PRÉ-REQUISITOS** | (1) Schema de imóveis + unidades (2) Dados de valores a ratear (3) Períodos contábeis |
| **CUIDADOS** | Comparar rateio antigo vs novo; Documentar mudanças; Fazer ajuste retroativo explícito (audit trail); Validar somas (deve bater com total) |

---

#### 🔴 RED (Alto Risco — NÃO Integrar Direto)

##### 6. **Vistorias/Inspections de Imóveis**

| Campo | Valor |
|-------|-------|
| **Funcionalidade** | Módulo de inspeção física com registro de fotos, itens danificados, laudo |
| **Origem** | `app-bruxel/` (campo `vistorias` mencionado, mas lógica incompleta) |
| **Descrição** | Estrutura existe em schema, mas implementação lógica está ausente (não há cálculos, validação ou fluxo de aprovação). |
| **Testes** | ❌ **NONE** — Sem testes implementados |
| **Qualidade** | 🔴 **LOW** — Estrutura de dados sem lógica operacional |
| **Padrão** | Incompleto (não há padrão consolidado) |
| **Integração Segura** | ❌ **NÃO INTEGRAR** — Requer novo design (fluxo de aprovação, integrações com fotos, cálculos de valores). Melhor: implementar do zero para ERP com requisitos claros. |
| **Risco** | **high** — Código incompleto, sem testes, risco de dados órfãos |
| **PRÉ-REQUISITOS** | Redesign completo |
| **CUIDADOS** | Não copiar código parcial; Criar issue separada para novo módulo de vistorias no ERP; Considerar integração com armazenamento de fotos (S3, etc.) |

---

## Resumo Executivo: Roadmap de Integração Priorizado

### Fase 1 — Integração Imediata (Sprints 1-2)
✅ **Copiar integralmente de Lucide-react:**
1. Classificação automática de documentos
2. Regras aprendidas
3. Exportação de relatórios

**Ação**: Criar `feature/integracao-classif-regras-export` branch, copiar módulos, rodar testes, merge.

### Fase 2 — Integração com Adapção (Sprints 3-4)
⚠️ **Integrar com testes comparativos:**
1. Validadores de dados (com modo dry-run inicial)
2. Alocação de custos (com comparativo antes/depois)

**Ação**: Criar branch, copiar, estender testes com dados ERP, validar, documentar mudanças.

### Fase 3 — Não Fazer (Backlog do ERP)
❌ **Implementar novo (não copiar):**
1. Vistorias/Inspections — novo design com requisitos específicos

**Ação**: Criar issue de design, não bloqueia outras integrações.

## Próximos Passos

1. ✅ Criar nova branch: `análise/integração-funcionalidades-cruzadas`
2. ✅ Rodar Explore Agent para mapear funcionalidades
3. ✅ Consolidar matriz com recomendações de integração
4. ⏹️ Iniciar Fase 1: Copiar 3 módulos GREEN de Lucide-react
5. ⏹️ Criar testes de integração ERP-específicos
6. ⏹️ Documentar checklist de implementação segura

## Notas de Segurança

- **Nunca quebrar** o fluxo heurístico de Lucide-react (risco forense)
- **Sempre revisar** dados antes de auto-aplicar (domain honesty principle)
- **Graceful degradation**: Sistema continua funcional sem IA/backend extra
- **Versionamento**: Cada integração entra como nova feature branch com testes
- **Backups**: Preservar schemas/dados atuais antes de migração

---

*Atualização: Este arquivo será preenchido conforme a análise progride.*
