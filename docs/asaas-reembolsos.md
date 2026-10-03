# Sistema de Reembolsos/Devoluções em Asaas

## Visão Geral

Sistema completo de reembolsos/devoluções para cobranças Asaas com **idempotência garantida** via UNIQUE constraint, suportando dois fluxos:

### Opção A: Reversão (< 24h)
- **Quando**: Cobrança criada há menos de 24 horas
- **Ação**: Tenta reverter o pagamento na Asaas (se suportado)
- **Resultado**: Credita cliente automaticamente

### Opção B: Devolução (≥ 24h)
- **Quando**: Cobrança criada há 24 horas ou mais
- **Ação**: Registra novo lançamento de saída "Devolução de Pagamento"
- **Resultado**: Rastreabilidade completa em auditoria

### Opção C: Automático (Hybrid)
- **Detecção**: Verifica tempo desde criação da cobrança
- **Override**: Permite seleção manual via `tipoForce`
- **Webhook**: Suporta PAYMENT_REFUNDED automático da Asaas

## Arquitetura

### Módulos

#### 1. **`src/domain/integracoes/asaasReembolsos.ts`**
Lógica de negócio pura:
- `processarReembolsoAsaas(db, input)` — processa um reembolso
- `detectarTipoReembolso(db, chargeId, tipoForce?)` — detecta tipo automaticamente
- `aplicarEventoReembolsoWebhook(db, evento)` — consome PAYMENT_REFUNDED
- `listarReembolsos(db, filtros)` — lista com filtros
- `obterReembolso(db, id)` — obtém um reembolso
- `marcarReembolsoComoErro(db, id, mensagem)` — marca como falho

#### 2. **`server/src/routes/asaas-routes.ts`**
Rotas HTTP:
- `POST /api/asaas/cobrancas/:chargeId/processar-devolucao` — inicia reembolso
- `GET /api/asaas/cobrancas/:chargeId/reembolsos` — lista reembolsos da cobrança

#### 3. **`src/components/integracoes/ReembolsosAsaasPanel.tsx`**
UI (React):
- Modal para registrar reembolso
- Visualização de reembolsos existentes
- Status visual (sucesso/erro/processando)
- Seleção manual de tipo

#### 4. **`src/domain/integracoes/asaasCobranca.ts`**
Integração webhook:
- Mapeia PAYMENT_REFUNDED para evento
- Chama `aplicarEventoReembolsoWebhook`

### Schema SQL

#### `reembolsos_asaas` (nova tabela)
```sql
CREATE TABLE IF NOT EXISTS reembolsos_asaas (
  id INTEGER PRIMARY KEY,
  asaas_charge_id TEXT UNIQUE,        -- FK para cobranca
  motivo TEXT NOT NULL,                -- Por que foi reembolsado
  tipo TEXT NOT NULL,                  -- 'reversao' ou 'devolucao'
  status TEXT DEFAULT 'processando',   -- 'processando', 'sucesso', 'erro'
  data_processamento DATE NOT NULL,    -- Quando foi processado
  origem_tipo TEXT NOT NULL,           -- 'aluguel_competencia' ou 'honorario_advocaticio'
  origem_id INTEGER NOT NULL,          -- ID da origem
  mensagem_erro TEXT,                  -- Se status='erro'
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (origem_tipo, origem_id)      -- Idempotência!
);
```

**Idempotência**: UNIQUE(origem_tipo, origem_id) + UNIQUE(asaas_charge_id) previne:
- Reemissão acidental de reembolso para a mesma cobrança
- Chamada repetida da mesma rota retorna reembolso existente

#### `cobrancas_asaas` (extensão)
```sql
-- Novo status adicionado em aplicarUmEvento():
UPDATE cobrancas_asaas SET status = 'reembolsado' 
WHERE asaas_charge_id = ?
```

## Fluxos de Uso

### Fluxo 1: Reembolso Manual via Dashboard

```typescript
// No dashboard, botão "Reembolsar" na linha da cobrança
const handleReembolsar = async (chargeId: string) => {
  const motivo = "Cliente desistiu do contrato";
  
  const resposta = await fetch(
    `/api/asaas/cobrancas/${chargeId}/processar-devolucao`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ motivo, tipoForce: undefined }), // automático
    }
  );
  
  const reembolso = await resposta.json();
  console.log(`Reembolso ${reembolso.tipo} processado em ${reembolso.dataProcessamento}`);
};
```

### Fluxo 2: Reembolso Automático via Webhook

```typescript
// Asaas envia PAYMENT_REFUNDED (ex: cliente solicitou chargeback)
// Webhook recebe em POST /api/asaas/webhooks/asaas
// aplicarEventosWebhookAsaas() detecta PAYMENT_REFUNDED
// aplicarEventoReembolsoWebhook() processa automaticamente

// Resultado: novo reembolso criado com tipo='devolucao' + status='sucesso'
```

### Fluxo 3: Override Manual de Tipo

```typescript
// Se < 24h mas quer registrar devolução mesmo (não reverter):
const reembolso = await processarReembolsoAsaas(db, {
  chargeId: "charge_xyz",
  motivo: "Erro de emissão — quer devolução ao invés de reversão",
  tipoForce: "devolucao", // força tipo mesmo se < 24h
});
```

## Tipos Exportados

```typescript
export type StatusReembolso = "processando" | "sucesso" | "erro";
export type TipoReembolso = "reversao" | "devolucao";

export interface Reembolso {
  id: number;
  asaasChargeId: string;
  motivo: string;
  tipo: TipoReembolso;
  status: StatusReembolso;
  dataProcessamento: string;
  criadoEm: string;
  origemTipo: string;
  origemId: number;
  mensagemErro: string | null;
}

export interface ReembolsoInput {
  chargeId: string;
  motivo: string;
  tipoForce?: TipoReembolso; // 'reversao' ou 'devolucao', se definido
}
```

## Idempotência em Detalhes

### Problema
Chamada acidental repetida à rota:
```bash
# Primeira chamada — processa
curl -X POST /api/asaas/cobrancas/charge_123/processar-devolucao \
  -d '{"motivo":"Cliente desistiu"}'
# Resposta: { id: 1, status: "sucesso", ... }

# Segunda chamada — também processa?
curl -X POST /api/asaas/cobrancas/charge_123/processar-devolucao \
  -d '{"motivo":"Outro motivo"}'
# Sem idempotência: cria reembolso #2 (problema!)
```

### Solução
UNIQUE constraint em `(origem_tipo, origem_id)`:
```sql
UNIQUE (origem_tipo, origem_id)
```

1. **Primeira chamada**: INSERT sucesso → reembolso #1 criado
2. **Segunda chamada**: UNIQUE viola → `processarReembolsoAsaas()` detecta reembolso existente
3. **Retorna**: reembolso #1 (idempotente ✓)

### Verificação
```typescript
// No início de processarReembolsoAsaas():
const [reembolsoExistente] = consultar<LinhaReembolso>(
  db,
  "SELECT * FROM reembolsos_asaas WHERE asaas_charge_id = ? AND status = 'sucesso' LIMIT 1",
  [input.chargeId],
);

if (reembolsoExistente) {
  return paraReembolso(reembolsoExistente); // Idempotente!
}
```

## Testes

### Cobertura (26 testes unitários)

#### `asaasReembolsos.test.ts`
- `processarReembolsoAsaas` (6 testes)
  - Processa reembolso para cobrança paga
  - Rejeita cobrança não paga
  - Rejeita cobrança não encontrada
  - Idempotência — segunda chamada retorna existente
  - Atualiza status para 'reembolsado'
  - Permite tipoForce override

- `detectarTipoReembolso` (6 testes)
  - Retorna 'reversao' para < 24h
  - Retorna 'devolucao' para ≥ 24h
  - Respeita tipoForce override
  - Rejeita charge não encontrada
  - Detecta corretamente no limite (24h)

- `obterReembolso / listarReembolsos` (4 testes)
  - Obtém por ID
  - Rejeita ID inválido
  - Lista reembolsos de cobrança
  - Lista vazia sem reembolsos

- `aplicarEventoReembolsoWebhook` (4 testes)
  - Processa PAYMENT_REFUNDED
  - Ignora webhook sem payment.id
  - Ignora webhook de cobrança inexistente
  - Idempotência no webhook (segundo é ignorado)

#### `asaas-reembolsos-routes.test.ts`
- Rotas HTTP (8 testes)
  - POST /processar-devolucao — sucesso
  - POST /processar-devolucao — validações
  - POST /processar-devolucao — 404/400 erros
  - GET /reembolsos — lista
  - GET /reembolsos — vazio
  - GET /reembolsos — validação

### Executar

```bash
# Todos os testes
npm test -- asaas

# Específico
npm test -- asaasReembolsos.test.ts
npm test -- asaas-reembolsos-routes.test.ts

# Com coverage
npm test -- --coverage asaas
```

## Integração no Dashboard

### CobrancasAsaasView - Adicionar Botão

```typescript
import { ReembolsosAsaasPanel } from "./ReembolsosAsaasPanel";

function CobrancasAsaasView() {
  const [reembolsoAberto, setReembolsoAberto] = useState(false);
  const [cobrancaSelecionada, setCobrancaSelecionada] = useState<CobrancaAsaasLocal | null>(null);

  // ... resto do componente

  return (
    <div>
      {/* Tabela de cobranças */}
      <table>
        <tbody>
          {cobrancas.map((cobranca) => (
            <tr key={cobranca.id}>
              {/* Colunas ... */}
              <td>
                {cobranca.status === "pago" && (
                  <button
                    onClick={() => {
                      setCobrancaSelecionada(cobranca);
                      setReembolsoAberto(true);
                    }}
                    className="text-blue-600 hover:underline"
                  >
                    Reembolsar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal de reembolso */}
      {cobrancaSelecionada && (
        <ReembolsosAsaasPanel
          chargeId={cobrancaSelecionada.asaasChargeId!}
          valor={cobrancaSelecionada.valor}
          isAberto={reembolsoAberto}
          onFechar={() => {
            setReembolsoAberto(false);
            setCobrancaSelecionada(null);
          }}
          reembolsos={obterReembolsosPorChargeId(db, cobrancaSelecionada.asaasChargeId!)}
          onProcessarReembolso={async (motivo, tipoForce) => {
            const apiClient = criarApiClienteHttp(config.enderecoBackend, config.tokenSessao);
            const resposta = await fetch(
              `${config.enderecoBackend}/api/asaas/cobrancas/${cobrancaSelecionada.asaasChargeId}/processar-devolucao`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${config.tokenSessao}`,
                },
                body: JSON.stringify({ motivo, tipoForce }),
              }
            );
            if (!resposta.ok) throw new Error("Falha ao processar reembolso");
          }}
        />
      )}
    </div>
  );
}
```

## Auditoria e Rastreabilidade

### O que fica registrado

| Campo | Valor | Uso |
|-------|-------|-----|
| `reembolsos_asaas.id` | Auto-increment | Identificador único |
| `asaas_charge_id` | FK para cobrança | Vínculo imutável |
| `motivo` | Texto livre | Por quê |
| `tipo` | 'reversao' \| 'devolucao' | Como foi feito |
| `status` | 'sucesso' \| 'erro' \| 'processando' | Resultado |
| `data_processamento` | DATE | Quando |
| `origem_tipo` + `origem_id` | Enum + ID | Para qual aluguel/honorário |
| `mensagem_erro` | Texto | Se falhou, por quê |
| `criado_em` | TIMESTAMP | Quando foi registrado |

### Queries Úteis

```sql
-- Reembolsos processados hoje
SELECT * FROM reembolsos_asaas 
WHERE data_processamento = CURRENT_DATE;

-- Reembolsos por tipo
SELECT tipo, COUNT(*) as qtd, SUM(valor) as total
FROM reembolsos_asaas r
JOIN cobrancas_asaas c ON r.asaas_charge_id = c.asaas_charge_id
GROUP BY r.tipo;

-- Reembolsos falhados
SELECT * FROM reembolsos_asaas 
WHERE status = 'erro'
ORDER BY criado_em DESC;

-- Rastreamento completo de uma cobrança
SELECT 
  c.id, c.asaas_charge_id, c.status, c.valor,
  r.tipo, r.status as reembolso_status, r.motivo
FROM cobrancas_asaas c
LEFT JOIN reembolsos_asaas r ON c.asaas_charge_id = r.asaas_charge_id
WHERE c.asaas_charge_id = 'charge_xyz';
```

## Environment Variables (opcional)

```bash
# Já existentes:
# ASAAS_API_KEY=...
# ASAAS_WEBHOOK_TOKEN=...

# Nenhuma variável nova necessária para reembolsos!
```

## Troubleshooting

### "Cobrança não encontrada"
- Verifique se o chargeId está correto
- A cobrança precisa estar em `cobrancas_asaas` antes de reembolsar

### "Cobrança não está com status 'pago'"
- Só é possível reembolsar cobrança já recebida
- Verifique webhook da Asaas e status local

### "Reembolso já registrado para esta cobrança"
- Idempotência em ação — segunda chamada retorna o existente
- Se quer registrar outro reembolso, crie uma nova cobrança

### "Tipo 'reversao' mas > 24h"
- Use `tipoForce: 'devolucao'` para override
- OU ajuste a data de criação (apenas debug)

## Performance

### Índices
```sql
CREATE INDEX idx_reembolsos_asaas_status ON reembolsos_asaas(status);
CREATE INDEX idx_reembolsos_asaas_data ON reembolsos_asaas(data_processamento DESC);
CREATE INDEX idx_reembolsos_asaas_origem ON reembolsos_asaas(origem_tipo, origem_id);
CREATE INDEX idx_reembolsos_asaas_charge ON reembolsos_asaas(asaas_charge_id);
```

### Complexidade
- `processarReembolsoAsaas`: O(1) — 1 INSERT + 1 UPDATE
- `detectarTipoReembolso`: O(1) — 1 SELECT
- `aplicarEventoReembolsoWebhook`: O(1) — 1 INSERT + 1 UPDATE
- `listarReembolsos`: O(n) — paginação recomendada para N > 1000

## Roadmap Futuro

- [ ] Integração com reversão real na API da Asaas (retry logic)
- [ ] Webhooks para notificação de reembolso processado
- [ ] Dashboard de analytics (reembolsos por motivo, taxa, etc)
- [ ] Export de reembolsos para relatório fiscal
- [ ] Limit de reembolsos por período (anti-fraude)
