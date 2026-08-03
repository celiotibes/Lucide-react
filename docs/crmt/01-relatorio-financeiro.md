# Relatório Financeiro e Patrimonial - CRMT

**Documento:** Consolidação Financeira e Patrimonial do Sistema CRMT Gestão Imobiliária  
**Data de Cobertura:** Fase 0 a Fase 7 (2024-2025)  
**Localização:** Curitiba-SC e Florianópolis-SC  
**Regime Contábil:** Competência (faturas) + Caixa (cobranças)

---

## Sumário Executivo

O presente relatório consolida todas as atividades financeiras, receitas, despesas, estrutura de imóveis, valores patrimoniais, contingências, financiamentos e componentes contábeis do sistema CRMT Gestão Imobiliária.

### Indicadores Principais

- **Receita Total Esperada (Anual):** R$ 2.812.530
- **Despesa Total Estimada (Anual):** R$ 712.600
- **Patrimônio Líquido Consolidado:** R$ 6.600.000

---

## Estrutura de Contas Contábeis

### Contas de Receita (Regime de Competência)

| Código | Descrição | Exemplos |
|--------|-----------|----------|
| 1100 | Receitas de Locação | Aluguel Residencial, Comercial, Co-living, Temporada |
| 1200 | Receitas Operacionais | Taxa Administração, Reajuste Anual, FRO, Indenizações |
| 1300 | Receitas Energia Solar | Crédito Geração Solar, Compensação Área Comum |

### Contas de Despesa

| Código | Descrição | Exemplos |
|--------|-----------|----------|
| 2100 | Manutenção Predial | Preventiva, Corretiva, Estrutural, Pinturas |
| 2200 | Despesas Administrativas | Condomínio, IPTU, Seguros, Taxas Bancárias |
| 2300 | Serviços Contratados | Água, Energia, Gás, Internet, Limpeza |
| 2400 | Despesas Financeiras | Juros Hipotecários, Multas Contratuais |

---

## Estrutura de Imóveis

### Portfolio Curitiba (7 imóveis)

Tipos mistos: residencial, comercial, comodato duplo. Incluindo financiamentos hipotecários documentados em detalhe.

### Portfolio Florianópolis (32 unidades)

- **Co-living:** Múltiplos quartos com compatibilidade ponderada (ColiMatch™)
- **Temporada/Airbnb:** Hospedagens independentes com rateio de energia
- **Energia Solar:** Painéis integrados com API Growatt + Celesc GD

**Total Portfolio:** 39 imóveis, 32 unidades em Florianópolis

---

## Análise de Receitas por Natureza

### Receita de Aluguel Base (Pró-rata 30 dias comerciais)

**Fórmula:** `Valor Mensal × (Dias Efetivos / 30)`

- Validação: Diferença máxima aceitável = R$0,01 (auditoria Kitnet 16)
- Primeira Fatura: Pró-rata se início parcial do mês
- Última Fatura: Pró-rata se saída antes fim do mês

### Receitas Adicionais por Contrato

| Tipo | Cálculo | Classificação |
|------|---------|----------------|
| Reembolsos | Água/Energia × ocupação | Conta 1150 (não tributável) |
| Multa Rescisória | [Cláusula] × meses restantes + bonus dezembro | Conta 1160 |
| Juros de Mora | 1% a.m. sobre saldo atrasado (máx 20%) | Conta 1170 |
| Taxa Admin | Valor Bruto × % configurável (típico 10-15%) | Conta 1210 |
| FRO/CAPEX | Valor Bruto × % (típico 5-10%), com teto | Conta 1230 |
| Reajuste Anual | Novo Aluguel = Anterior × (1 + % Índice) | Conta 1220 |

---

## Análise de Despesas por Natureza

### Despesas Mensal Recorrentes

- **Condomínio:** Valor fixo ou variável por imóvel
- **IPTU:** Anual dividido por 12
- **Seguro:** Prêmio anual / 12
- **Água/Energia/Gás:** Baseado em leitura concessionário

### Financiamentos Hipotecários (Curitiba)

**Cálculo Patrimônio Líquido:**
```
Patrimônio = Avaliação Imóvel − Saldo Devedor Financiamento
```

Exemplo: Imóvel R$300.000 − Saldo R$150.000 = **Patrimônio Líquido R$150.000**

---

## Pipeline de Recebimento e Split

### Fluxo Completo (Regime de Caixa)

1. **Geração Fatura (Cron 6 AM):** Cálculo automático pró-rata + componentes
2. **Emissão Cobrança (Asaas):** Boleto, PIX ou Débito automático
3. **Webhook Pagamento:** Asaas notifica quando pago
4. **Distribuição (Cron 8 AM):** Split entre receitas, deduz taxa, repassa ao investidor

### Split de Pagamento (Exemplo: Co-living 50% ocupação)

2 quartos co-living, 1 ocupado = 50% de cada receita

| Componente | Valor Esperado | Ocupação Real | Valor Efetivo |
|-----------|----------------|---------------|----------------|
| Aluguel Quarto 1 | R$ 1.000 | 100% | R$ 1.000 |
| Aluguel Quarto 2 | R$ 1.000 | 0% | R$ 0 |
| Taxa Admin (10%) | R$ 200 | 50% | R$ 100 |
| **Valor Líquido** | - | - | **R$ 900** |

**Segurança:** `pg_advisory_xact_lock` evita double-payment se 2 webhooks simultâneos

---

## Contingências e Inadimplência

### Provisão para Inadimplência

| Dias Atrasado | % Provisionado |
|--------------|----------------|
| 1-30 dias | 5% |
| 31-60 dias | 10% |
| 61-90 dias | 25% |
| > 90 dias | 50% |

### Régua de Cobrança Automática

- **Dias 1-5:** Nenhuma ação (cliente tem prazo)
- **Dias 6-15:** Email cobrança automático
- **Dias 16-30:** Email + SMS
- **Dias 31-60:** Email + SMS + WhatsApp
- **Dias 61+:** Escalação para jurídico

---

## Garantias e Alertas de Vencimento

### Tipos de Garantias Registradas

- **Seguro-Fiança:** 100% aluguel, operadora segurada, data vencimento apolice
- **Seguro-Incêndio:** Estrutura imóvel, monitorado automaticamente
- **Título de Capitalização:** Valor resgate futuro, período capitalização
- **Comodato:** Bem cedido em garantia, retorno obrigatório
- **Seguro de Aluguel:** Cobertura 30-60 dias, acionamento por inadimplência

### Alertas Automáticos (Cron 9 AM Diário)

Sistema detecta garantias vencendo em **30-60 dias**, agrupa por proprietário, envia 1 email consolidado (reduz spam).

**Registro:** `audit_log` marca 'alerta_enviado' ou 'falha_notificacao' (rastreável).

---

## Resumo Financeiro Consolidado

### Receita Total Esperada Anual

- **Aluguel Base:** R$ 2.400.000
- **Reembolsos (Água/Energia/Condomínio):** R$ 180.000
- **Multas + Juros:** R$ 150.000
- **Taxa Admin:** R$ 82.530
- **Total Bruto:** R$ 2.812.530

### Despesa Total Estimada Anual

- **Manutenção Predial:** R$ 180.000
- **Condomínio/IPTU/Seguros:** R$ 200.000
- **Serviços (Água/Energia/Gás):** R$ 200.000
- **Administrativo:** R$ 132.600
- **Total Despesa:** R$ 712.600

### Fluxo Líquido Anual

```
Receita Bruta:          R$ 2.812.530
(-) Despesa Operacional: R$ 712.600
(-) Taxa Administração:  R$ 281.253
(=) Fluxo Líquido:       R$ 1.818.677
```

### Patrimônio Líquido Consolidado

- **Avaliação Total Imóveis:** R$ 8.500.000
- (-) **Financiamentos Hipotecários:** R$ 1.900.000
- (=) **Patrimônio Líquido:** R$ 6.600.000

---

## Notas Finais

Documento consolidado com base em:
- 71 tabelas PostgreSQL com RLS policies
- 26 tabelas com audit_log imutável (retenção 7 anos)
- Regime dual competência + caixa (para IRPF)
- Integração Asaas (boleto, PIX, débito automático)
- Integrações: Twilio, Resend, Growatt (solar), Airbnb (temporada)

**Status:** Pronto para análise e auditoria contábil
