# Módulo de Prestadores de Serviço

**Status:** Implementação Inicial (v0.1)  
**Data:** Julho 2026  
**Escopo:** Paulo (Zelador), Cristiano (Serviços Gerais), Prestadores Eventuais

---

## 📋 Visão Geral

O módulo de Prestadores de Serviço fornece um sistema completo para:

- **Gestão de Contratos:** Fixos (Paulo/Cristiano) e eventuais (pontuais)
- **Apontamentos:** Entrada diária de horas trabalhadas com suporte a emergências, kits Airbnb, combustível
- **Cálculo Automático:** Diárias, horas adicionais, deslocamentos, kits, emergências
- **Rateio Contábil:** Automático ou manual por residencial visitado
- **Fechamentos:** Semanais (Cristiano) ou mensais (Paulo)
- **Pagamento:** Aprovação gerencial e marcação como pago via PIX

---

## 🏗️ Arquitetura

### Camadas

#### 1. **Camada de Lógica Pura** (`server/prestador/logicaApontamento.ts`)

Funções sem estado que implementam a matemática dos cálculos:

```typescript
calcularHoras(horaInicio, horaSaida, intervaloAlmocoMinutos): number
calcularCombustivel(km, tipo, regras): number
calcularKits(dia, dentro8h, extraordinario, regras): number
calcularEmergencia(horas, regras): number
rateiarAutomatico(horas, residencialIds, residencialHoras): Record<string, number>
calcularApontamentoTotal(apontamento, regras): {...}
calcularFechamento(apontamentos, adiantamentos, parcelas): {...}
```

**Características:**
- Totalmente testável (24 testes unitários, todos passando)
- Sem acesso a banco de dados
- Independente de contexto (permissões, RLS, etc.)

#### 2. **Camada de Ações do Servidor** (`app/actions/prestador/`)

Server Actions que implementam fluxos de negócio:

**apontamentos.ts:**
- `criarApontamento()`: Valida permissões, calcula horas, cria registro
- `editarApontamento()`: Atualiza rascunho (status = 'rascunho' apenas)
- `deletarApontamento()`: Remove rascunho

**fechamentos.ts:**
- `submeterParaFechamento()`: Calcula totais, cria registro, faz rateio automático
- `aprovarFechamento()`: Manager aprova (admin only)
- `devolverFechamento()`: Retorna para prestador corrigir (com motivo)
- `registrarPagamento()`: Marca como pago (status = 'pago')

**Segurança:**
- Validação de autenticação (Supabase Auth)
- Verificação de permissões (prestador ve apenas seu dados; admin vê todos)
- Transições de status validadas (rascunho → enviado → aprovado → pago)

#### 3. **Camada de Interface** (`app/painel-prestador/`, `app/admin/prestadores/`)

**Painel do Prestador (`/painel-prestador`):**
- Dashboard com resumo de contrato e apontamentos
- Calendário mensal interativo (clique para criar/editar dia)
- Histórico de fechamentos com status

**Admin (`/admin/prestadores`):**
- Dashboard com KPIs (total pago, pendente, prestadores)
- Tabela de fechamentos pendentes com ações inline
- Modais para aprovar/devolver/pagar

---

## 📊 Fluxo de Dados

### Criar Apontamento

```
Prestador clica em dia no calendário
  ↓
Modal de entrada (horas, atividades, emergência, etc.)
  ↓
Submitir → criarApontamento() Server Action
  ↓
Valida permissão (RLS: pessoa.email == auth.user.email)
  ↓
Calcula horas via calcularHoras()
  ↓
Insere em apontamentos_prestador (status = 'rascunho')
  ↓
Se rateio manual preenchido: insere apontamentos_residencial_detalhe
  ↓
Sucesso → Calendário atualiza
```

### Submeter para Fechamento

```
Prestador ao final da semana/mês clica "Submeter"
  ↓
submeterParaFechamento(contrato_id, data_inicio, data_fim)
  ↓
Busca todos os apontamentos_prestador (rascunho) no período
  ↓
Para cada apontamento:
  - Calcula total via calcularApontamentoTotal()
  - Registra componentes (diária, extras, combustível, kits, emergência)
  
  ↓
Busca adiantamentos_prestador ativo
  ↓
Calcula deduções (parcelamento do período)
  ↓
total_liquido = total_proventos - total_deducoes
  ↓
Insere fechamentos_prestador (status = 'enviado_para_gestao')
  ↓
Insere fechamento_itens_prestador (linha-por-linha para auditoria)
  ↓
Faz rateio automático para apontamentos sem rateio manual
  ↓
Marca apontamentos como 'enviado'
  ↓
Email notificação ao gestor
```

### Aprovar / Devolver / Pagar (Gestor)

```
Manager vê tabela de "Aguardando Aprovação"
  ↓
Opções por linha:
  [Aprovar] → aprovarFechamento() → status = 'aprovado'
  [Devolver] → devolverFechamento(motivo) → status = 'devolvido'
               apontamentos voltam a 'rascunho' para edição
  
  ↓
Se aprovado:
  [Pagar] → registrarPagamento() → status = 'pago'
  ↓
Sistema pronto para gerar NFS-e e processar PIX
```

---

## 💾 Schema Principais

### Tabelas Core

#### `prestadores_servico`
```sql
id, pessoa_id (FK), cpf_cnpj, nome_completo, categoria, tipo,
chave_pix, instituicao_bancaria, tipo_conta, agencia, conta,
email, status
```

#### `contratos_prestador`
```sql
id, prestador_id (FK), data_inicio, data_fim,
tipo_contrato (fixo|eventual),
tipo_remuneracao (diaria_fixa|hora|comissao),
valor_base, valor_hora,
reajuste_indice (ipca), data_base_reajuste, percentual_reajuste_ultimo,
frequencia_fechamento (mensal|semanal), 
dia_fechamento_mes (1-31), dia_fechamento_semana (1-7)
```

#### `regras_prestador`
```sql
id, contrato_id (FK),
regras (JSONB) {
  diaria, valor_hora,
  combustivel_valor_litro, combustivel_diario_litros,
  kit_pos_hospedagem_dentro_8h, kit_extraordinario_dia_semana, kit_extraordinario_fim_semana,
  emergencia_percentual_extra, emergencia_deslocamento, emergencia_minimo,
  ...
}
```

#### `apontamentos_prestador`
```sql
id, contrato_id (FK), data, 
hora_inicio, hora_saida, intervalo_almoco_minutos, horas_trabalhadas,
descricao_atividades,
quilometragem_extra, tipo_deslocamento,
quantidade_kits_pos_hospedagem, quantidade_kits_dentro_horario,
eh_emergencia,
residenciais_ids (string[]), residencial_horas (JSONB),
status (rascunho|enviado|devolvido),
foi_importado_retroativo (bool),
criado_em, atualizado_em
```

#### `apontamentos_residencial_detalhe`
```sql
id, apontamento_id (FK), residencial_id (FK),
horas_trabalhadas,
foi_rateado_automatico (bool),
criado_em
```

#### `fechamentos_prestador`
```sql
id, contrato_id (FK), prestador_id (FK),
data_inicio, data_fim,
total_proventos, total_deducoes, valor_liquido,
status (rascunho|enviado_para_gestao|aprovado|devolvido|pago),
motivo_devolucao,
data_pagamento, chave_pix_usada,
detalhes_calculo (JSONB),
criado_em, atualizado_em
```

#### `fechamento_itens_prestador`
```sql
id, fechamento_id (FK), apontamento_id (FK),
descricao, valor, tipo (diaria|horas_adicionais|combustivel|kits|emergencia|deducao),
criado_em
```

---

## 🔐 RLS (Row-Level Security)

### Políticas

**Prestador vê apenas seus dados:**
```sql
create policy prestador_ve_proprios_apontamentos on apontamentos_prestador
  for select using (
    exists (
      select 1 from contratos_prestador cp
      join prestadores_servico ps on cp.prestador_id = ps.id
      join pessoas p on ps.pessoa_id = p.id
      join auth.users u on p.email = u.email
      where cp.id = apontamentos_prestador.contrato_id
        and u.id = auth.uid()
    )
  );
```

**Admin vê todos:**
```sql
create policy admin_ve_todos on apontamentos_prestador
  for all using (fn_eh_admin_ou_economista());
```

---

## 📝 Exemplos de Uso

### Cenário: Paulo (Zelador) — Entrada Manual

```
Data: 13/07/2026
Horas: 08:00 - 17:00 (9 horas - 1h almoço = 8 horas)
Atividades: "Limpeza de áreas comuns, conferência de acesso"
Emergência: Não
Deslocamento: Interno (R$ 0)

Cálculo:
- Horas: 8h
- Diária: 8h × (121.63 / 8h) = R$ 121.63
- Extras: 0h
- Total: R$ 121.63
```

### Cenário: Cristiano (Serviços Gerais) — Com Kits

```
Data: 18/07/2026 (sábado)
Horas: 08:00 - 17:00 (8 horas)
Quantidade de Kits dentro 8h: 3
Quantidade de Kits extraordinário: 0
Emergência: Não

Cálculo:
- Diária: R$ 200.00
- Kits dentro 8h: 3 × R$ 30 = R$ 90.00
- Total: R$ 290.00
```

### Cenário: Emergência com Deslocamento

```
Data: 15/07/2026
Horas: 2 horas
Emergência: Sim
Deslocamento: R$ 20

Cálculo:
- Base: (121.63 / 8) × 1.20 × 2h = R$ 36.39
- Mínimo para ≤2h: max(36.39, 50) = R$ 50.00
- Deslocamento: R$ 20.00
- Total: R$ 70.00
```

### Cenário: Rateio Automático

```
Apontamento: 8 horas, 3 residenciais visitados (sem rateio manual)
→ Sistema divide: 8h / 3 = 2.67h por residencial

apontamentos_residencial_detalhe:
- Residencial A: 2.67h (foi_rateado_automatico = true)
- Residencial B: 2.67h (foi_rateado_automatico = true)
- Residencial C: 2.67h (foi_rateado_automatico = true)
```

---

## 🚀 Próximos Passos (Roadmap)

### Fase 2: Integração e Automação

- [ ] **NFS-e:** Geração automática via Asaas ou n8n
- [ ] **PIX:** Integração com API de pagamento para envio automático
- [ ] **Notificações:** Email ao prestador quando aprovado/devolvido

### Fase 3: Dados Históricos

- [ ] **Migração Retroativa:** Script para importar 01/2023 - 06/2026 via CSV
- [ ] **Auditoria:** Validação de integridade (totais, residenciais, etc.)
- [ ] **Relatórios:** Extrato de apontamentos por período

### Fase 4: UI/UX

- [ ] **Detalhes do Fechamento:** Página para visualizar linha-por-linha
- [ ] **Relatórios do Prestador:** Extrato anual, gráficos de ganhos
- [ ] **Bulk Actions:** Aprovar múltiplos fechamentos de uma vez
- [ ] **Deslocamento:** Dropdown para suprimentos/córrego grande (não livre)

### Fase 5: Conformidade

- [ ] **RPA Fiscal:** Integração com GovBR para emissão de RPA
- [ ] **Retorno Fiscal:** Rastreamento de IR/INSS
- [ ] **Conformidade LGPD:** Atualizar privacidade de dados de prestador

---

## 🧪 Testes

### Testes Unitários

- **Localização:** `server/prestador/logicaApontamento.test.ts`
- **Total:** 24 testes
- **Status:** ✅ Todos passando

```bash
npm test server/prestador/logicaApontamento.test.ts
```

Cobre:
- calcularHoras: 5 testes
- calcularCombustivel: 4 testes
- calcularKits: 5 testes
- calcularEmergencia: 3 testes
- rateiarAutomatico: 4 testes
- calcularApontamentoTotal: 3 testes

### Inicialização de Dados

Para popular dados de Paulo e Cristiano:

```bash
# No Supabase Console, execute:
cat database/init-prestadores-paulo-cristiano.sql
```

Ou via CLI:
```bash
psql -h localhost -U postgres -d seu_banco < database/init-prestadores-paulo-cristiano.sql
```

---

## 📞 Suporte

### Dúvidas Comuns

**P: Como editar um apontamento já enviado?**  
R: Apenas apontamentos em status `rascunho` podem ser editados. Se foi enviado, o gestor deve devolver para ajustes.

**P: Como Cristiano entra com emergência de sábado?**  
R: Marque `eh_emergencia = true`. O sistema automaticamente aplica:
- 20% de aumento na hora base
- R$ 20 de deslocamento
- Mínimo de R$ 50 garantido

**P: O rateio automático considera todas as residenciais?**  
R: Sim, se há `residenciais_ids` preenchidos mas `residencial_horas` vazio, o sistema divide proporcionalmente ao final do fechamento.

---

## 📚 Referências

- Schema Completo: `database/schema.sql` (Seção 32)
- Dados de Inicialização: `database/init-prestadores-paulo-cristiano.sql`
- Lógica Pura: `server/prestador/logicaApontamento.ts`
- Server Actions: `app/actions/prestador/apontamentos.ts`, `fechamentos.ts`
- UI Prestador: `app/painel-prestador/`
- UI Admin: `app/admin/prestadores/`
