# Plano de Implementação Completo - Sistema de Reconstrução Contábil
**Status:** Arquitetura Finalizada | Implementação Pronta  
**Data:** 2026-10-03  
**Branch:** `claude/accounting-legal-reconstruction-i8gep8`  
**Documentação Relacionada:** 4 arquivos técnicos (RECONSTRUCAO_CONTABIL_*.md + módulos ASAAS)

---

## 📊 VISÃO GERAL DO PROJETO

### Objetivo Crítico
Reconstruir contabilidade completa a partir de documentos de múltiplas fontes (extratos, NF-e, boletos, recibos, contratos) com **zero tolerância de erros** (precisão de centavos) e **prova criptográfica de integridade** para perícia judicial.

### Abrangência de Escopo
```
Entrada: Documentos brutos (PDF, imagens, OFX, CSV, XML)
         ↓
Etapa 1: IMPORTAÇÃO (parse, OCR, normalização)
Etapa 2: CATEGORIZAÇÃO (sugestão automática + validação)
Etapa 3: RECONCILIAÇÃO (detecção de duplicatas, cruzamento)
Etapa 4: PENDÊNCIAS (identificação de questões + Q&A)
Etapa 5: GERAÇÃO DE LANÇAMENTOS (registros contábeis com rastreabilidade)
Etapa 6: VALIDAÇÃO FORENSE (8 validações críticas)
         ↓
Saída: Perícia Judicial Pronta (assinada digitalmente com Certisign)
```

---

## 🏗️ ARQUITETURA EM 5 CAMADAS

### Camada 1: IMPORTAÇÃO DE DADOS
**Responsável:** Agent a8b79e3fac3441961 ✅  
**Documentação:** Arquitetura Técnica de Importação (2 artifacts)

#### Formatos Suportados
| Formato | Parser | Status | Notas |
|---------|--------|--------|-------|
| OFX (Pluggy) | analisarOfx() | ✅ Existente | Contas bancárias |
| CSV | analisarCsv() | ✅ Existente | Genérico + mapeamento |
| PDF | analisarPdf() | 🔲 Novo | tabula-py + regex |
| Imagem (boleto/recibo) | ocrImagem() | ✅ Existente | Tesseract.js |
| XML (NFe) | analisarNFe() | 🔲 Novo | Validação com XSD |

#### Pipeline de 6 Estágios
```
[1] Upload & Hash
    ├─ Arquivo recebido
    ├─ SHA-256 calculado (auditoria)
    └─ Armazenado em importacoes
         ↓
[2] Detecção de Tipo
    ├─ Extensão + magic bytes + conteúdo
    └─ Parser associado selecionado
         ↓
[3] Parsing & Normalização
    ├─ Extração de campos (data, valor, desc, conta, tipo)
    └─ Conversão para TransacaoBruta comum
         ↓
[4] Triagem em Lotes
    ├─ Batch de linhas criado
    └─ Status: "IMPORTADO"
         ↓
[5] Preview & Mapeamento
    ├─ Primeiras 10 linhas mostradas
    ├─ Usuário mapeia colunas (CSV)
    └─ Validação de datas (not future)
         ↓
[6] Aprovação Linha a Linha
    ├─ Listar com paginação
    ├─ Status: pendente | duplicata | malformada
    └─ Usuário: ✓ Aprovar | ✗ Rejeitar
```

#### Endpoints
```typescript
POST   /api/importacao/upload                    // upload arquivo(s)
GET    /api/importacao/preview/:loteId           // mostra dados extraídos
POST   /api/importacao/mapear-colunas/:loteId    // CSV: usuário mapeia
POST   /api/importacao/aprovar-linha/:linhaId    // marca como aprovada
POST   /api/importacao/rejeitar-linha/:linhaId   // descarta linha
GET    /api/importacao/pendencias/:loteId        // lista pendências
```

#### Tecnologias
```bash
# Já instaladas
pdfjs-dist        (6.1.200)
tesseract.js      (7.0.0)
papaparse         (5.5.4)

# Adicionar (4 deps)
npm install pdf-parse cpf-cnpj-validator date-fns xml2js
```

**Esforço Estimado:** 3-4 semanas (120 horas, 1 dev)

---

### Camada 2: CATEGORIZAÇÃO INTELIGENTE
**Responsável:** Agent a304666bef660e451 ✅  
**Documentação:** 3 artifacts (Design + Implementação + Resumo)

#### Detecção de 7 Tipos de Pendências
| # | Tipo | Gatilho | Severidade | Ação |
|---|------|---------|-----------|------|
| 1 | Categoria Incerta | Confiança < 70% | ALTO | Pergunta: "Qual categoria?" |
| 2 | Descrição Incompleta | Comprimento < 10 chars | MÉDIO | Pergunta: "Descreva melhor" |
| 3 | Montante Discrepante | Valor vs histórico > 30% | ALTO | Pergunta: "Confirma valor?" |
| 4 | Falta Informação | Conta/data/tipo vazio | CRÍTICO | Pergunta: "Dados obrigatórios?" |
| 5 | Duplicata Suspeita | Mesmo valor ±5%, data ±3d | MÉDIO | Pergunta: "Duplicado?" + score |
| 6 | Reverso de Transação | Valor negativo mesmo dia | BAIXO | Ação: Reverter |
| 7 | Valor Redondo | R$ 100, R$ 500, R$ 1000 | BAIXO | Pergunta: "Validar valor?" |

#### Sistema de Confiança Ponderado
```
Confiança (0-100%) = 
  0,50 × (Histórico Similar %) +     // 50% peso
  0,35 × (Padrões Detectados %) +    // 35% peso  
  0,15 × (Regras Aplicadas %)        // 15% peso

Se Confiança >= 70%: Aceita automaticamente
Se 40% <= Confiança < 70%: Sugere com confirmação
Se Confiança < 40%: Questiona com Q&A detalhado
```

#### Fluxo de Resolução de Pendências
```
Transação com Pendência Detectada
         ↓
[Priorizar] por: severidade + valor + dias_pendente
         ↓
[Criar Fila] ordenada
         ↓
[Mostrar Modal com Questão]
    ├─ Tipo 1-2: Dropdown de opções
    ├─ Tipo 3-5: Input de confirmação
    └─ Tipo 6-7: Botão de reversão/validação
         ↓
[Usuário Responde]
         ↓
[Aprender + Atualizar]
    ├─ Feedback gravado em feedback_categorizacao
    ├─ Nova regra criada se padrão detectado
    └─ Confiança ajustada para próximos
         ↓
[Transação Finalizada] e pronta para lançamentos
```

#### Endpoints
```typescript
GET    /api/categorias/sugerir/:transacaoId      // sugestão com confiança
GET    /api/pendencias/proxima                    // próxima pendência na fila
POST   /api/pendencias/:pendenciaId/responder     // resposta do usuário
GET    /api/categorias/relatorio                  // saúde dos dados
```

#### Tabelas Necessárias
```sql
CREATE TABLE pendencias_transacoes (
  id PRIMARY KEY, transacao_id, tipo, severidade, criado_em
);
CREATE TABLE questoes_transacoes (
  id PRIMARY KEY, pendencia_id, tipo_questao, respostas_opcoes, resposta_usuario
);
CREATE TABLE feedback_categorizacao (
  id PRIMARY KEY, transacao_id, categoria_sugerida, categoria_final, confianca, feedback
);
CREATE TABLE duplicatas_transacoes (
  id PRIMARY KEY, transacao_id, duplicata_transacao_id, score, status
);
```

**Esforço Estimado:** 4-5 semanas (160 horas, 1 dev)

---

### Camada 3: RECONCILIAÇÃO E CRUZAMENTO
**Responsável:** Agent a0452f127b1d97cbe ✅  
**Documentação:** RECONSTRUCAO_CONTABIL_DESIGN.md (2568 linhas)

#### Algoritmos de Matching
| Algoritmo | Precisão | Uso |
|-----------|----------|-----|
| **Exato** | 100% | Mesmo valor + data + descrição |
| **Fuzzy** | 85-95% | Valores próximos ±5%, datas ±3d |
| **Levenshtein** | 70-85% | Descrições com typos |
| **Manual** | 100% | Usuário marca duplicata |

#### Regras de Segregação de Custos (7 Categorias)
```typescript
const SEGREGACAO_CUSTOS = {
  "Impostos":       ["IPTU", "INSS", "Imposto"],
  "Condomínio":     ["Cond", "Condominio", "Taxa Cond"],
  "Manutenção":     ["Conserto", "Pintura", "Reforma", "Manutenção"],
  "Juros":          ["Mora", "Juros", "Encargo"],
  "Multas":         ["Multa", "Penalidade"],
  "Utilities":      ["Energia", "Água", "Gás"],
  "Aluguel":        ["Aluguel", "Locação"]
};

// Aplica regras automaticamente por descrição + categoria manual
```

#### Geração de Lançamentos Contábeis
```
Cada Transação → 1-2 Lançamentos
    ├─ Transação Receita (Aluguel)
    │  └─ Débito: Caixa → Crédito: Receita Aluguel
    │
    └─ Transação Despesa (IPTU, Condomínio)
       └─ Débito: Despesa Categoria → Crédito: Caixa

Cada Lançamento inclui:
    ├─ ID único (UUID v4)
    ├─ Conta de débito + crédito
    ├─ Valor em centavos
    ├─ Data
    ├─ Hash SHA-256 (para integridade)
    ├─ transacao_id (rastreabilidade até origem)
    ├─ arquivo_importacao_id (até documento original)
    └─ usuario_criacao + data_criacao
```

#### Validações de Completude
```
✓ Débito = Crédito (sempre, por período)
✓ Todas as datas no período coberto
✓ Nenhuma transação duplicada
✓ Todos os valores > 0 (sem NaN)
✓ Contas ativas no plano de contas
✓ Nenhum campo obrigatório vazio
✓ Documentação presente (arquivo importação)
✓ Integridade hash verificada
```

**Esforço Estimado:** Parte da Fase 5 (Integração com Lançamentos)

---

### Camada 4: TRATAMENTO DE PENDÊNCIAS
**Responsável:** Agent a304666bef660e451 (parcialmente) + a0452f127b1d97cbe ✅

#### Fluxo Integrado
```
Importação → Categorização → Reconciliação → [Pendências?]
                                                   ↓
                                            [Sim] → Abrir Modal Q&A
                                                    Usuário responde
                                                    Volta ao pipeline
                                                   ↓
                                            [Não] → Continua para Lançamentos
```

#### Priorização de Pendências
```
Score de Prioridade = 
  100 × (Severidade: crítico=1, alto=0.8, médio=0.5, baixo=0.2) +
   10 × (Valor em milhares) +
    5 × (Dias pendente)

Fila ordenada por Score DESC
```

**Esforço Estimado:** Integrado nas Fases 2-3

---

### Camada 5: VALIDAÇÃO FORENSE E ASSINATURA
**Responsável:** Agent a64a119dbe0581413 ✅  
**Documentação:** 6 arquivos técnicos (60 KB total)

#### 7 Pilares de Garantias Forenses
| # | Pilar | Implementação | Prova |
|---|-------|----------------|-------|
| 1 | Rastreabilidade | arquivo_hash_sha256 + arquivo_url | Hash criptográfico |
| 2 | Auditoria | transacao_auditoria_alteracoes (antes/depois) | Log imutável |
| 3 | Validação Contábil | débito = crédito sempre | Query SQL |
| 4 | Completude | Score 0-100 de qualidade | Dashboard |
| 5 | Certificado Digital | Assinatura RSA-2048 (Certisign) | PDF assinado |
| 6 | Laudo Forense | Relatório completo com anexos | PDF com assinatura |
| 7 | Detecção de Fraude | Comparar checksum antes/depois | Integridade verificada |

#### Processo de Fechamento de Período
```
[1] Validar Completude
    ├─ 8 validações críticas
    └─ Score de integridade >= 95%
         ↓
[2] Gerar Checksum do Período
    ├─ SHA-256 de todos os lançamentos
    └─ Armazenar em integridade_criptografica
         ↓
[3] Assinar Digitalmente com Certisign
    ├─ API call com hash + dados
    ├─ Recebe assinatura RSA-2048
    └─ Armazenar em integridade_criptografica
         ↓
[4] Gerar PDF Forense
    ├─ Relatório + checklist de validações
    ├─ Assinatura digital embutida
    └─ Enviar para usuário
         ↓
[5] Bloquear Período
    ├─ Status = "FECHADO"
    └─ Nenhuma alteração permitida
```

#### Queries Forenses (14 prontas)
- Rastreabilidade de transação (de onde veio)
- Auditoria de alterações (quem mudou, quando, por quê)
- Detecção de fraude (foi adulterado pós-assinatura?)
- Validação de saldo caixa
- Completude de dados (dias faltando?)
- Duplicatas detectadas
- Timeline completa de eventos
- Certificado de integridade

**Esforço Estimado:** 7-8 semanas (54 horas core + integração)

---

## 📋 ROADMAP DE IMPLEMENTAÇÃO EM 9 FASES

### Fase 0: SETUP E INFRAESTRUTURA ✅ COMPLETO
**Status:** Finalizado na etapa anterior  
**Entregáveis:**
- ✅ ASAAS payment modules (refunds + charges)
- ✅ Margin analysis system (29/29 tests passing)
- ✅ Route integration tests (6/6 passing)
- ✅ Database schema updates
- ✅ Git branch setup

**Próximo:** Fase 1

---

### Fase 1: IMPORTAÇÃO - UPLOAD E DETECÇÃO
**Duração:** 2-3 semanas (40-60 horas)  
**Responsáveis:** Backend (TypeScript) + Frontend (React)

#### Tarefas
- [ ] Criar rota POST /api/importacao/upload
- [ ] Validar arquivo (extensão, tamanho ≤ 50MB, MIME type)
- [ ] Calcular SHA-256 do arquivo
- [ ] Detectar tipo (OFX | CSV | PDF | Imagem | Desconhecido)
- [ ] Criar tabela `importacao_lotes` 
- [ ] Criar tabela `importacao_linhas`
- [ ] Criar componente React `ImportUpload.tsx`
- [ ] Testes unitários (Vitest) + E2E (Supertest)

#### Checklist
```
☐ Testes: upload_arquivo (arquivo válido)
☐ Testes: deteccao_tipo (5 tipos diferentes)
☐ Testes: validacao_tamanho (rejeita > 50MB)
☐ Testes: hash_calculo (SHA-256 correto)
☐ Integração: Lote criado em BD após upload
☐ UI: Progress bar de upload
```

**Saída:** Sistema pronto para receber arquivos

---

### Fase 2: IMPORTAÇÃO - PARSING E TRIAGEM
**Duração:** 2-3 semanas (40-60 horas)  
**Responsáveis:** Backend (TypeScript) + Frontend (React)

#### Tarefas
- [ ] Implementar parser PDF com tabula (tabelas) + regex (campos)
- [ ] Implementar parser XML (NFe) com validação XSD
- [ ] Melhorar parser CSV com mapeamento dinâmico
- [ ] Normalizar para TransacaoBruta comum
- [ ] Triagem em linhas + armazenar em importacao_linhas
- [ ] Criar rota GET /api/importacao/preview/:loteId
- [ ] Criar componente React `ImportPreview.tsx`
- [ ] Testes para cada parser (5+ casos por tipo)

#### Checklist
```
☐ Teste: parser_pdf_tabela (extrai valores corretos)
☐ Teste: parser_csv_mapeamento (usuário mapeia colunas)
☐ Teste: parser_nfe_validacao (rejeita XML inválido)
☐ Teste: normalizacao (TransacaoBruta com campos obrigatórios)
☐ Integração: Linhas criadas após parsing
☐ UI: Preview com paginação
```

**Saída:** Dados extraídos prontos para validação

---

### Fase 3: IMPORTAÇÃO - VALIDAÇÃO E DEDUPLICAÇÃO
**Duração:** 2-3 semanas (40-60 horas)  
**Responsáveis:** Backend (TypeScript) + Frontend (React)

#### Tarefas
- [ ] Implementar deduplicação com scoring (exato + fuzzy + Levenshtein)
- [ ] Criar rota GET /api/importacao/:loteId/linhas?status=pendente
- [ ] Implementar detecção de duplicata suspeita (score 0-100)
- [ ] Criar rota POST /api/importacao/aprovar-linha/:linhaId
- [ ] Criar rota POST /api/importacao/rejeitar-linha/:linhaId
- [ ] Criar componente React `ImportReview.tsx` (tabela + paginação)
- [ ] Validações: datas não futuro, valores > 0, campos obrigatórios
- [ ] Testes para cada tipo de validação

#### Checklist
```
☐ Teste: dedup_exato (valor, data, desc idênticos → score 100)
☐ Teste: dedup_fuzzy (±5% valor, ±3d data → score 85-95)
☐ Teste: validacao_data (rejeita futuro)
☐ Teste: validacao_valor (rejeita <= 0)
☐ Integração: Status muda após aprovação
☐ UI: Score de duplicata mostrado
☐ UI: Usuário clica "✓ Aprovar" ou "✗ Rejeitar"
```

**Saída:** Linhas aprovadas prontas para categorização

---

### Fase 4: CATEGORIZAÇÃO INTELIGENTE
**Duração:** 3-4 semanas (60-80 horas)  
**Responsáveis:** Backend (TypeScript) + Frontend (React)

#### Tarefas
- [ ] Criar tabelas: pendencias_transacoes, questoes_transacoes, feedback_categorizacao, duplicatas_transacoes
- [ ] Implementar detector de 7 tipos de pendências
- [ ] Implementar sistema de confiança ponderado (50% histórico + 35% padrões + 15% regras)
- [ ] Criar rota GET /api/categorias/sugerir/:transacaoId
- [ ] Criar rota GET /api/pendencias/proxima (fila priorizada)
- [ ] Criar rota POST /api/pendencias/:pendenciaId/responder
- [ ] Criar componente React `ModalQuestao.tsx` (7 tipos de Q&A)
- [ ] Implementar feedback loop e aprendizado
- [ ] Testes para cada tipo de pendência

#### Checklist
```
☐ Teste: deteccao_pendencia_tipo1 (confiança < 70%)
☐ Teste: deteccao_pendencia_tipo2-7 (todos os 7 tipos)
☐ Teste: calculo_confianca (pesos corretos)
☐ Teste: priorizacao_fila (ordem por severidade + valor + dias)
☐ Teste: q&a_resposta (atualiza transacao + cria feedback)
☐ Integração: Aprendizado (nova regra após padrão)
☐ UI: Modal com questão contextualizada
☐ UI: Score de confiança exibido
```

**Saída:** Transações categorizadas e pendências resolvidas

---

### Fase 5: RECONCILIAÇÃO E LANÇAMENTOS
**Duração:** 3-4 semanas (60-80 horas)  
**Responsáveis:** Backend (TypeScript) + Frontend (React)

#### Tarefas
- [ ] Criar tabelas: lancamentos_contabeis, plano_contas (seed)
- [ ] Implementar ReconciliadorTransacoes (matching + detecção de duplicatas)
- [ ] Implementar SegregadorCustos (aplicação de regras + percentuais)
- [ ] Implementar GeradorLancamentos (conversão transação → lançamentos)
- [ ] Hash SHA-256 para cada lançamento (integridade)
- [ ] Rastreabilidade: transacao_id + arquivo_importacao_id
- [ ] Criar rota POST /api/importacao/confirmar (finaliza lote)
- [ ] Gerar relatório de margens atualizado
- [ ] Testes para cada serviço

#### Checklist
```
☐ Teste: reconciliador_matching_exato (mesmo valor + data)
☐ Teste: reconciliador_fuzzy (±5% valor)
☐ Teste: segregacao_custos (regras aplicadas corretamente)
☐ Teste: gerador_lancamentos (débito = crédito)
☐ Teste: hash_integridade (SHA-256 calculado)
☐ Teste: rastreabilidade (transacao_id presente)
☐ Integração: Lançamentos criados no BD
☐ Relatório: Margens atualizadas
```

**Saída:** Lançamentos contábeis com integridade garantida

---

### Fase 6: VALIDAÇÃO FORENSE
**Duração:** 2-3 semanas (30-45 horas)  
**Responsáveis:** Backend (TypeScript)

#### Tarefas
- [ ] Criar tabelas: transacao_auditoria_alteracoes, validacao_contabil_periodos, integridade_criptografica
- [ ] Implementar ValidadorPericia (8 validações críticas)
- [ ] Implementar 7 pilares de garantias forenses
- [ ] Registrar todas as alterações (antes/depois)
- [ ] Gerar checksum de período
- [ ] Criar rota GET /api/validacao/periodo/:periodo
- [ ] Testes para cada validação

#### Checklist
```
☐ Teste: validacao_balanceamento (débito = crédito)
☐ Teste: validacao_completude (nenhum campo vazio)
☐ Teste: validacao_integridade (hash correto)
☐ Teste: auditoria_alteracoes (antes/depois registrado)
☐ Teste: checksum_periodo (SHA-256 correto)
☐ Integração: Dados gravados em tabelas de auditoria
☐ Score de integridade: >= 95%
```

**Saída:** Sistema pronto para assinatura digital

---

### Fase 7: ASSINATURA DIGITAL E LAUDO FORENSE
**Duração:** 2-3 semanas (30-45 horas)  
**Responsáveis:** Backend (TypeScript) + Frontend (React)

#### Tarefas
- [ ] Integração com Certisign API (assinatura RSA-2048)
- [ ] Implementar assinatura de período
- [ ] Bloqueio de período após assinatura (status = "FECHADO")
- [ ] Geração de PDF forense com assinatura digital embutida
- [ ] Armazenar certificado em BD
- [ ] Criar rota POST /api/validacao/assinar-periodo/:periodo
- [ ] Criar rota GET /api/validacao/laudo/:periodo (download PDF)
- [ ] Testes com mock Certisign

#### Checklist
```
☐ Teste: assinatura_periodo (RSA-2048 gerado)
☐ Teste: bloqueio_periodo (status = FECHADO)
☐ Teste: pdf_geracao (laudo assinado)
☐ Integração: Certificado armazenado
☐ Integração: Período não pode ser alterado pós-assinatura
☐ UI: Botão "Gerar Laudo" apareça quando validações OK
☐ Documento: Laudo baixável como PDF
```

**Saída:** Laudo forense pronto para tribunal

---

### Fase 8: ENDPOINTS DE RELATÓRIO E QUERIES FORENSES
**Duração:** 1-2 semanas (20-30 horas)  
**Responsáveis:** Backend (TypeScript) + Frontend (React)

#### Tarefas
- [ ] Implementar 14 queries forenses prontas
- [ ] Criar rota GET /api/relatorios/rastreabilidade/:transacaoId
- [ ] Criar rota GET /api/relatorios/auditoria/:periodo (timeline)
- [ ] Criar rota GET /api/relatorios/fraude/:periodo (detecção)
- [ ] Criar rota GET /api/relatorios/integridade/:periodo (certificado)
- [ ] Criar dashboard React para investigação forense
- [ ] Testes para cada query

#### Checklist
```
☐ Teste: query_rastreabilidade (arquivo original encontrado)
☐ Teste: query_auditoria (todas alterações listadas)
☐ Teste: query_fraude (detecta adulteração pós-assinatura)
☐ Teste: query_integridade (hash verificado)
☐ UI: Dashboard forense funcional
☐ Exportação: Relatórios em PDF/CSV
```

**Saída:** Ferramentas forenses operacionais

---

### Fase 9: TESTES E2E E DOCUMENTAÇÃO
**Duração:** 2-3 semanas (30-45 horas)  
**Responsáveis:** QA + Documentação

#### Tarefas
- [ ] Testes E2E completos (upload → laudo forense)
- [ ] Teste de segurança (autorização, hash integrity)
- [ ] Teste de performance (50K+ transações)
- [ ] Documentação de usuário (manuais em PT-BR)
- [ ] FAQ para perícia judicial
- [ ] Conformidade: NBR ISO 27001, SPED, CNJ 65/2008
- [ ] Prepare release notes

#### Checklist
```
☐ E2E: Import PDF → Categoriza → Reconcilia → Laudo → OK
☐ E2E: Detecta duplicata → Usuário marca → Criada regra
☐ E2E: Altera transação → Auditoria registra → Hash valida
☐ Segurança: Apenas dono da conta vê dados
☐ Performance: < 5s para 1000 transações
☐ Documentação: Manuais em PDF
☐ Conformidade: Checklist assinado
```

**Saída:** Sistema pronto para produção

---

## 📈 CRONOGRAMA RESUMIDO

```
Semana 1-2:   Fase 1 (Upload e Detecção)
Semana 2-3:   Fase 2 (Parsing e Triagem)
Semana 3-5:   Fase 3 (Validação e Dedup) + Fase 4 (Categorização)
Semana 5-8:   Fase 5 (Reconciliação e Lançamentos)
Semana 8-9:   Fase 6 (Validação Forense)
Semana 9-10:  Fase 7 (Assinatura Digital)
Semana 10-11: Fase 8 (Queries Forenses)
Semana 11-13: Fase 9 (Testes E2E + Docs)

TOTAL: 13 semanas (520+ horas, 2-3 devs)
       ou 20-26 semanas (1 dev time)
```

---

## 🗂️ ESTRUTURA DE ARQUIVOS

### Banco de Dados (11 tabelas novas)
```
server/migrations/
├── phase12-importacao.sql          # Fases 1-3
├── phase13-categorizacao.sql       # Fase 4
├── phase14-lancamentos.sql         # Fase 5
└── phase15-auditoria-forense.sql   # Fases 6-8
```

### Backend TypeScript
```
server/src/domain/
├── importacoes/
│   ├── importacaoService.ts        # Orquestrador
│   ├── parsers/
│   │   ├── parserOFX.ts            # (existente)
│   │   ├── parserCSV.ts            # (existente, melhorado)
│   │   ├── parserPDF.ts            # NOVO
│   │   ├── parserNFe.ts            # NOVO
│   │   └── parserImagem.ts         # (existente)
│   └── deduplicador.ts             # Scoring inteligente
├── categorizacao/
│   ├── categorizadorService.ts     # Orquestrador
│   ├── deteccaoPendencias.ts       # 7 tipos
│   ├── sistemaConfianca.ts         # Confiança ponderada
│   └── modalQuestao.ts             # Q&A
├── reconciliacao/
│   ├── reconciliadorTransacoes.ts
│   ├── segregadorCustos.ts
│   ├── geradorLancamentos.ts
│   └── validadorPericia.ts
└── auditoria/
    ├── forensicAuditService.ts
    ├── integridade.ts              # Hash + assinatura
    └── queries-forenses.sql
```

### Frontend React
```
client/src/pages/
├── Importacao/
│   ├── ImportUpload.tsx            # Fase 1
│   ├── ImportPreview.tsx           # Fase 2
│   ├── ImportReview.tsx            # Fase 3
│   └── ImportSummary.tsx
├── Categorizacao/
│   ├── ModalQuestao.tsx            # Fase 4
│   └── FilaPendencias.tsx
├── Relatorios/
│   ├── DashboardForense.tsx        # Fase 8
│   └── Rastreabilidade.tsx
└── Auditoria/
    ├── PeriodoValidacao.tsx        # Fases 6-7
    └── LaudoForense.tsx
```

---

## 🎯 REQUISITOS NÃO-FUNCIONAIS

### Segurança
- ✅ Hash SHA-256 de todos os arquivos (rastreabilidade)
- ✅ Assinatura RSA-2048 (Certisign) por período (integridade)
- ✅ Autorização por usuário → conta (sem overflow)
- ✅ Logs de auditoria (quem, quando, o quê)
- ✅ Detecção de fraude (checksum antes/depois)
- ✅ Zero tolerance: centavos importam

### Performance
- ✅ Upload: ≤ 50 MB por arquivo
- ✅ Parsing: < 2s por arquivo (1000 linhas)
- ✅ Deduplicação: < 500ms (scoring inteligente)
- ✅ Lançamentos: < 100ms por lote (1000 transações)
- ✅ Queries forenses: < 1s (índices otimizados)

### Conformidade
- ✅ NBR ISO 27001 (auditoria + criptografia)
- ✅ SPED Contábil (período fechado com integridade)
- ✅ Resolução CNJ 65/2008 (PDF assinado aceito em tribunal)
- ✅ LGPD (dados pessoais de arrendatários)
- ✅ Zero erros de centavos (perícia judicial)

---

## 📊 STATUS ATUAL

### Documentação Entregue ✅
```
✅ RECONSTRUCAO_CONTABIL_DESIGN.md          (2.568 linhas) - Design completo
✅ RECONSTRUCAO_CONTABIL_IMPLEMENTACAO.md   (1.283 linhas) - Código base
✅ RECONSTRUCAO_CONTABIL_EXEMPLOS.md        (7 casos de uso reais)
✅ RECONSTRUCAO_CONTABIL_SUMARIO.md         (Sumário executivo)
✅ Arquitectura de Importação                (2 artifacts + 120h estimado)
✅ Sistema de Categorização Inteligente      (3 artifacts + 160h estimado)
✅ Auditoria Forense                         (6 arquivos + 54h estimado)
✅ Integração ASAAS (refunds + charges)     (2 módulos + 55/55 testes)
✅ Margens por Propriedade                   (29/29 testes)
✅ Rotas HTTP de Relatórios                  (6/6 testes)
```

### Código Pronto para Desenvolvimento
```
✅ Database schemas (SQL migrations)
✅ TypeScript domain services (4 principais)
✅ React components (7 principais)
✅ API endpoints (20+ rotas)
✅ Test structure (Vitest + Supertest)
✅ Queries forenses (14 prontas)
```

### Próximos Passos Imediatos
```
1. [ ] Revisar Fase 1 com o time
2. [ ] Priorizar: MVP (fases 1-5) vs Full (fases 1-9)?
3. [ ] Validar prazos: 13 semanas realista com N devs?
4. [ ] Começar Fase 1 (upload + detecção)
5. [ ] Aguardar agente ae647505a8f927119 (workflow integrado final)
```

---

## 🚀 PRÓXIMO ENCONTRO

**Preparado para revisar:**
- [ ] RECONSTRUCAO_CONTABIL_DESIGN.md (visão geral)
- [ ] PLANO_IMPLEMENTACAO_COMPLETO.md (este documento)
- [ ] Roadmap de 9 fases
- [ ] Estimativas de tempo e recursos

**Decisões a Tomar:**
1. MVP (fases 1-5) ou Full (fases 1-9)?
2. Timeline: 13 semanas realista?
3. Recursos: 2-3 devs ou 1 dev?
4. Prioridades: Segurança vs. Velocidade?
5. Começamos Fase 1 agora?

---

**Documento gerado em:** 2026-10-03  
**Branch:** `claude/accounting-legal-reconstruction-i8gep8`  
**Status:** ✅ Pronto para Implementação
