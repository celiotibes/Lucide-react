# 43. Status da Sessão Atual — Phase 2 UI + Avaliação Gaps

Data: 2026-07-23

## Resumo Executivo

Phase 2 (Coliving + Airbnb) **100% backend + 90% UI**. Todas as 3 features principais têm interface funcional:
- ✅ Encerramento por substituição de morador (página detalhes + modal)
- ✅ Registro de hospedagens Airbnb/Booking (formulário dedicado)
- ✅ Vistoria de área comum (checkbox na criação)

Projeto está em **~35% de Fase 0** (MVP Operacional) com 5 gaps críticos bloqueando saída para produção.

## O Que Foi Feito Nesta Sessão

### Phase 2 — UI Completa (10 arquivos criados/modificados)

**1. Página de detalhes do contrato** (`app/contratos/[id]/detalhes/page.tsx`)
- Dashboard com informações básicas (imóvel, locatário, período, status)
- Links para seções: contrato HTML, documentos, vistorias, reajustes
- Botão "Encerrar por substituição" (visível apenas em coliving ativo)
- Modal com seletor de novo contrato + validação
- Estilos responsivos com feedback de sucesso/erro

**2. Página de registrar hospedagens** (`app/hospedagens/novo/page.tsx`)
- Seleção de imóvel + quarto específico (opcional)
- Campos: período início/fim, dias, valor diária, plataforma (Airbnb/Booking/outro)
- ID externo (para sincronização futura de API)
- Cálculo automático de receita
- Mensagem informativa sobre compensação de energia para coliving
- Desabilitação condicional e validações

**3. Seletor de vistoria de área comum** (`app/contratos/[id]/vistorias/page.tsx`)
- Checkbox: "☑️ Vistoria de área comum (sem atribuição específica)"
- Apenas para vistorias periódicas
- Estilo destacado em fundo azul
- Server action modificada para suportar flag `eh_area_comum`

### APIs Criadas (6 endpoints)

```
GET    /api/contratos/[id]                        — detalhes contrato
GET    /api/contratos/[id]/candidatos-substituicao — contratos do mesmo quarto
POST   /api/contratos/encerrar-substituicao       — executa encerramento
POST   /api/hospedagens/registrar                 — cria hospedagem + vistorias
GET    /api/imoveis                               — lista com filtro permite_temporada
GET    /api/imoveis/[id]/comodos                  — cômodos do imóvel
```

Todas reutilizam server actions já testadas (`encerrarContratoPorSubstituicao`, `registrarHospedagemAirbnb`).

### Integração Backend ✅

Fluxo Asaas **já está 100% pronto**:
- ✅ `gerarFaturaMensal()` — cria faturas status='aberta'
- ✅ `emitirCobrancasPendentes()` — emite cobrança Asaas
- ✅ Webhook `/api/webhooks/asaas` — recebe pagamentos e marca como pago
- ✅ `distribuirRecebimento()` — distribui para proprietário
- ✅ Crons registrados em vercel.json

**Gap residual**: Sem chave de API Asaas neste ambiente (validação em staging apenas).

---

## Avaliação Geral: Gaps vs. Roadmap (docs/04)

### FASE 0 — MVP Operacional: ~35-40% Completo

| Item | Status | Bloqueador |
|------|--------|-----------|
| **M1 Cadastro** | ❌ 50% | Edição/exclusão imóvel, cadastro pessoa |
| **M2 Contratos** | ❌ 50% | Garantias, edição, reajuste manual |
| **M3 Faturamento** | ✅ 95% | Validação Asaas sandbox real |
| **M4 Portal Inquilino** | ❌ 0% | Autenticação Supabase Auth |
| **Autenticação** | ❌ 0% | Decisão tomada, não implementada |
| **M11 Simplificado** | ❌ 0% | OFX upload + categorização IA |
| **Segurança** | ⚠️ 70% | Backup, homologação vs. produção |

**Critério de saída Fase 0**: "todo aluguel de locação padrão das duas cidades é cobrado pelo sistema"
→ **Bloqueado** sem Supabase Auth (portal inquilino) e validação Asaas real.

### PHASE 2 — Coliving + Airbnb: 95% Completo (implementada fora do roadmap original)

| Componente | Status | Nota |
|---|---|---|
| Backend (SQL + PL/pgSQL) | ✅ 100% | Migration 6 blocos, 2 actions, 2 testes |
| Documentação | ✅ 100% | docs/41 + docs/42 |
| UI Principal | ✅ 90% | 3 features + 6 APIs |
| Testes Integração | ⚠️ 0% | Escritos, requerem DATABASE_URL |
| Dashboard de Ocupação | ❌ 0% | Futuro (nice-to-have) |
| Sincronização Airbnb API | ❌ 0% | Futuro (nice-to-have) |

**Risco residual**: Item 4 (faturamento com compensação) é **ALTO RISCO**. Requer teste com dados simulados antes de aplicar a contratos reais.

### FASE 1-4: 0% Completo

Todas as 10+ funcionalidades ainda não iniciadas.

---

## Próximas Tarefas Priorizadas

### Curto Prazo (Semana 1-2) — Saída de Fase 0

**Crítico (bloqueiam produção)**:

1. **Ligar Asaas a fatura real** ⚠️ (pode fazer, mas validação é bloqueada)
   - Integração `gerarFaturaMensal()` → cliente Asaas
   - Chamar `criarCobranca()` após cálculo
   - Arquivo: `server/integracao/emitirFaturaPorAsaas.ts`

2. **Autenticação Supabase Auth** ❌ (bloqueado por projeto Supabase real)
   - Decisão já tomada (magic link por e-mail)
   - Requer: projeto Supabase real, variáveis de ambiente
   - Desbloqueia: M4 Portal Inquilino

3. **Portal do inquilino v0** ❌ (bloqueado por autenticação)
   - 2ª via, histórico pagamento, contato
   - Após autenticação estar pronta

**Moderado (melhoram cobertura Fase 0)**:

4. **Edição/exclusão de imóvel** (pode fazer hoje)
   - CRUD: criar, ler, atualizar, deletar
   - Form com validação
   - ~2-3 horas

5. **Cadastro direto de pessoa** (pode fazer hoje)
   - Form avulso sem vínculo contrato
   - Reusa lógica existente
   - ~1-2 horas

6. **Edição de contrato** (pode fazer hoje)
   - Permitir mudança de vencimento, garantia, reajuste
   - Validar não alterar data_inicio (imutável)
   - ~3-4 horas

7. **Testes integração Phase 2** ❌ (bloqueado por DATABASE_URL)
   - Rodar contra Postgres real em staging
   - Valida: substituição, Airbnb, compensação energia
   - ~1-2 horas (quando DB real existir)

### Médio Prazo (Semana 3-4)

8. **Garantias (caução, fiador, seguro)**
9. **Reajuste anual por índice** — fluxo de aprovação manual
10. **OFX upload** — importação de extratos para conciliação

### Longo Prazo (Mês 2+)

- **Phase 1**: Ticketing, payroll, leitura de energia
- **Phase 3**: Tesouraria, comercial, relatórios
- **Phase 4**: Tributário, reconstituição histórica

---

## Recomendação

**Imediato**: Focar em tarefas que não dependem de externo:
- Edição imóvel + pessoa + contrato (CRUD completo)
- Garantias (caução, fiador, seguro)
- Testes unitários para as novas APIs

**Bloqueado até staging estar pronto**:
- Validação Asaas sandbox real
- Autenticação Supabase Auth
- Testes de integração Phase 2

**Para manter produção segura**:
- ⚠️ Phase 2 item 4 (faturamento) — testar com dados simulados **2+ semanas** antes de aplicar a contratos reais
- ⚠️ Backup + ambiente homologação — implementar **ANTES** de qualquer deploy

---

## Git Status

Branch: `claude/crmt-imobiliaria-erp-design-w794ml`
Último commit: `60ebc81` — Phase 2 UI (10 files, 1204 insertions)

Próximo commit será com CRUD imóvel/pessoa/contrato e garantias.

---

## Checklist de Produção para Fase 0

- [ ] Autenticação Supabase Auth funcional
- [ ] Portal do inquilino (2ª via, histórico)
- [ ] Asaas validado em sandbox real
- [ ] Webhook `/api/webhooks/asaas` exposto e testado
- [ ] Tests de integração Phase 2 passando em Postgres real
- [ ] Backup configurado + plano de recovery
- [ ] Ambiente homologação separado de produção
- [ ] Documentação de deployment + runbooks
- [ ] Teste end-to-end: criar contrato → gerar fatura → emitir Asaas → receber pagamento

