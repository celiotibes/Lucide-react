# Painel de Conferência - Sistema de Gestão de Apontamentos

Componente completo para gestão, aprovação e auditoria de apontamentos de prestadores de serviço.

## Estrutura

```
painel-conferencia/
├── PainelConferencia.tsx          # Componente principal com tabs
├── tabs/
│   ├── ApontamentosPendentes.tsx  # Tab de apontamentos
│   ├── FechamentosSemamanais.tsx  # Tab de fechamentos
│   ├── MovimentacoesFinanceiras.tsx  # Tab de movimentações
│   └── ReajusteIPCATab.tsx        # Tab de reajuste IPCA
├── modals/
│   ├── ModalRetificacao.tsx       # Modal para retificar apontamento
│   ├── ModalVisualizacaoApontamento.tsx
│   ├── ModalVisualizacaoFechamento.tsx
│   ├── ModalAprovacaoMovimentacao.tsx
│   ├── ModalPropostaReajuste.tsx
│   └── MemoriaCalculoDetalhada.tsx
└── README.md                       # Esta documentação
```

## Features

### 1. Apontamentos Pendentes
- Visualização de apontamentos com status "enviado" ou que requerem análise
- Filtros por prestador, status, data
- Ações:
  - **Visualizar**: Modal com memória de cálculo completa
  - **Aprovar**: Lança no ledger e muda status
  - **Retificar**: Abre modal de retificação com auditoria
  - **Rejeitar**: Para apontamentos que requerem análise

**Tipos de Apontamentos**:
- Diária (horas × valor)
- Airbnb (quantidade × valor)
- Urgência (minutos × taxa + deslocamento)
- Deslocamento
- Busca de Materiais
- Diária Ajudante

### 2. Fechamentos Semanais
- Visualização de fechamentos por semana
- Breakdown detalhado:
  - Valor bruto
  - Descontos (vale, empréstimo, adiantamento)
  - Valor líquido
- Ações:
  - **Visualizar**: Modal com breakdown completo
  - **Aprovar**: Gera título financeiro no ledger
  - **Gerar Pagamento**: Integração Pluggy para transferência bancária

### 3. Movimentações Financeiras
- Vale, Empréstimo, Adiantamento
- Filtros por tipo, status, data
- Ações:
  - **Aprovar**: Modal com campos de desconto e parcelas (empréstimo)
  - **Rejeitar**: Com motivo

### 4. Reajuste IPCA
- Monitora próximo reajuste (janeiro/julho)
- Notificação automática 15 dias antes
- Proposta de reajuste com:
  - Rubricas: Urgência (R$50, R$62,50), Airbnb (1q/2q), Deslocamentos, Busca Materiais, Diária Ajudante
  - NÃO inclui Combustível (ajuste manual)
  - Memória de cálculo por rubrica
  - Edição manual de valores
- Ações:
  - **Aprovar**: Cria nova vigência
  - **Rejeitar**: Mantém valores atuais
  - **Editar**: Ajustes pontuais antes de aprovar

## Componentes Secundários

### MemoriaCalculoDetalhada
Exibe árvore completa de cálculos com:
- Horários (entrada, intervalo, saída)
- Total de horas
- Componentes por tipo
- Subtotais
- Valor bruto
- Descontos (se houver)
- Valor final

### Modais de Retificação
- Só permite alteração dentro de 1 dia
- Se passou do prazo: "Será marcado para análise manual"
- Auditoria completa dos dados anteriores/novos

## Integração API

### Endpoints Esperados

```typescript
// Apontamentos
GET  /api/apontamentos?prestador_id=&status=&data_inicio=&data_fim=&requer_analise=
PUT  /api/apontamentos/:id/aprovar
PUT  /api/apontamentos/:id/retificar
PUT  /api/apontamentos/:id/rejeitar

// Fechamentos
GET  /api/fechamentos-semanais?prestador_id=&status=&semana_inicio=&semana_fim=
PUT  /api/fechamentos-semanais/:id/aprovar
POST /api/fechamentos-semanais/:id/gerar-pagamento

// Movimentações
GET  /api/movimentacoes?prestador_id=&tipo=&status=&data_inicio=&data_fim=
PUT  /api/movimentacoes/:id/aprovar
PUT  /api/movimentacoes/:id/rejeitar

// Reajuste IPCA
GET  /api/reajuste-ipca/proposta
POST /api/reajuste-ipca/aprovar
POST /api/reajuste-ipca/rejeitar
```

### Headers Necessários
```typescript
"X-API-Key": process.env.REACT_APP_API_KEY
"Content-Type": "application/json"
```

## Auditoria

Cada ação registra:
- `entidade_tipo`: "apontamento" | "fechamento" | "movimentacao" | "reajuste"
- `acao`: "criacao" | "aprovacao" | "retificacao" | "rejeicao" | "edicao"
- `usuario`: ID do usuário que realizou
- `dados_anteriores`: valores antigos
- `dados_novos`: valores novos
- `motivo`: por que foi feita a ação
- `data`: timestamp ISO 8601

## Exemplo de Uso

```tsx
import PainelConferencia from "@/components/painel-conferencia/PainelConferencia";

export default function App() {
  return (
    <PainelConferencia
      usuarioId="gestor-001"
      usuarioNome="João Silva"
    />
  );
}
```

## Variáveis de Ambiente

```env
REACT_APP_API_KEY=sua_chave_api_aqui
```

## Responsividade

- Desktop: Layout completo com 4 colunas de counters
- Tablet: Layout ajustado
- Mobile: Stack vertical (uso limitado, recomenda-se desktop)

## Notificações

O componente principal exibe notificações para:
- Reajuste IPCA chegando (15 dias antes)
- Erros de carregamento
- Status de operações

As notificações podem ser descartadas clicando no ✕.

## Estados de Apontamento

- **rascunho**: Ainda sendo editado pelo prestador
- **enviado**: Pronto para análise do gestor
- **aprovado**: Aprovado e lançado no ledger
- **retificado**: Foi alterado pelo gestor
- **rejeitado**: Rejeitado por análise manual

## Estados de Movimentação

- **solicitado**: Aguardando aprovação
- **aprovado**: Aprovado e pronto para desconto
- **descontado**: Já foi descontado do fechamento
- **pago**: Finalizado
- **rejeitado**: Rejeitado

## Notas Importantes

1. **Prazo de Retificação**: 1 dia após criação. Após esse prazo, será marcado para análise manual.
2. **Combustível**: NÃO é reajustado automaticamente por IPCA. Requer ajuste manual.
3. **Parcelas de Empréstimo**: Máximo 12 meses com possibilidade de adicionar juros.
4. **Ledger**: Cada aprovação de apontamento/fechamento cria lançamento automático.
5. **Pluggy**: Integração com API Pluggy para gerar transferências bancárias.

## Troubleshooting

### Apontamentos não carregam
- Verificar se a API_KEY está correta
- Verificar se o endpoint `/api/apontamentos` existe
- Consultar logs do servidor

### Modais não abrem
- Verificar se os componentes de UI (Dialog, Button, etc) estão importados corretamente
- Verificar se há erros no console

### Cálculos incorretos
- Verificar memória_calculo JSON no banco de dados
- Validar se entrada/saída estão em formato HH:MM
- Verificar intervalo em minutos

## Futuras Melhorias

- [ ] Export para PDF da memória de cálculo
- [ ] Notificações em tempo real via WebSocket
- [ ] Bulk approval de apontamentos
- [ ] Histórico de alterações detalhado
- [ ] Gráficos de produtividade por prestador
- [ ] Integração com SMS/Email para notificações
