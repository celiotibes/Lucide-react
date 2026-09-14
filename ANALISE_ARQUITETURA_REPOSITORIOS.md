# Análise de Arquitetura — Compatibilidade e Padrões

## 1. Lucide-react (Principal — Contabilidade Reconstituição)

**Tipo**: React 19 + TypeScript + Vite (Frontend)  
**Persistência**: sql.js (SQLite em WASM) + IndexedDB (100% local, offline-first)  
**Modelos principais**: 

```
src/domain/
├── documentos/          ← Extração de campos, classificação (heurística + IA)
├── categorize/          ← Regras de categorização aprendidas
├── contabilidade/       ← DRE, cálculos contábeis
├── auditoria/           ← Análise forense de dados
├── patrimonio/          ← Gestão de patrimônio, depreciação
├── transacoes/          ← Categorização manual de transações
└── parsers/             ← PDF, OCR, XML parsing
```

**Características-chave**:
- ✅ Heurística pura (determinístico, sem IA)
- ✅ Fallback IA (fallback para Claude API, máx 1000 chars)
- ✅ Learned rules (UNIQUE UPSERT por CNPJ/CPF)
- ✅ 189 testes (unit + e2e com Playwright)
- ✅ Sem dependências externas (tudo in-browser)
- ✅ CSV/XLSX export (sem binários)
- ✅ Multi-dispositivo (sync-server mínimo, "send all"/"get all")

**Risco de integração**: MÉDIO
- Se integrar código do ERP: deve preservar padrão heurístico + fallback
- Schemas SQLite devem ser compatíveis (PRAGMA foreign_keys = ON)

---

## 2. app-bruxel (Streamlit + Google Sheets)

**Tipo**: Python + Streamlit (Frontend)  
**Persistência**: Google Sheets (cloud, não local)  
**Finalidade**: Lançamento operacional de diárias (horas, km, gastos)

```
app.py
├── get_sheet()         ← Conexão OAuth2 com Google Sheets
├── form                ← UI para dados operacionais (dia, descrição, horas, km, gastos)
└── submit handler      ← Escrita na planilha
```

**Características**:
- ✅ Simples, foco operacional (não contábil)
- ✅ UI form em Streamlit (totalmente diferente de React)
- ❌ Cloud-dependent (Google Sheets)
- ❌ Sem testes visíveis
- ❌ Tecnologia incompatível (Python vs TypeScript)

**Risco de integração**: ALTO
- **Não há padrão compartilhado** entre app-bruxel (Python/Streamlit) e Lucide-react (React/TypeScript)
- **Cloud vs local**: app-bruxel usa Google Sheets (cloud), Lucide-react é 100% offline
- **Possível aproveitamento**: Lógica de UI (form layout, validação), não código

**Conclusão**: Aproveitar **padrões de UX** (form organization), não integrar código

---

## 3. ERP-CRMT-Gestao-Imobiliaria (Vazio/Em Inicialização)

**Tipo**: Apenas estrutura, sem código implementado  
**Status**: Repositório recém criado, apenas README.md

```
.
├── README.md           (29 bytes — "# ERP-CRMT-Gestao-Imobiliaria---")
├── .github/            (estrutura, sem workflows)
└── (nada mais)
```

**Conclusão**: Este é o repositório **destino** para consolidação, não uma fonte de funcionalidades.

---

## 4. skillos (SkillOS — Skills Library do usuário)

**Localização**: `/home/user/skillos` (já clonado em sessões anteriores)  
**Tipo**: Biblioteca de skills reutilizáveis (técnicas de auditoria contábil, normalização de dados, etc.)  
**Relevância**: Guardrails para integração segura de IA (SkillOS accounting-reconstruction skill)

---

## Matriz de Compatibilidade

| Aspecto | Lucide-react | app-bruxel | ERP-CRMT |
|---------|--------------|-----------|----------|
| **Linguagem** | TypeScript | Python | — |
| **Framework** | React 19 | Streamlit | — |
| **Persistência** | SQLite (local) | Google Sheets | — |
| **Offline-first** | ✅ | ❌ | — |
| **Testes** | 189 testes ✅ | Nenhum | — |
| **IA** | Sim (fallback) | Não | — |
| **Multi-device sync** | sync-server | Não | — |
| **Escalabilidade** | Local/browser | Cloud (Sheets) | — |

---

## Estratégia de Integração Recomendada

### ✅ **INTEGRAR em Lucide-react** (seguro)

1. **Padrões de classificação de documentos** (já existe)
   - ✅ Heurística regex (determinístico)
   - ✅ Fallback IA (Claude API via `import.meta.env`)
   - ✅ Learned rules (UNIQUE UPSERT)

2. **Padrões de relatórios contábeis** (já existe)
   - ✅ DRE, cascata, inadimplência, patrimônio
   - Procurar no ERP por variações

3. **Padrões de validação de dados**
   - Procurar em skillos (domain honesty principle)

### ⚠️ **REFERENCIAR (padrões, não código)** do app-bruxel

1. **UI/UX patterns** (form layout, validação de campo, feedback)
2. **Lógica de arredondamento** (Sheets usa vírgula decimal português)
3. **Gestão de sessão** (Streamlit @st.cache_resource ← similaridade com React hooks)

### ❌ **NÃO INTEGRAR** app-bruxel direto

- Tecnologias incompatíveis (Python ≠ TypeScript)
- Paradigmas opostos (cloud ≠ local)
- Use como **referência visual/lógica**, não código

### ⏹️ **PREPARAR** ERP-CRMT

- Este é o repositório de consolidação
- Receberá código migrado de Lucide-react (não o contrário)
- Será branch de ERP que consolida funcionalidades de múltiplas fontes

---

## Próximas Ações

1. ⏳ Aguardar resultado do Explore Agent
2. ⏹️ Consolidar matriz de funcionalidades
3. ⏹️ Identificar padrões reutilizáveis em skillos
4. ⏹️ Criar plano de migração segura para ERP-CRMT
5. ⏹️ Documentar trade-offs (local vs cloud, sync, performance)

---

**Data**: 2026-09-14  
**Status**: Análise em andamento  
**Próxima atualização**: Quando Agent completar
