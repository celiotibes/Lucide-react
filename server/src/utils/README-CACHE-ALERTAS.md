# Cache, Alertas & Health Check (Phase 9)

Sistema de monitoramento e otimização de performance para contabilidade.

## Componentes

### 1. Cache em Memória (`cache-memoria.ts`)

**Objetivo**: Reduzir carga no banco de dados ao cachear cálculos custosos.

**TTLs Padrão**:
- DRE (Demonstração de Resultado): **1 hora** (dados históricos, menos volatilidade)
- Fluxo de Caixa: **2 horas** (projeção 30 dias)
- Margens por Produto: **2 horas** (análise por centro de custo)

**Performance**: Responde em **< 10ms** após primeira execução (armazenado em RAM).

#### Uso Básico

```typescript
import { cache } from "../utils/cache-memoria";

// Set com TTL customizado
cache.set("dre:2026:10", { receita: 100000, despesa: 70000 }, { ttl: 3600000 });

// Get
const dre = cache.get("dre:2026:10");
if (!dre) {
  // Recalcula do banco
  const dre = await calcularDre(2026, 10);
  cache.set("dre:2026:10", dre, { ttl: 3600000 });
}

// Invalida quando dados mudam (novo lançamento → marca fluxo como stale)
cache.invalidate("fluxo:proximo-30d");

// Invalida todas as chaves que começam com prefixo
cache.invalidarPrefixo("fluxo:");

// Stats para monitoramento
const { total, chaves } = cache.stats();
console.log(`Cache tem ${total} entradas`);
```

#### Type-Safe

```typescript
interface DRE {
  receita: number;
  despesa: number;
  lucro: number;
}

// Tipagem automática
const dre = cache.get<DRE>("dre:2026:10");
if (dre?.receita) {
  // TypeScript sabe que receita existe
}

// Factory para type-safety
const cacheDre = criarCacheRelatorio("dre");
cacheDre.set(2026, 10, { receita: 100000, ... });
const resultado = cacheDre.get(2026, 10); // ✅ type-checked
```

---

### 2. Email Alertas (`email-alertas.ts`)

**Objetivo**: Notificar quando jobs críticos falham (DRE, Reconciliação PIX, Pagamentos PIX).

**Provedores Suportados**:
1. **Resend** (recomendado) - Free: 100 emails/dia, $20/mês ilimitado
   - Signup: https://resend.com
   - Mais moderno, melhor deliverability
2. **SendGrid** - Free: 100 emails/dia
   - Signup: https://sendgrid.com
3. **Mock (Dev)** - Apenas logs no stdout

#### Setup

```bash
# .env
ALERTS_EMAIL_PROVIDER=resend
ALERTS_EMAIL_API_KEY=sk-or_xxxxxxxxxxxxx
ALERTS_EMAIL_FROM=noreply@seu-dominio.com
ALERTS_EMAIL_TO_ADMIN=admin@sua-empresa.com,gestor@sua-empresa.com
```

#### Uso

```typescript
import { enviarAlertaEmail, templateAlertaCritico } from "../utils/email-alertas";

// Alerta simples
await enviarAlertaEmail({
  assunto: "❌ Geração de DRE mensal falhou",
  corpo: "Erro: Query timeout após 30 segundos.\nVerifique índices do banco.",
  destinatario: "admin@empresa.com, gestor@empresa.com",
  severidade: "critical",
  html: false,
});

// Com template HTML
const html = templateAlertaCritico({
  titulo: "Falha na Reconciliação PIX",
  mensagem: "123 lançamentos não foram conciliados",
  detalhes: { tentativas: 3, próxima: "10 minutos", erro: "rate limit Asaas" },
  timestamp: new Date().toISOString(),
});

await enviarAlertaEmail({
  assunto: "Reconciliação PIX falhou",
  corpo: html,
  destinatario: "admin@empresa.com",
  html: true,
  severidade: "critical",
});
```

**Características**:
- ✅ Falha silenciosa (não interrompe job se email falhar)
- ✅ Retentativas automáticas (fetch interno do Node)
- ✅ Suporta múltiplos destinatários
- ✅ Graceful degradation se provider não configurado

---

### 3. Slack Alertas (`slack-alertas.ts`)

**Objetivo**: Notificações em tempo real em canal privado do Slack.

#### Setup

1. Crie workspace no Slack (gratuito)
2. Crie canal `#alertas-contabilidade` (privado)
3. Settings > Integrations > Incoming Webhooks
4. "Add New Webhook to Workspace" → Selecione `#alertas-contabilidade`
5. Copie URL (ex: `https://hooks.slack.com/services/T00000000/B00000000/XXXX`)

```bash
# .env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXX
```

#### Uso

```typescript
import {
  enviarAlertaSlack,
  enviarNotificacaoSlack,
  enviarResumoSlack,
} from "../utils/slack-alertas";

// Alerta com detalhes (crítico, warning, info)
await enviarAlertaSlack({
  mensagem: "Falha na geração de DRE mensal",
  detalhes: "Query timeout após 30 segundos. Verifique índices.",
  severidade: "critical", // 🔴 vermelho
  campos: {
    "Hora": "2026-10-02 09:30:00",
    "Banco": "prod-1",
    "Próxima tentativa": "10min",
  },
});

// Notificação simples (info, warning, critical)
await enviarNotificacaoSlack(
  "Relatório DRE",
  "Gerado com sucesso em 1.2 segundos",
  "info", // 🔵 azul
);

// Resumo agregado (daily digest)
await enviarResumoSlack(
  [
    { titulo: "Transações importadas", valor: "156" },
    { titulo: "Discrepâncias detectadas", valor: "3" },
    { titulo: "Uptime", valor: "99.9%" },
  ],
  "Resumo Diário - 2026-10-02",
);
```

**Cores por Severidade**:
- 🔵 **info**: azul (`#439FE0`)
- 🟡 **warning**: amarelo (`#FFB600`)
- 🔴 **critical**: vermelho (`#DC3545`)

**Características**:
- ✅ Graceful degradation se webhook não configurado
- ✅ Falha silenciosa (não bloqueia job)
- ✅ Suporta campos estruturados (até 10)
- ✅ Emojis automáticos por severidade

---

### 4. Health Check (`health-check.ts`)

**Objetivo**: Diagnostico de saúde do sistema (BD, APIs externas, memória).

#### Endpoint

```bash
# Versão completa (< 500ms, inclui APIs externas)
curl http://localhost:8787/api/health
{
  "status": "ok" | "degraded" | "error",
  "timestamp": "2026-10-02T09:30:00.000Z",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latencia_ms": 5 },
    "memory": { "status": "ok", "mensagem": "Heap 45.2% de 512MB" },
    "asaas": { "status": "ok", "latencia_ms": 120 },
    "pluggy": { "status": "ok", "latencia_ms": 150 }
  }
}

# Versão leve (< 100ms, Kubernetes readiness probe)
curl http://localhost:8787/api/health?leve=true
{
  "status": "ok" | "degraded" | "error",
  "timestamp": "...",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latencia_ms": 5 },
    "memory": { "status": "ok", "mensagem": "Heap 45.2%" }
  }
}
```

#### Checks Incluídos

| Check | O que verifica | Timeout | Quando falha |
|-------|---|---|---|
| **database** | SELECT 1 no SQLite | 5s | BD desconectado, corrompido |
| **memory** | Heap usage | - | > 80% (degraded), > 95% (error) |
| **asaas** | GET /v3/customers | 5s | Chave inválida, servidor offline |
| **pluggy** | POST /v2/auth | 5s | Credenciais inválidas, offline |

#### Status Agregado

- ✅ **ok**: Todos os checks OK
- 🟡 **degraded**: Pelo menos um check degraded (mas nenhum error)
- 🔴 **error**: Pelo menos um check error → HTTP 503

#### Uso em Orchestração

**Docker/Kubernetes**:
```yaml
livenessProbe:
  httpGet:
    path: /api/health?leve=true
    port: 8787
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /api/health?leve=true
    port: 8787
  initialDelaySeconds: 5
  periodSeconds: 10
```

**Monitoramento (Sentry, DataDog)**:
```typescript
import { executarHealthCheck } from "../utils/health-check";

// Em background job
const saude = await executarHealthCheck(db);
if (saude.status === "error") {
  Sentry.captureException(new Error("Sistema em estado crítico"));
}
```

---

## Casos de Uso Recomendados

### 1. Relatório DRE Diário (Scheduler)

```typescript
import { cache } from "../utils/cache-memoria";
import { enviarAlertaEmail, enviarAlertaSlack } from "../utils/alertas";

async function gerarDreDaily() {
  try {
    // Invalida cache de ontem (novo dia)
    cache.invalidarPrefixo("dre:");

    const ano = new Date().getFullYear();
    const mes = new Date().getMonth() + 1;

    // Verifica se já em cache
    let dre = cache.get(`dre:${ano}:${mes}`);
    if (!dre) {
      // Calcula do banco
      dre = await calcularDRE(ano, mes);
      // Cachea por 1 hora
      cache.set(`dre:${ano}:${mes}`, dre, { ttl: 3600000 });
    }

    // Sucesso
    await enviarNotificacaoSlack("DRE Diária", `Gerada em ${Date.now()}ms`, "info");
  } catch (erro) {
    // Falha: notifica admin
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await Promise.all([
      enviarAlertaEmail({
        assunto: "❌ DRE diária falhou",
        corpo: mensagem,
        destinatario: process.env.ALERTS_EMAIL_TO_ADMIN,
        severidade: "critical",
      }),
      enviarAlertaSlack({
        mensagem: "Falha na DRE diária",
        detalhes: mensagem,
        severidade: "critical",
      }),
    ]);
  }
}

// Roda 1x/dia às 10h
schedule("0 10 * * *", gerarDreDaily);
```

### 2. Reconciliação PIX com Notificação

```typescript
async function reconciliarPixHora() {
  try {
    // Invalida fluxo e reconciliação
    cache.invalidarPrefixo("fluxo:");
    cache.invalidarPrefixo("reconciliacao:");

    const { discrepancias, sincronizados } = await executarReconciliacao();

    if (discrepancias.length > 0) {
      // Alerta (mas não crítico)
      await enviarAlertaSlack({
        mensagem: `Reconciliação concluída com ${discrepancias.length} discrepâncias`,
        campos: { sincronizados, discrepâncias: discrepancias.length },
        severidade: "warning",
      });
    } else {
      // Notificação de sucesso
      await enviarNotificacaoSlack(
        "Reconciliação PIX",
        `100% sincronizado (${sincronizados} lançamentos)`,
        "info",
      );
    }
  } catch (erro) {
    // Falha crítica
    await enviarAlertaEmail({
      assunto: "❌ Reconciliação PIX falhou",
      corpo: `Verifique conexão BD e APIs externas.\n\nErro: ${erro.message}`,
      destinatario: process.env.ALERTS_EMAIL_TO_ADMIN,
      severidade: "critical",
      html: false,
    });
  }
}

// Roda a cada 2 horas
schedule("0 */2 * * *", reconciliarPixHora);
```

### 3. Health Check em Dashboard

```typescript
// GET /api/diagnostico
app.get("/api/diagnostico", async (req, res) => {
  const saudeCompleta = await executarHealthCheck(req.app.locals.db);

  res.json({
    sistema: saudeCompleta.status,
    uptime: saudeCompleta.uptime,
    ultimaVerificacao: saudeCompleta.timestamp,
    alertas: Object.entries(saudeCompleta.checks)
      .filter(([_, check]) => check.status !== "ok")
      .map(([nome, check]) => ({
        servico: nome,
        status: check.status,
        mensagem: check.mensagem,
      })),
    cache: req.app.locals.cache.stats(),
  });
});
```

---

## Configuração Mínima para Produção

```bash
# .env

# Cache (padrões já bons)
# CACHE_TTL_DRE=3600000
# CACHE_TTL_FLUXO=7200000

# Email (escolha um)
ALERTS_EMAIL_PROVIDER=resend
ALERTS_EMAIL_API_KEY=sk-or_xxxxxxxxxxxxxxxx
ALERTS_EMAIL_FROM=noreply@seu-dominio.com
ALERTS_EMAIL_TO_ADMIN=admin@seu-dominio.com

# Slack (opcional mas recomendado)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXX

# Sentry (opcional)
# SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
```

---

## Performance & Limites

| Componente | Latência | Limite |
|---|---|---|
| Cache hit | < 10ms | ~10k entradas (depende de RAM) |
| Email envio | 500-2000ms | 100 emails/dia (Resend/SendGrid free) |
| Slack webhook | 200-500ms | Ilimitado (próprio servidor) |
| Health check completo | 300-500ms | -
| Health check leve | 50-100ms | - |

---

## Troubleshooting

### Email não está enviando
1. Verificar `ALERTS_EMAIL_PROVIDER` está em [resend, sendgrid, none]
2. Se "resend": validar `ALERTS_EMAIL_API_KEY` em https://resend.com/api-keys
3. Se "sendgrid": testar chave em https://sendgrid.com/settings/api_keys
4. Verificar se domínio de `ALERTS_EMAIL_FROM` está verificado no provider

### Slack não está recebendo
1. Validar `SLACK_WEBHOOK_URL` em Slack App Directory > Incoming Webhooks
2. Testar webhook com curl:
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Teste"}' \
     $SLACK_WEBHOOK_URL
   ```
3. Verificar se canal `#alertas-contabilidade` existe e bot tem permissão

### Health check retorna error
1. `GET /api/health` → analisa qual `check` tem `status: "error"`
2. Se `database`: verificar conexão SQLite, permissões arquivo
3. Se `asaas`: verificar `ASAAS_API_KEY`, conectividade de rede
4. Se `pluggy`: verificar credenciais em `.env`

---

## Próximos Passos

- [ ] Integrar cache em endpoints DRE/Fluxo/Margens
- [ ] Adicionar alertas em lembretes-dispatcher.ts (DRE falha, etc)
- [ ] Configurar Sentry para produção ($9/mês)
- [ ] Dashboard de monitoramento (cache stats, últimos alertas)
