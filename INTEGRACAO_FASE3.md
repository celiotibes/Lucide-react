# Integração Fase 3 — ❌ NÃO INTEGRAR (Novo Design Necessário)

**Data**: 2026-09-14  
**Status**: 📋 Documentação de recomendação — Fase 3 iniciará somente após fases 1-2 completas  
**Referência**: `MATRIZ_INTEGRACAO_FUNCIONALIDADES.md` (seção RED)

---

## 📋 Módulo Rejeitado (RED — Alto Risco)

### ❌ **Vistorias/Inspections de Imóveis**

**Localização**: `app-bruxel/` (branch: `claude/property-inspection-app-sv8czi`)

**Status de Análise**: 🔴 **REJEITADO — NÃO INTEGRAR**

---

## 🔍 Por Que Não Integrar?

### 1. **Lógica Incompleta**
```
app-bruxel/
├── vistorias/        ← Campo existe em schema
├── inspecoes/        ← Referência menciona vistorias
└── (sem lógica real de cálculo/fluxo)
```

- Campo `vistorias` existe no schema, mas **sem implementação operacional**
- Não há cálculos de danos, impactos ou valores
- Não há fluxo de aprovação de vistoria
- Não há integrações com armazenamento de fotos

### 2. **Sem Testes**
- ❌ Zero testes unitários
- ❌ Zero testes e2e
- ❌ Sem exemplos de uso
- ❌ Sem validação de entrada

### 3. **Design Inadequado para ERP**
- Estrutura incompleta (vistoria é apenas 1 campo)
- Falta fluxo de workflow (agendamento → inspeção → laudo → aprovação)
- Falta rastreabilidade de quem fez a inspeção
- Falta histórico de mudanças (para auditoria)

### 4. **Risco Alto**
- **Dados órfãos**: Se copiado, dados não validados podem ficar órfãos
- **Quebra de fluxo**: Sistema fica incompleto, causa confusão
- **Regredir em qualidade**: ERP teria código half-finished

---

## 💡 Recomendação: Novo Design para Vistorias no ERP

### Fase 3A: Planejamento (Sprint 1)
```
[ ] Define requisitos funcionais
    - [ ] Quando agendar uma vistoria? (mudança de inquilino? dano?)
    - [ ] Quem realiza? (gerente, terceiro?)
    - [ ] Qual é o output? (laudo? lista de danos?)
    - [ ] Como se integra com reparos/débitos?

[ ] Design de data model
    - [ ] Vistoria (id, imóvel, data, responsável, status)
    - [ ] Item de vistoria (tipo de dano, descrição, foto, valor estimado)
    - [ ] Anexos (fotos, documentos, laudo PDF)
    - [ ] Histórico de mudanças (audit trail)

[ ] Design de workflow
    - [ ] Estados: agendada → em progresso → concluída → aprovada
    - [ ] Transições: quem aprova? (gerente? proprietário?)
    - [ ] Notificações: aviso ao responsável? Ao proprietário?

[ ] Definir integrações
    - [ ] Vistoria → Débito ao inquilino?
    - [ ] Vistoria → Chamado de reparo?
    - [ ] Vistoria → Histórico do imóvel?
```

### Fase 3B: Implementação (Sprints 2-4)
```
[ ] Implementar models & schema SQL
    - [ ] Criar tabelas (vistoria, item_vistoria, anexo)
    - [ ] Migrations com versionamento
    - [ ] Constraints & validações

[ ] Implementar lógica de negócio
    - [ ] CRUD de vistorias
    - [ ] Transições de estado (workflow)
    - [ ] Cálculo de valores de dano (se aplicável)
    - [ ] Geração de laudo (PDF com items, fotos, valores)

[ ] Implementar UI (React components)
    - [ ] Form de agendamento
    - [ ] Checklist de items de inspeção (com fotos)
    - [ ] Histórico de vistorias do imóvel
    - [ ] Laudo em PDF

[ ] Testes
    - [ ] Unit tests para lógica de negócio (20+ testes)
    - [ ] E2E tests para workflow completo
    - [ ] Performance tests (upload de fotos)

[ ] Documentação
    - [ ] README.md explicando vistorias
    - [ ] Exemplos de uso
    - [ ] Troubleshooting
```

### Fase 3C: Consolidação (Sprint 5)
```
[ ] Integração com resto do ERP
    - [ ] Vincular vistorias a imóveis/contratos
    - [ ] Sincronizar com auditoria/histórico
    - [ ] Testar com dados legados

[ ] Code review & testes finais
    - [ ] Revisão cruzada de código
    - [ ] Testes de aceitação do usuário
    - [ ] Performance profiling

[ ] Deploy & documentação de release
    - [ ] Documentar breaking changes (se houver)
    - [ ] Guia de uso para operadores
    - [ ] FAQ de troubleshooting
```

---

## 📊 Comparação: Copiar vs Novo Design

| Aspecto | Copiar de app-bruxel | Novo Design |
|---------|---|---|
| **Tempo** | Ilusoriamente rápido (1 dia) | +3-4 sprints |
| **Qualidade** | 🔴 LOW (incompleto) | 🟢 HIGH (testado) |
| **Risco** | 🔴 HIGH (dados órfãos) | 🟢 LOW (validado) |
| **Testabilidade** | ❌ Sem testes | ✅ 20+ testes |
| **Manutenção** | 🔴 Difícil (lógica incompleta) | 🟢 Fácil (bem documentado) |
| **User satisfaction** | 🔴 Frustração (sistema quebrado) | 🟢 Produtivo (funcional) |

---

## 🚨 O Que NÃO Fazer

❌ **NÃO copie o código half-finished de app-bruxel**
- Você herdará problemas sem ganhar funcionalidade completa

❌ **NÃO tente "completar" o código copiado**
- Você estará reescrevendo tudo do zero (desperdício de tempo)

❌ **NÃO deixe a vistoria como campo único em transação**
- Vistorias é um domínio complexo (workflow, histórico, fotos, valores)

✅ **DO**: Usar app-bruxel como **referência visual** de UX (como organizar form de inspeção)
✅ **DO**: Criar novo módulo de vistorias no ERP com design próprio
✅ **DO**: Documentar requisitos de negócio antes de implementar

---

## 📚 Documentação de Referência

- **Matriz de integração**: `MATRIZ_INTEGRACAO_FUNCIONALIDADES.md` (seção RED)
- **Roadmap**: `ROADMAP_INTEGRACAO_ERP.md` (Fase 3)
- **Status**: `STATUS_INTEGRACAO_CRUZADA.md`

---

## 🎯 Próximas Ações

### Imediato (Após Fase 2 Completa)
1. [ ] Criar issue no ERP-CRMT: "Módulo de Vistorias — novo design"
2. [ ] Tag com label: `feature/vistorias` `fase-3`
3. [ ] Documentar requisitos de negócio em colaboração com usuários
4. [ ] Design document com fluxos, schemas, use cases

### Médio Prazo (Sprints 5-8)
1. [ ] Implementar novo módulo seguindo checklist acima
2. [ ] Testes e validação com dados reais
3. [ ] Code review & release

---

## 💬 Checklist de Decisão

Antes de implementar qualquer coisa com vistorias:

- [ ] Todos concordam que copiar app-bruxel não é viável?
- [ ] Requisitos de negócio documentados?
- [ ] Timeline de 3-4 sprints é aceitável?
- [ ] Recursos (dev + PM) alocados?

Se algum item for "não", rever escopo ou timeline.

---

**Versão**: 1.0  
**Status**: Recomendação formal — Implementação adiada até fases 1-2 completas  
**Próxima revisão**: Após Fase 2 concluída (estimado: 2 semanas)
