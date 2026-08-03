# Documentação CRMT Gestão Imobiliária

Central de Documentação Especializada do Sistema ERP CRMT para Gestão Imobiliária

---

## 📚 Documentos Disponíveis

### 1. 💰 Relatório Financeiro e Patrimonial
**Arquivo:** `01-relatorio-financeiro.md`

Consolidação completa de todas as atividades financeiras do sistema:
- Estrutura de contas contábeis (1100-2400)
- Análise de receitas (aluguel, reembolsos, multas, juros, taxa admin, FRO, reajustes)
- Análise de despesas (manutenção, administrativo, condomínio, financiamentos)
- Pipeline de recebimento e split payment
- Regime contábil duplo (competência + caixa)
- Contingências e provisão para inadimplência
- Garantias e alertas automáticos
- Indicadores consolidados (R$2.812.530 receita, R$712.600 despesa, R$6.600.000 patrimônio)

**Público:** Contadores, CFOs, Analistas Financeiros, Auditores  
**Uso:** Auditoria contábil, planejamento tributário, análise de fluxo de caixa  
**Links:** [Visualizar no Artifact](https://claude.ai/code/artifact/56c70029-0244-4e51-9405-b551ea97b567)

---

### 2. 🏗️ Análise de Requisitos e Arquitetura
**Arquivo:** `02-arquitetura-requisitos.md`

Especificação técnica completa da arquitetura e requisitos do sistema:
- Stack tecnológico (Next.js 15.5.20, PostgreSQL, Supabase, TypeScript strict)
- 11 requisitos funcionais (RF-001 a RF-031)
- 17 requisitos não-funcionais (RNF-001 a RNF-020)
- Decisões arquiteturais justificadas (RLS nativa, audit log imutável, pró-rata 30d comerciais)
- Algoritmo ColiMatch™ para compatibilidade de co-living
- Segurança: 71/71 tabelas com RLS policies, 26 tabelas audit_log com triggers
- Testes: 50+ testes para cálculos financeiros, 11 para multa rescisória, 6 para garantias
- Integrações técnicas: Asaas, Twilio, Resend, Growatt, Airbnb

**Público:** Arquitetos, Desenvolvedores, Tech Leads, QA  
**Uso:** Roadmap técnico, design review, especificação de features, validação de testes  
**Links:** [Visualizar no Artifact](https://claude.ai/code/artifact/a53855e3-3591-49d8-b132-ce0daa08dd94)

---

### 3. 📊 Portfólio de Funcionalidades
**Arquivo:** `03-portfolio-funcionalidades.md`

Catálogo completo de capacidades, funcionalidades e relacionamentos do sistema:
- **32+ funcionalidades essenciais** (gestão contratos, imóveis, faturamento, recebimentos, cobrança, OS, garantias, transações, extratos)
- **4 funcionalidades avançadas** (co-living ColiMatch™, temporada/Airbnb, energia solar Growatt, análises BI)
- **15+ integrações externas** (Asaas, Twilio, Resend, Growatt, Airbnb, com roadmap para n8n, HubSpot, Power BI, React Native)
- **6 mapas de relacionamentos funcionais** entre módulos
- **5 casos de uso principais** com timeline completa (ciclo contrato, co-living, inadimplência, energia solar)
- **Benefícios por ator** (proprietário, inquilino, administradora)
- **Roadmap de 12 fases** (atual até futuras implementações)

**Público:** Product Managers, Stakeholders, Marketing, Clientes  
**Uso:** Apresentações, RFP responses, material de marketing, entendimento funcional  
**Links:** [Visualizar no Artifact](https://claude.ai/code/artifact/f70d44a3-2467-4f8e-a4f3-7819f9c17688)

---

## 🔗 Links Públicos (Compartilháveis)

Todos os documentos estão publicados como Artifacts com links permanentes:

| Documento | Tipo | Link |
|-----------|------|------|
| Relatório Financeiro | HTML + Markdown | [Artifact](https://claude.ai/code/artifact/56c70029-0244-4e51-9405-b551ea97b567) |
| Análise Arquitetura | HTML + Markdown | [Artifact](https://claude.ai/code/artifact/a53855e3-3591-49d8-b132-ce0daa08dd94) |
| Portfolio Funcionalidades | HTML + Markdown | [Artifact](https://claude.ai/code/artifact/f70d44a3-2467-4f8e-a4f3-7819f9c17688) |

---

## 📂 Estrutura de Diretórios

```
docs/
└── crmt/
    ├── README.md                      # Este arquivo
    ├── 01-relatorio-financeiro.md     # Consolidação financeira
    ├── 02-arquitetura-requisitos.md   # Especificação técnica
    └── 03-portfolio-funcionalidades.md # Catálogo de capacidades
```

---

## 🎯 Guia de Uso por Perfil

### Contadores e Auditores
📄 **Leia:** Relatório Financeiro e Patrimonial
- Estrutura de contas, receitas, despesas
- Regime competência + caixa
- Contingências e provisões
- Audit trail (7 anos de retenção)

### Desenvolvedores e Tech Leads
🔧 **Leia:** Análise de Requisitos e Arquitetura
- Stack tecnológico, decisões arquiteturais
- Requisitos funcionais e não-funcionais
- Exemplos de RLS policies, cálculos
- Testes unitários (50+, 11+, 6+ respectivamente)

### Product Managers e Stakeholders
📊 **Leia:** Portfólio de Funcionalidades
- 32+ funcionalidades essenciais
- 4 funcionalidades avançadas (premium)
- 15+ integrações externas
- Roadmap de 12 fases
- Casos de uso reais (ciclo contrato, co-living, inadimplência)

### Clientes e Marketing
💼 **Comece:** Portfólio de Funcionalidades
- Benefícios por ator (proprietário, inquilino, admin)
- Casos de uso pragmáticos
- Roadmap futuro
- Luego: Relatório Financeiro (para ROI/análise negócio)

---

## 🔄 Fluxo de Leitura Recomendado

### Para Avaliação de Viabilidade
1. Portfólio de Funcionalidades (visão geral)
2. Análise de Requisitos (confirmar arquitetura)
3. Relatório Financeiro (validar modelo de negócio)

### Para Integração/Implementação
1. Análise de Requisitos (stack, decisões técnicas)
2. Portfólio de Funcionalidades (relacionamentos entre módulos)
3. Relatório Financeiro (dados de referência)

### Para Conformidade/Auditoria
1. Relatório Financeiro (contas, regime fiscal)
2. Análise de Requisitos (RLS, audit log, compliance)
3. Portfólio de Funcionalidades (cobertura funcional)

---

## 📊 Indicadores Resumidos

| Métrica | Valor |
|---------|-------|
| **Receita Anual Esperada** | R$ 2.812.530 |
| **Despesa Anual Estimada** | R$ 712.600 |
| **Patrimônio Líquido** | R$ 6.600.000 |
| **Tabelas PostgreSQL** | 71 (100% com RLS) |
| **Tabelas com Audit Log** | 26 (append-only, 7 anos) |
| **Funcionalidades Core** | 32+ |
| **Funcionalidades Premium** | 4 |
| **Integrações Externas** | 15+ |
| **Requisitos Funcionais** | 11+ (RF-001 a RF-031) |
| **Requisitos Não-Funcionais** | 17+ (RNF-001 a RNF-020) |
| **Cobertura de Testes** | 50+, 11+, 6+ testes específicos |
| **Retenção de Dados** | 7 anos (compliance fiscal Brasil) |

---

## 🛠️ Tecnologias Principais

**Frontend:** Next.js 15.5.20, TypeScript strict  
**Banco de Dados:** PostgreSQL + Supabase (RLS nativa)  
**Autenticação:** Supabase Auth (magic link)  
**Pagamentos:** Asaas API v3 (boleto, PIX, débito)  
**Notificações:** Twilio (SMS/WhatsApp), Resend (Email)  
**Orquestração:** Vercel Cron Jobs  
**Deploy:** Vercel CI/CD  
**Integrações:** Growatt (solar), Airbnb (temporada), n8n (futuro), HubSpot (CRM futuro)

---

## 📞 Contato e Suporte

**Sistema:** CRMT Gestão Imobiliária  
**Versão:** Fase 0-7 (2024-2025)  
**Localização:** Curitiba-SC, Florianópolis-SC  
**Email:** celiotibes@gmail.com

---

## 📝 Changelog

**2026-08-03**
- ✅ Publicação de 3 documentos especializados
- ✅ Conversão HTML → Markdown para versionamento git
- ✅ Estrutura de índice central (este README)
- ✅ Links permanentes para Artifacts

---

**Documentação Oficial CRMT — Todos os Direitos Reservados**
