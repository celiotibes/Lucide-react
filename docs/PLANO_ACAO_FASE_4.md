# Plano de Ação: FASE 4 - Integração com Tribunais + IA Especializada

**Data de Início:** 4 de julho de 2026  
**Versão:** v1.0  
**Status:** 🟢 PRONTO PARA IMPLEMENTAÇÃO

---

## 🎯 Objetivo Geral

Transformar Lucide-react de ferramenta de análise jurimetria em **plataforma integrada com infraestrutura judicial brasileira** com IA especializada em jurisprudência.

**Métrica de Sucesso:** MVP funcional em 8 semanas com:
- ✅ Backend Python + FastAPI
- ✅ Portal Jus.br integrado
- ✅ 3 calculadores jurídicos (dano material, binômio, dano moral)
- ✅ RAG com jurisprudência brasileira
- ✅ Deploy em staging

---

## 📅 Timeline Detalhada (8 semanas)

### SEMANA 1 (4-10 de julho) - Setup Infraestrutura

#### Sprint 1.1: Backend Foundation
```
Objetivo: Estrutura básica de backend funcional

Tarefas:
[ ] 1. Criar /backend com estrutura FastAPI
      └─ backend/
         ├── main.py
         ├── requirements.txt
         ├── .env.example
         ├── services/
         ├── routes/
         ├── models/
         └── utils/

[ ] 2. Configurar FastAPI + uvicorn
      └─ pip install fastapi uvicorn python-dotenv

[ ] 3. Setup PostgreSQL + Redis
      └─ docker-compose.yml com postgres:15 + redis:7

[ ] 4. Implementar autenticação JWT básica
      └─ services/auth.py
         - Create token
         - Verify token
         - Refresh token

[ ] 5. GitHub Actions CI/CD
      └─ .github/workflows/
         - test.yml (pytest)
         - deploy.yml (staging)

[ ] 6. Documentação README.md
      └─ backend/README.md
         - Setup local
         - Docker
         - Variáveis de ambiente

Deliverables:
  - Backend rodando em http://localhost:8000
  - Health endpoint: GET /health
  - Documentação Swagger automática
  - CI/CD em 1-click deploy

Commits: 5-6
Responsável: Dev Backend
Estimado: 2-3 dias
```

#### Sprint 1.2: Frontend Bridge
```
Objetivo: Frontend comunicando com novo backend

Tarefas:
[ ] 1. Criar arquivo src/services/backendClient.ts
      └─ axios com interceptors para JWT
         - Autenticação automática
         - Retry com backoff exponencial
         - Error handling

[ ] 2. Criar hook useFetch() customizado
      └─ hooks/useFetch.ts
         - Estado loading/error/data
         - Cancelamento de requests
         - Cache automático

[ ] 3. Criar env var VITE_API_URL
      └─ .env.local
         VITE_API_URL=http://localhost:8000

[ ] 4. Testar primeiro endpoint (GET /health)
      └─ src/components/StatusBackend.tsx
         - Exibe "Backend: ✅ Online"

Deliverables:
  - Frontend conectado ao backend
  - Comunicação bidirecional funcional
  - Status visual de conexão

Commits: 3
Responsável: Dev Frontend
Estimado: 1-2 dias
```

---

### SEMANA 2 (11-17 de julho) - Portal Jus.br + Dashboard

#### Sprint 2.1: Integração Portal Jus.br
```
Objetivo: Consultar processos via CNJ

Tarefas:
[ ] 1. Implementar backend/routes/processos.py
      └─ GET /processos/{numero}
         - Consultar Portal Jus.br
         - Cache 24h
         - Tratamento de erros

[ ] 2. Criar serviço: services/cnj_portal.py
      ```python
      class CNJPortalClient:
          async def consultar_processo(numero: str) -> dict
          async def consultar_andamentos(numero: str) -> list
      ```

[ ] 3. Frontend: src/components/ConsultadorProcesso.tsx
      └─ Input para número de processo
      └─ Exibe dados em cards (partes, tribunal, etc)

[ ] 4. Integração com TimelineEventos.tsx
      └─ Carrega andamentos como eventos
      └─ Timeline auto-preenchida

[ ] 5. Testes automatizados
      └─ pytest para endpoint
      └─ Vitest para componente React

Deliverables:
  - POST /consultar-processo funcional
  - Frontend com busca de processos
  - Timeline auto-populada com andamentos reais
  - Testes com cobertura >80%

Commits: 4-5
Responsável: Dev Backend + Frontend
Estimado: 2-3 dias
```

#### Sprint 2.2: Dashboard Expansão
```
Objetivo: Integrar Portal Jus.br no Dashboard

Tarefas:
[ ] 1. Criar aba "Processo" no DashboardAnalytics.tsx
      └─ Exibe dados do processo consultado
      └─ Link com fatos probatórios

[ ] 2. Exportar dados do processo para análise
      └─ Pré-preencher fatos de andamentos
      └─ Sincronização automática

[ ] 3. Notifications de andamentos
      └─ Alert quando há movimentação nova
      └─ WebSocket para updates em tempo real

Deliverables:
  - Dashboard com aba "Processo"
  - Dados real-time do tribunal
  - Sincronização automática

Commits: 3
Responsável: Dev Frontend
Estimado: 1-2 dias
```

---

### SEMANA 3 (18-24 de julho) - Cálculos Jurídicos Fase 1

#### Sprint 3.1: Dano Material
```
Objetivo: Calculator de correção monetária

Tarefas:
[ ] 1. Implementar services/calculador_dano_material.py
      └─ Métodos:
         - calcular_ipca(data_inicio, data_fim)
         - calcular_tr(data_inicio, data_fim)
         - calcular_selic(data_inicio, data_fim)
         - calcular_indenizacao(...) com juros compostos

[ ] 2. Criar POST /calcular/dano-material
      └─ Body: data_dano, valor_original, tipo_correccao
      └─ Response: valor_corrigido, juros, total

[ ] 3. Tabelas de referência IPCA/TR/SELIC
      └─ models/indices_economicos.py
      └─ Atualizar mensalmente

[ ] 4. Testes com casos reais
      └─ Valores conhecidos de processos TJSP
      └─ Validação com calculadoras oficiais

[ ] 5. Frontend: FormularioDanoMaterial.tsx
      └─ Campos: data dano, valor, índice
      └─ Resultado em cards coloridos
      └─ Botão "Copiar valor calculado"

Deliverables:
  - POST /calcular/dano-material funcional
  - Componente React com UI clara
  - Banco de dados de índices
  - Testes validados

Commits: 5
Responsável: Dev Backend + Frontend
Estimado: 3 dias
```

#### Sprint 3.2: Pensão Alimentícia (Binômio)
```
Objetivo: Analisar necessidade x possibilidade

Tarefas:
[ ] 1. Implementar services/calculador_pensao.py
      └─ Classe CalculadorPensaoAlimenticia
      └─ Métodos:
         - analisar_binomio(credor, devedor)
         - calcular_percentual_sugerido()
         - validar_limite_maximo()

[ ] 2. Criar POST /calcular/pensao-alimenticia
      └─ Body: renda_credor, despesas_credor, etc
      └─ Response: necessidade, possibilidade, valor_sugerido

[ ] 3. Jurisprudência integrada
      └─ Referências STJ Súmula 358
      └─ Taxa de concessão (87% TJSP)

[ ] 4. Frontend: FormularioPensaoAlimenticia.tsx
      └─ Tabela de renda/despesas
      └─ Análise visual do binômio
      └─ Recomendação de valor

Deliverables:
  - POST /calcular/pensao-alimenticia
  - Componente com análise binômio
  - Fundamentos jurídicos

Commits: 4
Responsável: Dev Backend + Frontend
Estimado: 2 dias
```

#### Sprint 3.3: Dano Moral
```
Objetivo: Calculadora com comparativo jurisprudencial

Tarefas:
[ ] 1. Implementar services/calculador_dano_moral.py
      └─ Banco de faixas jurisprudenciais
      └─ Fatores agravantes/atenuantes
      └─ Jurisprudência similar TJSP

[ ] 2. Criar POST /calcular/dano-moral
      └─ Body: tipo_dano, descricao, fatores
      └─ Response: faixa, valor_sugerido, casos_similares

[ ] 3. Database de jurisprudência
      └─ models/jurisprudencia_dano_moral.py
      └─ 100+ casos TJSP 2024

[ ] 4. Frontend: FormularioDanoMoral.tsx
      └─ Seletor de tipo (leve, moderado, grave)
      └─ Checkboxes fatores
      └─ Exibir casos similares com valores

Deliverables:
  - POST /calcular/dano-moral
  - UI com jurisprudência integrada
  - Database de 100+ casos

Commits: 4-5
Responsável: Dev Backend + Frontend
Estimado: 2 dias
```

---

### SEMANA 4 (25-31 de julho) - RAG Setup

#### Sprint 4.1: Pinecone + Legal-BERT Setup
```
Objetivo: Estrutura RAG pronta

Tarefas:
[ ] 1. Criar conta Pinecone
      └─ Index "jurisprudencia-br"
      └─ Dimensão 384 (Legal-BERT)

[ ] 2. Implementar services/rag_jurisprudencia.py
      └─ HuggingFace embeddings (Legal-BERT-PT)
      └─ Upload vetores para Pinecone
      └─ Similarity search

[ ] 3. Coleta de dados iniciais (100K ementas)
      └─ TJSP OpenData crawler
      └─ STJ jurisprudência
      └─ Cleaning e normalização

[ ] 4. Testing embeddings
      └─ Qualidade de buscas semânticas
      └─ Performance (latência <500ms)

[ ] 5. Documentação
      └─ Como atualizar índice
      └─ Como fazer queries
      └─ Troubleshooting

Deliverables:
  - Pinecone index com 100K+ vetores
  - Pipeline de embedding automático
  - Testes de qualidade

Commits: 5-6
Responsável: Dev Data/Backend
Estimado: 2-3 dias
```

#### Sprint 4.2: LangChain Integration
```
Objetivo: RAG funcional end-to-end

Tarefas:
[ ] 1. Implementar RAG chain com LangChain
      ```python
      from langchain.chains import RetrievalQA
      from langchain.chat_models import ChatAnthropic
      
      qa_chain = RetrievalQA.from_chain_type(
          llm=ChatAnthropic(api_key=...),
          chain_type="stuff",
          retriever=vectorstore.as_retriever(k=5)
      )
      ```

[ ] 2. Criar POST /rag/hermenautica-com-citacoes
      └─ Input: fatos da causa
      └─ Output: hermenêutica + jurisprudência citada
      └─ Fallback: Claude puro se Pinecone offline

[ ] 3. Prompt engineering
      └─ Template com contexto jurídico
      └─ Instrução para citar jurisprudência
      └─ Validação de respostas

[ ] 4. Frontend: HermenauticaComRAG.tsx
      └─ Exibe argumentação com citações clicáveis
      └─ Link para ementa completa

Deliverables:
  - RAG chain end-to-end
  - Endpoint funcionando
  - UI com jurisprudência citada

Commits: 4
Responsável: Dev Backend + Frontend
Estimado: 2 dias
```

---

### SEMANA 5 (1-7 de agosto) - NLP/NER

#### Sprint 5.1: Named Entity Recognition
```
Objetivo: Extrair entidades de petições

Tarefas:
[ ] 1. Implementar services/extrator_entidades.py
      └─ spaCy + Legal-NER pipeline
      └─ Extração: partes, datas, valores, artigos

[ ] 2. Criar POST /analisar/entidades
      └─ Input: texto da petição
      └─ Output: partes, datas, valores, jurisprudência

[ ] 3. Testes com petições reais
      └─ Validação de precisão
      └─ Métricas de recall/precision

[ ] 4. Frontend: AnalisadorEntidades.tsx
      └─ Highlighting de entidades
      └─ Tabela com resumo

Deliverables:
  - NER pipeline funcional
  - Endpoint de análise
  - Validação com petições reais

Commits: 3-4
Responsável: Dev Backend + Frontend
Estimado: 1-2 dias
```

---

### SEMANA 6 (8-14 de agosto) - WebExtensions Foundation

#### Sprint 6.1: WebExtension Skeleton
```
Objetivo: Extensão para navegador compilando

Tarefas:
[ ] 1. Criar /webextension com estrutura Manifest v3
      ```
      webextension/
      ├── manifest.json (v3)
      ├── popup/
      │   ├── popup.html
      │   ├── popup.tsx
      │   └── popup.css
      ├── content/
      │   └── content.ts
      ├── background/
      │   └── service-worker.ts
      └── icons/
      ```

[ ] 2. Popup HTML com botões
      └─ "Analisar Petição"
      └─ "Enviar para e-SAJ"
      └─ "Calcular Dano"

[ ] 3. Content script para ePROC/PJe detection
      └─ Detectar quando usuário está em sistema tribunal
      └─ Injetar botão de ativação

[ ] 4. Comunicação com backend
      └─ Message passing popup <-> content script
      └─ Requisições HTTP autenticadas

[ ] 5. Build com webpack/esbuild
      └─ npm run build:ext
      └─ Output em /dist/webextension

[ ] 6. Teste local em Chrome
      └─ Load unpacked extension
      └─ Validação funcional básica

Deliverables:
  - WebExtension compilando
  - Popup funcional
  - Content script injetando
  - Possível carregar no Chrome

Commits: 4-5
Responsável: Dev Frontend
Estimado: 2 dias
```

---

### SEMANA 7-8 (15-28 de agosto) - Refinamento + Deploy

#### Sprint 7.1: Testes e Otimização
```
Objetivo: Sistema pronto para staging

Tarefas:
[ ] 1. Testes End-to-End (E2E)
      └─ playwright para fluxos críticos
      └─ Buscar processo → Calcular dano → Gerar hermenêutica

[ ] 2. Performance optimization
      └─ Índices no banco de dados
      └─ Caching de consultas
      └─ Lazy loading no frontend

[ ] 3. Security audit
      └─ CORS configurado corretamente
      └─ JWT validation
      └─ Rate limiting em endpoints críticos

[ ] 4. Documentação técnica
      └─ README.md backend
      └─ README.md frontend
      └─ Diagrama arquitetura
      └─ API documentation (Swagger)

Commits: 3-4
Responsável: Dev Backend + Frontend + QA
Estimado: 2-3 dias
```

#### Sprint 7.2: Deploy em Staging
```
Objetivo: MVP rodando em servidor

Tarefas:
[ ] 1. Infraestrutura staging
      └─ AWS EC2 + RDS PostgreSQL
      └─ Redis cache
      └─ Nginx reverse proxy

[ ] 2. Docker Compose para reprodução
      └─ docker-compose.yml com todos serviços
      └─ Variáveis de ambiente
      └─ Persistent volumes

[ ] 3. GitHub Actions deploy
      └─ trigger: push para main
      └─ build docker image
      └─ push para registry
      └─ deploy em staging

[ ] 4. Monitoramento
      └─ Sentry para erros
      └─ DataDog para metrics
      └─ Alertas críticos

[ ] 5. Launch documentation
      └─ Guia de uso para beta testers
      └─ Relatório de bugs conhecidos
      └─ Roadmap público

Deliverables:
  - MVP em staging acessível
  - CI/CD automatizado
  - Monitoramento ativo
  - Documentação de launch

Commits: 5-6
Responsável: DevOps + Dev Backend
Estimado: 2-3 dias
```

---

## 📊 Resumo Timeline

```
Semana  Datas          Foco                              Commits
────────────────────────────────────────────────────────────────
  1     04-10 jul      Backend setup + CI/CD              8-9
  2     11-17 jul      Portal Jus.br integrado            7-8
  3     18-24 jul      Cálculos: dano material, etc       13-14
  4     25-31 jul      RAG com Pinecone                   5-6
  5     01-07 ago      NLP/NER de entidades              3-4
  6     08-14 ago      WebExtension foundation            4-5
  7-8   15-28 ago      Refinamento + deploy              8-10
────────────────────────────────────────────────────────────────
Total: 8 semanas                    MVP funcional      ~50-60 commits
```

---

## 👥 Estrutura de Equipe Recomendada

| Função | Responsabilidade | Dedicação | Experiência Mínima |
|--------|------------------|-----------|-------------------|
| **Dev Backend** | Python/FastAPI, APIs, RAG | 100% | 3+ anos Python |
| **Dev Frontend** | React/TS, UI/UX | 100% | 3+ anos React |
| **DevOps** | Infra, Docker, CI/CD | 50% | 2+ anos |
| **Data Engineer** | RAG, embeddings, dados | 50% | 2+ anos ML |
| **QA/Tester** | E2E, validação, docs | 30% | 1+ ano |

**Custo estimado:** R$ 30.000/mês (2 devs full-time)

---

## 💾 Arquivos a Criar

```
backend/
├── main.py                               (FastAPI app)
├── requirements.txt                      (deps)
├── Dockerfile                            (containerização)
├── docker-compose.yml                    (local dev)
├── .env.example                          (variáveis)
├── pytest.ini                            (config testes)
│
├── services/
│   ├── auth.py                           (JWT)
│   ├── cnj_portal.py                     (Portal Jus.br)
│   ├── calculador_dano_material.py       (Correção monetária)
│   ├── calculador_pensao.py              (Binômio)
│   ├── calculador_dano_moral.py          (Jurisprudência)
│   ├── rag_jurisprudencia.py             (LangChain+Pinecone)
│   ├── extrator_entidades.py             (NER)
│   └── cliente_mni.py                    (MNI API - FASE 4D)
│
├── routes/
│   ├── health.py                         (GET /health)
│   ├── auth.py                           (POST /login)
│   ├── processos.py                      (GET /processos/{numero})
│   ├── calculos.py                       (POST /calcular/*)
│   ├── analise.py                        (POST /analisar/*)
│   └── integracao.py                     (POST /peticionamento/* - FASE 4D)
│
├── models/
│   ├── usuario.py                        (SQLAlchemy)
│   ├── caso.py                           (Caso jurídico)
│   ├── indices_economicos.py             (IPCA, TR, SELIC)
│   └── jurisprudencia.py                 (Ementas)
│
├── utils/
│   ├── validadores.py                    (Validação CPF, CNPJ, etc)
│   ├── conversores.py                    (Conversão de formatos)
│   ├── certificado_digital.py            (Para FASE 4D)
│   └── logger.py                         (Logging estruturado)
│
└── tests/
    ├── test_calculos.py
    ├── test_cnj_portal.py
    ├── test_rag.py
    └── test_api.py

webextension/
├── manifest.json                         (Manifest v3)
├── package.json                          (deps)
├── tsconfig.json                         (config TS)
│
├── popup/
│   ├── popup.html
│   ├── popup.tsx
│   └── popup.css
│
├── content/
│   ├── content.ts                        (Injetor de UI)
│   └── detector.ts                       (Detecta ePROC/PJe)
│
├── background/
│   └── service-worker.ts                 (Background logic)
│
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png

Frontend (existente):
├── src/services/backendClient.ts         (NOVO: Axios client)
├── src/hooks/useFetch.ts                 (NOVO: Custom hook)
├── src/components/ConsultadorProcesso.tsx (NOVO)
├── src/components/FormularioCálculos.tsx (NOVO)
│   ├── FormularioDanoMaterial.tsx
│   ├── FormularioPensaoAlimenticia.tsx
│   └── FormularioDanoMoral.tsx
└── src/components/HermenauticaComRAG.tsx (NOVO)

Documentation:
├── docs/ANALISE_VIABILIDADE_*.md         (✅ Criado)
├── docs/PLANO_ACAO_FASE_4.md             (✅ Este arquivo)
├── backend/README.md                     (NOVO)
├── webextension/README.md                (NOVO)
└── docs/API_DOCUMENTATION.md             (NOVO)
```

---

## ✅ Checklist Pré-Desenvolvimento

Antes de começar o código:

- [ ] Clonar repo em branch nova: `git checkout -b claude/fase-4-backend`
- [ ] Criar `/backend` vazio e adicionar ao git
- [ ] Criar `.python-version` com 3.11.x
- [ ] Setup venv: `python -m venv venv && source venv/bin/activate`
- [ ] Criar `backend/requirements.txt` inicial
- [ ] Adicionar backend ao `.gitignore` (se necessário)
- [ ] Criar primeira estrutura e fazer commit inicial
- [ ] Setup CI/CD básico no GitHub Actions
- [ ] Comunicar timeline com stakeholders

---

## 🎓 Referências Técnicas

### Para Backend Dev:

- FastAPI Best Practices: https://fastapi.tiangolo.com/
- PostgreSQL 15: https://www.postgresql.org/docs/15/
- LangChain: https://python.langchain.com/
- spaCy: https://spacy.io/
- Legal-BERT: https://huggingface.co/rufimelo/Legal-BERT-pt

### Para Frontend Dev:

- React 19: https://react.dev
- TypeScript: https://www.typescriptlang.org
- Vite: https://vitejs.dev

### APIs Externas:

- Portal Jus.br: https://www.cnj.jus.br/
- Pinecone: https://www.pinecone.io/
- Anthropic Claude: https://docs.anthropic.com

---

## 📝 Status Atual

**Última atualização:** 4 de julho de 2026  
**Status:** 🟢 PRONTO PARA COMEÇAR

Next action: Criar `/backend` e iniciar Sprint 1.1

---

**Branch de trabalho:** `claude/legal-accounting-plugins-4gmkm3`  
**Próximo commit:** Adição de `/backend` skeleton
