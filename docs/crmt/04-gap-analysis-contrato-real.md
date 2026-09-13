# Gap Analysis: Sistema CRMT vs Contrato Real (Kitnet 02 Pottker)

**Data Análise**: 23/08/2026  
**Contrato Referência**: Kitnet 02 Pottker, Florianópolis  
**Assinado**: 29/08/2026  
**Inquilino**: Gustavo Pereira Natal (1 pessoa)

---

## Resumo Executivo

Análise de 9 funcionalidades críticas extraídas do contrato real contra a documentação do sistema CRMT. **4 funcionalidades não estão implementadas** e representam gaps legais que impedem conformidade contratual.

### Status Geral
- ✅ **Implementado**: 0
- ⚠️ **Parcialmente Implementado**: 5
- ❌ **Não Implementado**: 4

---

## Análise Detalhada por Funcionalidade

### 1. 🔴 VISTORIA ELETRÔNICA
**Status**: ❌ Não Implementado  
**Criticidade**: CRÍTICO (Legal)

#### Requisitos do Contrato (Anexo II)
- Upload obrigatório de vídeo HD (mínimo 1080p)
- Prazos legais:
  - **7 dias**: Impugnação pela inquilino
  - **15 dias úteis**: Relatório de Avaliação de Danos (RAD)
  - **10 dias**: Devolução de caução

#### Dados Reais
- Caução: R$ 1.539,00
- Período: 29/08/2026 - 28/08/2027
- Vídeo inicial: Prova da condição do imóvel na entrada

#### Gap
- [ ] Modelo `Inspection` com campos vídeo_url, timestamps
- [ ] Upload S3 com compressão automática
- [ ] Triggers automáticos nos dias 7, 15, 10
- [ ] Bloqueio de devolução se RAD não enviado
- [ ] Integração com cálculo de débitos

**Issue GitHub**: [#6](https://github.com/celiotibes/Lucide-react/issues/6)

---

### 2. 🔴 FRANQUIA DE LAVANDERIA
**Status**: ❌ Não Implementado  
**Criticidade**: CRÍTICO (Receita)

#### Requisitos do Contrato (Anexo III, item 6)
- 2 ciclos/semana inclusos (por morador)
- Pacotes extras:
  - R$ 25,00 → 2 ciclos
  - R$ 40,00 → 4 ciclos
  - R$ 55,00 → 6 ciclos
  - R$ 75,00 → 10 ciclos
- Multa 10% aluguel por uso de lavanderia vizinha

#### Dados Reais
- Residentes: 1 pessoa
- Ciclos inclusos/mês: ~8-9 ciclos
- Valor aluguel efetivo: R$ 846,45
- Multa por violação: R$ 84,65

#### Gap
- [ ] Dashboard de rastreamento de ciclos
- [ ] Integração Asaas para venda de pacotes
- [ ] Log detalhado por morador
- [ ] Alerta automático (80% ciclos usados)
- [ ] Multa automática por violação

**Issue GitHub**: [#7](https://github.com/celiotibes/Lucide-react/issues/7)

---

### 3. 🔴 REGRAS DE OCUPAÇÃO
**Status**: ❌ Não Implementado  
**Criticidade**: CRÍTICO (Compliance)

#### Requisitos do Contrato
- Limite máximo: 1-2 pessoas (por imóvel)
- Vedação absoluta: AirBnB, Booking, aluguel temporada
- Multa: 10% aluguel efetivo

#### Dados Reais
- Kitnet 02: Máximo 2 ocupantes
- Inquilino: Gustavo Pereira Natal (1 pessoa)
- Multa por sublocação: R$ 153,90

#### Gap
- [ ] Validação max_occupants no tenant_profiles
- [ ] Bloqueio de registro acima do limite
- [ ] Detecção de violação (API AirBnB/Booking?)
- [ ] Notificação ao locador
- [ ] Multa automática + rescisão

**Issue GitHub**: [#8](https://github.com/celiotibes/Lucide-react/issues/8)

---

### 4. 🔴 PRAZOS CRÍTICOS AUTOMATIZADOS
**Status**: ⚠️ Parcialmente Implementado  
**Criticidade**: CRÍTICO (Automação Legal)

#### Requisitos do Contrato (Cl. 5ª e 13ª)
| Dia | Evento | Ação | Notificação |
|-----|--------|------|------------|
| 10 | Vencimento | Cobrar via Asaas | Email + WhatsApp |
| 30 | Atraso 20d | Incluir SPC/SERASA | SMS urgente |
| 40 | Atraso 30d | Ação executória | Email tabelião |
| 60 antes | Renovação | Notif não-renov | Email registrado |

#### Dados Reais
- Vencimento: Dia 10 de cada mês
- Valor: R$ 1.539,00
- Composição: 55% aluguel (R$ 846,45) + 45% custeio (R$ 692,55)

#### Gap
- [ ] Trigger automático SPC no dia 30
- [ ] Integração SERASA/SPC (se não existe)
- [ ] Geração de notificação executória (dia 40)
- [ ] Comprovação digital com hash para processos

**Issue GitHub**: [#9](https://github.com/celiotibes/Lucide-react/issues/9)

---

### 5. ⚠️ CONTABILIDADE SEGREGADA
**Status**: ⚠️ Parcialmente Implementado

#### Requisitos
- Split payment: 55% aluguel + 45% custeio
- Regime competência (faturamento) vs caixa (pagamento)
- Recibos mensais segregados

#### Observações
✅ Modelo documentado  
⚠️ Validar: regime contábil duplicado, recibos separados

---

### 6. ⚠️ FRANQUIA HÍDRICA
**Status**: ⚠️ Parcialmente Implementado

#### Requisitos
- 1 pessoa: 4,5 m³ (interno) + 1,3 m³ (lavanderia) = 5,8 m³
- Balanceamento anual (superávit/déficit)
- Segregação custos locador: 4,0 m³ zeladoria + 3,0 m³ turnover
- Notificação vazamento em 24h

#### Observações
✅ Modelo documentado  
⚠️ Validar: balanceamento automático, notificação vazamento

---

### 7. ⚠️ ENERGIA INDIVIDUAL
**Status**: ⚠️ Parcialmente Implementado

#### Requisitos
- Leitura no dia 1º de cada mês
- Repasse exato ANEEL (bandeiras tarifárias)
- Memória de cálculo simplificada

#### Observações
✅ Conceito implementado  
⚠️ Validar: bandeiras automáticas, memória de cálculo

---

### 8. ⚠️ NOTIFICAÇÕES AUDITADAS
**Status**: ⚠️ Parcialmente Implementado

#### Requisitos
- Email: crmt.gestao@gmail.com
- WhatsApp: (41) 4041-5242
- Log completo: timestamp, destinatário, conteúdo, status, canal

#### Observações
✅ Twilio (SMS/WhatsApp) + Resend (Email) integrados  
⚠️ Validar: logs auditados, comprovação entrega

---

### 9. ⚠️ DOSSIÊ OPERACIONAL
**Status**: ⚠️ Parcialmente Implementado

#### Requisitos
- Armazenamento digital (7 anos)
- Memória de cálculo de cota
- Histórico despesas por rubrica
- Classificação: documentada, confirmada, estimada, pendente

#### Observações
✅ Auditoria append-only (26 tabelas)  
⚠️ Validar: storage PDF, memória cálculo, histórico

---

## Matriz de Prioridade

### 🔴 CRÍTICO (Fazer Imediatamente)
| Funcionalidade | Razão | Prazo |
|---|---|---|
| Vistoria Eletrônica | Requisito legal | SEMANA 1 |
| Franquia Lavanderia | Receita diferenciada | SEMANA 2 |
| Regras Ocupação | Compliance contratual | SEMANA 2 |
| Prazos Críticos | Proteção legal | SEMANA 3 |

### 🟡 IMPORTANTE (2-3 Semanas)
- Franquia Hídrica (validar balanceamento)
- Energia Individual (bandeiras automáticas)
- Notificações Auditadas (logs completos)

### 🟢 BACKLOG (Melhorias)
- Dossiê Operacional (otimizar)
- Contabilidade Segregada (validação)

---

## Casos de Teste com Dados Reais

### Teste 1: Vistoria Inicial
```
Data: 29/08/2026
Imóvel: Kitnet 02 Pottker
Inquilino: Gustavo Pereira Natal
Caução: R$ 1.539,00

Esperado:
- Upload vídeo HD (prova condição inicial)
- Trigger 7 dias: notificar impugnação
- Trigger 15 dias: RAD vencendo
- Trigger 10 dias: liberar devolução se sem danos
```

### Teste 2: Franquia Lavanderia
```
Mês: Setembro 2026
Residentes: 1 pessoa
Ciclos inclusos: 9 ciclos
Consumo real: 11 ciclos

Esperado:
- Dashboard: 11/9 ciclos (122%)
- Cobrar 2 ciclos extras = R$ 25,00
- Alerta automático: "80% ciclos usados"
```

### Teste 3: Atraso de Pagamento
```
Vencimento: 10/09/2026
Valor: R$ 1.539,00
Pagamento recebido: Nunca

Esperado:
- Dia 10: Fatura gerada, cobrar via Asaas
- Dia 30: SMS urgente + inclusão SPC
- Dia 40: Notificação ação executória
- Auditoria: Log completo com timestamps
```

---

## Recomendações

1. **Priorizar 4 issues críticas** (já criadas no GitHub)
2. **Implementar modelo de dados** completo antes de funcionalidades
3. **Validar com contrato real** em cada implementação
4. **Criar testes automatizados** com dados reais
5. **Documentar conformidade legal** em cada feature

---

## Referências

- **Contrato Assinado**: `/root/.claude/uploads/408a2423-5df5-565c-a054-b52a215ef538/c095b52c-Contrato_de_Locacao_Residencial__Legal_Design_assinado.pdf`
- **Anexos Contrato**: `/root/.claude/uploads/408a2423-5df5-565c-a054-b52a215ef538/9df3f8f3-Anexos__Contrato_de_Locacao_Residencial_assinado.pdf`
- **Issues GitHub**: #6, #7, #8, #9

---

**Análise Concluída por**: Claude Haiku 4.5  
**Data**: 23/08/2026  
**Status**: Pronto para implementação
