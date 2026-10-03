# Sistema de Integração ASAAS

Módulos para integração com o gateway de pagamentos ASAAS, suportando reembolsos e cobrança de boletos.

## Módulos

### 1. asaasReembolsos.ts
Processa devoluções e restituições de pagamentos.

**Funcionalidades:**
- Criar reembolsos
- Atualizar status de reembolsos
- Processar webhooks do Asaas
- Sincronizar reembolsos com Asaas
- Listagem e auditoria

**Status válidos:**
- `pendente`: Aguardando processamento
- `processando`: Sendo processado pela API Asaas
- `confirmado`: Reembolso confirmado
- `rejeitado`: Reembolso rejeitado pelo Asaas
- `cancelado`: Reembolso cancelado

### 2. asaasCobranca.ts
Emite boletos e cobrança para aluguéis e serviços.

**Funcionalidades:**
- Emitir cobrança/boleto
- Gerar QR Code Pix
- Registrar pagamentos recebidos
- Processar webhooks do Asaas
- Listar cobrancas abertas
- Rastreamento de vencimentos
- Auditoria completa

**Status válidos:**
- `pendente`: Aguardando emissão de boleto
- `processando`: Gerando boleto no Asaas
- `aberta`: Boleto emitido e pronto para pagamento
- `paga`: Pagamento recebido
- `vencida`: Boleto venceu
- `cancelada`: Boleto cancelado

## Instalação

### 1. Variáveis de Ambiente
```bash
# Em .env ou .env.local
ASAAS_API_KEY=sua_chave_api_asaas
ASAAS_SANDBOX=true  # true para sandbox, false para produção
```

### 2. Criar Tabelas do Banco de Dados
Execute o SQL em `schema-asaas.sql`:

```sql
-- Reembolsos
CREATE TABLE asaas_reembolsos (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
  status TEXT NOT NULL,
  data_solicitacao TEXT NOT NULL,
  data_confirmacao TEXT,
  motivo TEXT NOT NULL,
  numero_transacao_original TEXT NOT NULL,
  asaas_reembolso_id TEXT UNIQUE,
  descricao_erro TEXT
);

CREATE TABLE asaas_reembolsos_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reembolso_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  data_acao TEXT NOT NULL,
  descricao TEXT
);

-- Cobrancas
CREATE TABLE asaas_cobrancas (
  id TEXT PRIMARY KEY,
  aluguel_id TEXT NOT NULL,
  imovel_id TEXT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
  data_vencimento TEXT NOT NULL,
  status TEXT NOT NULL,
  numero_boleto TEXT,
  linha_digitavel TEXT,
  qr_code_pix TEXT,
  asaas_cobranca_id TEXT UNIQUE,
  data_criacao TEXT NOT NULL,
  data_pagamento TEXT,
  valor_pago DECIMAL(12, 2),
  tipo_pagamento TEXT,
  referencia_externa TEXT
);

CREATE TABLE asaas_cobrancas_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cobranca_id TEXT NOT NULL,
  aluguel_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  data_acao TEXT NOT NULL,
  descricao TEXT
);
```

## Uso

### Reembolsos

#### Criar um reembolso
```typescript
import Database from "better-sqlite3";
import { criarReembolso } from "./asaasReembolsos";

const db = new Database("./banco.db");

const reembolso = criarReembolso(db, {
  usuario_id: "user-123",
  valor: 500.00,
  motivo: "Pagamento duplicado",
  numero_transacao_original: "txn-456"
});

console.log(reembolso.id); // ID do reembolso criado
console.log(reembolso.status); // "pendente"
```

#### Listar reembolsos
```typescript
import { listarReembolsos } from "./asaasReembolsos";

// Todos os reembolsos
const todos = listarReembolsos(db);

// Reembolsos de um usuário
const porUsuario = listarReembolsos(db, {
  usuario_id: "user-123"
});

// Reembolsos confirmados
const confirmados = listarReembolsos(db, {
  status: "confirmado"
});

// Reembolsos em período
const porPeriodo = listarReembolsos(db, {
  data_inicio: "2026-10-01",
  data_fim: "2026-10-31"
});
```

#### Enviar para processamento no Asaas
```typescript
import { enviarReembolsoParaAsaas } from "./asaasReembolsos";

const asaasId = await enviarReembolsoParaAsaas(db, fetch, reembolso.id);
console.log("ID no Asaas:", asaasId);
```

#### Processar webhook do Asaas
```typescript
import { processarWebhookReembolso } from "./asaasReembolsos";

// Quando Asaas enviar webhook para seu servidor
app.post("/webhook/asaas", (req, res) => {
  const webhook = req.body; // { type: "TRANSFER_RECEIVED", data: {...} }
  processarWebhookReembolso(db, webhook);
  res.json({ success: true });
});
```

### Cobrança/Boletos

#### Emitir cobrança
```typescript
import { emitirCobranca } from "./asaasCobranca";

const cobranca = emitirCobranca(db, {
  aluguel_id: "aluguel-123",
  imovel_id: "imovel-456",
  valor: 1500.00,
  data_vencimento: "2026-11-30"
});

console.log(cobranca.id); // ID da cobrança
console.log(cobranca.status); // "pendente"
```

#### Gerar boleto
```typescript
import { gerarBoleto } from "./asaasCobranca";

const boleto = await gerarBoleto(db, fetch, cobranca.id);
console.log("Número:", boleto.numero_boleto);
console.log("Linha digitável:", boleto.linha_digitavel);
console.log("QR Code Pix:", boleto.qr_code_pix);
```

#### Listar cobrancas
```typescript
import { listarCobrancas } from "./asaasCobranca";

// Todas as cobrancas de um imóvel
const cobrancas = listarCobrancas(db, "imovel-456");

// Filtrar por status
const abertas = listarCobrancas(db, "imovel-456", {
  status: "aberta"
});

// Filtrar por aluguel
const doAluguel = listarCobrancas(db, undefined, {
  aluguel_id: "aluguel-123"
});
```

#### Registrar pagamento
```typescript
import { registrarPagamento } from "./asaasCobranca";

const cobrancaPaga = registrarPagamento(
  db,
  cobranca.id,
  1500.00,
  "boleto", // ou "pix", "transferencia", "cartao", "dinheiro"
  "2026-11-20"
);

console.log(cobrancaPaga.status); // "paga"
console.log(cobrancaPaga.tipo_pagamento); // "boleto"
```

#### Cancelar cobrança
```typescript
import { cancelarCobranca } from "./asaasCobranca";

const cobrancaCancelada = cancelarCobranca(db, cobranca.id);
console.log(cobrancaCancelada.status); // "cancelada"
```

#### Processar webhook do Asaas
```typescript
import { processarWebhookCobranca } from "./asaasCobranca";

app.post("/webhook/asaas", (req, res) => {
  const webhook = req.body; // { type: "PAYMENT_RECEIVED", data: {...} }
  processarWebhookCobranca(db, webhook);
  res.json({ success: true });
});
```

#### Listar cobrancas vencidas
```typescript
import { listarCobrancasVencidas, atualizarCobrancasVencidas } from "./asaasCobranca";

// Background job que roda diariamente
const vencidas = listarCobrancasVencidas(db);
console.log(`Encontradas ${vencidas.length} cobrancas vencidas`);

const atualizado = atualizarCobrancasVencidas(db);
console.log(`${atualizado} cobrancas marcadas como vencidas`);
```

## Validações

### Reembolsos
- Valor deve ser positivo e menor que R$ 1.000.000,00
- usuario_id é obrigatório
- motivo é obrigatório e máximo 500 caracteres
- numero_transacao_original é obrigatório

### Cobrança
- Valor deve ser positivo e menor que R$ 100.000,00
- aluguel_id é obrigatório
- imovel_id é obrigatório
- data_vencimento deve ser futura (formato YYYY-MM-DD)
- Máximo um boleto aberto por aluguel

## Auditoria

Todas as operações são registradas em tabelas de histórico:
- `asaas_reembolsos_historico`: Rastreia mudanças de reembolsos
- `asaas_cobrancas_historico`: Rastreia mudanças de cobrancas

### Consultar histórico
```typescript
// Histórico de um reembolso
const stmtAudit = db.prepare(`
  SELECT * FROM asaas_reembolsos_historico 
  WHERE reembolso_id = ?
  ORDER BY data_acao DESC
`);
const historico = stmtAudit.all(reembolso.id);

// Histórico de uma cobrança
const stmtAudit2 = db.prepare(`
  SELECT * FROM asaas_cobrancas_historico 
  WHERE cobranca_id = ?
  ORDER BY data_acao DESC
`);
const historico2 = stmtAudit2.all(cobranca.id);
```

## Tratamento de Erros

```typescript
import {
  ErroValidacaoReembolso,
  ErroValidacaoCobranca,
  AsaasApiError,
  AsaasConfiguracaoAusenteError
} from "./asaasReembolsos";

try {
  const reembolso = criarReembolso(db, dados);
} catch (err) {
  if (err instanceof ErroValidacaoReembolso) {
    console.error("Dados inválidos:", err.erros);
  } else if (err instanceof AsaasConfiguracaoAusenteError) {
    console.error("Configuração faltando:", err.message);
  } else {
    console.error("Erro desconhecido:", err);
  }
}
```

## Background Jobs

Recomenda-se executar periodicamente:

```typescript
// A cada 2 horas: sincronizar reembolsos pendentes
import { sincronizarReembolsosPendentes } from "./asaasReembolsos";

setInterval(async () => {
  const resultado = await sincronizarReembolsosPendentes(db, fetch);
  console.log(`Reembolsos: ${resultado.sucesso} sucesso, ${resultado.erro} erro`);
}, 2 * 60 * 60 * 1000);

// A cada dia: atualizar cobrancas vencidas
import { atualizarCobrancasVencidas } from "./asaasCobranca";

setInterval(() => {
  const count = atualizarCobrancasVencidas(db);
  console.log(`${count} cobrancas marcadas como vencidas`);
}, 24 * 60 * 60 * 1000);
```

## Webhook do Asaas

Configure no dashboard do Asaas:
- URL: `https://seu-dominio.com/webhook/asaas`
- Eventos: `TRANSFER_RECEIVED`, `REFUND_PROCESSED`, `PAYMENT_RECEIVED`, `INVOICE_PAID`

Tratamento:
```typescript
import { processarWebhookReembolso } from "./asaasReembolsos";
import { processarWebhookCobranca } from "./asaasCobranca";

app.post("/webhook/asaas", (req, res) => {
  const webhook = req.body;

  if (webhook.type.includes("REFUND") || webhook.type === "TRANSFER_RECEIVED") {
    processarWebhookReembolso(db, webhook);
  }

  if (webhook.type.includes("PAYMENT") || webhook.type === "INVOICE_PAID") {
    processarWebhookCobranca(db, webhook);
  }

  res.json({ success: true });
});
```

## Testes

Execute os testes com:
```bash
npm test -- asaasReembolsos.test.ts
npm test -- asaasCobranca.test.ts
```

## Documentação Asaas

- API Docs: https://asaasx.docs.apiary.io
- Dashboard: https://sandbox.asaas.com (sandbox) ou https://api.asaas.com (produção)
- Webhook Events: https://asaasx.docs.apiary.io/#reference/webhooks
