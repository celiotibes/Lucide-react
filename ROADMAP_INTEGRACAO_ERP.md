# Roadmap de Integração Segura — ERP-CRMT

**Objetivo**: Consolidar funcionalidades de Lucide-react + padrões de app-bruxel em ERP-CRMT-Gestao-Imobiliaria, sem quebrar o que já existe.

## Fases de Integração

### Fase 1: Análise & Documentação ✅ (EM PROGRESSO)
- [x] Adicionar repositórios ao session
- [x] Explorar estruturas e brances
- [x] Criar matriz de funcionalidades
- [x] Análise de compatibilidade
- [ ] Consolidar resultado do Explore Agent
- **Entregáveis**: MATRIZ_INTEGRACAO_FUNCIONALIDADES.md, ANALISE_ARQUITETURA_REPOSITORIOS.md

### Fase 2: Mapeamento de Funcionalidades ⏳ (AGUARDANDO AGENT)
- [ ] Explore Agent: Lista completa de funcionalidades por origem
- [ ] Identificar duplicações
- [ ] Verificar testes existentes
- [ ] Documentar padrões reutilizáveis
- **Saída esperada**: Matriz preenchida com qualidade/risco/integração segura

### Fase 3: Piloto de Integração (PÓS-AGENT)
- [ ] Escolher 1 funcionalidade de baixo risco
- [ ] Exemplo: Exporte regras aprendidas de Lucide para template ERP
- [ ] Criar testes que validem compatibilidade
- [ ] Documento de lições aprendidas

### Fase 4: Integração Modular (PÓS-PILOTO)
- [ ] Padrões de classificação de documentos
- [ ] Regras aprendidas (learned rules)
- [ ] Importação de extratos
- [ ] Relatórios contábeis
- [ ] Sincronização multi-dispositivo

### Fase 5: Consolidação & Lançamento
- [ ] ERP-CRMT funcional com todas as features de Lucide
- [ ] Migração segura de dados (versionamento, backups)
- [ ] Documentação de upgrade path para usuários
- [ ] Deprecation de Lucide (ou manutenção em paralelo)

---

## Trade-offs & Decisões Arquiteturais

### ❓ **Questão 1: Local vs Cloud Persistence**

**Cenário Lucide-react**: 100% local (SQLite em IndexedDB), offline-first  
**Cenário ERP-CRMT**: ??? (a definir)

**Opções**:
1. **Lucide path**: Manter 100% local (segurança, offline)
   - Sincronização via sync-server (send all / get all)
   - Fácil deploy (estático HTML/JS)
   
2. **ERP path**: Backend centralizado (PostgreSQL/MySQL)
   - Relatórios em tempo real (multi-user)
   - Auditoria centralizada de quem fez o quê
   
3. **Híbrido**: Local-first + opcional backend sync
   - Melhor dos dois mundos, mas complexo

**Recomendação**: ✅ **Híbrido**
- Padrão: Local (sql.js + IndexedDB)
- Opcional: Backend para sync/sharing (via sync-server ou WebSync)

---

### ❓ **Questão 2: Tecnologia (React vs Outra)**

**Lucide**: React 19 + TypeScript (consolidado, 189 testes)  
**app-bruxel**: Python + Streamlit (incompatível)  
**ERP-CRMT**: ??? (a definir)

**Opções**:
1. **React** (padrão Lucide)
   - Reutiliza todo o código existente
   - Ecossistema rico de libraries
   - Familiar com Vite, TailwindCSS
   
2. **Python Django/FastAPI** (padrão ERP clássico)
   - Melhor para backend-heavy
   - Menos reutilização de Lucide
   
3. **Full-stack Node (Nest.js + React)**
   - Backend em TypeScript
   - 100% compartilhamento de tipos

**Recomendação**: ✅ **React para frontend + Node backend (opcional)**
- Reutiliza máximo de código
- sync-server (Node) já é estabelecido
- Fácil migração incremental de Lucide para ERP

---

### ❓ **Questão 3: IA & Classificação**

**Lucide**: Heurística + fallback Claude (máx 1000 chars)  
**app-bruxel**: Nenhuma  
**ERP-CRMT**: ??? (a definir)

**Opções**:
1. **Apenas heurística** (padrão atual)
   - 100% determinístico
   - Sem custos, sem latência
   
2. **Heurística + fallback IA** (padrão Lucide-fase2)
   - IA é fallback para edge cases
   - Configurável via env vars
   - Graceful degradation
   
3. **IA-first** (mais agressivo)
   - Usar IA para tudo que der
   - Maior confiança em docs estranhos
   - Mais caro

**Recomendação**: ✅ **Heurística + fallback IA** (como Lucide fase 2)
- Seguro forense (nunca adivinha)
- Custeable (paga só quando precisa)
- Compatível com Lucide existente

---

### ❓ **Questão 4: Estrutura de Repositório**

**Opção A**: ERP-CRMT tem tudo  
```
ERP-CRMT-Gestao-Imobiliaria-/
├── frontend/ (cópia de Lucide-react)
├── backend/ (novo)
├── sync-server/ (cópia de Lucide)
└── docs/
```

**Opção B**: ERP-CRMT é meta-repo (monorepo)  
```
ERP-CRMT-Gestao-Imobiliaria-/
├── lucide-react/ (git submodule)
├── app-bruxel/ (git submodule)
└── integration/
```

**Opção C**: ERP-CRMT é workspace (packages)  
```
ERP-CRMT-Gestao-Imobiliaria-/
└── packages/
    ├── crmt-core/ (business logic)
    ├── crmt-ui/ (React components)
    ├── crmt-server/ (Node backend)
    └── crmt-sync/ (sync-server)
```

**Recomendação**: ✅ **Opção A** (simples, sem complexidade de submodules)
- Copia código estável de Lucide
- Modificações do ERP ficam no ERP
- Fácil rastreabilidade de quem mudou o quê
- Sync com Lucide via pull request manual (quando quiser features novas)

---

## Critérios de Integração Segura

Cada funcionalidade só é integrada se passar em:

✅ **Testes**: Deve ter cobertura de testes (unit ou e2e)  
✅ **Documentação**: Como funciona, edge cases, como testar  
✅ **Domain honesty**: Nunca inventa dados; undefined/null quando incerto  
✅ **Revertibilidade**: Pode remover sem quebrar o resto  
✅ **Versionamento**: Schema changes bem documentadas (migrations)  
✅ **Backward compat**: Dados antigos continuam funcionando  

---

## Checklist de Implementação Segura

Para cada feature a integrar:

- [ ] Ler código em detalhes (reviews cruzadas)
- [ ] Executar testes existentes (devem passar)
- [ ] Criar branch: `feature/nome-integracao`
- [ ] Copiar código (ou submodule)
- [ ] Ajustar imports/paths (se necessário)
- [ ] Rodas testes em ambiente integrado
- [ ] Criar testes novos (integração específica)
- [ ] Documentar no README (como usar, configuração, troubleshooting)
- [ ] Merge com code review
- [ ] Tag de versão (semanticversion)
- [ ] Atualizar CHANGELOG.md

---

## Timeline Estimado

| Fase | Duração | Entrega |
|------|---------|---------|
| 1. Análise | 1-2 dias | Matriz + recomendações |
| 2. Piloto | 3-5 dias | 1 feature integrada + docs |
| 3. Integração core | 2-3 semanas | Classificação, regras, relatórios |
| 4. Refinamento | 1-2 semanas | Testes, perf, edge cases |
| 5. Lançamento | 1 semana | Docs de migração, cutover |
| **Total** | **4-6 semanas** | **ERP-CRMT v1.0** |

---

## Dependências & Bloqueadores

- [ ] Resultado da análise do Explore Agent (funcionalidades específicas)
- [ ] Decisão de Lucide-react: qual é o futuro? (mantém em paralelo vs deprecated)
- [ ] Acesso de push ao ERP-CRMT (deve ter permissão de escrita)
- [ ] Backup dos dados de Lucide (antes de qualquer migração)

---

## Contato & Escalações

Se durante integração encontrar:
- ❓ Conflito de padrões → Discutir, documentar trade-off
- 🚨 Dato quebrado/perda de dados → Revert imediatamente, post-mortem
- 🤔 Edge case não coberto → Criar teste isolado, depois integrar
- 💥 Integração impossível → Reavaliar, procurar alternativa

---

**Versão**: 0.1  
**Status**: Planejamento  
**Próxima atualização**: Após resultado do Explore Agent
