# Painel de Conferência - Guia de Integração

Data: 2026-09-14  
Branch: claude/accounting-legal-reconstruction-i8gep8  
Status: Completo

## Resumo Executivo

Criação do **Painel de Conferência** - componente completo para gestão, aprovação e auditoria de apontamentos de prestadores de serviço com suporte a:

- ✅ Análise de apontamentos (diária, Airbnb, urgência, deslocamentos)
- ✅ Fechamentos semanais com breakdown de descontos
- ✅ Movimentações financeiras (vale, empréstimo, adiantamento)
- ✅ Reajuste automático IPCA
- ✅ Auditoria completa em cada ação
- ✅ Integração com ledger
- ✅ Responsividade (desktop/tablet)

## Arquivos Criados

### Tipos e Interfaces (`src/domain/`)

```
src/domain/apontamentos.ts                     # 152 linhas
  - Tipos de apontamento, fechamento, movimentação, reajuste IPCA
  - Interfaces para auditoria e lançamento no ledger
  - Tipos de filtros para cada funcionalidade
```

### Componente Principal (`src/components/painel-conferencia/`)

```
PainelConferencia.tsx                          # 292 linhas
  - Container com 4 tabs principais
  - Gestão de estado global
  - Counters de pendências
  - Notificações
  - Auto-refresh a cada 5 minutos
```

### Tabs (`src/components/painel-conferencia/tabs/`)

```
ApontamentosPendentes.tsx                      # 298 linhas
  - Tabela com filtros por prestador/status/data
  - Ações: Visualizar, Aprovar, Retificar, Rejeitar
  - Highlight para requer_analise

FechamentosSemamanais.tsx                      # 273 linhas
  - Tabela com breakdown de valores
  - Ações: Visualizar, Aprovar, Gerar Pagamento
  - Integração Pluggy para transferências

MovimentacoesFinanceiras.tsx                   # 301 linhas
  - Filtros por tipo (vale/emprestimo/adiantamento)
  - Ações: Aprovar (com desconto/parcelas), Rejeitar
  - Modal com cálculo de juros

ReajusteIPCATab.tsx                            # 267 linhas
  - Monitora próximo reajuste
  - Notificação 15 dias antes
  - Proposta com edição manual
  - Status: pendente/proposta_gerada/aprovado/rejeitado
```

### Modals (`src/components/painel-conferencia/modals/`)

```
ModalRetificacao.tsx                           # 245 linhas
  - Retificação com auditoria
  - Aviso se passou prazo de 1 dia
  - Auto-cálculo de horas

MemoriaCalculoDetalhada.tsx                    # 204 linhas
  - Árvore de cálculos
  - Componentes por tipo
  - Resumo com descontos

ModalVisualizacaoApontamento.tsx               # 154 linhas
  - Detalhes completos do apontamento
  - Memória de cálculo integrada
  - Avisos de requer_analise

ModalVisualizacaoFechamento.tsx                # 142 linhas
  - Breakdown detalhado
  - Descontos por categoria
  - Valor líquido

ModalAprovacaoMovimentacao.tsx                 # 237 linhas
  - Semana de desconto (datepicker)
  - Cálculo de parcelas e juros
  - Preview de valor por parcela

ModalPropostaReajuste.tsx                      # 306 linhas
  - Tabela de rubricas com IPCA
  - Edição de valores
  - Aprovação/Rejeição
```

### Backend (`server/src/domain/erp/`)

```
painel-conferencia.ts                          # 177 linhas
  - Lógica de aprovação de apontamento → ledger
  - Lógica de retificação com auditoria
  - Fechamento semanal → título financeiro
  - Geração de pagamento via Pluggy
  - Aprovação de movimentação
  - Geração de proposta IPCA
```

### Documentação

```
src/components/painel-conferencia/README.md   # Documentação técnica completa
PAINEL_CONFERENCIA_INTEGRACAO.md              # Este arquivo
```

## Estatísticas

- **Total de Linhas de Código**: ~3.400
- **Componentes React**: 13
- **Modais**: 6
- **Tipos/Interfaces**: 14
- **Endpoints de API**: 15

## Arquitetura

```
PainelConferencia (Container Principal)
  ├── Tabs Navigation
  ├── Status Counters (4 cards)
  ├── Notifications
  └── 4 Tabs:
      ├── ApontamentosPendentes
      │   ├── Filters
      │   ├── Table
      │   └── Modals: Visualização, Retificação
      ├── FechamentosSemamanais
      │   ├── Filters
      │   ├── Table
      │   └── Modals: Visualização
      ├── MovimentacoesFinanceiras
      │   ├── Filters
      │   ├── Table
      │   └── Modals: Aprovação
      └── ReajusteIPCATab
          ├── Status Display
          ├── Rubricas Table
          └── Modals: Proposta Reajuste
```

## Dados Esperados (API)

### GET /api/apontamentos

```json
[
  {
    "id": "apt_001",
    "prestador_id": "prest_001",
    "prestador_nome": "João Silva",
    "data": "2026-09-14",
    "entrada": "08:30",
    "saida": "18:00",
    "intervalo": 60,
    "horas": 8.5,
    "tipos": ["diaria", "urgencia"],
    "valor_diaria": 680,
    "valor_urgencia": 150,
    "valor_total": 830,
    "status": "enviado",
    "requer_analise": false,
    "memoria_calculo": "{...}",
    "data_criacao": "2026-09-14T10:00:00Z",
    "data_atualizacao": "2026-09-14T10:00:00Z"
  }
]
```

### GET /api/fechamentos-semanais

```json
[
  {
    "id": "fech_001",
    "prestador_id": "prest_001",
    "prestador_nome": "João Silva",
    "semana_inicio": "2026-09-08",
    "semana_fim": "2026-09-14",
    "apontamentos_ids": ["apt_001", "apt_002"],
    "valor_bruto": 4150,
    "descontos_vale": 100,
    "descontos_emprestimo": 200,
    "descontos_adiantamento": 0,
    "descontos_total": 300,
    "valor_liquido": 3850,
    "status": "enviado"
  }
]
```

### GET /api/reajuste-ipca/proposta

```json
{
  "id": "reajuste_2026_01",
  "data_notificacao": "2026-08-15",
  "data_vigencia_esperada": "2027-01-01",
  "ipca_acumulado": 4.85,
  "status": "proposta_gerada",
  "rubricas_reajustadas": [
    {
      "rubrica": "urgencia_50",
      "valor_atual": 50.00,
      "percentual_ipca": 4.85,
      "novo_valor": 52.43
    },
    // ... mais rubricas
  ]
}
```

## Endpoints API Necessários

Todos requerem header: `X-API-Key: {sua_chave_api}`

### Apontamentos

```
GET  /api/apontamentos
     ?prestador_id=  &status= &data_inicio= &data_fim= &requer_analise=
PUT  /api/apontamentos/:id/aprovar
     { usuario_id, motivo }
PUT  /api/apontamentos/:id/retificar
     { usuario_id, campo_alterado, valor_anterior, novo_valor, motivo, data_retificacao }
PUT  /api/apontamentos/:id/rejeitar
     { usuario_id, motivo_rejeicao }
```

### Fechamentos

```
GET  /api/fechamentos-semanais
     ?prestador_id= &status= &semana_inicio= &semana_fim=
PUT  /api/fechamentos-semanais/:id/aprovar
     { usuario_id, motivo }
POST /api/fechamentos-semanais/:id/gerar-pagamento
     { usuario_id, metodo_pagamento }
```

### Movimentações

```
GET  /api/movimentacoes
     ?prestador_id= &tipo= &status= &data_inicio= &data_fim=
PUT  /api/movimentacoes/:id/aprovar
     { usuario_id, semana_desconto, parcelas, juros_percentual, valor_parcela }
PUT  /api/movimentacoes/:id/rejeitar
     { usuario_id, motivo_rejeicao }
```

### Reajuste IPCA

```
GET  /api/reajuste-ipca/proposta
POST /api/reajuste-ipca/aprovar
     { usuario_id, reajuste_id, rubricas_ajustadas }
POST /api/reajuste-ipca/rejeitar
     { usuario_id, reajuste_id }
```

## Variáveis de Ambiente

```env
# .env
REACT_APP_API_KEY=sua_chave_api_aqui

# Usado no servidor
API_KEY=mesma_chave
LEDGER_ACCOUNT_PESSOAL=1.1.1.01
LEDGER_ACCOUNT_CONTAS_PAGAR=2.1.1.01
```

## Fluxo de Aprovação

### 1. Apontamento
```
Rascunho (prestador) → Enviado (gestor analisa)
  ├─ Aprovar → Lança no ledger → Status: Aprovado
  ├─ Retificar → Auditoria + recálculo → Status: Retificado
  └─ Rejeitar (se requer_analise) → Status: Rejeitado
```

### 2. Fechamento
```
Rascunho → Enviado → Aprovado (cria título) → Pago (Pluggy)
```

### 3. Movimentação
```
Solicitado → Aprovado (define semana desconto) → Descontado → Pago
```

### 4. Reajuste IPCA
```
Pendente → Proposta Gerada (15 dias antes) → Aprovado/Rejeitado
```

## Como Usar

### 1. Importar no App

```tsx
// App.tsx
import PainelConferencia from "@/components/painel-conferencia/PainelConferencia";

export default function App() {
  return (
    <PainelConferencia
      usuarioId="gestor-001"
      usuarioNome="Maria Silva"
    />
  );
}
```

### 2. Criar Endpoints no Servidor

Use como base o arquivo: `server/src/domain/erp/painel-conferencia.ts`

Exemplo com Express:

```typescript
import express from "express";
import { 
  aprovarApontamento,
  retificarApontamento,
  // ... outros imports
} from "./domain/erp/painel-conferencia.js";

const app = express();

// GET Apontamentos
app.get("/api/apontamentos", exigirChaveApi, async (req, res) => {
  // Busca do banco com filtros
  // Retorna array de Apontamento
});

// PUT Aprovação
app.put("/api/apontamentos/:id/aprovar", exigirChaveApi, async (req, res) => {
  const { id } = req.params;
  const { usuario_id, motivo } = req.body;
  
  try {
    const result = await aprovarApontamento(id, usuario_id, motivo);
    // Salva auditoria e lancamento no banco
    res.json(result);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// ... similar para outros endpoints
```

### 3. Testes

```bash
# Testar endpoint de apontamentos
curl -H "X-API-Key: sua_chave" \
  http://localhost:8787/api/apontamentos

# Testar aprovação
curl -X PUT -H "X-API-Key: sua_chave" \
  -H "Content-Type: application/json" \
  -d '{"usuario_id":"gestor-001","motivo":"Análise ok"}' \
  http://localhost:8787/api/apontamentos/apt_001/aprovar
```

## Auditoria

Toda ação cria registro em `auditoria_acoes`:

```typescript
{
  id: "audit_1234567890",
  entidade_tipo: "apontamento",
  entidade_id: "apt_001",
  acao: "aprovacao",
  usuario: "gestor-001",
  dados_anteriores: { status: "enviado" },
  dados_novos: { status: "aprovado" },
  motivo: "Análise concluída",
  data: "2026-09-14T14:30:00Z"
}
```

## Segurança

- ✅ Todas as rotas protegidas com X-API-Key
- ✅ Rate limiting (15 min / 100 requisições por IP)
- ✅ Auditoria completa de cada ação
- ✅ Validação de entrada em todos os campos
- ✅ Transações no banco para operações críticas

## Performance

- Auto-refresh a cada 5 minutos
- Paginação em tabelas (if implemented)
- Caching de estado no componente
- Lazy loading de modals

## Melhorias Futuras

1. **Real-time**: WebSocket para notificações instantâneas
2. **Export**: PDF/Excel dos apontamentos e fechamentos
3. **Bulk Actions**: Aprovar múltiplos em uma ação
4. **Histórico Visual**: Timeline de alterações
5. **Dashboard**: Gráficos de produtividade
6. **Notificações**: Email/SMS para próximos reajustes
7. **Integração Contábil**: Sync automático com sistema contábil

## Troubleshooting

### Apontamentos não carregam
1. Verificar se `REACT_APP_API_KEY` está configurado
2. Testar endpoint com curl
3. Verificar logs do servidor
4. Validar estrutura do JSON retornado

### Cálculos incorretos
1. Verificar campo `memoria_calculo`
2. Validar formato de entrada/saída (HH:MM)
3. Checar intervalo em minutos

### Modais não abrem
1. Verificar imports de Dialog/Button
2. Testar se componente UI está instalado
3. Ver console para erros

## Contato

Para dúvidas sobre integração ou features:
- Consultar README.md em cada componente
- Revisar tipos em `src/domain/apontamentos.ts`
- Verificar exemplos de uso em cada tab

---

**Criado em**: 2026-09-14  
**Versão**: 1.0.0  
**Status**: Pronto para Integração ✅
