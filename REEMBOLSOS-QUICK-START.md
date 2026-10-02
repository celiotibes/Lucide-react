# Reembolsos Asaas - Quick Start Guide

## 30 segundos para entender

Sistema de reembolsos/devoluções com **idempotência garantida**:
- < 24h: reversão (tenta reverter na Asaas)
- ≥ 24h: devolução (registra lançamento de saída)
- Override manual: escolha o tipo manualmente
- Webhook automático: Asaas envia PAYMENT_REFUNDED

## Arquivos principais

| Arquivo | O quê | LOC |
|---------|-------|-----|
| `src/domain/integracoes/asaasReembolsos.ts` | Lógica pura | 250 |
| `src/components/integracoes/ReembolsosAsaasPanel.tsx` | UI Modal | 200 |
| `server/src/routes/asaas-routes.ts` | Rotas HTTP | +80 |
| `server/src/migrations-phase8-asaas-reembolsos.sql` | Schema SQL | 50 |
| `src/domain/integracoes/asaasCobranca.ts` | Webhook | +15 |

## Usar a API (TypeScript)

```typescript
import { 
  processarReembolsoAsaas, 
  detectarTipoReembolso,
  obterReembolsosPorChargeId 
} from "src/domain/integracoes/asaasReembolsos";

// Processar reembolso
const reembolso = await processarReembolsoAsaas(db, {
  chargeId: "charge_123",
  motivo: "Cliente desistiu",
  tipoForce: undefined, // 'reversao' | 'devolucao' | undefined (automático)
});

console.log(reembolso.tipo); // 'reversao' ou 'devolucao'
console.log(reembolso.status); // 'sucesso'

// Listar reembolsos de uma cobrança
const reembolsos = obterReembolsosPorChargeId(db, chargeId);
console.log(reembolsos); // Array<Reembolso>
```

## Usar UI (React)

```typescript
import { ReembolsosAsaasPanel } from "./ReembolsosAsaasPanel";

export function MeuComponente() {
  const [isAberto, setIsAberto] = useState(false);

  return (
    <>
      <button onClick={() => setIsAberto(true)}>
        Reembolsar
      </button>

      <ReembolsosAsaasPanel
        chargeId="charge_123"
        valor={1500}
        isAberto={isAberto}
        onFechar={() => setIsAberto(false)}
        reembolsos={[]}
        onProcessarReembolso={async (motivo, tipoForce) => {
          // Chama rota HTTP
          const res = await fetch(
            `/api/asaas/cobrancas/charge_123/processar-devolucao`,
            {
              method: "POST",
              body: JSON.stringify({ motivo, tipoForce }),
            }
          );
          if (!res.ok) throw new Error("Falha ao processar");
        }}
      />
    </>
  );
}
```

## Usar HTTP (REST)

```bash
# Processar reembolso
curl -X POST http://localhost:3000/api/asaas/cobrancas/charge_123/processar-devolucao \
  -H "Authorization: Bearer token123" \
  -H "Content-Type: application/json" \
  -d '{
    "motivo": "Cliente desistiu",
    "tipoForce": undefined
  }'

# Resposta: 201 Created
# {
#   "id": 1,
#   "asaasChargeId": "charge_123",
#   "tipo": "reversao",
#   "status": "sucesso",
#   "dataProcessamento": "2025-10-02",
#   "origemTipo": "aluguel_competencia",
#   "origemId": 5
# }

# Listar reembolsos de uma cobrança
curl http://localhost:3000/api/asaas/cobrancas/charge_123/reembolsos \
  -H "Authorization: Bearer token123"

# Resposta: 200 OK
# {
#   "chargeId": "charge_123",
#   "reembolsos": [
#     {
#       "id": 1,
#       "tipo": "reversao",
#       "status": "sucesso",
#       "motivo": "Cliente desistiu",
#       "dataProcessamento": "2025-10-02"
#     }
#   ]
# }
```

## Testes

```bash
# Rodar testes de reembolsos
npm test -- asaasReembolsos        # 26 testes unitários
npm test -- asaas-reembolsos       # 8 testes de rotas
npm test -- asaas                  # Todos (34 testes)

# Com coverage
npm test -- --coverage asaas
```

## Schema SQL

```sql
-- Tabela de reembolsos
CREATE TABLE reembolsos_asaas (
  id INTEGER PRIMARY KEY,
  asaas_charge_id TEXT UNIQUE,
  motivo TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('reversao', 'devolucao')),
  status TEXT DEFAULT 'processando' CHECK (status IN ('processando', 'sucesso', 'erro')),
  data_processamento DATE NOT NULL,
  origem_tipo TEXT CHECK (origem_tipo IN ('aluguel_competencia', 'honorario_advocaticio')),
  origem_id INTEGER NOT NULL,
  mensagem_erro TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (origem_tipo, origem_id)  -- Idempotência!
);
```

## Tipos TypeScript

```typescript
export type TipoReembolso = "reversao" | "devolucao";
export type StatusReembolso = "processando" | "sucesso" | "erro";

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
  tipoForce?: TipoReembolso;
}
```

## Idempotência

Chamada repetida retorna reembolso existente:

```typescript
// 1ª chamada
const r1 = await processarReembolsoAsaas(db, {
  chargeId: "charge_123",
  motivo: "Teste",
});
// → reembolso #1 criado

// 2ª chamada (acidental)
const r2 = await processarReembolsoAsaas(db, {
  chargeId: "charge_123",
  motivo: "Motivo diferente (não importa)",
});
// → retorna reembolso #1 (sem duplicação!)

console.log(r1.id === r2.id); // true ✓
```

## Webhook Automático

Quando Asaas envia `PAYMENT_REFUNDED`:

```
POST /api/asaas/webhooks/asaas
Body: {
  "event": "PAYMENT_REFUNDED",
  "payment": {
    "id": "charge_123",
    "refundedAmount": 1500,
    "refundDate": "2025-10-02"
  }
}

→ aplicarEventosWebhookAsaas() detecta PAYMENT_REFUNDED
→ aplicarEventoReembolsoWebhook() processa
→ reembolso criado automaticamente
→ cobrança.status = 'reembolsado'
```

## Detecção Automática de Tipo

```typescript
const tipo = detectarTipoReembolso(db, chargeId);

// Se < 24h desde criação: 'reversao'
// Se ≥ 24h desde criação: 'devolucao'
// Se tipoForce fornecido: usa tipoForce (ignora tempo)
```

## Queries Úteis

```sql
-- Reembolsos de hoje
SELECT * FROM reembolsos_asaas 
WHERE data_processamento = CURRENT_DATE;

-- Por tipo
SELECT tipo, COUNT(*) FROM reembolsos_asaas 
GROUP BY tipo;

-- Falhados
SELECT * FROM reembolsos_asaas 
WHERE status = 'erro';

-- Rastrear cobrança completa
SELECT 
  c.id, c.asaas_charge_id, c.status, c.valor,
  r.tipo, r.motivo, r.status as reemb_status
FROM cobrancas_asaas c
LEFT JOIN reembolsos_asaas r ON c.asaas_charge_id = r.asaas_charge_id
WHERE c.asaas_charge_id = 'charge_xyz';
```

## Troubleshooting

| Problema | Solução |
|----------|---------|
| "Cobrança não encontrada" | Verifique chargeId |
| "Status não é 'pago'" | Só reembolsa pago |
| "Reembolso já existe" | Idempotência em ação — segunda chamada retorna existente |
| "Webhook com erro" | Verifique logs e `mensagem_erro` no BD |

## Fluxo Completo no Dashboard

1. Tabela de cobranças mostra "Reembolsar" (botão ativo se status='pago')
2. Clica botão → abre modal ReembolsosAsaasPanel
3. Usuário:
   - Seleciona tipo (Automático/Reversão/Devolução)
   - Insere motivo
   - Clica "Processar Reembolso"
4. Modal chama:
   ```typescript
   POST /api/asaas/cobrancas/:chargeId/processar-devolucao
   Body: { motivo, tipoForce? }
   ```
5. Resposta retorna reembolso criado
6. Modal exibe status visual (sucesso/erro)
7. Toast notifica usuário

## Performance

- processarReembolsoAsaas: O(1) — 1 INSERT + 1 UPDATE
- detectarTipoReembolso: O(1) — 1 SELECT
- listarReembolsos: O(n) — com índices para performance
- Webhook: O(1) — automático, idempotente

## Próximos Passos

1. Executar migration: `migrations-phase8-asaas-reembolsos.sql`
2. Integrar modal no dashboard
3. Testar: `npm test -- asaas`
4. Deploy
5. Comunicar aos usuários

## Referências

- Documentação completa: `docs/asaas-reembolsos.md`
- Changelog: `CHANGELOG-asaas-reembolsos.md`
- Sumário: `IMPLEMENTACAO-REEMBOLSOS-SUMARIO.md`
