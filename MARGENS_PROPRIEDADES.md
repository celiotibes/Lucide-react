# Sistema de Análise de Margens por Propriedade

## Visão Geral

Sistema completo para calcular, persistir e visualizar a margem operacional de cada propriedade aluguel.

**Margem % = (Receita Aluguel - Despesa da Propriedade) / Receita Aluguel × 100**

### Status da Margem
- **OK (verde)**: > 70% → Propriedade muito rentável
- **ATENÇÃO (amarelo)**: 50-70% → Investigar custos
- **CRÍTICO (vermelho)**: < 50% → Rever preço aluguel ou reduzir despesas

---

## Arquitetura

### 1. Domínio (`server/src/domain/relatorios/margensPorPropriedade.ts`)

#### Tipos
```typescript
type MargemStatus = "OK" | "ATENÇÃO" | "CRÍTICO";

interface MargemImovel {
  imovelId: number;
  nomeProriedade: string;
  periodo: string; // YYYY-MM
  receita: number; // em centavos
  despesa: number; // em centavos
  margem: number; // percentual 0-100
  status: MargemStatus;
  calculadoEm: string;
}
```

#### Funções Principais

**`calcularMargensImovel(db, imovelId, ano, mes): MargemImovel`**
- Calcula margem para um imóvel em um período específico
- Busca receitas de aluguel
- Busca despesas categorizadas (IPTU, condomínio, manutenção, consertos)
- Retorna objeto MargemImovel com cálculo completo

**`gravarMargensImovel(db, ano, mes, margem): void`**
- Persiste resultado em `margens_propriedades_periodo`
- Faz UPSERT (atualiza se já existe)
- Valida entrada (receita/despesa ≥ 0, margem 0-100)

**`obterMargensHistorico(db, imovelId, dataInicio, dataFim): MargemHistorico`**
- Retorna histórico de margens para um imóvel em um período
- Usado para gráfico de tendência de 12 meses

**`obterMargensRanking(db, ano, mes): { top5, bottom5 }`**
- Retorna top 5 (maiores margens) + bottom 5 (menores margens)
- Ordenado por margem percentual

**`calcularEGravarMargensDoMes(db, ano, mes): MargemImovel[]`**
- Calcula e persiste margens para **todos** os imóveis de um período
- Executado diariamente (recomendado às 23:55)

---

### 2. Banco de Dados

#### Tabela: `margens_propriedades_periodo`
```sql
CREATE TABLE margens_propriedades_periodo (
  id INTEGER PRIMARY KEY,
  periodo TEXT NOT NULL,        -- YYYY-MM
  ano INTEGER NOT NULL,         -- 2026
  mes INTEGER NOT NULL,         -- 1-12
  imovel_id INTEGER NOT NULL,   -- FK
  
  receita DECIMAL(15, 2),       -- em R$
  despesa DECIMAL(15, 2),       -- em R$
  margem DECIMAL(5, 2),         -- percentual
  status TEXT,                  -- OK | ATENÇÃO | CRÍTICO
  
  calculado_em DATETIME,
  criado_em DATETIME,
  atualizado_em DATETIME,
  
  UNIQUE(imovel_id, ano, mes),
  FOREIGN KEY (imovel_id)
);
```

#### Índices
- `idx_margens_imovel_periodo(imovel_id, ano, mes DESC)` → Busca rápida por imóvel
- `idx_margens_periodo(ano, mes DESC)` → Busca por período
- `idx_margens_status` → Filtro por status
- `idx_margens_calculado(calculado_em DESC)` → Histórico

---

### 3. Categorias de Despesa Incluídas

As seguintes categorias são consideradas "despesa da propriedade":

| Categoria Pluggy | Exemplos | Incluída? |
|---|---|---|
| Impostos | IPTU, INSS | ✅ |
| Condomínio | Taxa de condomínio | ✅ |
| Manutenção | Consertos, reparos, pintura, reforma | ✅ |
| Gasolina | Combustível | ❌ |
| Alimentação | | ❌ |
| Outros | | ❌ |

**Nota**: A busca é case-insensitive e busca por padrões em `descricao`:
- "IPTU", "condominio", "condomínio", "manutencao", "manutenção", "conserto", "reforma"

---

## API REST

### Base URL
```
GET|POST /api/relatorios/margens
```

### Endpoints

#### 1. Histórico de um imóvel
```http
GET /api/relatorios/margens?imovelId=1&dataInicio=2026-01-01&dataFim=2026-12-31
```

**Query Params**
- `imovelId` (obrigatório): número
- `dataInicio` (opcional): YYYY-MM-DD, padrão = 12 meses atrás
- `dataFim` (opcional): YYYY-MM-DD, padrão = hoje

**Response (200 OK)**
```json
{
  "imovelId": 1,
  "nomePropriedade": "Apto 101 - São Paulo",
  "periodos": [
    {
      "periodo": "2026-10",
      "receita": 5000.00,
      "despesa": 1500.00,
      "margem": 70.00,
      "status": "OK"
    },
    // ... últimos 12 meses
  ]
}
```

#### 2. Ranking (Top 5 + Bottom 5)
```http
GET /api/relatorios/margens/ranking?periodoMes=2026-10
```

**Query Params**
- `periodoMes` (obrigatório): YYYY-MM

**Response (200 OK)**
```json
{
  "periodo": "2026-10",
  "top5": [
    {
      "rank": 1,
      "imovelId": 1,
      "nomePropriedade": "Apto 101",
      "receita": 5000.00,
      "despesa": 1500.00,
      "margem": 70.00,
      "status": "OK"
    },
    // ... até 5 itens
  ],
  "bottom5": [
    // ... até 5 itens
  ]
}
```

#### 3. Forçar Cálculo (Admin)
```http
POST /api/relatorios/margens/calcular
Content-Type: application/json

{
  "ano": 2026,
  "mes": 10
}
```

**Response (200 OK)**
```json
{
  "periodo": "2026-10",
  "totalImoveisCalculados": 5,
  "margens": [
    {
      "imovelId": 1,
      "nomePropriedade": "Apto 101",
      "receita": 5000.00,
      "despesa": 1500.00,
      "margem": 70.00,
      "status": "OK"
    },
    // ... todos os imóveis
  ]
}
```

#### 4. Última Margem (Quick lookup)
```http
GET /api/relatorios/margens/imovel/:imovelId/ultimo
```

**Response (200 OK)**
```json
{
  "imovelId": 1,
  "nomePropriedade": "Apto 101",
  "periodo": "2026-10",
  "receita": 5000.00,
  "despesa": 1500.00,
  "margem": 70.00,
  "status": "OK",
  "calculadoEm": "2026-10-02T23:55:00Z"
}
```

---

## Dashboard React

### Componente: `MargensPropriedadesView`

Localizado em: `src/components/integracoes/MargensPropriedadesView.tsx`

#### Features
1. **Seletor de Período** → Alterna entre meses
2. **Cards de Status** → Conta de imóveis por categoria (OK, ATENÇÃO, CRÍTICO)
3. **Tabela de Ranking** → Top 5 + Bottom 5 do período
4. **Código de Cores**
   - Verde: margem > 70%
   - Amarelo: margem 50-70%
   - Vermelho: margem < 50%
5. **Histórico Expansível** → Clique em imóvel para expandir
6. **Gráfico de Tendência** → Ultimos 12 meses (Recharts)
7. **Alertas** → Avisos para margens críticas

#### Uso
```typescript
import MargensPropriedadesView from "@/components/integracoes/MargensPropriedadesView";

export default function Dashboard() {
  return <MargensPropriedadesView />;
}
```

---

## Integração com Sistema Existente

### 1. Registrar Rotas
No arquivo principal (`server/src/index.ts` ou equivalente):

```typescript
import { criarRotasRelatorios } from "./routes/relatorios-routes.js";

// ... setup Express ...

const rotasRelatorios = criarRotasRelatorios({
  authService: seuAuthService,
  db: seuDatabase,
});

app.use("/api", rotasRelatorios);
```

### 2. Job Diário (Cron)
Executar às 23:55 diariamente:

```typescript
// Usando node-cron ou similar
cron.schedule("55 23 * * *", () => {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  
  calcularEGravarMargensDoMes(db, ano, mes);
  console.log(`✅ Margens calculadas para ${ano}-${String(mes).padStart(2, "0")}`);
});
```

### 3. Migrações SQL
Executar arquivo:
```bash
sqlite3 seu_banco.db < server/src/migrations-phase7-margens-propriedades.sql
```

---

## Testes

### Cobertura: 32 testes

#### Domínio (18 testes)
- `calcularMargensImovel()`: 10 testes
  - Margem com receita/despesa normal
  - Status OK/ATENÇÃO/CRÍTICO
  - Zero receita, zero despesa, 100% margem
  - Ignorar transações fora do mês
  - Validação de entrada
- `gravarMargensImovel()`: 8 testes
  - Persistência básica
  - UPSERT em conflito
  - Validação (receita/despesa negativas, margem > 100, imovelId)

#### Rotas (6 testes)
- Histórico para um imóvel
- Erro 400 se imovelId ausente
- Ranking (top 5 + bottom 5)
- Erro 400 se periodo inválido
- Cálculo e gravação em lote
- Última margem de um imóvel

#### Edge Cases (8 testes)
- Imóvel sem transações
- Transações com valor zero
- Arredondamento para 2 casas decimais
- Case-insensitive em descrições
- Ignorar despesas de outros tipos
- Clampear margem negativa para 0%
- Clampear margem > 100% para 100%
- Histórico com períodos faltando

### Executar Testes
```bash
npm test -- margensPorPropriedade.test.ts
npm test -- relatorios-routes.test.ts
```

---

## Cronograma de Implementação

| Fase | O quê | Quando |
|---|---|---|
| 1 | Criar tipos e funções de cálculo | ✅ Pronto |
| 2 | Criar testes unitários | ✅ Pronto |
| 3 | Criar rotas API | ✅ Pronto |
| 4 | Criar tabelas SQL | ✅ Pronto |
| 5 | Criar dashboard React | ✅ Pronto |
| 6 | Integrar com sistema principal | 🔜 Próximo |
| 7 | Setup job diário (cron) | 🔜 Próximo |
| 8 | Testes de integração e8e | 🔜 Próximo |

---

## Troubleshooting

### ❌ "Imóvel não encontrado"
- Verificar se `imovelId` existe em tabela `imoveis`
- Usar endpoint `/api/relatorios/margens/imovel/:id/ultimo` para check

### ❌ "Nenhuma margem calculada"
- Executar `POST /api/relatorios/margens/calcular` com `ano` e `mes`
- Verificar se existem transações no período

### ❌ Margens zeradas
- Verificar categorias de despesa (IPTU, condomínio, manutenção)
- Conferir se transações estão com tipo correto (RECEITA/DESPESA)
- Usar busca por descrição: "IPTU", "condominio", "manutencao", etc

---

## Próximos Passos

1. **Alertas Automáticos** → Notificar quando margem < 50%
2. **Export CSV** → Relatório mensal
3. **Comparativo Período** → "Margem melhorou X% vs mês passado"
4. **Sugestões IA** → "Reduza despesa em R$200 para atingir 70%"
5. **Webhook** → Integrar com Telegram/Email
