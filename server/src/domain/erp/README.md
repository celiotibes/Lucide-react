# ERP Module - SPRINT 1 & SPRINT 2

Módulos de integração e processamento contábil.

## Arquitetura

```
domain/erp/
├── api-gateway-streamlit.ts     # 1A.1 - Integração Streamlit
├── payroll-base.ts              # 2A.3 - Processamento de Folha
├── webhook-ledger.ts            # 3A.1 - Lançamento Imediato
├── despesas-operacionais.ts     # 4A.1 - Automação de Despesas
├── document-approvals.ts        # 5A.2 - Fluxo de Aprovações
├── apontamento-prestador.ts     # 6A.1 - Apontamento do Prestador (SPRINT 2)
└── index.ts                     # Barrel export
```

## 1. API Gateway Streamlit (1A.1)

Transforma payloads do app-bruxel em lançamentos contábeis.

### Uso Básico

```typescript
import { 
  processarPayloadStreamlit,
  type StreamlitPayload 
} from './erp/api-gateway-streamlit';

const payload: StreamlitPayload = {
  origem_modulo: 'app-bruxel',
  tipo_documento: 'diaria',
  data_evento: '2024-09-14',
  valor: 1500,
  descricao: 'Diária de cliente',
  usuario_id: 'USER-001'
};

const resposta = processarPayloadStreamlit(payload);
console.log(resposta);
// { 
//   sucesso: true,
//   lancamento_id: 'LCT-xxx',
//   mensagem: 'Lançamento sincronizado com ERP'
// }
```

### Roteamento de Tipos

| Tipo | Débito | Crédito |
|------|--------|---------|
| diaria | 2.1.01 | 1.0.01 |
| despesa | 3.1.01 | 1.0.01 |
| folha_pagamento | 6.2.01 | 3.1.02 |
| receita | 1.0.01 | 4.1.01 |

### Funções Principais

```typescript
validarPayloadStreamlit(payload)      // → { valido, erros }
transformarDiariaEmLancamento(payload) // → LancamentoGerado
sincronizarComERP(lancamento)         // → APIGatewayResponse
processarPayloadStreamlit(payload)    // → APIGatewayResponse (pipeline)
```

---

## 2. Payroll Base (2A.3)

Processamento de folha com cálculos de INSS e IRRF.

### Uso Básico

```typescript
import { 
  registrarContrato,
  processarFolha,
  calcularINSS,
  type ContratoFolha 
} from './erp/payroll-base';

// Registrar contrato
const contrato = registrarContrato({
  funcionario_id: 'FUNC-001',
  funcionario_nome: 'João Silva',
  cargo: 'Gerente',
  salario_base: 3000,
  data_admissao: '2023-01-15',
  tipo_contrato: 'CLT',
  ativo: true
});

// Processar folha
const folha = processarFolha(contrato, '2024-09');
console.log(folha);
// {
//   salario_bruto: 3000,
//   desconto_inss: 225,
//   desconto_irrf: 187.50,
//   salario_liquido: 2587.50,
//   status: 'finalizado'
// }
```

### Cálculos de Imposto

```typescript
// INSS - Alíquota Progressiva
calcularINSS(3000) // → 225 (7.5%)
calcularINSS(5000) // → 559

// IRRF - Faixas Tributárias
calcularIRRF(3000, 225) // → Valor proporcional
calcularIRRF(5000, 300) // → Valor proporcional
```

### Lançamentos Contábeis Automáticos

```typescript
const lancamentos = gerarLancamentosFolha(folha);
// Gera 3 lançamentos:
// 1. Salário: 6.2.01 → 3.1.02 (3000)
// 2. INSS: 6.2.02 → 3.1.03 (225)
// 3. IRRF: 6.2.03 → 3.1.04 (187.50)
```

### Funções Principais

```typescript
registrarContrato(dados)            // → ContratoFolha
processarFolha(contrato, mes)       // → ProcessamentoFolha
calcularINSS(salario_bruto)         // → number
calcularIRRF(salario_bruto, inss)   // → number
extrairDescontos(folha)             // → DescontoFolha[]
gerarLancamentosFolha(folha)        // → Lançamentos[]
validarContrato(contrato)           // → { valido, erros }
```

---

## 3. Webhook para Ledger (3A.1)

Dispara lançamentos em tempo real quando eventos ocorrem.

### Uso Básico

```typescript
import { 
  criarEventoWebhook,
  processarWebhook,
  registrarWebhook,
  type WebhookEvent 
} from './erp/webhook-ledger';

// Criar evento
const evento = criarEventoWebhook({
  origem_modulo: 'app-bruxel',
  tipo_evento: 'diaria_criada',
  entidade_id: 'DIARIA-001',
  dados_lancamento: {
    data: '2024-09-14',
    valor: 1500,
    descricao: 'Diária',
    conta_debito: '2.1.01',
    conta_credito: '1.0.01'
  }
});

// Processar webhook
let registro = registrarWebhook(evento);
registro = processarWebhook(evento, registro);

console.log(registro.status); // 'finalizado'
```

### Módulos Suportados

```
skillos-integracao  → POST /webhooks/skillos
app-bruxel          → POST /webhooks/app-bruxel
imovel-gestao       → POST /webhooks/imovel-gestao
```

### Retry Logic

- Máximo: 3 tentativas
- Intervalo: 5 minutos
- Estados: recebido → processando → finalizado/erro

### Funções Principais

```typescript
criarEventoWebhook(dados)        // → WebhookEvent
validarEventoWebhook(evento)     // → { valido, erros }
registrarWebhook(evento)         // → RegistroWebhook
processarWebhook(evento, registro) // → RegistroWebhook (atualizado)
obterRotasWebhook(origem_modulo) // → string[]
reconectarWebhook(registro, evento) // → RegistroWebhook (retry)
```

---

## 4. Despesas Operacionais (4A.1)

Automação e agendamento de despesas recorrentes.

### Uso Básico

```typescript
import { 
  criarDespesaOperacional,
  processarDespesasAgendadas,
  executarCicloDespesas,
  type DespesaOperacional 
} from './erp/despesas-operacionais';

// Criar despesa recorrente
const despesa = criarDespesaOperacional({
  imovel_id: 'IMOV-001',
  descricao: 'Condomínio - Bloco A',
  valor: 500,
  tipo: 'CONDOMINIO',
  categoria_contabil: '3.1.10',
  recorrencia: 'mensal',
  dia_vencimento: 15,
  ativa: true
});

// Processar para um mês
const processados = processarDespesasAgendadas([despesa], '2024-09');

// Executar ciclo completo (gera lançamentos)
const { processados, lancamentos } = executarCicloDespesas([despesa], '2024-09');

console.log(lancamentos);
// [
//   {
//     descricao: 'Condomínio - Bloco A - 2024-09',
//     conta_debito: '3.1.10',
//     conta_credito: '1.0.01',
//     valor: 500
//   }
// ]
```

### Tipos de Despesa

```
CONDOMINIO    → Condomínio
AGUA          → Água
LUZ           → Eletricidade
GAS           → Gás
INTERNET      → Internet
MANUTENCAO    → Manutenção
OUTRA         → Outras
```

### Recorrências

```
mensal        → Dia X de cada mês
trimestral    → A cada 3 meses
semestral     → A cada 6 meses
anual         → Uma vez ao ano
```

### Funções Principais

```typescript
criarDespesaOperacional(dados)         // → DespesaOperacional
agendarDespesaOperacional(despesa, mes) // → ProcessamentoDespesa
processarDespesasAgendadas(despesas, mes) // → ProcessamentoDespesa[]
calcularProximoVencimento(despesa)     // → Date
marcarComoPago(processamento, data, comprovante) // → ProcessamentoDespesa
executarCicloDespesas(despesas, mes)   // → { processados, lancamentos }
gerarRelatorioDespesas(despesas, processados) // → Relatório
```

---

## 5. Document Approvals (5A.2)

Workflow de aprovação com 2 níveis (Gerente e Contabilista).

### Uso Básico

```typescript
import { 
  criarDocumentoAprovacao,
  aprovarDocumento,
  rejeitarDocumento,
  type DocumentoAprovacao 
} from './erp/document-approvals';

// Criar documento
const doc = criarDocumentoAprovacao({
  tipo_documento: 'folha',
  entidade_id: 'FLH-2024-09',
  descricao: 'Folha de Setembro 2024',
  valor: 3000,
  criado_por: 'USER-001'
});

console.log(doc.status);       // 'pendente'
console.log(doc.nivel_atual);  // 'gerente'

// Aprovação Nível 1: Gerente
let doc2 = aprovarDocumento(doc, 'USER-002', 'Maria Silva', 'gerente');
console.log(doc2.status);       // 'aprovado_gerente'
console.log(doc2.nivel_atual);  // 'contabilista'

// Aprovação Nível 2: Contabilista
let doc3 = aprovarDocumento(doc2, 'USER-003', 'Carlos Neves', 'contabilista');
console.log(doc3.status);       // 'finalizado'
console.log(doc3.nivel_atual);  // null
```

### Estados e Transições

```
pendente
  ├─ aprovarDocumento(gerente)
  │   └─ aprovado_gerente
  │       ├─ aprovarDocumento(contabilista)
  │       │   └─ finalizado ✓
  │       │
  │       └─ rejeitarDocumento()
  │           └─ rejeitado
  │
  └─ rejeitarDocumento()
      └─ rejeitado
```

### Fluxos por Tipo

| Tipo | Fluxo |
|------|-------|
| folha | Gerente → Contabilista → Finalizado |
| despesa | Gerente → Contabilista → Finalizado |
| lancamento | Contabilista → Finalizado |
| relatorio | Proprietário → Finalizado |

### Funções Principais

```typescript
criarDocumentoAprovacao(payload)       // → DocumentoAprovacao
aprovarDocumento(doc, user, nome, nivel) // → DocumentoAprovacao
rejeitarDocumento(doc, user, nome, motivo, nivel) // → DocumentoAprovacao
adicionarComentario(doc, user, nome, texto, nivel) // → DocumentoAprovacao
finalizarDocumento(doc)                // → DocumentoAprovacao
obterHistoricoFormatado(doc)           // → string
podeAprovar(doc, nivel)                // → boolean
gerarRelatorioPendentes(docs, nivel)   // → Relatório
validarFluxoAprovacao(tipo)            // → { valido, fluxo }
```

---

## Integração

### Pipeline Completo: Streamlit → Ledger → Aprovação

```typescript
// 1. Receber payload
const payload = { ... };
const resposta1 = processarPayloadStreamlit(payload);

// 2. Criar webhook para lançamento
const evento = criarEventoWebhook({ ... });
let registro = registrarWebhook(evento);
registro = processarWebhook(evento, registro);

// 3. Criar aprovação se necessário
const doc = criarDocumentoAprovacao({ ... });
const aprovado = aprovarDocumento(doc, 'USER-002', 'Maria', 'gerente');

// 4. Finalizar
const finalizado = aprovarDocumento(aprovado, 'USER-003', 'Carlos', 'contabilista');
```

### Integração com Ledger (TODO)

Todos os módulos têm pontos de integração com `ledger.ts`:

```typescript
// Em cada módulo, procurar por TODO:
// TODO: ledger.registrarLancamento(lancamento)

// Exemplo:
import { ledger } from '../ledger';

function sincronizarComERP(lancamento) {
  try {
    const resultado = ledger.registrarLancamento(lancamento);
    return { sucesso: true, lancamento_id: resultado.id };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}
```

---

## Testes

### Executar Todos os Testes

```bash
npm test -- src/domain/__tests__/sprint1.test.ts
```

### Testes por Módulo

```bash
npm test -- -t "API Gateway Streamlit"
npm test -- -t "Payroll Base"
npm test -- -t "Webhook para Ledger"
npm test -- -t "Despesas Operacionais"
npm test -- -t "Document Approvals"
```

### Cobertura

```bash
npm test -- --coverage src/domain/__tests__/sprint1.test.ts
```

---

## Banco de Dados

### Tabelas SQL

11 tabelas definidas em `__tests__/test-setup.ts`:

```
payroll_contratos
payroll_processamento
payroll_descontos
despesas_operacionais
processamento_despesas
agendador_despesas
document_approvals
approval_history
webhook_events
webhook_registros
api_gateway_logs
```

### Migração (quando integrar com BD real)

```bash
# 1. Rodar migrations
npm run migrate:up

# 2. Seed dados de teste
npm run seed:dev
```

---

## Estrutura de Dados

### Contas Contábeis

```
1.0.01 - Caixa/Banco
2.1.01 - Imóvel
3.1.02 - Salários a Pagar
3.1.03 - INSS a Recolher
3.1.04 - IRRF a Recolher
3.1.10 - Despesa Operacional
4.1.01 - Receita Aluguel
6.2.01 - Encargo Pessoal - Salários
6.2.02 - Encargo Pessoal - INSS
6.2.03 - Encargo Pessoal - IRRF
```

### Centros de Custo

```
CC-GERAL     - Centro geral padrão
CC-{IMOVEL}  - Por imóvel (CC-IMOV-001, etc)
```

---

## 6. Apontamento do Prestador (6A.1 - SPRINT 2)

Gestão de apontamentos diários, remuneração variável, empréstimos e retificações de prestadores.

### Uso Básico

```typescript
import { 
  Apontamento,
  StatusApontamento,
  validarApontamento,
  calcularValorRemuneravel,
  gerarLancamentosRemuneracao,
  type ItemRemuneravel
} from './erp/apontamento-prestador';

// Criar apontamento diário
const apontamento: Partial<Apontamento> = {
  prestador_id: 'PREST-001',
  data: '2024-09-14',
  entrada: '08:00',
  saida_intervalo: '12:00',
  retorno_intervalo: '13:00',
  saida_final: '17:00',
  status: StatusApontamento.RASCUNHO
};

// Validar
const validacao = validarApontamento(apontamento);
if (validacao.valido) {
  console.log('Apontamento válido');
}

// Adicionar item remunerável
const itemDiaria: Partial<ItemRemuneravel> = {
  tipo: 'diaria',
  rubrica: 'Diária Completa',
  valor_base: 150,
  adicional_percentual: 0
};

// Calcular valor final
const valor_final = calcularValorRemuneravel(150, 0); // 150
```

### Estrutura de Dados

**Apontamento Diário**
- ID, Prestador ID, Data
- Horários: Entrada, Saída Intervalo, Retorno, Saída Final
- Status: Rascunho → Enviado → Aprovado → Retificado
- Rastreamento de criação/atualização

**Itens Remuneráveis**
```
Tipo: diaria | airbnb | urgencia | deslocamento | materiais | extra
Valor Base + Adicional Percentual = Valor Final
```

**Constantes de Cálculo**

```typescript
// Tabelas Airbnb por trimestre
TABELA_AIRBNB_1Q: { dentro: 31.50, fora_uteis: 42.00, sabado_domingo_feriado: 63.00 }
TABELA_AIRBNB_2Q: { dentro: 37.80, fora_uteis: 50.40, sabado_domingo_feriado: 75.60 } // +20%

// Urgência
URGENCIA_MINIMA_UTEIS: 50.00
URGENCIA_MINIMA_DOMINGO_FERIADO: 62.50

// Deslocamento
DESLOCAMENTO_CARVOEIRA_CORREGO: 21.00
DESLOCAMENTO_BUSCA_MATERIAIS: 30.00

// Combustível
COMBUSTIVEL: { valor_litro: 6.50, km_por_litro: 10 }
```

### Validações

```typescript
// Validar sequência de eventos (entrada < intervalo < retorno < saída)
validarSequenciaEventos([
  { tipo_evento: TipoEvento.CHEGADA, horario: '08:00' },
  { tipo_evento: TipoEvento.SAIDA_INTERVALO, horario: '12:00' },
  { tipo_evento: TipoEvento.RETORNO, horario: '13:00' },
  { tipo_evento: TipoEvento.SAIDA, horario: '17:00' }
]); // → { valido: true, erros: [] }

// Validar item remunerável
validarItemRemuneravel(item); // → { valido, erros }

// Validar movimentação financeira
validarMovimentacaoFinanceira(movimentacao); // → { valido, erros }

// Validar empréstimo
validarEmprestimo(emprestimo); // → { valido, erros }
```

### Cálculos Financeiros

```typescript
// Remuneração com adicional
calcularValorRemuneravel(150, 10); // 150 + (150 * 10/100) = 165

// Combustível
calcularReembolsoCombustivel(100); // (100 / 10) * 6.50 = 65.00

// Empréstimo com juros compostos
calcularValorEmprestimoComJuros(1000, 2.5, 12); // 1000 * (1.025)^12 ≈ 1344.89
```

### Lançamentos Contábeis

```typescript
// Gerar lançamentos de remuneração
const lancamentos = gerarLancamentosRemuneracao(apontamento, itens, fechamento);
// Gera:
// - Débito 5.1.01 (Despesa Remuneração) / Crédito 3.1.05 (A Pagar)
// - Se descontos: Débito 3.1.05 / Crédito 1.1.01 (Caixa)

// Gerar lançamentos de empréstimo
const lancamentosEmprestimo = gerarLancamentosEmprestimo(emprestimo);
// Gera:
// - Débito 2.1.02 (Passivo) / Crédito 1.1.01 (Caixa)
// - Débito 5.3.01 (Juros) / Crédito 2.1.02 (Passivo)
```

### Contas Contábeis Utilizadas

| Conta | Descrição | Natureza |
|-------|-----------|----------|
| 5.1.01 | Despesa com Remuneração de Prestadores | Débito |
| 3.1.05 | Remuneração de Prestador a Pagar | Crédito |
| 2.1.02 | Empréstimos a Pagar | Crédito |
| 5.3.01 | Despesa com Juros | Débito |
| 1.1.01 | Caixa | Débito |

### Integração com Ledger

Todos os lançamentos são criados automaticamente:
- `origem_modulo`: `"apontamento-prestador"`
- `origem_id`: ID da entidade (apontamento_id, emprestimo_id, etc.)

### Funções Principais

```typescript
// Apontamento
validarApontamento(apontamento)              // → { valido, erros }
validarSequenciaEventos(eventos)            // → { valido, erros }

// Remuneração
validarItemRemuneravel(item)                 // → { valido, erros }
calcularValorRemuneravel(base, percentual)  // → number

// Movimentação Financeira
validarMovimentacaoFinanceira(movimentacao) // → { valido, erros }

// Empréstimo
validarEmprestimo(emprestimo)               // → { valido, erros }
calcularValorEmprestimoComJuros(v, i, n)   // → number

// Combustível
calcularReembolsoCombustivel(km)            // → number
obterTabelaAirbnb(trimestre)                // → Record<string, number>

// Lançamentos
gerarLancamentosRemuneracao(apt, itens, fech) // → Lançamentos[]
gerarLancamentosEmprestimo(emprestimo)        // → Lançamentos[]
```

### Fluxos de Aprovação

```
Apontamento:
  rascunho → enviado → aprovado
           → retificado (via manual do gestor)

Movimentação Financeira:
  pendente → aprovado → descontado
          → rejeitado

Fechamento Semanal:
  aberto → fechado → aprovado → pago
```

---

## Contribuindo

1. Adicione testes para novas funções
2. Mantenha 100% de cobertura
3. Valide roteamento de contas contábeis
4. Documente fluxos complexos

---

## Licença

Part of Lucide React ERP - SPRINT 1

---

**Última atualização**: 2025-09-14
**Versão**: 2.0.0 (SPRINT 2 - Apontamento do Prestador)
