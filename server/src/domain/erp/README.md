# ERP Module - SPRINT 1

Módulos de integração e processamento contábil da SPRINT 1.

## Arquitetura

```
domain/erp/
├── api-gateway-streamlit.ts    # 1A.1 - Integração Streamlit
├── payroll-base.ts             # 2A.3 - Processamento de Folha
├── webhook-ledger.ts           # 3A.1 - Lançamento Imediato
├── despesas-operacionais.ts    # 4A.1 - Automação de Despesas
├── document-approvals.ts       # 5A.2 - Fluxo de Aprovações
└── index.ts                    # Barrel export
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

## Contribuindo

1. Adicione testes para novas funções
2. Mantenha 100% de cobertura
3. Valide roteamento de contas contábeis
4. Documente fluxos complexos

---

## Licença

Part of Lucide React ERP - SPRINT 1

---

**Última atualização**: 2024-09-14
**Versão**: 1.0.0
