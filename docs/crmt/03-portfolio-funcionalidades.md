# Portfólio de Funcionalidades - CRMT

**Documento:** Portfólio Completo de Funcionalidades, Integrações e Relacionamentos do Sistema CRMT Gestão Imobiliária

---

## Funcionalidades Essenciais (Core)

### Gestão de Contratos

- **Criar & Editar Contrato:** Suporte múltiplas partes (inquilino, fiador, responsável financeiro), seleção de modelo, geração PDF com assinatura digital.
- **Visualizar em Tempo Real:** Pré-visualização HTML/CSS antes de gerar PDF. Merge automático `{{variáveis}}` sem Handlebars. Dark/light mode support.
- **Histórico de Contratos:** Todos contratos passados + ativo. Filtro por status (ativo, encerrado, em_despejo), data. Re-abrir como template.
- **Rescindir com Multa:** Cálculo automático multa rescisória com bonificação dezembro (Florianópolis). Simulador "se rescindir agora, multa = R$ X".

### Gestão de Imóveis

- **Cadastrar Imóvel:** Identificação, endereço, tipo (residencial/comercial/comodato), cômodos, foto fachada, mapa interativo.
- **Configurar Co-living:** Enable toggle, perfil compatibilidade ColiMatch™ (5 variáveis, 2 veto crítico, threshold ≥80%), quartos disponíveis, preço por quarto.
- **Gerenciar Cômodos:** Lista interativa (quarto, sala, cozinha, banheiro), área m², especificações, rateio automático se despesa comum.
- **Avaliação Patrimonial:** Inserir valor avaliação, histórico atualizações, deflacionador IPCA, patrimônio líquido (avaliação − saldo devedor), relatório consolidado.
- **Financiamentos:** Registrar hipotecário (mutuário, instituição, taxa, prazo), saldo devedor mensal, impacto patrimônio, calendário amortização.

### Faturamento & Receitas

- **Gerar Fatura Automática:** Cron diário 6 AM: aluguel pró-rata (30 dias comerciais) + reembolsos (água, energia, condomínio) + componentes mensais. Idempotente.
- **Visualizar Fatura:** Detalhes completos: período, composição, histórico pagamentos, status, timeline, ações (imprimir, enviar email, contestar).
- **Emitir Cobrança:** Asaas integrado: Boleto, PIX (QR code gerado), Débito automático. Configurável dia vencimento. Retentativa automática.
- **Reembolsos de Despesas:** Água, energia, condomínio, gás — rateio por ocupação real. Classificação "reembolso" (não tributário).
- **Split de Pagamento:** Múltiplas receitas (aluguel + água + energia) rateadas conforme ocupação. Transparência linha-por-linha ao investidor. Lock distribuído (`pg_advisory_xact_lock`).
- **Reajuste Anual Automático:** Índice (IGP-M, IPCA, INPC) selecionável. Data próximo reajuste configurável. Cálculo: Novo = Anterior × (1 + % Índice). Email inquilino com detalhes.
- **Multa Rescisória com Simulador:** Cálculo: [Cláusula] × meses restantes. Bonificação dezembro (Florianópolis). Simulador pré-rescisão. Registro imutável audit_log.

### Recebimentos & Asaas

- **Webhook Pagamento:** Asaas notifica quando pago (boleto, PIX, débito). Marca fatura 'paga', distribui ao investidor. Idempotência automática.
- **Distribuir ao Investidor:** Fluxo: Pagamento → Split → Insert investidor_ledger → Email confirmação. Segregação: bruto, taxa, líquido visível.
- **Comprovante Pagamento:** Gerado por Asaas (boleto, PIX, débito). Conteúdo: valor, data, método, referência. Download PDF. Acesso: ambos veem em fatura.
- **Relatório Recebimentos:** Filtro: período, imóvel, status (não pago, atrasado). Valor total pendências. Export CSV análise.

### Cobrança & Inadimplência

- **Régua Escalonada Automática:** Dias 1-5: nenhuma. 6-15: email. 16-30: email+SMS. 31-60: email+SMS+WhatsApp. 61+: jurídico manual.
- **Juros de Mora:** 1% a.m. sobre saldo atrasado (máx 20% legal). Aplicação: a cada dia atraso. Cálculo: Valor Original × 1% × Dias.
- **Confissão de Dívida:** Inquilino reconhece dívida formal. Parcelamento até 12x. Juros reduzidos. PDF assinado digitalmente. Imutável audit_log.
- **Histórico & Score:** Timeline pagamentos vs atrasos. Score adimplência inquilino. Alertas padrão recorrente. Export CSV análise.

### Ordens de Serviço & Manutenção

- **Abrir Chamado:** Inquilino (self-service) ou admin. Tipo: emergência (SLA 4h), preventiva (10d úteis), corretiva (15d úteis). Foto opcional. Email/SMS proprietário.
- **Atribuir Prestador:** Cadastro profissionais (eletricista, encanador, etc.). Seleção proprietário. SMS/WhatsApp prestador. Avaliação (1-5 stars). Rating histórico.
- **Timeline Multifoto (Imutável):** Etapas: entrada, andamento, saída. Múltiplas fotos por etapa. Legenda descrição. Cronológica, nunca deleta. Supabase Storage.
- **Aprovação & Custo:** Prestador estima. Proprietário aprova. Custo real ao término. Alocação FRO (se ≤ teto) ou fatura extra inquilino.
- **Plano Preventivo Recorrente:** Frequência: mensal/trimestral/semestral/anual. Exemplo: limpeza filtro (mensal), inspeção hidráulica (anual). Cron gera OS auto. Orçamento pré-aprovado.

### Garantias & Alertas

- **Registrar Garantias:** 5 tipos: Seguro-Fiança, Incêndio, Título Capitalização, Comodato, Seguro Aluguel. Dados: apolice, valor, data vencimento, operadora. Validação data ≥ hoje.
- **Alerta Vencimento:** Cron 9 AM diário. Detecta 30-60 dias antes. Agrupamento proprietário (1 email múltiplas). Email Resend. Registro audit_log status ('alerta_enviado' ou 'falha').
- **Renovação Garantia:** Proprietário informa novo apolice + data vencimento. Validação garantia antiga venceu. Cria novo (histórico fica). Próximo alerta pela nova.

### Transações Bancárias & Conciliação

- **Importar OFX:** Download do banco (Bradesco, Itaú, etc.). Upload via UI. Parser extrai: data, descricao, valor, FITID. Deduplicação por FITID (referência única banco).
- **Revisar Transações:** Status: sugerido, aprovado, ignorado, duplicado. Curador aprova/ignora cada. Match manual fatura. Campo observação (ex: "TED saída").
- **Categorização Automática (Futura):** IA ChatGPT analisa descrição. Sugestão categoria + confiança %. Manual override. Exemplo: "Aluguel Kitnet 16" → Receita Aluguel, 95% confiança.
- **Relatório Conciliação:** Período selecionável. Valor esperado (faturas) vs recebido (transações). Divergências alertadas. Export CSV contabilista.

### Extratos & Relatórios Investidor

- **Extrato por Imóvel:** Período selecionável (mês, trimestre, ano). Linhas: aluguel, reembolsos, taxa admin, FRO, valor líquido. Consolidação por tipo receita. Status pago/pendente/parcial.
- **Extrato Consolidado:** Todos imóveis resumido. Total bruto, taxa admin, líquido. Benchmark: comparação mês anterior (var %).
- **Relatório Patrimônio:** Avaliação total, saldo devedor, patrimônio líquido. Timeline evolução. Deflacionador IPCA. ROI/Yield anual.
- **Análise Lucratividade:** ROI: receita anual / patrimônio total. Yield: rentabilidade %. Benchmark mercado. Tendência 12 meses.

---

## Funcionalidades Avançadas (Premium)

### Co-living com ColiMatch™

- **Configurar Perfil:** 5 variáveis (idade, profissão, estilo vida, animal, fumante) com pesos configuráveis. 2 veto crítico (limpeza > 4, background check). Threshold mínimo 80%.
- **Buscar Compatibilidade:** Novo inquilino preenche perfil. Sistema calcula score contra co-livers existentes. Ranking melhor match primeiro. Proprietário aprova/rejeita sugestão.
- **Gerenciar Mudanças:** Co-liver solicita mudança quarto (motivo: incompatibilidade, barulho, etc.). Validação novo quarto disponível. Recálculo compatibilidade nova dupla. Sem penalidade (flex é valor agregado).
- **Dashboard Ocupação:** Imóvel 4 quartos: 3/4 ocupados (75%). Perfis fotos+nomes por quarto. Compatibilidade score cada dupla. Previsão saída próximo contrato.

### Temporada & Airbnb

- **Sincronizar Calendário:** API Airbnb Listing Management. Frequência: diária 6 PM (próximos 90 dias). Status: ocupado, disponível, bloqueado. Preço noite, nome hóspede, check-in/check-out.
- **Gerar Fatura Hospedagem:** Trigger: check-out hóspede. Dados: noites × preço = receita. Adicionais: limpeza, dano, serviço. Líquido = receita − taxa Airbnb (3-5%). Automático.
- **Rateio Despesas Ocupação:** Cálculo: (Despesa Mês / Dias Mês) × Dias Ocupado. Exemplo: Energia R$300, 10/30 dias ocupado = R$100 atribuível. Franquia mínima garantida (ex: R$50).
- **Compensação Energia:** Detecta consumo excedente (hóspede usa ar-condicionado pesado). Comparação média vs período ocupação. Cobrança extra conforme T&C Airbnb. Fatura segregada.

### Energia Solar & Geração

- **Integração Growatt:** Inversor solar conectado. Dados em tempo real: geração kWh. Cron 7 AM lê diário. Histórico por dia/mês/ano. Dashboard com gráfico geração (W, kWh). Alertas queda.
- **Auditoria Isolamento:** Cálculo: Consumo CC = Consumo Lido − Consumo Privado (inquilinos). Validação nunca negativo. Crédito Celesc = Geração − Isolamento. Faturamento crédito.
- **Upload Fatura Celesc:** PDF fatura Celesc GD. Parser extrai dados. Validação: Growatt vs Celesc (divergência > 5% = alerta). Auditoria histórico todas faturas.
- **Relatório Geração:** Período selecionável. Dados: geração total, consumo CC, crédito líquido. Economia (kWh × R$/kWh Celesc). ROI painel (tempo retorno). Export PDF técnico.

### Análises Avançadas

- **Dashboard Executivo:** Cards principais: receita mês, despesa, ocupação %, patrimônio líquido. Gráficos: receita trend (12m), ocupação timeline, inadimplência %. Drill-down detalhes.
- **Análise Ocupação:** Por imóvel: real vs esperada. Histórico 12m. Benchmark mercado. Previsão próximos 3m (futura: ML). Alertas se ocupação < meta.
- **Sazonalidade:** Identificar picos/vales receita ano (julho/agosto alta, maio/junho baixa). Padrões. Ajuste ações (promoção maio). Previsão trimestral.
- **Conformidade Fiscal:** Regime dual: competência + caixa separados. Cálculo IRPF (se PF). Deduções comprovadas. Export CSV contabilista / software contábil.

---

## Integrações Externas (15+)

- **🏦 Asaas (Cobranças):** Emissão boleto, PIX (QR code), débito automático. Webhook pagamento confirmado. Taxa 3.49%. Integração completa split payment.
- **💬 Twilio (SMS/WhatsApp):** Notificações cobrança, confirmação pagamento, alerta SLA. Bidireccional (respostas SMS capturáveis). ~R$0,10/SMS, WhatsApp gratuito.
- **📧 Resend (Email):** Transacional: fatura, cobrança, confirmação pagamento, alerta vencimento garantia, escalonada jurídica. Templates HTML. No-reply address.
- **☀️ Growatt (API Inversor Solar):** Leitura geração kWh em tempo real. Diária 7 AM. Histórico por período. Alertas queda geração.
- **🏖️ Airbnb (Temporada):** Sincronização calendário (90 dias), dados hospedagem (guest, datas, preço), webhooks reserva (futura). Calendário bloqueio/liberação.

**Futuras:** n8n (orquestração workflow), CRM (HubSpot), BI (Power BI/Metabase), Mobile (React Native), Multitenancy (SaaS).

---

## Mapa de Relacionamentos Funcionais

### Contratos ↔ Faturamento ↔ Recebimentos ↔ Investidor
Contrato define valor + datas. Fatura gera automaticamente (pró-rata se parcial). Asaas emite cobrança. Webhook marca paga. Split distribui ao investidor com taxa segregada. Investidor vê extrato por imóvel.

### Imóvel ↔ Co-living ↔ Compatibilidade ↔ Ocupação
Imóvel enable_coliving. Perfil compatibilidade define critérios. Novo inquilino preenche perfil. Sistema busca match ≥80%. Proprietário aprova. Dashboard mostra ocupação real vs esperada. Rateio automático por ocupação.

### Imóvel ↔ Financiamento ↔ Patrimônio Líquido
Imóvel avaliado em R$300k. Financiamento hipotecário R$150k saldo devedor. Patrimônio Líquido = R$300k − R$150k = R$150k. Timeline evolução patrimônio ao longo tempo.

### Garantia ↔ Alerta Vencimento ↔ Notificação Proprietário
Garantia Seguro-Fiança vencendo 30 dias. Cron 9 AM detecta. Agrupamento proprietário (múltiplas = 1 email). Resend envia. Audit_log registra 'alerta_enviado'. Proprietário renova.

### Contrato ↔ OS Preventiva ↔ FRO ↔ Custo Alocado
Plano preventivo: limpeza filtro mensal. Cron gera OS automaticamente. Proprietário aprova. Custo R$200. Se ≤ teto FRO, deduz FRO; fatura próximo mês (no reembolso). Transparência investor ledger.

### Transação Bancária ↔ OFX Import ↔ Conciliação ↔ Fatura Match
Extrato OFX importado (FITID deduplicação). Transações status 'sugerido'. Curador aprova e faz match fatura. Conciliação compara valor esperado vs recebido. Divergência gera alerta.

---

## Casos de Uso Principais

### Ciclo de Vida Contrato (T0 → T12 → Rescisão)

**T0:** Proprietário cria novo contrato → seleciona inquilino → preenche modelo → define garantias → gera PDF + assinatura digital → salvo status='ativo'

**T1-T12:** Mensalmente cron 6 AM gera fatura pró-rata → cron 7 AM emite cobrança Asaas (boleto/PIX/débito) → inquilino paga → webhook marca paga → distribui ao proprietário → email confirmação

**T3, T6, T9:** Reajuste anual IGP-M/IPCA automático → próxima fatura usa novo valor → email inquilino detalha reajuste

**T13 (Saída):** Proprietário simula multa rescisória → registra quebra contrato → fatura gerada (últimas despesas + multa) → contrato status='encerrado' → imóvel status='disponível' (recolocação)

### Co-living com Matching

**T0:** Proprietário configura imóvel enable_coliving=true → define perfil compatibilidade (idade, profissão, etc.) → teto preço por quarto R$800/mês

**T1:** Novo inquilino X se candidata → preenche perfil (25 anos, estudante, noturno, sem animal) → sistema calcula score vs co-livers = 87% compatibilidade com inquilino Y → proprietário aprova → contrato quarto 2

**T6:** Inquilino Z quer mudar (incompatibilidade) → solicita quarto 3 → recalcula score (Z + W) = 75% ABAIXO threshold → proprietário pode forçar (90% chance sucesso) → autoriza mudança → novo contrato quarto 1

**T12:** Contrato inquilino X encerra (formou-se) → quarto 2 liberado → reabre candidaturas

### Inadimplência com Régua Escalonada

**T0:** Fatura vencida (data_vencimento=hoje−1) → status='emitida' → inquilino não paga

**T+5 (Dias 6-15):** Cron email: "Aluguel não pago. Pague via PIX: [cópia+cola]" → status='atrasado_5d'

**T+20 (Dias 16-30):** Cron SMS: "URGENTE! Débito 20 dias." + WhatsApp: "Atrasado. Responda SIM para parcelar: [link]" → status='atrasado_20d'

**T+45 (Dias 31-60):** Proprietário oferece confissão: 3 parcelas R$800 (jan, fev, mar) + juros reduzidos → inquilino assina digital → nova fatura 3× parcelas

**T+65 (Dias 61+):** Se ainda inadimplente → escala manual jurídico → contrato status='em_despejo' → seguro-fiança acionado (até 2 meses cobertura)

### Energia Solar com Auditoria

**T0:** Proprietário instala painel (10 kWh/dia) → integra inversor Growatt → upload fatura Celesc histórico

**T1-T30:** Cron 7 AM lê Growatt → cron 6 AM lê Celesc → calcula isolamento consumo CC → crédito geração = 10 kWh − 2 kWh CC = 8 kWh creditável

**T31:** Validação mensal: Growatt 300 kWh vs Celesc 298 kWh = 99% acuracia ✓ → registro audit_log OK. Se divergência > 5% → alerta "verificar inversor"

**T12:** Relatório anual: Geração 3.650 kWh → Isolamento 730 kWh (20%) → Crédito Líquido 2.920 kWh → Economia 2.920 × R$0,50 = R$1.460/ano → ROI painel R$8.000 em 5,5 anos

---

## Benefícios por Ator

### Por Proprietário

- ✅ **Receita Previsível:** Fatura automática, SLA atendimento garantido, cálculo pró-rata validado contra reais.
- ✅ **Transparência Total:** Extrato segregado (bruto, taxa, líquido), investidor vê linha-por-linha splitpagamento.
- ✅ **Redução Inadimplência:** Régua automática (email→SMS→WhatsApp→jurídico), confissão digital, parcelamento.
- ✅ **Patrimônio Rastreado:** Avaliação imóvel + financiamentos + solar = patrimônio líquido atualizado.
- ✅ **Manutenção Proativa:** Preventiva automática reduz custos corretiva. Timeline multifoto imutável (comprovação).

### Por Inquilino

- ✅ **Flexibilidade Pagamento:** Boleto, PIX (instantâneo), débito automático — escolhe método preferido.
- ✅ **Transparência Fatura:** Desdobramento completo (aluguel + água + energia), itens segregados, sem surpresa.
- ✅ **Acesso Digital:** Portal próprio (visualizar andamento OS), timeline multifoto, historico pagamentos.
- ✅ **Co-living Inclusivo:** Matching compatibilidade = melhor convivência. Mudanças de quarto sem penalidade.
- ✅ **Comunicação Clara:** Email, WhatsApp, SMS — escolhe canal preferido. Sem spam (régua escalonada).

### Por Administradora

- ✅ **Automação 90%:** Faturamento, cobrança, distribuição, alertas — zero intervenção manual maioria fluxos.
- ✅ **Auditoria Completa:** 71 tabelas RLS + audit_log imutável (26 tabelas com triggers) = rastreabilidade total.
- ✅ **Compliance:** LGPD consent, fiscal (modo competência+caixa), contábil (audit_log 7 anos retenção).
- ✅ **Escalabilidade:** Serverless (Vercel + Supabase), sem limite imóveis, auto-scaling carga.
- ✅ **Integrações Prontas:** 15+ (Asaas, Twilio, Resend, Growatt, Airbnb) — reduz desenvolvimento custom.

---

## Roadmap de Desenvolvimento

### ✅ Fase Atual (100% Completa)

- Gestão contratos (CRUD + assinatura digital)
- Faturamento mensal automático (pró-rata)
- Integração Asaas (cobranças boleto/PIX/débito)
- RLS policies (auditoria nativa PostgreSQL)
- Co-living com matching ColiMatch™
- Alertas vencimento garantias
- OFX import + conciliação bancária

### 🔄 Fase 8 (Em Andamento)

- Temporada/Airbnb (sync calendário, rateio)
- Energia solar (Growatt API + Celesc GD auditoria)
- UI/UX melhorias (dark mode, responsivo mobile)

### ⏳ Fase 9-10 (Próximas)

- Categorização automática OFX (IA ChatGPT)
- Relatório contábil em PDF (layout profissional)
- CRM integrado (follow-up inquilino, histórico contato)
- Mobile app React Native (iOS + Android)

### ⏳ Fase 11-12 (Futuras)

- Multitenancy (SaaS, cobrar administradoras)
- Chatbot IA (processamento natural language)
- Previsão ocupação (ML sazonalidade, demanda)
- BI avançado (Power BI / Metabase integration)

---

**Portfólio completo pronto para: Marketing, Entendimento Stakeholder, Roadmap Técnico, RFP Respostas**
