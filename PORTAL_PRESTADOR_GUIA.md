# Portal do Prestador - Guia de Uso e Arquitetura

## Visão Geral

O Portal do Prestador é um módulo React para registro de apontamentos diários de trabalho, integrado com agenda/OS pré-existente. Funciona 100% no navegador (SQLite via sql.js) e fornece:

- **Registro de jornada**: Entrada, intervalo, retorno e saída automáticos com botões um-clique
- **Atividades realizadas**: Rubricas (Airbnb, urgência, deslocamento, etc.) com valores
- **Memória de cálculo**: Auditável, com fórmulas por linha
- **Prévia semanal**: Consolidação com envio apenas nas sextas
- **Retificação**: Corrigir horários até o dia seguinte (após isso: aprovação gestor)

---

## Estrutura de Arquivos

```
src/
├── ui/
│   └── portal-prestador/
│       ├── PortalPrestador.tsx          # Componente principal com 3 tabs
│       ├── TabAgenda.tsx                 # Tab: Agenda (demandas do dia)
│       ├── TabApontamentos.tsx           # Tab: Registro de jornada
│       ├── TabPreviaSemanal.tsx          # Tab: Fechamento semanal
│       ├── HorarioAutomatico.tsx         # Captura horário do dispositivo
│       ├── MemoriaCalculo.tsx            # Cálculo auditável de remuneração
│       └── index.ts                      # Exportações
├── domain/
│   ├── types.ts                          # Tipos TypeScript (ApontamentoDiario, etc.)
│   └── apontamentos/
│       └── apontamentoUtils.ts           # Utilitários de domínio
└── db/
    └── connection.ts                     # Acesso ao banco (consultar, executar)

contabilidade-reconstituicao/
└── schema.sql                            # Schema SQLite com tabelas de apontamentos
```

---

## Tipos de Dados

### ApontamentoDiario

```typescript
interface ApontamentoDiario {
  id: number;
  prestador_id: number;
  data: string; // YYYY-MM-DD
  entrada: string; // HH:MM:SS
  saida_intervalo?: string; // HH:MM:SS
  retorno_intervalo?: string; // HH:MM:SS
  saida_final: string; // HH:MM:SS
  status: "rascunho" | "enviado" | "aprovado" | "retificado";
  observacoes?: string;
  criado_em: string; // ISO timestamp
  atualizado_em: string; // ISO timestamp
}
```

### ItemRemunerable

```typescript
interface ItemRemunerable {
  id: number;
  apontamento_id: number;
  tipo: "diaria" | "airbnb" | "urgencia" | "deslocamento" | "materiais" | "extra";
  rubrica: string;
  valor_base: number;
  adicional_percentual: number; // ex: 10 para 10%
  valor_final: number; // valor_base × (1 + adicional_percentual/100)
  observacao?: string;
  criado_em: string;
}
```

---

## Tabelas do Banco de Dados (SQLite)

### apontamentos_diarios
Registro diário de entrada/saída de um prestador.

```sql
CREATE TABLE apontamentos_diarios (
    id INTEGER PRIMARY KEY,
    prestador_id INTEGER NOT NULL REFERENCES prestadores(id),
    data DATE NOT NULL,
    entrada TEXT NOT NULL,
    saida_intervalo TEXT,
    retorno_intervalo TEXT,
    saida_final TEXT NOT NULL,
    status TEXT CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'retificado')),
    observacoes TEXT,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (prestador_id, data)
);
```

### itens_remuneraveis
Rubricas/atividades cobradas por prestador.

```sql
CREATE TABLE itens_remuneraveis (
    id INTEGER PRIMARY KEY,
    apontamento_id INTEGER NOT NULL REFERENCES apontamentos_diarios(id),
    tipo TEXT CHECK (tipo IN ('diaria', 'airbnb', 'urgencia', 'deslocamento', 'materiais', 'extra')),
    rubrica TEXT NOT NULL,
    valor_base REAL NOT NULL,
    adicional_percentual REAL DEFAULT 0,
    valor_final REAL NOT NULL,
    observacao TEXT,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### historico_horarios
Auditoria de eventos de horários (para rastrear retificações).

```sql
CREATE TABLE historico_horarios (
    id INTEGER PRIMARY KEY,
    apontamento_id INTEGER NOT NULL REFERENCES apontamentos_diarios(id),
    tipo_evento TEXT CHECK (tipo_evento IN ('chegada', 'saida_intervalo', 'retorno', 'saida')),
    horario TEXT NOT NULL,
    horario_original TEXT,
    justificativa_retificacao TEXT,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### retificacoes
Registro de correções de apontamentos (com motivo e aprovação).

```sql
CREATE TABLE retificacoes (
    id INTEGER PRIMARY KEY,
    apontamento_id INTEGER NOT NULL REFERENCES apontamentos_diarios(id),
    campo_alterado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_novo TEXT,
    motivo TEXT,
    data_retificacao DATE NOT NULL,
    aprovada_em DATETIME,
    observacao TEXT,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### fechamentos_semanais
Consolidação de apontamentos por semana (para envio de prévia).

```sql
CREATE TABLE fechamentos_semanais (
    id INTEGER PRIMARY KEY,
    prestador_id INTEGER NOT NULL REFERENCES prestadores(id),
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    valor_bruto REAL NOT NULL,
    descontos_total REAL DEFAULT 0,
    valor_liquido REAL NOT NULL,
    status TEXT CHECK (status IN ('aberto', 'fechado', 'aprovado', 'pago')),
    aprovado_em DATETIME,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (prestador_id, data_inicio, data_fim)
);
```

---

## Componentes Principais

### PortalPrestador

Componente raiz. Gerencia:
- Seleção do prestador
- Navegação de mês (anterior/próximo)
- Alternância entre 3 tabs (Agenda, Apontamentos, Prévia Semanal)

**Props:**
```typescript
interface Props {
  aoNavegar?: (aba: string) => void; // Callback para navegação externa
}
```

### TabAgenda

Lista demandas (Ordens de Serviço) agendadas para o dia.

**Mock de dados:** Retorna 2 OS de exemplo (em produção: integração com tabela de demandas).

**Funcionalidade:**
- Mostra título, imóvel, unidade, serviço, prioridade
- Botão "Registrar" abre TabApontamentos com apontamento vinculado

### TabApontamentos

Registro de jornada em 5 seções:

1. **Entrada**: Botão "Cheguei" captura horário_do_dispositivo
2. **Intervalo**: "Iniciar Almoço" (após entrada) → "Retornar do Almoço"
3. **Atividades Realizadas**: Tabela com rubricas (Airbnb, urgência, etc.), valores e checkboxes
4. **Saída Final**: Botão "Encerrar Jornada" → calcula horas e remuneração
5. **Memória de Cálculo**: Exibe fórmulas auditáveis

**Estado:**
- `apontamentoAtual`: Apontamento do dia (se existe)
- `secaoAtiva`: Qual seção está visível
- `horarioCapturado`: Horário do dispositivo em revisão
- `atividades`: Lista de rubricas do dia

**Validação:**
- Sequência cronológica: não avança sem evento anterior
- Não permite saída sem entrada
- Intervalo opcional mas deve ter retorno se iniciado

### TabPreviaSemanal

Consolidação semanal (seg-dom).

**Funcionalidades:**
- KPIs: dias trabalhados, horas totais, faturamento
- Detalhamento por dia (entrada, saída, horas, valor)
- Rubricas aplicadas (totais por tipo)
- Status de envio (rascunho/enviado/aprovado)
- **Botão "Enviar Prévia"**: Apenas sextas-feiras
- Memória de cálculo completa antes de confirmar

**Cálculo de Memória:**
```
Total de horas trabalhadas: Σ(horas_por_dia)
Total de rubricas: Σ(valor_final_por_atividade)
Descontos: (somente se houver registros em movimentacoes_financeiras)
Valor total a receber: Total de rubricas - Descontos
```

### HorarioAutomatico

Componente de captura de horário.

**Workflow:**
1. Usuário clica em "Cheguei" / "Iniciar Almoço" / "Retornar" / "Encerrar"
2. Sistema captura `new Date().toLocaleTimeString("pt-BR", ...)` (horário local do dispositivo)
3. Exibe em card azul com 2 botões: "OK" (confirmar) e "Rejeitar" (tentar novamente)
4. Ao confirmar: registra em `historico_horarios` e atualiza `apontamentos_diarios`

**Segurança:**
- Horário nunca é digitado manualmente (evita erros)
- Sempre há opção de rejeitar e capturar novamente
- Histórico completo para auditoria

### MemoriaCalculo

Tabela de cálculo auditável.

**Conteúdo:**
- Horários: entrada, saída_intervalo, retorno_intervalo, saída_final
- Horas trabalhadas: (saída - entrada) - intervalo
- Rubricas agrupadas por tipo: diária, Airbnb, urgência, etc.
- Cada linha mostra: rubrica, valor_base, adicional%, valor_final
- Total final destacado

**Fórmula por linha:**
```
valor_final = valor_base × (1 + adicional_percentual / 100)
```

---

## Fluxos Principais

### Fluxo 1: Registrar Jornada Diária

```
PortalPrestador
  → TabApontamentos
    1. Botão "Cheguei" → HorarioAutomatico [entrada confirmada]
    2. Botão "Iniciar Almoço" → HorarioAutomatico [saida_intervalo confirmada]
    3. Adicionar atividade → TextInput [rubrica] + Select [tipo] + Input [valor]
       → Botão "+" → ItemRemunerable criado
    4. (Opcional) Botão "Retornar do Almoço" → HorarioAutomatico [retorno_intervalo confirmada]
    5. Botão "Encerrar Jornada" → HorarioAutomatico [saida_final confirmada]
    6. MemoriaCalculo exibe cálculo completo
    7. TextArea [observações] salva automaticamente
    8. Status: "rascunho" até envio na sexta
```

### Fluxo 2: Enviar Prévia Semanal

```
PortalPrestador
  → TabPreviaSemanal (apenas sexta-feira)
    1. Exibe KPIs da semana (dias, horas, faturamento)
    2. Detalhamento por dia
    3. Rubricas totalizadas
    4. MemoriaCalculo da semana
    5. Botão "Enviar Prévia" → Confirma e envia para aprovação
       → Status muda para "enviado"
       → Pode ser retificado apenas por gestor
```

### Fluxo 3: Retificar Horário

```
PortalPrestador
  → Retificacao (componente não implementado, mas há dados no banco)
    1. Usuário clica "Corrigir" em um horário
    2. Modal com: horário_anterior, novo_horario, motivo, autor
    3. Se mesmo dia ou dia+1: permite self-service
    4. Se 2+ dias: requer aprovação do gestor
    5. Cria registro em retificacoes + historico_horarios
```

---

## Funções Utilitárias (apontamentoUtils.ts)

### Criação e Leitura

```typescript
criarApontamento(db, prestadorId, data)
  → Cria novo apontamento vazio para um dia

obterApontamentoCompleto(db, apontamentoId)
  → Retorna apontamento + atividades + histórico + retificações

obterApontamentosPeriodo(db, prestadorId, dataInicio, dataFim)
  → Lista todos os apontamentos de uma semana/mês
```

### Eventos e Atividades

```typescript
registrarEventoHorario(db, apontamentoId, tipoEvento, horario)
  → Registra chegada/saída/intervalo no histórico

adicionarAtividade(db, apontamentoId, tipo, rubrica, valorBase, adicionalPercentual)
  → Cria uma rubrica de trabalho

criarRetificacao(db, apontamentoId, campoAlterado, valorAnterior, valorNovo, motivo)
  → Registra correção com motivo
```

### Cálculos

```typescript
calcularHoras(entrada, saida, saidaIntervalo?, retornoIntervalo?)
  → Horas efetivas de trabalho (arredonda para 0.25h)

calcularHorasEfetivas(apt: ApontamentoDiario)
  → Wrapper que usa os dados do apontamento

validarProgressaoApontamento(apt)
  → Verifica se pode avançar para próximo estágio

podeRetificar(dataApontamento)
  → Permite retificação apenas até +1 dia (após: gestor)
```

---

## Integração com App.tsx

Para adicionar o Portal do Prestador ao menu principal:

```typescript
// Em App.tsx
const PortalPrestadorView = lazy(() => 
  import("./ui/portal-prestador").then((m) => ({ 
    default: m.PortalPrestador 
  }))
);

// Adicionar à lista ABAS:
const ABAS = [
  // ... outras abas
  { 
    id: "portal-prestador" as Aba, 
    rotulo: "Portal Prestador", 
    icone: Clock 
  },
];

// Adicionar type Aba:
type Aba = "dashboard" | "portal-prestador" | // ... outras;

// Renderizar na seção Conteudo():
{aba === "portal-prestador" && <Suspense fallback={...}><PortalPrestadorView/></Suspense>}
```

---

## Boas Práticas

### Segurança e Auditoria
- ✓ Horários nunca são digitados (apenas capturados)
- ✓ Histórico completo de eventos (para rastrear mudanças)
- ✓ Retificações requerem motivo + data limite
- ✓ Statuses progressivos (rascunho → enviado → aprovado)

### UX
- ✓ Mobile-first: 100% responsivo
- ✓ Sequência clara: entrada → intervalo → atividades → saída
- ✓ Validação em tempo real (não deixa avançar sem evento anterior)
- ✓ Memória de cálculo sempre visível (transparência)

### Performance
- ✓ Lazy loading das tabs (render sob demanda)
- ✓ Índices no banco para queries comuns
- ✓ UseMemo/useCallback para evitar re-renders desnecessários

---

## Testes

### Casos de Teste Recomendados

1. **Fluxo básico**: Criar apontamento, registrar entrada/saída, adicionar atividade
2. **Intervalo**: Entrada → Almoço → Retorno → Saída (valida duração)
3. **Múltiplas atividades**: Adicionar 3+ rubricas diferentes, verificar totalizações
4. **Retificação**: Corrigir horário no mesmo dia, verificar histórico
5. **Prévia semanal**: Simular 5 dias completos, enviar apenas sexta-feira
6. **Edge cases**:
   - Sem entrada: botões de intervalo/saída desabilitados
   - Intervalo sem retorno: aviso visual
   - Apontamento rascunho não pode ser enviado via "Enviar Prévia"

---

## Próximas Melhorias (Roadmap)

- [ ] Sincronização com agenda/OS backend
- [ ] Cálculo automático de combustível (km × consumo)
- [ ] Integração com empréstimos (desconto automático de ficha)
- [ ] Notificação semanal (lembrete de envio sexta-feira)
- [ ] Aprovação de gestor (workflow de revisão)
- [ ] Exportação PDF com assinatura digital
- [ ] Histórico de aprovações (dashboard gestor)
- [ ] Semanal automático (fecha segunda sem ação do usuário)
- [ ] QR code para check-in/check-out (in-loco)

---

## Contato e Suporte

Para dúvidas ou problemas:
1. Verifique se o banco está carregando (F12 → Storage → IndexedDB)
2. Teste com dados de demonstração (botão no seletor de prestador)
3. Consulte CLAUDE.md do projeto para contexto completo
