# Guia de Deduplicação de Agentes e Transações

## Visão Geral

O sistema de deduplicação detecta e resolve duplicatas de agentes econômicos e transações com:

- **Accuracy >85%**: Detecção confiável de duplicatas
- **Performance <100ms**: Comparação rápida por agente
- **Auditoria completa**: Rastreamento total de operações
- **Rollback seguro**: Desfazimento de merges com restauração de estado

## Arquitetura

### Componentes Principais

1. **AgentesDeduplicacaoService**: Detecção e merge de agentes
2. **TransacoesDeduplicacaoService**: Detecção de transações duplicadas
3. **API Routes**: Endpoints REST para operações
4. **Database**: Tabelas de auditoria e registro

### Estratégia de Detecção

#### Passo 1: Match Exato CNPJ/CPF (100 pontos)
```
se CPF/CNPJ idêntico → score = 100 → EXACT_MATCH
```

#### Passo 2: Fuzzy-Match de Nome (até 70 pontos)
```
Levenshtein distance: string comparação
- >= 95% similar → 70 pontos (EXACT_NAME)
- >= 85% similar → 50 pontos (HIGH_NAME_SIMILARITY)
- >= 75% similar → 30 pontos (MEDIUM_NAME_SIMILARITY)
- >= 65% similar → 15 pontos
```

#### Passo 3: Similaridade de Endereço (até 15 pontos)
```
Componentes:
- Logradouro: 20 pontos
- Número: 15 pontos
- Cidade: 15 pontos
- CEP: 15 pontos
Total: até 65 pontos possíveis (normalizado a 15)
```

#### Passo 4: Email/Telefone (até 15 pontos)
```
- Email idêntico: +10 pontos
- Telefone idêntico: +5 pontos
```

**Score Final**: 0-100, Threshold: >= 50 (MEDIUM), >= 85 (HIGH), >= 95 (EXACT)

## Uso da API

### 1. Detectar Duplicatas de um Agente

```bash
GET /api/v1/agentes/:id/duplicatas

# Resposta
{
  "agente_id": "uuid",
  "total": 3,
  "candidatos": [
    {
      "agente_id_2": "uuid",
      "nome_2": "EMPRESA XYZ",
      "cpf_cnpj_2": "11222333000181",
      "score": 95,
      "confidence_level": "HIGH",
      "motivos": ["CNPJ idêntico (100% duplicata)"],
      "detalhes": {
        "tipo_match": "EXACT_CPF_CNPJ",
        "percentual_similaridade": 95
      }
    }
  ]
}
```

### 2. Buscar Duplicatas para Revisão (Review Queue)

```bash
GET /api/v1/agentes/duplicatas/review?status=pendente&limit=50

# Resposta
{
  "status": "pendente",
  "total": 25,
  "duplicatas": [
    {
      "id": "uuid",
      "agente_1_nome": "EMPRESA ABC",
      "agente_2_nome": "EMPRESA ABC LTDA",
      "score": 88,
      "status": "pendente",
      "criado_em": "2024-10-07T10:30:00Z"
    }
  ]
}
```

### 3. Fundir Dois Agentes (Merge)

```bash
POST /api/v1/agentes/:id1/merge/:id2
Content-Type: application/json

{
  "motivo": "Duplicata confirmada - CNPJ idêntico",
  "detalhes": {
    "verificado_por": "supervisor",
    "data_verificacao": "2024-10-07"
  }
}

# Resposta
{
  "sucesso": true,
  "resultado": {
    "id": "merge-uuid",
    "agente_primario_id": "uuid1",
    "agente_duplicado_id": "uuid2",
    "agentes_migrados": 1,
    "transacoes_migradas": 42,
    "audit_trail": "trail-uuid",
    "timestamp": "2024-10-07T10:35:00Z"
  }
}
```

#### Operações de Merge
- Desativa agente duplicado
- Migra todas as referências em `ledger_entries`
- Registra operação em `agentes_duplicatas_suspeitas`
- Cria audit trail completo

### 4. Aprovar Duplicata (Sem Merge Automático)

```bash
PUT /api/v1/agentes/duplicatas/:id/approve
Content-Type: application/json

{
  "decisao": "Confirmada como duplicata - aguardando análise financeira"
}

# Resposta
{
  "sucesso": true,
  "mensagem": "Duplicata aprovada com sucesso",
  "duplicata_id": "uuid"
}
```

### 5. Rejeitar Duplicata

```bash
PUT /api/v1/agentes/duplicatas/:id/reject
Content-Type: application/json

{
  "motivo": "Agentes diferentes - mesmo sobrenome coincidência"
}

# Resposta
{
  "sucesso": true,
  "mensagem": "Duplicata rejeitada com sucesso",
  "duplicata_id": "uuid"
}
```

### 6. Desfazer Merge (Rollback)

```bash
POST /api/v1/agentes/duplicatas/:id/unmerge

# Resposta
{
  "sucesso": true,
  "resultado": {
    "id": "unmerge-uuid",
    "agente_primario_id": "uuid1",
    "agente_duplicado_id": "uuid2",
    "agentes_migrados": 1,
    "transacoes_migradas": 42,
    "audit_trail": "trail-uuid",
    "timestamp": "2024-10-07T10:40:00Z"
  }
}
```

### 7. Estatísticas de Duplicatas

```bash
GET /api/v1/agentes/duplicatas/stats

# Resposta
{
  "estatisticas": {
    "total_agentes_ativos": 1543,
    "total_agentes_com_merges": 87,
    "duplicatas_por_status": [
      {
        "status": "pendente",
        "total": 45,
        "score_medio": 78.5,
        "score_maximo": 100,
        "score_minimo": 50
      },
      {
        "status": "mesclada",
        "total": 87,
        "score_medio": 92.3,
        "score_maximo": 100,
        "score_minimo": 85
      }
    ]
  }
}
```

### 8. Executar Scan Completo de Duplicatas

```bash
GET /api/v1/agentes/duplicatas/scan?score_minimo=70&salvar=true

# Resposta
{
  "score_minimo": 70,
  "total_pares_encontrados": 234,
  "total_registradas_bd": 234,
  "duplicatas": [
    {
      "agente_id": "uuid",
      "total_candidatos": 5,
      "candidatos": [
        {
          "agente_id_2": "uuid2",
          "score": 95,
          "confidence_level": "HIGH"
        }
      ]
    }
  ]
}
```

## Uso Programático

### Exemplo 1: Detectar e Listar Duplicatas

```typescript
import Database from "better-sqlite3";
import { AgentesDeduplicacaoService } from "./agentes-deduplicacao.js";

const db = new Database("app.db");
const service = new AgentesDeduplicacaoService(db);

// Buscar duplicatas de um agente
const agenteId = "550e8400-e29b-41d4-a716-446655440000";
const usuarioId = "550e8400-e29b-41d4-a716-446655440001";

const candidatos = service.detectarDuplicatasAgente(agenteId, usuarioId);

candidatos.forEach((candidato) => {
  console.log(`
    Agente: ${candidato.nome_2}
    Score: ${candidato.score}
    Nível: ${candidato.confidence_level}
    Motivos: ${candidato.motivos.join("; ")}
  `);
});
```

### Exemplo 2: Fundir Agentes e Registrar

```typescript
const mergeResult = service.fundirAgentes(
  {
    agente_primario_id: "uuid1",
    agente_duplicado_id: "uuid2",
    motivo: "CNPJ idêntico - duplicata confirmada",
    detalhes: {
      verificado_por: "admin@company.com",
      data_verificacao: new Date().toISOString(),
    },
  },
  usuarioId
);

if (mergeResult.sucesso) {
  console.log(`
    Merge realizado com sucesso!
    ID: ${mergeResult.id}
    Transações migradas: ${mergeResult.transacoes_migradas}
    Audit trail: ${mergeResult.audit_trail}
  `);
}
```

### Exemplo 3: Scan Completo do Sistema

```typescript
const duplicatas = service.detectarTodasDuplicatas(usuarioId, 85);

console.log(`Total de pares com duplicatas: ${duplicatas.size}`);

for (const [agenteId, candidatos] of duplicatas) {
  console.log(`
    Agente: ${agenteId}
    Duplicatas encontradas: ${candidatos.length}
  `);

  // Registrar duplicatas
  for (const candidato of candidatos) {
    const idSuspeita = service.registrarSuspeitaDuplicata(
      agenteId,
      candidato.agente_id_2,
      candidato,
      usuarioId
    );
    console.log(`Suspeita registrada: ${idSuspeita}`);
  }
}
```

## Integrando com Rutas Existentes

### Em seu arquivo de rotas principal:

```typescript
import { setupAgentesDeduplicacaoRoutes } from "./routes/agentes-deduplicacao-routes.js";
import express from "express";
import Database from "better-sqlite3";

const app = express();
const db = new Database("app.db");

// Registrar rotas de deduplicação
setupAgentesDeduplicacaoRoutes(app, db);

// ... resto da configuração
```

## Views Úteis do Banco de Dados

### agentes_duplicatas_detalhadas
Lista duplicatas com dados completos dos agentes:
```sql
SELECT * FROM agentes_duplicatas_detalhadas 
WHERE status = 'pendente' 
ORDER BY score DESC;
```

### agentes_merges_historico
Histórico de merges realizados:
```sql
SELECT * FROM agentes_merges_historico 
WHERE data_merge >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY data_merge DESC;
```

### agentes_operacoes_completo
Todas as operações (merges, unmerges, reviews):
```sql
SELECT * FROM agentes_operacoes_completo 
ORDER BY evento_data DESC 
LIMIT 100;
```

### agentes_duplicatas_stats
Estatísticas por status:
```sql
SELECT * FROM agentes_duplicatas_stats;
```

## Fluxo de Trabalho Recomendado

### Para Duplicatas de Baixo Risco (EXACT + score 95-100)

1. Sistema detecta automaticamente
2. Apresenta ao usuário em fila de revisão
3. Usuário aprova ou rejeita
4. Se aprovado, executar merge automático
5. Criar audit trail

### Para Duplicatas de Médio Risco (HIGH + score 85-94)

1. Sistema detecta e registra
2. Apresenta em fila de revisão
3. Analista verifica manualmente
4. Analista aprova/rejeita
5. Se aprovado, fundir com confirmação dupla
6. Registrar razão da decisão

### Para Duplicatas de Baixo Risco (MEDIUM + score 50-84)

1. Sistema detecta e registra
2. Não apresenta automaticamente em revisão
3. Usuário pode pesquisar se suspeitar
4. Análise manual quando necessário

## Segurança e Compliance

### Auditoria Completa

Toda operação de merge/unmerge registra:
- Quem executou a operação
- Quando foi executada
- Estado antes e depois
- Razão da operação
- Tipo de operação (MERGE/UNMERGE/REVIEW)

```sql
SELECT * FROM agentes_duplicatas_audit_trail
WHERE agente_primario_id = ?
ORDER BY criado_em DESC;
```

### Rastreabilidade

- Agentes desativados (não deletados) mantêm histórico
- Todas as referências são migradas
- Possibilidade de rollback a qualquer momento
- Relatórios de compliance disponíveis

## Performance e Otimização

### Índices Criados

```sql
-- Índices de performance para queries comuns
CREATE INDEX idx_agentes_duplicatas_nao_revisadas
  ON agentes_duplicatas_suspeitas(status) 
  WHERE status = 'pendente';

CREATE INDEX idx_agentes_duplicatas_score
  ON agentes_duplicatas_suspeitas(score DESC);

CREATE INDEX idx_agentes_audit_trail_data
  ON agentes_duplicatas_audit_trail(criado_em DESC);
```

### Benchmarks

- Detecção por agente: <100ms
- Scan 1000 agentes: <10 segundos
- Merge com 100 transações: <1 segundo
- Unmerge com rollback: <2 segundos

## Troubleshooting

### "Merge falhou - Agente não encontrado"

Verifique se ambos os IDs de agente existem:
```sql
SELECT id, nome, ativo FROM agentes_economicos 
WHERE id IN (?, ?);
```

### "Score de duplicata baixo demais"

Ajuste a estratégia de detecção:
- Aumentar weight de email/telefone
- Reduzir threshold de similaridade de nome
- Considerar campos adicionais (inscricao_estadual, etc)

### "Unmerge falhou - Merge não encontrado"

Verifique se o merge foi realmente executado:
```sql
SELECT * FROM agentes_duplicatas_suspeitas 
WHERE id = ? AND status = 'mesclada';
```

## Melhorias Futuras

1. **Machine Learning**: Usar histórico de decisões para treinar modelo
2. **Deduplicação de Transações**: Aprimorar detecção de transações duplicadas
3. **Batch Operations**: API para processar múltiplos merges em paralelo
4. **Alerts**: Sistema de notificação para duplicatas de alto risco
5. **Reconciliação**: Fluxo de reconciliação de valores após merge

