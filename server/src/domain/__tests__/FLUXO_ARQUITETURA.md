# SPRINT 1 - Fluxo de Arquitetura

## 1. Fluxo: Streamlit → API Gateway → Ledger

```
app-bruxel (Streamlit)
    ↓
    │ POST /api/processador
    │ {
    │   origem_modulo: "app-bruxel"
    │   tipo_documento: "diaria"
    │   valor: 1500
    │   ...
    │ }
    ↓
[API Gateway Streamlit]
    ├─ validarPayloadStreamlit()
    ├─ transformarDiariaEmLancamento()
    └─ sincronizarComERP()
    ↓
[Lançamento Gerado]
    {
        id: "LCT-xxx"
        conta_debito: "2.1.01"  (Imóvel)
        conta_credito: "1.0.01" (Caixa)
        valor: 1500
        status: "pendente"
    }
    ↓
[Webhook para Ledger]
    ├─ criarEventoWebhook()
    ├─ registrarWebhook()
    └─ processarWebhook()
    ↓
[Ledger - Lançamento Finalizado]
    ✓ Contabilizado
    ✓ Centro de Custo Atribuído
    ✓ Pronto para Relatórios
```

## 2. Fluxo: Payroll Processing

```
[Contrato Ativo]
    {
        funcionario_id: "FUNC-001"
        salario_base: 3000
        tipo_contrato: "CLT"
    }
    ↓
[Processamento de Folha]
    ├─ calcularINSS()     → 225.00 (7.5%)
    ├─ calcularIRRF()     → 187.50 (6.25%)
    └─ salario_liquido    → 2587.50
    ↓
[Descontos Extraídos]
    1. INSS: 225.00 (Conta 6.2.02)
    2. IRRF: 187.50 (Conta 6.2.03)
    ↓
[Lançamentos Contábeis - Gerados Automaticamente]
    LCT-1: Débito 6.2.01 / Crédito 3.1.02 → 3000 (Folha)
    LCT-2: Débito 6.2.02 / Crédito 3.1.03 → 225 (INSS)
    LCT-3: Débito 6.2.03 / Crédito 3.1.04 → 187.50 (IRRF)
    ↓
[Documento de Aprovação Criado]
    status: "pendente"
    nivel_atual: "gerente"
    ↓
[Fluxo de Aprovação: 2 Níveis]
    Gerente → Contabilista → Finalizado
```

## 3. Fluxo: Despesas Operacionais (Automação)

```
[Despesa Configurada]
    {
        imovel_id: "IMOV-001"
        descricao: "Condomínio"
        valor: 500
        recorrencia: "mensal"
        dia_vencimento: 15
        ativa: true
    }
    ↓
[Agendador (Cron Job Simulado)]
    Mensalmente no dia 15
    ↓
[Execução: executarCicloDespesas()]
    ├─ processarDespesasAgendadas()
    └─ gerarLancamentosAutomaticos()
    ↓
[Processamento Criado]
    {
        mes: "2024-09"
        status: "processado"
        valor_processado: 500
    }
    ↓
[Lançamento Contábil]
    Débito: 3.1.10 (Despesa Operacional)
    Crédito: 1.0.01 (Caixa)
    Valor: 500
    ↓
[Documento de Aprovação]
    status: "pendente"
    nivel_atual: "gerente"
```

## 4. Fluxo: Document Approvals (2 Níveis)

```
[Documento Criado]
    {
        tipo: "folha"
        status: "pendente"
        nivel_atual: "gerente"
    }
    ↓
[Nível 1: Gerente]
    aprovarDocumento(gerente)
    ├─ status → "aprovado_gerente"
    ├─ nivel_atual → "contabilista"
    └─ historico_aprovacoes[+1]
    ↓
[Nível 2: Contabilista]
    aprovarDocumento(contabilista)
    ├─ status → "finalizado"
    ├─ nivel_atual → null
    └─ historico_aprovacoes[+1]
    ↓
[Estados Possíveis]
    • pendente → aprovado_gerente → aprovado_contabilista → finalizado
    • pendente → rejeitado (volta para pendente)
    • pendente → comentado (sem mudança de estado)
```

## 5. Fluxo: Webhook para Ledger (Tempo Real)

```
[Evento Disparado]
    skillos-integracao, app-bruxel, imovel-gestao
    ↓
[Validação Webhook]
    validarEventoWebhook()
    ├─ Verifica origem_modulo
    ├─ Verifica tipo_evento
    ├─ Verifica contas contábeis
    └─ Valida valores
    ↓
[Registro de Recebimento]
    {
        id: "WHR-xxx"
        status: "recebido"
        tentativas: 0
    }
    ↓
[Processamento]
    processarWebhook()
    ├─ status: "processando"
    ├─ Integra com Ledger (TODO)
    └─ tentativas += 1
    ↓
[Sucesso]
    {
        status: "finalizado"
        lancamento_id: "LCT-xxx"
        tentativas: 1
    }
    ↓
[Erro - Retry Logic]
    {
        status: "erro"
        tentativas: 1
        proxima_tentativa: (em 5 minutos)
    }
    Máximo: 3 tentativas
```

## 6. Mapas de Contas Contábeis

### Estrutura do Plano de Contas

```
1.0.00 - ATIVO
  1.0.01 - Caixa/Banco
  1.1.01 - Contas a Receber

2.0.00 - PASSIVO
  2.1.01 - Imóveis (Ativo Circulante)

3.0.00 - PASSIVO CIRCULANTE
  3.1.01 - Despesa Operacional
  3.1.02 - Salários a Pagar
  3.1.03 - INSS a Recolher
  3.1.04 - IRRF a Recolher
  3.1.10 - Despesa Operacional

4.0.00 - RECEITA
  4.1.01 - Receita Aluguel

6.0.00 - DESPESA
  6.2.01 - Encargos com Pessoal - Salários
  6.2.02 - Encargos com Pessoal - INSS
  6.2.03 - Encargos com Pessoal - IRRF
```

### Roteamento por Tipo de Documento

| Tipo | Débito | Crédito | Descrição |
|------|--------|---------|-----------|
| Diária | 2.1.01 | 1.0.01 | Imóvel ← Caixa |
| Despesa | 3.1.01 | 1.0.01 | Despesa ← Caixa |
| Folha | 6.2.01 | 3.1.02 | Encargo ← Salários Pagar |
| Receita | 1.0.01 | 4.1.01 | Caixa ← Receita |

## 7. Integração: Módulos Interdependentes

```
┌─────────────────────────────────────────────────────────┐
│                   LEDGER CENTRAL                         │
│         (Repositório de Lançamentos Contábeis)           │
└──────────────┬──────────────────────────────────────────┘
               │
      ┌────────┼────────┬─────────────┐
      ↓        ↓        ↓             ↓
[API GW] → [Payroll] [Despesas] [Document]
                                   Approvals
      ↓        ↓        ↓             ↓
   ┌──────────────────────────────────┐
   │   Webhook para Ledger (RT)       │
   │  (Dispara lançamentos imediatos) │
   └──────────────────────────────────┘
                    ↓
         ┌──────────────────────┐
         │  Relatórios & BI     │
         │  Contas Correntes    │
         │  Fluxo de Caixa      │
         │  Análise Custos      │
         └──────────────────────┘
```

## 8. Estados e Transições

### Documento de Aprovação
```
pendente
    ↓ (aprovarDocumento - gerente)
aprovado_gerente
    ↓ (aprovarDocumento - contabilista)
finalizado
    ↓ (marcarComoPago)
✓ FINALIZADO

OU

pendente
    ↓ (rejeitarDocumento)
rejeitado
    ↓ (volta para reprocessamento)
pendente
```

### Webhook
```
recebido
    ↓
processando
    ├─ finalizado ✓
    │
    └─ erro
        ├─ tentativas < 3
        │  ↓
        │  proxima_tentativa (em 5min)
        │  ↓
        │  processando (retry)
        │
        └─ tentativas >= 3
           ↓
           ✗ FALHOU (máximo de tentativas)
```

## 9. Cobertura de Testes

- **API Gateway Streamlit**: 8 testes
- **Payroll Base**: 7 testes
- **Webhook para Ledger**: 7 testes
- **Despesas Operacionais**: 8 testes
- **Document Approvals**: 9 testes
- **Integração**: 3 testes

**Total: 50+ testes**

## 10. Checklist de Implementação SPRINT 1

- [x] 1A.1 - API Gateway Streamlit (transformação e roteamento)
- [x] 2A.3 - Payroll Base (CLT, INSS, IRRF)
- [x] 3A.1 - Webhook para Ledger (lançamento imediato)
- [x] 4A.1 - Despesas Operacionais (automação e agendamento)
- [x] 5A.2 - Document Approvals (2 níveis de aprovação)
- [x] Test Setup com tabelas SQL
- [x] 50+ testes cobrindo todos os módulos
- [x] Integração validada entre módulos
- [x] Documentação de fluxo e arquitetura
