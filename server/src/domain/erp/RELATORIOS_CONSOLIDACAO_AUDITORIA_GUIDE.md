# Guia: Relatórios de Consolidação e Auditoria (SPRINT 3)

## Visão Geral

Este documento fornece instruções completas para:
- **6 Relatórios Executivos**: Consolidação, Financeiro, Painel de Gestão, Fluxo de Caixa, Sensibilidade IPCA, Projeção 12M
- **6 Relatórios de Auditoria**: Rastreabilidade, Conformidade, Integridade Hash, Anomalias, Retificações, Acesso de Pessoas
- Contexto regulatório (IBRACON, CPC, Lei 6404/76)
- Interpretação de resultados e investigação de desvios

---

## PARTE 1: RELATÓRIOS EXECUTIVOS (CONSOLIDAÇÃO)

### 1. Relatório de Consolidação por Módulo

**Propósito**: Snapshot completo do ERP agrupado por origem de módulo (Payroll, Despesas, API Gateway, Webhooks, Apontamentos)

**Regulamentação**: 
- Lei das Sociedades Anônimas 6404/76 (Art. 176)
- IBRACON - NBC TA 200 (Conformidade de Informação Financeira)

**Uso Típico**:
```typescript
import { relatorioConsolidacaoModulos } from './relatorios-consolidacao';

const relatorio = relatorioConsolidacaoModulos(lancamentos, "2024-09");

console.log(`Total Geral: R$ ${relatorio.total_geral}`);
console.log(`Módulos: ${relatorio.modulos.map(m => m.nome_modulo).join(', ')}`);

// Validar balanceamento
if (relatorio.validacoes.balanceamento) {
  console.log("✓ Débito = Crédito validado");
} else {
  console.log("✗ Desbalanceamento detectado!");
  relatorio.validacoes.mensagens.forEach(msg => console.warn(msg));
}
```

**Interpretação de Resultados**:
- ✓ Balanceamento True = Partidas dobradas conformes
- Total Valor = Soma de todas as transações do período
- Hash Modulo = Fingerprint de integridade de cada módulo

---

### 2. Relatório Executivo Financeiro

**Propósito**: Demonstrativo Financeiro completo (Balanço Patrimonial + Demonstração de Resultado)

**Estrutura**:

#### Balanço Patrimonial (Equação Fundamental: A = P + PL)

```
ATIVO
├─ Circulante (Conta 1.1.x)
│  ├─ Caixa e Equivalentes: R$ 150.000
│  ├─ Contas a Receber: R$ 80.000
│  └─ Estoques: R$ 20.000
│  └─ Total AC: R$ 250.000
│
└─ Não Circulante (Conta 1.2.x)
   ├─ Imóveis, Máquinas: R$ 300.000
   ├─ Intangíveis: R$ 50.000
   └─ Total ANC: R$ 350.000

TOTAL ATIVO: R$ 600.000

PASSIVO
├─ Circulante (Conta 2.1.x)
│  ├─ Salários a Pagar: R$ 50.000
│  ├─ Contas a Pagar: R$ 80.000
│  └─ Total PC: R$ 130.000
│
└─ Não Circulante (Conta 2.2.x)
   ├─ Empréstimos LP: R$ 170.000
   └─ Total PNC: R$ 170.000

TOTAL PASSIVO: R$ 300.000

PATRIMÔNIO LÍQUIDO
├─ Capital: R$ 210.000
├─ Lucros Acumulados: R$ 90.000
└─ Total PL: R$ 300.000

VERIFICAÇÃO: A (600) = P (300) + PL (300) ✓
```

#### Demonstração de Resultado do Exercício (DRE)

```
RECEITAS (Conta 4.x)
├─ Receita Operacional: R$ 500.000

CUSTOS (Conta 5.x)
├─ Custo de Serviços: R$ 150.000

LUCRO BRUTO: R$ 350.000

DESPESAS OPERACIONAIS (Conta 6.x)
├─ Folha de Pagamento: R$ 120.000
├─ Despesas Administrativas: R$ 80.000
└─ Despesas de Vendas: R$ 50.000

RESULTADO OPERACIONAL: R$ 100.000

IR/CSLL (27% aprox.): R$ 27.000

RESULTADO LÍQUIDO: R$ 73.000
```

**Interpretação**:
- **Liquidez Corrente** = AC/PC → Deve ser > 1.0 (capacidade de pagar obrigações curtas)
- **Endividamento** = P/A → Deve ser < 60% (limite de risco financeiro)
- **Margem Líquida** = Resultado Líquido / Receitas → Índice de lucratividade

---

### 3. Painel de Gestão (Dashboard de KPIs)

**Propósito**: Monitoramento em tempo real de indicadores de desempenho e alertas gerenciais

**KPIs Principais**:

| KPI | Fórmula | Esperado | Crítico |
|-----|---------|----------|---------|
| Margem de Lucro | (Lucro / Receita) × 100 | > 15% | < 5% |
| ROI | (Lucro / Ativo) × 100 | > 10% | < 2% |
| Liquidez Corrente | AC / PC | > 1.5 | < 0.8 |
| Índice Endividamento | (P / A) × 100 | < 50% | > 70% |
| Taxa de Crescimento | (Lucro / Capital Inicial) × 100 | > 5% a.m. | < 0% |

**Alertas Automáticos**:

```typescript
const painel = relatorioPainelGestao(lancamentos, "2024-09");

painel.alertas.forEach(alerta => {
  switch (alerta.severidade) {
    case 'crítico':
      console.error(`🔴 CRÍTICO: ${alerta.mensagem}`);
      // Escalar para diretoria
      break;
    case 'aviso':
      console.warn(`🟡 AVISO: ${alerta.mensagem}`);
      // Verificação do gerente
      break;
    case 'informativo':
      console.log(`🟢 INFO: ${alerta.mensagem}`);
      break;
  }
});
```

**Tendências (30 dias)**:
- Gráfico de evolução de receita e despesa
- Identifica sazonalidade e padrões anormais
- Facilita previsão de cash flow

---

### 4. Fluxo de Caixa Consolidado

**Propósito**: Demonstração de Fluxo de Caixa (DFC) método indireto

**Estrutura**:

```
FLUXO DE CAIXA

ATIVIDADES OPERACIONAIS
├─ Resultado Líquido: R$ 73.000
├─ Ajustes não-caixa (Deprec.): R$ 10.000
├─ Mudanças Capital Trabalho: R$ (5.000)
└─ Fluxo Operacional: R$ 78.000

ATIVIDADES DE INVESTIMENTO
├─ Aquisição Imobilizado: R$ (50.000)
├─ Venda de Ativos: R$ 5.000
└─ Fluxo Investimento: R$ (45.000)

ATIVIDADES DE FINANCIAMENTO
├─ Obtenção Empréstimos: R$ 20.000
├─ Pagamento Dividendos: R$ (10.000)
└─ Fluxo Financiamento: R$ 10.000

VARIAÇÃO DE CAIXA: R$ 43.000
├─ Saldo Inicial: R$ 100.000
└─ Saldo Final: R$ 143.000
```

**Interpretação**:
- **Fluxo Operacional Positivo**: Negócio gera caixa
- **Fluxo Investimento Negativo**: Normal (reaplicação)
- **Equilíbrio Financiamento**: Sustentabilidade de longo prazo

---

### 5. Sensibilidade IPCA

**Propósito**: Análise de impacto da inflação (IPCA) em remuneração e custos

**Exemplo - Impacto 10.5% IPCA**:

```
RUBRICAS DE REMUNERAÇÃO

┌─ Urgência 50
│  Valor Atual: R$ 50,00
│  Impacto IPCA: +R$ 5,25 (10.5%)
│  Novo Valor: R$ 55,25

├─ Airbnb 1Q
│  Valor Atual: R$ 150,00
│  Impacto IPCA: +R$ 15,75 (10.5%)
│  Novo Valor: R$ 165,75

└─ Diária Ajudante
   Valor Atual: R$ 80,00
   Impacto IPCA: +R$ 8,40 (10.5%)
   Novo Valor: R$ 88,40

RESUMO
├─ Custo Anual Atual: R$ 14.400
├─ Impacto Total/Ano: R$ 1.512
└─ Custo Anual Projetado: R$ 15.912
```

**Decisões Decorrentes**:
- Solicitar aprovação para reajuste de rubricas
- Ajustar orçamento anual de remuneração
- Comunicar revisão de valores a fornecedores internos

---

### 6. Projeção Orçamentária - Próximos 12 Meses

**Propósito**: Forward-looking budget com análise de cenários

**Cenários**:

| Cenário | Ajuste | Margem | Uso |
|---------|--------|--------|-----|
| Pessimista | -10% | 15% | Pior caso, planejamento defensivo |
| Esperado | ±0% | 10% | Caso base, orçamento aprovado |
| Otimista | +10% | 5% | Melhor caso, ambição estratégica |

**Exemplo - Cenário Esperado**:

```
MÊS         | RECEITA | DESPESA | SALDO   | SALDO ACUMULADO
Janeiro     | 15.000  | 12.000  | 3.000   | 103.000
Fevereiro   | 15.300  | 12.120  | 3.180   | 106.180
Março       | 15.606  | 12.241  | 3.365   | 109.545
...
Dezembro    | 18.735  | 14.729  | 4.006   | 156.423
```

**Interpretação**:
- **Saldo Acumulado Crescente**: Negócio é sustentável
- **Margem Segurança 10%**: Variação até 10% não compromete plano
- **Investimentos Aprovados**: Basear em cenário esperado, não otimista

---

## PARTE 2: RELATÓRIOS DE AUDITORIA

### 1. Rastreabilidade Completa (Audit Trail)

**Propósito**: Histórico completo de cada lançamento com origem de módulo e referência de documento

**Regulamentação**:
- IBRACON NBC TA 500 (Auditoria de Documentação)
- Resolução CFC 1.018/05 (Registro de Evidência em Auditoria)
- Lei Geral de Proteção de Dados (LGPD Art. 12)

**Exemplo de Registro**:

```
Sequência:        1
Data:             2024-09-10
Módulo Origem:    payroll
Tipo Documento:   folha_pagamento
Descrição:        Folha de Setembro - João Silva
Valor:            R$ 3.000,00
Conta Débito:     6.2.01 (Encargos com Pessoal)
Conta Crédito:    3.1.02 (Salários a Pagar)
Usuário Criador:  USER-001 (João Contabilista)
Hash Verificação: a7f3e2d4b9c1e6f8a2d5c9e1b4f7a3d6
Modulo Confirmado: ✓ SIM
Timestamp:        2024-09-10T10:30:45Z
```

**Procedimento de Investigação**:

Se detectado problema → Hash não corresponde:

1. **Localizar registro original** → Via `lancamento_id`
2. **Comparar dados**:
   - Valor está correto?
   - Contas estão corretas?
   - Data está correta?
3. **Identificar alteração**:
   - Quem modificou? (Usuario_id)
   - Quando? (Timestamp anterior vs posterior)
   - Por quê? (Motivo em relatório de retificações)
4. **Validar conformidade**:
   - Dentro de 24h? (Prazo para retificação sem aprovação)
   - Justificativa documenta? (Auditoria)

---

### 2. Conformidade Contábil (Partidas Dobradas)

**Propósito**: Validação de que débito = crédito (equação fundamental da contabilidade)

**Regulamentação**:
- Resolução CFC 1.374/11 (Normas Contábeis)
- Lei 6404/76 Art. 177 (Livros Obrigatórios)
- CPC 05 (Divulgação de Informações)

**Fórmula de Validação**:

```
Σ Débitos (Contas 1, 5, 6) = Σ Créditos (Contas 2, 3, 4)

Se diferença absoluta < 0.01 → CONFORME
Se diferença absoluta >= 0.01 → NÃO CONFORME (Investigar)
```

**Exemplo de Relatório**:

```
CONFORMIDADE CONTÁBIL - Setembro 2024

Total Lançamentos Validados:  150
├─ Lançamentos Válidos:       148 (98.7%)
└─ Lançamentos Inválidos:       2 (1.3%)

SALDO DE CONTAS
├─ Total Débito:     R$ 45.725,50
├─ Total Crédito:    R$ 45.725,50
├─ Diferença:        R$ 0,00
└─ % Diferença:      0,00%

RESULTADO: ✓ CONFORME

VIOLAÇÕES DETECTADAS:
├─ LCT-045: Conta inválida (7.1.01 - não existe classe 7)
└─ LCT-089: Valor negativo (-R$ 150,00)
```

**Ações Corretivas**:

```typescript
// Para cada violação
if (relatorio.violacoes.length > 0) {
  relatorio.violacoes.forEach(v => {
    switch (v.tipo_violacao) {
      case 'debito_credito_desbalanceado':
        // Revisar todos os lançamentos do período
        // Possível: lançamento duplicado ou faltante
        break;
      
      case 'conta_invalida':
        // Revisar plano de contas
        // Alterar para conta válida (retificação)
        break;
      
      case 'valor_negativo':
        // Revisar se é reversão (ok) ou erro de entrada
        break;
      
      case 'data_invalida':
        // Corrigir data para período apropriado
        break;
    }
  });
}
```

---

### 3. Integridade Hash - Snapshot SHA-256

**Propósito**: Verificação criptográfica de integridade de dados por período

**Regulamentação**:
- Lei 12.965/14 (Marco Civil - Segurança de Dados)
- IBRACON NBC TA 500 (Preservação de Evidência)

**Conceito**:

- **Hash SHA-256**: Fingerprint criptográfico (64 caracteres hexadecimais)
- **Imutável**: Qualquer alteração de 1 bit muda completamente o hash
- **Determinístico**: Mesmo dado = mesmo hash (sempre)
- **Unidirecional**: Impossível recuperar dados do hash

**Exemplo**:

```
SNAPSHOT ORIGINAL - Setembro 2024
├─ Data: 2024-10-01 (Encerramento do mês)
├─ Total Lançamentos: 150
├─ Hash Período: 
│  a7f3e2d4b9c1e6f8a2d5c9e1b4f7a3d6
│  c9e1b4f7a3d6e2f8a7c1d9e4b6f8a2d5
│
└─ Hashes Individuais (amostra):
   LCT-001: 3e7d9a2c5f1b8e4a6d9c2e5b8f1a4d7c
   LCT-002: 7c3e9d2a5f8b1e4c6a9d2e5b8f1a4d7c
   ...

VERIFICAÇÃO 6 MESES DEPOIS
├─ Dados Armazenados: Intactos
├─ Hash Recomputado: 
│  a7f3e2d4b9c1e6f8a2d5c9e1b4f7a3d6
│  c9e1b4f7a3d6e2f8a7c1d9e4b6f8a2d5
│
└─ Resultado: ✓ INTEGRIDADE CONFIRMADA
   (Sem adulteração detectada no período)
```

**Procedimento em Caso de Falha**:

```typescript
if (!verificarIntegridadeSnapshot(snapshot, lancamentosAtual)) {
  // ✗ Integridade comprometida!
  
  // 1. Identificar qual lançamento mudou
  snapshot.hashes_lancamentos.forEach((hashOriginal, lancamentoId) => {
    const hashAtual = gerarHashLancamento(lancamentosAtual
      .find(l => l.lancamento_id === lancamentoId)!);
    
    if (hashOriginal !== hashAtual) {
      console.error(`Lançamento ${lancamentoId} foi alterado!`);
      // 2. Gerar relatório de alteração
      // 3. Escalerar para auditoria
    }
  });
}
```

---

### 4. Detecção de Anomalias

**Propósito**: Identificar lançamentos anormais ou suspeitos

**Tipos de Anomalias**:

| Tipo | Score | Investigar? | Exemplo |
|------|-------|-------------|---------|
| Valor Alto | 30 | Sim, se > 2x média | R$ 100.000 (média R$ 50.000) |
| Duplicação | 40 | Sim, sempre | Mesmo lançamento 2x |
| Fora Período | 25 | Sim | Lançamento Jan em Setembro |
| Conta Incomum | 35 | Sim | Conta 7.1.01 (classe 7 não existe) |
| Usuário Suspeito | 20 | Se combinado | 50+ tentativas de acesso/dia |

**Score de Risco**:
- **0-50**: Baixo risco (avisos)
- **50-80**: Médio risco (requer revisão)
- **80-100**: Alto risco (investigação obrigatória)

**Exemplo - Detecção em Ação**:

```
ANOMALIAS DETECTADAS - Setembro 2024

🔴 CRÍTICA (Score: 87) - Requerer Investigação
├─ ID: LCT-142
├─ Tipo: Duplicação + Valor Alto
├─ Descrição: Folha de Pagamento - Maria Santos
├─ Valor: R$ 15.000 (5x acima da média)
├─ Razão: Mesmo lançamento detectado 2x
├─ Ação: Verificar com RH se é bonificação ou erro

🟡 AVISO (Score: 65) - Requerer Revisão
├─ ID: LCT-156
├─ Tipo: Fora do Período
├─ Descrição: Diária de Cliente (data: 2024-08-15, período: 2024-09)
├─ Razão: Lançamento retroativo 15 dias
├─ Ação: Validar com comercial a justificativa

🟢 INFO (Score: 45) - Monitorar
├─ ID: LCT-089
├─ Tipo: Conta Incomum
├─ Conta: 1.1.99 (Diversos)
└─ Ação: Classificar corretamente próximo mês
```

**Investigação Estruturada**:

```
1. VALIDAR DADOS
   - Lançamento é legítimo?
   - Documentação existe?
   - Autorização foi concedida?

2. CONSULTAR RESPONSÁVEL
   - Quem criou (usuario_criador)?
   - Por qual motivo?
   - Quando? (timestamp)

3. VERIFICAR AUTORIZAÇÃO
   - Documento está aprovado?
   - Está dentro de limite de delegação?
   - Necessita revisão de compliance?

4. DOCUMENTAR CONCLUSÃO
   - Registrar em relatório de retificações
   - Armazenar evidência (print, email)
   - Comunicar auditoria (se necessário)
```

---

### 5. Rastreamento de Retificações

**Propósito**: Histórico completo de correções e reversões

**Regulamentação**:
- Lei 6404/76 Art. 179 (Livro Diário)
- IBRACON NBC TA 450 (Documentação de Evidência)
- Resolução 1.003/04 CFC (Retificação de Erros)

**Tipos de Operações**:

| Tipo | Descrição | Prazo Análise | Exemplo |
|------|-----------|---------------|---------|
| **Correção** | Ajuste de valor/conta em lançamento | 24h | Valor entrada errado |
| **Reversão** | Desfazer lançamento + criar inverso | 48h | Lançamento duplicado |
| **Complementação** | Adicionar informação faltante | 7 dias | Falta centro de custo |

**Exemplo - Rastreamento Completo**:

```
RETIFICAÇÃO RET-001
├─ Data: 2024-09-11
├─ Usuário: USER-001 (João Contabilista)
├─ Lançamento Original: LCT-001 (R$ 3.000)
├─ Tipo Operação: Correção
├─ Campo Alterado: Valor
├─ Anterior: R$ 3.000
├─ Novo: R$ 3.100
├─ Motivo: Valor foi recebido com diferença - confirmado com RH
├─ Justificativa: Pagamento extra era benefício retroativo Jan-Set
├─ Tempo desde Lançamento: 1 dia ✓ (Dentro de 24h)
├─ Lançamento Corretivo: LCT-001-RET (R$ 100 complementar)
└─ Hash Retificação: abc123def456...
```

**Conformidade de Tempo**:

```typescript
const conformidade = relatorio.conformidade_tempo;

console.log(`Retificações dentro de 24h: ${conformidade.dentro_prazo_24h} (Bom)`);
console.log(`Retificações fora de 24h: ${conformidade.fora_prazo_24h}`);

// Se > 20% fora de prazo:
if ((conformidade.fora_prazo_24h / (conformidade.dentro_prazo_24h + conformidade.fora_prazo_24h)) > 0.2) {
  console.warn("⚠️  Muitas retificações fora do prazo. Investigar processo.");
  // Possivelmente problemas com:
  // - Treinamento de usuários
  // - Falta de validação na entrada
  // - Comunicação lenta entre departamentos
}
```

**Procedimento de Revisão**:

```
1. VALIDAR MOTIVO
   - Motivo está justificado?
   - Documentação suporta?

2. VERIFICAR CORREÇÃO
   - Valor anterior/novo está correto?
   - Conta está apropriada?
   - Período está correto?

3. AUDITAR USUÁRIO
   - Tem autorização para retificar?
   - Essa categoria de erro é frequente?

4. ACOMPANHAR TENDÊNCIA
   - Aumentando retificações?
   - Mesmo tipo de erro?
   → Implementar controle preventivo
```

---

### 6. Audit Log - Acesso de Pessoas

**Propósito**: Rastreamento de quem fez o quê, quando e resultados

**Regulamentação**:
- LGPD Lei 13.709/18 (Proteção de Dados Pessoais)
- Lei 12.965/14 (Segurança em TI)
- NBC PA 302 (Controles Internos)

**Ações Rastreadas**:

```
AUDIT LOG - Setembro 2024

08:00 - USER-001 (João)     | CRIAR   | LCT-001 | Folha Setembro       | ✓ Sucesso
08:05 - USER-001 (João)     | APROVAÇÃO | LCT-001 | Validação folha    | ✓ Sucesso
10:30 - USER-002 (Gerente)  | LEITURA | LCT-001 | Revisar              | ✓ Sucesso
14:15 - USER-003 (Fiscal)   | DELECAO | LCT-089 | Remove errado        | ✗ Falha (sem permissão)
14:20 - USER-003 (Fiscal)   | LEITURA | LCT-001 | Justificar falha      | ✓ Sucesso
17:00 - SYSTEM              | SINCRONIZAÇÃO | WH-001 | Pluggy sync      | ✓ Sucesso
```

**Operações Críticas Detectadas**:

```
🔴 CRÍTICA: Tentativa de Deleção
├─ Usuário: USER-003 (Fiscal)
├─ Entidade: LCT-089 (Condomínio)
├─ Resultado: ✗ FALHA (sem permissão)
├─ Hora: 14:15
├─ Ação Recomendada:
│  1. Verificar se foi acidental
│  2. Confirmar que permissions estão corretas
│  3. Se intencional, criar request para escalação
└─ Escalado para: Auditoria Interna

🟡 AVISO: Múltiplas Falhas de Acesso
├─ Usuário: USER-004 (Novo)
├─ Total Tentativas: 15
├─ Sucesso: 2
├─ Taxa Falha: 86.7%
├─ Possíveis Motivos:
│  - Credenciais incorretas
│  - Bloqueio de conta
│  - Permissões insuficientes
└─ Ação: Resetar senha e re-treinar
```

**Procedimento de Investigação - Atividade Suspeita**:

```typescript
// Identificar padrão anormal
relatorio.usuarios_com_atividade_suspeita.forEach(usuario => {
  const taxaFalha = (usuario.falhas_acesso / usuario.total_operacoes) * 100;
  
  if (taxaFalha > 30) {
    console.error(`⚠️  ${usuario.usuario_nome} tem ${taxaFalha}% de falhas`);
    
    // Investigar:
    // 1. Problema técnico (credenciais, permissões)?
    // 2. Usuário novo em treinamento?
    // 3. Tentativa de acesso não autorizado (segurança)?
    
    // Ação:
    // - Contatar usuário
    // - Validar permissões
    // - Se persistir > 24h, escalar
  }
});
```

---

## PARTE 3: CENÁRIOS DE INVESTIGAÇÃO

### Cenário 1: Desbalanceamento Detectado

**Situação**: Relatório aponta débito ≠ crédito

**Passos**:

```
1. VALIDAR CÁLCULO
   └─ Recomputar soma manualmente
      └─ Se diferença persiste, prosseguir

2. FILTRAR POR MÓDULO
   ├─ Payroll: R$ 3.225 débito vs R$ 3.225 crédito (✓ OK)
   ├─ Despesas: R$ 500 débito vs R$ 500 crédito (✓ OK)
   ├─ API-GW: R$ 1.500 débito vs R$ 1.500 crédito (✓ OK)
   └─ Webhook: R$ 500 débito vs R$ 500 crédito (✗ FALHA!)

3. INVESTIGAR MÓDULO FALHO
   └─ Webhook LCT-005
      ├─ Débito: 1.1.02 (Banco) = R$ 500
      ├─ Crédito: 2.1.01 (Fornecedor) = R$ 400
      └─ Diferença: R$ 100

4. DESCOBRIR CAUSA
   └─ LCT-005 foi retificado!
      ├─ Alteração: RET-002
      ├─ Motivo: Valor correto era R$ 400, não R$ 500
      ├─ Usuario: USER-SYSTEM (automático)
      └─ Ação: Localizar lançamento corretivo (deve existir)

5. VALIDAR CORREÇÃO
   ├─ Confirmar lançamento corretivo foi criado
   ├─ Se sim: Re-computar (deve balancear)
   └─ Se não: Criar lançamento de ajuste manual
```

### Cenário 2: Anomalia de Duplicação

**Situação**: Relatorio detecta 2 lançamentos idênticos

**Passos**:

```
1. COLETAR INFORMAÇÕES
   ├─ LCT-001: R$ 3.000 | Folha | 2024-09-10 | 6.2.01 → 3.1.02
   └─ LCT-142: R$ 3.000 | Folha | 2024-09-10 | 6.2.01 → 3.1.02
   └─ Ambas: João Silva | Falha detecta como duplicação

2. REVISAR CONTEXTO
   ├─ Período de processamento: Setembro 2024
   ├─ Responsável: USER-001 (João)
   ├─ Hash: Ambas têm hash diferente (timestamps diferentes)
   ├─ Status: LCT-001=finalizado, LCT-142=finalizado
   └─ Questão: É duplicação ou pagamento duplo intencional?

3. CONSULTAR RESPONSÁVEL
   "João, encontramos 2 lançamentos idênticos de folha em Set.
    Por quê? Se foi erro, vamos criar reversão."

4. DECISÃO E AÇÃO
   
   SE duplicação (erro):
   └─ Criar lançamento reversão:
      ├─ Débito: 3.1.02 (Reverter crédito)
      ├─ Crédito: 6.2.01 (Reverter débito)
      ├─ Valor: R$ 3.000
      └─ Descrição: "Reversão de folha duplicada LCT-142"
      
   SE intencional (ex: adiantamento duplo):
   └─ Documentar em relatório de retificação:
      ├─ Motivo: "Adiantamento duplo autorizado por GERENTE"
      ├─ Justificativa: "Funcionário solicitou antecipação"
      ├─ Aprovação: Anexar e-mail de autorização
      └─ Fazer notação em LCT-001 e LCT-142
```

---

## PARTE 4: PADRÕES E TEMPLATES

### Template - Relatório Mensal Consolidado

```markdown
# RELATÓRIO CONSOLIDADO - SETEMBRO 2024

## Executivo (1 página)

**Destaques Positivos:**
- Receita: R$ 500.000 (+12% vs Agosto)
- Lucro Líquido: R$ 73.000 (14.6% margem)
- Fluxo Caixa: +R$ 43.000
- ROI: 12.2%

**Destaques Críticos:**
- ✗ Endividamento 62% (limite: 50%)
- ✗ Liquidez 0.9 (limite: 1.0)
- ⚠ Anomalias: 3 críticas, 5 avisos

**Ações Recomendadas:**
1. Reduzir despesas em R$ 20.000/mês
2. Renegociar prazos com fornecedores
3. Investigar 3 anomalias críticas até 2024-10-15

---

## Consolidação por Módulo

[Tabela com modulos, totais, hash de verificacao]

---

## Indicadores de Desempenho (Painel)

[Gráficos de 30 dias de receita/despesa, KPIs]

---

## Conformidade Contábil

[Validação de partidas dobradas, violações]

---

## Integridade de Dados

[Hash SHA-256, snapshot do período]

---

## Anomalias Detectadas

[Lista de 8 anomalias com score e ações]

---

## Retificações Registradas

[5 retificações com justificativas]

---

## Acesso de Usuários

[Timeline de operações críticas, usuários suspeitos]

---

## Próximos Passos

1. Revisar anomalias críticas (até 2024-10-05)
2. Processar retificações pendentes (até 2024-10-08)
3. Reunião de alinhamento com fiscal (2024-10-02)
4. Gerar relatório de conformidade (2024-10-10)
```

---

## PARTE 5: CHECKLIST DE VALIDAÇÃO

```
☐ Consolidação
  ☐ Total geral = soma dos módulos
  ☐ Cada módulo tem > 0 lançamentos
  ☐ Hash de cada módulo é único
  ☐ Validações = balanceamento true

☐ Financeiro
  ☐ Ativo = Passivo + Patrimônio
  ☐ DRE estruturada (Receita > Custos > Despesas)
  ☐ Margem > 0% ou documentada perda

☐ Painel de Gestão
  ☐ KPIs dentro de intervalos reais
  ☐ Alertas coerentes com KPIs
  ☐ Tendência de 30 dias completa

☐ Fluxo de Caixa
  ☐ Saldo Final = Inicial + Variação
  ☐ Fluxo Operacional > 0 (negócio sustentável)
  ☐ Saldo Final > Saldo Mínimo Segurança

☐ Sensibilidade IPCA
  ☐ IPCA positivo → Custo Anual aumenta
  ☐ Todas rubricas reajustadas
  ☐ Impacto total documentado

☐ Projeção 12M
  ☐ 12 meses de dados
  ☐ Crescimento consistente (2%/mês)
  ☐ Margem segurança apropriada ao cenário

☐ Rastreabilidade
  ☐ Sequência contínua
  ☐ Cada lançamento tem hash
  ☐ Módulo origem confirmado

☐ Conformidade
  ☐ Débito ≈ Crédito (< 0.01)
  ☐ Contas válidas (classe 1-6)
  ☐ Valores positivos
  ☐ Datas consistentes

☐ Hash Snapshot
  ☐ Hash período é SHA-256 válido
  ☐ Verificação de integridade = true
  ☐ Dados não alterados desde snapshot

☐ Anomalias
  ☐ Score risco está entre 0-100
  ☐ Críticas investigadas
  ☐ Duplicações identificadas

☐ Retificações
  ☐ Total de retificações < 5% dos lançamentos
  ☐ >80% dentro de 24h
  ☐ Cada retificação tem justificativa

☐ Acesso
  ☐ Operações críticas rastreadas
  ☐ Usuários suspeitos identificados
  ☐ Taxa de falha < 30% por usuário
```

---

## Conclusão

Este padrão de relatórios consolidados e de auditoria fornece:

✓ **Transparência**: Visibilidade completa de operações
✓ **Conformidade**: Aderência a normas contábeis (Lei 6404/76, IBRACON)
✓ **Rastreabilidade**: Audit trail completo com criptografia SHA-256
✓ **Detecção**: Anomalias e risco identificados automaticamente
✓ **Documentação**: Evidência completa para auditoria externa

**Próxima Iteração (SPRINT 4)**:
- Integração com relatórios de compliance externa (ECD, FCONT)
- Dashboard interativo com alertas em tempo real
- Integração com sistema de aprovação de retificações
- Relatórios de conformidade LGPD e segurança de dados
