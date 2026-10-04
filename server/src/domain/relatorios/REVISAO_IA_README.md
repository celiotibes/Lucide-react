# Sistema de Revisão Obrigatória por IA

## Visão Geral

Sistema completo para gerenciar revisões obrigatórias de relatórios, campos e lançamentos contábeis. Implementa uma política de revisão que:

- Identifica campos críticos que sempre precisam revisão
- Detecta relatórios sensíveis que exigem autorização antes de publicação
- Monitora mudanças percentuais (thresholds) para disparar revisão automática
- Controla quem pode revisar baseado em papel/permissão
- Mantém fila de revisão com status tracking

## Arquitetura

```
┌─────────────────────────────────────────┐
│     Geração de Relatório                │
│   (relatorio-executivo.ts)              │
└────────────┬────────────────────────────┘
             │
             ├──→ VerificadorRevisaoIA
             │    (relatorio-revisao-integration.ts)
             │    - Verifica política
             │    - Cria itens na fila
             │
             └──→ FilaRevisaoService
                  (fila-revisao-service.ts)
                  - Gerencia fila
                  - Atualiza status
```

## Componentes Principais

### 1. `politicaRevisaoIA.ts` - Definição de Política

Define regras de quando revisão é necessária:

```typescript
// Campos que SEMPRE precisam revisão
CAMPOS_CRITICOS_REVISAO = [
  'lucroLiquido', 'receitaTotal', 'despesaTotal', 'saldoAtual',
  'margemPropriedade', 'inadimplencia', 'taxaOcupacao'
]

// Relatórios sensíveis
RELATORIOS_SENSVEIS = [
  'relatorios/executivo', 'relatorios/dre', 
  'relatorios/fluxo-caixa', 'relatorios/margens'
]

// Papéis que PODEM revisar
PAPEIS_COM_PODER_REVISAO = [
  'administrador', 'auditor', 'supervisor'
]

// Papéis que NÃO podem revisar
PAPEIS_SEM_PODER_REVISAO = [
  'usuario_operacional', 'prestador'
]

// Thresholds - disparam revisão automaticamente
THRESHOLDS_REVISAO = [
  {
    percentualMudanca: 10,
    aplicaA: ['receitaTotal', 'despesaTotal', 'lucroLiquido'],
    motivo: 'mudanca_drástica'
  },
  // ... mais thresholds
]
```

**Exporta interface compartilhável para UI:**
```typescript
const politica = obterPoliticaAtual();
// Retorna: PoliticaRevisaoIA com todas as configurações
```

### 2. `fila-revisao-service.ts` - Gerenciamento da Fila

Serviço para operações CRUD na fila de revisão:

```typescript
const filaService = criarFilaRevisaoService(db);

// Criar item
const item = filaService.criarItemRevisao({
  documentoId: 'rel-executivo-123',
  tipo: 'relatorio',
  motivo: 'threshold_exceeded',
  solicitanteId: 'user-456',
  status: 'pendente'
});

// Listar pendentes
const pendentes = filaService.obterPendentes(limit, offset);

// Obter por documento
const itens = filaService.obterPorDocumento('rel-123');

// Verificar pendências
if (filaService.temPendencias('rel-123')) {
  // Bloquear publicação
}

// Revisar/autorizar
filaService.marcarRevisado(itemId, revisorId, 'autorizado');

// Rejeitar
filaService.rejeitarRevisao(itemId, revisorId, 'Motivo da rejeição');

// Estatísticas
const stats = filaService.obterEstatisticas();
```

### 3. `relatorio-revisao-integration.ts` - Integração com Relatórios

Integra verificação de política com workflow de geração:

```typescript
const verificador = criarVerificadorRevisaoIA({ db, filaService });

// Após gerar relatório
const resultado = await verificador.verificarRelatorio({
  documentoId: 'rel-exec-10-2026',
  tipoRelatorio: 'relatorios/executivo',
  dadosAntigos: relatorioAnterior,
  dadosNovos: relatorioNovo,
  usuarioId: usuario.id
});

// Verifica:
// - Se relatório é sensível
// - Se campos críticos foram alterados
// - Se thresholds foram excedidos

if (resultado.precisaRevisao) {
  // Cria itens na fila automaticamente
  console.log('Itens criados:', resultado.itemsCriados);
  console.log('Motivos:', resultado.motivos);
}

// Validar publicação
const validacao = verificador.validarPublicacao('rel-123');
if (!validacao.permitido) {
  throw new Error(validacao.motivo);
}
```

### 4. `migrations-phase16-revisao-ia.sql` - Esquema de Banco

Cria duas tabelas:

**`fila_revisao_ia`** - Fila principal
```sql
CREATE TABLE fila_revisao_ia (
  id TEXT PRIMARY KEY,
  documento_id TEXT,
  tipo TEXT CHECK(tipo IN ('relatorio', 'campo', 'lancamento')),
  motivo TEXT CHECK(motivo IN (...)),
  solicitante_id TEXT,
  revisor_id TEXT,
  status TEXT DEFAULT 'pendente',
  descricao TEXT,
  dados_adicionais TEXT,  -- JSON
  data_criacao DATETIME,
  data_revisao DATETIME,
  motivo_rejeicao TEXT
)
```

**`regras_revisao_ia`** - Configuração de regras (para futuro)
```sql
CREATE TABLE regras_revisao_ia (
  id TEXT PRIMARY KEY,
  nome TEXT UNIQUE,
  tipo TEXT,
  ativa BOOLEAN,
  alvos TEXT,      -- JSON array
  threshold TEXT,  -- JSON
  ...
)
```

## Endpoints da API

### GET `/api/revisao-ia/fila`
Lista itens pendentes com paginação
```json
{
  "sucesso": true,
  "itens": [...],
  "paginacao": { "limit": 50, "offset": 0, "total": 5 }
}
```

### GET `/api/revisao-ia/fila/:id`
Obtém um item específico
```json
{
  "sucesso": true,
  "item": { "id": "...", "status": "pendente", ... }
}
```

### GET `/api/revisao-ia/politica`
Retorna política de revisão (para exibir na UI)
```json
{
  "sucesso": true,
  "politica": {
    "versao": "1.0.0",
    "camposCriticos": [...],
    "relatoriosSensveis": [...],
    ...
  }
}
```

### GET `/api/revisao-ia/documento/:documentoId`
Itens de revisão para um documento
```json
{
  "sucesso": true,
  "itens": [...],
  "temPendencias": true
}
```

### GET `/api/revisao-ia/estatisticas`
Estatísticas da fila
```json
{
  "sucesso": true,
  "estatisticas": {
    "totalPendente": 5,
    "totalRevisado": 12,
    "totalRejeitado": 2,
    "porTipo": { "relatorio": 3, "campo": 2, "lancamento": 0 }
  }
}
```

### POST `/api/revisao-ia/:id/revisar`
Marca item como revisado/autorizado
```json
{
  "sucesso": true,
  "item": { ... },
  "mensagem": "Item marcado como revisado"
}
```

### POST `/api/revisao-ia/:id/rejeitar`
Rejeita um item
```json
{
  "status": 400,
  "erro": "Você não tem permissão para revisar itens"
}
```

### POST `/api/revisao-ia/criar`
Cria novo item na fila (interno/system)
```json
{
  "sucesso": true,
  "item": { ... }
}
```

## Componentes React

### `RevisaoAISelector.tsx`
Modal para gerenciar revisões de um documento:

```tsx
<RevisaoAISelector
  isOpen={showRevisao}
  documentoId="rel-123"
  tipoDocumento="relatorio"
  camposARevisar={['receitaTotal', 'lucroLiquido']}
  motivoRevisao="threshold_exceeded"
  onClose={() => setShowRevisao(false)}
  onAutorizar={(resultado) => handleAutorizar(resultado)}
  onRejeitar={(resultado) => handleRejeitar(resultado)}
/>
```

Mostra:
- Status de revisão de cada item
- Botões para autorizar/rejeitar
- Motivo da rejeição (se rejeitado)

### `FilaRevisaoDashboard.tsx`
Dashboard compacto mostrando resumo da fila:

```tsx
<FilaRevisaoDashboard
  compact={true}
  onItemClick={(item) => abrirDetalhe(item)}
/>
```

Mostra:
- Contagem de pendentes/revisados/rejeitados
- Lista dos 10 itens mais recentes
- Filtros por status

### Hook `useRevisaoIA.ts`

```typescript
const {
  itens,
  politica,
  estatisticas,
  loading,
  carregarPendentes,
  carregarPolitica,
  autorizarItem,
  rejeitarItem,
  temPendencias,
  verificarRevisaoNecessaria
} = useRevisaoIA();
```

## Workflow Integrado

### 1. Geração de Relatório
```typescript
router.post('/relatorios/executivo/gerar', async (req, res) => {
  // Gerar relatório
  const relatorioNovo = gerarRelatorio(...);
  
  // Verificar política
  const verificador = criarVerificadorRevisaoIA({ db, filaService });
  const resultado = await verificador.verificarRelatorio({
    documentoId: `rel-exec-${mes}-${ano}`,
    tipoRelatorio: 'relatorios/executivo',
    dadosAntigos: relatorioAnterior,
    dadosNovos: relatorioNovo,
    usuarioId: usuario.id
  });

  if (resultado.precisaRevisao) {
    return res.json({
      sucesso: true,
      aviso: 'Relatório criado mas precisa revisão',
      revisoesNecessarias: resultado.itemsCriados,
      relatorio: relatorioNovo
    });
  }

  return res.json({ sucesso: true, relatorio: relatorioNovo });
});
```

### 2. Publicação de Relatório
```typescript
router.post('/relatorios/:id/publicar', async (req, res) => {
  const verificador = criarVerificadorRevisaoIA({ db, filaService });
  
  // Validar que não há pendências
  const validacao = verificador.validarPublicacao(documentoId);
  if (!validacao.permitido) {
    return res.status(403).json({ erro: validacao.motivo });
  }

  // Publicar
  publicarRelatorio(documentoId);
  return res.json({ sucesso: true });
});
```

### 3. Revisão de Item
```typescript
router.post('/revisao-ia/:id/revisar', async (req, res) => {
  // Validar permissão
  if (!papelPodeRevisar(usuarioRole)) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  // Autorizar
  const item = filaService.marcarRevisado(id, usuarioId, 'autorizado');
  
  return res.json({ sucesso: true, item });
});
```

## Testes

Arquivo: `__tests__/politica-revisao-ia.test.ts`

Cobre:
- Detecção de campos críticos
- Identificação de relatórios sensíveis
- Validação de papéis
- Cálculo de mudanças de threshold
- Exportação de política

Execute com:
```bash
npm test -- politica-revisao-ia.test.ts
```

## Inicialização do Banco

Para aplicar a migração:

1. Coloque a migração no diretório de migrações
2. Execute o script de migração:
   ```bash
   sqlite3 database.db < migrations-phase16-revisao-ia.sql
   ```

3. Verifique as tabelas:
   ```sql
   SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fila_revisao%';
   ```

## Exemplo de Integração Completa

```typescript
// server/src/index.ts
import { criarRotasRevisaoIA } from './routes/revisao-ia-routes.js';

// ... após setup de DB e auth service
app.use('/api/revisao-ia', criarRotasRevisaoIA({ 
  authService, 
  db 
}));

// Integrar verificador em rota de geração
import { criarVerificadorRevisaoIA } from './domain/relatorios/relatorio-revisao-integration.js';
import { criarFilaRevisaoService } from './domain/relatorios/fila-revisao-service.js';

app.post('/api/relatorios/executivo/gerar', async (req, res) => {
  const filaService = criarFilaRevisaoService(db);
  const verificador = criarVerificadorRevisaoIA({ db, filaService });
  
  // ... lógica existente
  
  const resultado = await verificador.verificarRelatorio({
    documentoId: `rel-exec-${mes}-${ano}`,
    tipoRelatorio: 'relatorios/executivo',
    dadosAntigos: relatorioAnterior,
    dadosNovos: relatorioNovo,
    usuarioId: usuario.id
  });
  
  // ... responder com aviso se houver revisões necessárias
});
```

```tsx
// client/src/pages/RelatorioExecutivo.tsx
import { RevisaoAISelector } from '../components/RevisaoAISelector.js';
import { useRevisaoIA } from '../hooks/useRevisaoIA.js';

export function RelatorioExecutivoPage() {
  const [showRevisao, setShowRevisao] = useState(false);
  const { carregarPorDocumento, autorizarItem } = useRevisaoIA();

  const handlePublicar = async () => {
    // Verificar pendências
    const itens = await carregarPorDocumento(relatorioId);
    if (itens.some(i => i.status === 'pendente')) {
      setShowRevisao(true);
      return;
    }

    // Publicar
    await publicar();
  };

  return (
    <>
      <button onClick={handlePublicar}>Publicar</button>

      <RevisaoAISelector
        isOpen={showRevisao}
        documentoId={relatorioId}
        tipoDocumento="relatorio"
        onClose={() => setShowRevisao(false)}
        onAutorizar={() => handlePublicar()}
      />
    </>
  );
}
```

## Notas de Implementação

- **Idempotência**: Evita duplicatas na fila usando UNIQUE constraint
- **Audit Trail**: Cada ação é registrada com timestamps e IDs de usuário
- **Performance**: Índices em queries frequentes (status, documento, revisor)
- **Segurança**: Validação de permissão por papel em cada revisão
- **Escalabilidade**: Cache em memória para pendências com invalidação
- **Configurabilidade**: Política é carregável em runtime (pronto para BD futuro)

## Próximos Passos

1. Integrar rotina de limpeza de dados históricos
2. Adicionar notificações por email quando item precisa revisão
3. Dashboard de métricas (tempo médio de revisão, taxa de rejeição)
4. Movimentação de regras para BD (permite edição via UI)
5. Aprovação em cascata (múltiplos revisores)
