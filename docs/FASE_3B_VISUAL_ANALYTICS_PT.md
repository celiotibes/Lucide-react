# FASE 3B: Visual Analytics - Análise Avançada de Dados Jurimetria

**Data de Conclusão:** 4 de julho de 2026  
**Status:** ✅ CONCLUÍDO  
**Linguagem:** Português (BR)

## 📊 Visão Geral

FASE 3B implementa um conjunto completo de visualizações analíticas para análise avançada de dados jurimetria. O sistema oferece:

- **Gráfico de Correlação**: Visualiza impacto de cada fato no score total
- **Heat Map de Lacunas**: Mostra distribuição visual de riscos probatórios
- **Timeline Interativa**: Cronologia de eventos do caso com associação a fatos
- **Dashboard Consolidado**: Integra todas as visualizações com resumo executivo
- **Recomendações Inteligentes**: Sugestões baseadas em análise automática

## 🏗️ Arquitetura

### Componentes Criados

```
src/components/analytics/
├── GraficoCorrelacao.tsx      (350+ linhas)
├── HeatmapLacunas.tsx         (350+ linhas)
├── TimelineEventos.tsx         (450+ linhas)
└── DashboardAnalytics.tsx      (550+ linhas)
```

### Fluxo de Dados

```
FatoProva[] + AnalisejurimetricaResult
    ↓
┌─────────────────────────────────────┐
│   DashboardAnalytics (Orquestrador) │
├─────────────────────────────────────┤
│ • GraficoCorrelacao (Correlação)   │
│ • HeatmapLacunas (Riscos)          │
│ • TimelineEventos (Cronologia)     │
│ • ResumoExecutivo (Sintetização)   │
└─────────────────────────────────────┘
    ↓
Recomendações + Insights + Export
```

## 📈 Componentes Detalhados

### 1. GraficoCorrelacao.tsx

**Propósito:** Visualizar correlação entre fatos e impacto no score jurimetria total.

**Características:**
- Gráfico SVG com barras por fato
- Cores por força probatória (verde/amarelo/vermelho)
- Altura das barras representa impacto (%)
- Grid de referência (25%, 50%, 75%, 100%)
- Hover interativo (aumento de opacidade)

**Fórmula de Impacto:**
```
Impacto = (Certeza × Peso) / Número de Fatos
Exemplo: (90% × 3) / 5 = 54% de impacto
```

**Dados de Saída:**
```
- Total de Fatos
- Impacto Médio
- Fato com Maior Impacto
- Impacto de cada fato (%)
```

**Props:**
```typescript
interface GraficoCorrelacaoProps {
  fatos: FatoProva[]
  analise: AnalisejurimetricaResult | null
  largura?: number  // 600px padrão
  altura?: number   // 400px padrão
}
```

### 2. HeatmapLacunas.tsx

**Propósito:** Visualizar distribuição espacial de riscos e lacunas probatórias.

**Características:**
- Mapa de calor com células SVG
- Intensidade visual (0-100%)
- Cores por nível de risco: Verde → Amarelo → Vermelho → Crítico
- Legenda de escala
- Detalhes de cada lacuna com sugestões

**Níveis de Risco:**
| Nível | Cor | Intensidade | Ação |
|-------|-----|------------|------|
| Crítico | Vermelho (#D32F2F) | 100% | Intervenção imediata |
| Alto | Vermelho (#C41E3A) | 70% | Intervenção urgente |
| Moderado | Amarelo (#FFC107) | 40% | Monitoramento |
| Baixo | Verde (#2E7D32) | 20% | Acompanhamento |

**Dados de Saída:**
```
- Contagem por nível de risco
- Descrição de cada lacuna
- Sugestão de blindagem para cada risco
```

**Props:**
```typescript
interface HeatmapLacunasProps {
  analise: AnalisejurimetricaResult | null
  largura?: number  // 800px padrão
  altura?: number   // 300px padrão
}
```

### 3. TimelineEventos.tsx

**Propósito:** Visualizar cronologia de eventos do caso com associação a fatos probatórios.

**Características:**
- Timeline vertical interativa
- 6 tipos de evento: Contrato, Comunicação, Testemunha, Documento, Ação, Marco
- Ícones e cores por tipo
- Associação a fatos probatórios
- Formulário para adicionar novos eventos
- Filtro por importância (alta/média/baixa)

**Tipos de Evento:**
```typescript
type TipoEvento = 'contrato' | 'comunicacao' | 'testemunha' | 'documento' | 'acao' | 'marco'
```

**Estrutura de Evento:**
```typescript
interface EventoCaso {
  id: string                    // ID único
  data: string                  // YYYY-MM-DD
  titulo: string                // Nome do evento
  descricao: string             // Detalhes
  tipo: TipoEvento             // Tipo (6 opções)
  fatoAssociado?: string        // Link a FatoProva.id
  importancia: 'alta' | 'media' | 'baixa'
}
```

**Props:**
```typescript
interface TimelineEventosProps {
  fatos: FatoProva[]
  eventos?: EventoCaso[]
  onAdicionarEvento?: (evento: EventoCaso) => void
}
```

### 4. DashboardAnalytics.tsx

**Propósito:** Orquestrador central que integra todas as visualizações com resumo executivo.

**Características:**
- 4 abas de navegação: Resumo, Correlação, Heat Map, Timeline
- 4 cartões de métricas principais
- Análise de distribuição de fatos por força
- Cronologia de eventos
- Recomendações inteligentes
- Export para JSON
- Função de impressão

**Resumo Executivo - Cartões de Métricas:**

1. **Score Jurimetria** (0-100)
   - Excelente: ≥80 (Verde)
   - Bom: 60-80 (Azul)
   - Moderado: 40-60 (Amarelo)
   - Crítico: <40 (Vermelho)

2. **Taxa de Cobertura Probatória (TCP)** (%)
   - % de fatos com prova
   - Objetivo: 100%

3. **Certeza Média** (%)
   - Força média de prova
   - Baseado em grauCerteza ponderado

4. **Lacunas Identificadas**
   - Contagem de riscos detectados
   - Link para heat map

**Recomendações Automáticas:**
- Se Score < 50: "Score crítico. Reforce provas em fatos frágeis."
- Se Lacunas > 0: "X lacuna(s) identificada(s). Consulte heat map."
- Se TCP < 100: "Taxa de cobertura em Y%. Alguns fatos carecem de prova."
- Se Fatos frágeis > 0: "X fato(s) com prova frágil. Fortaleça antes do recurso."
- Se Score ≥ 80: "✓ Caso com força probatória excelente. Pronto para fase de hermenêutica blindada."

**Props:**
```typescript
interface DashboardAnalyticsProps {
  fatos: FatoProva[]
  analise: AnalisejurimetricaResult | null
  onExportarDados?: (dados: any) => void
}
```

## 💻 Integração na Aplicação

Para integrar o Dashboard na interface principal:

```typescript
import { DashboardAnalytics } from '@/components/analytics/DashboardAnalytics'

function MeuComponente() {
  const [fatos, setFatos] = useState<FatoProva[]>([])
  const [analise, setAnalise] = useState<AnalisejurimetricaResult | null>(null)

  return (
    <DashboardAnalytics
      fatos={fatos}
      analise={analise}
      onExportarDados={(dados) => console.log('Exportado:', dados)}
    />
  )
}
```

## 📊 Formatos de Exportação

### JSON Export
```json
{
  "dataExportacao": "2026-07-04T15:30:00Z",
  "resumo": {
    "totalFatos": 5,
    "scoreJurimetria": 78,
    "tcp": 100,
    "certezaMedia": 82,
    "lacunas": 1
  },
  "fatos": [...],
  "analise": {...},
  "eventos": [...]
}
```

### Print Format
- Otimizado para impressão A4
- Remove elementos de navegação
- Mantém cores (quando impressora a cores)
- Quebras de página automáticas

## 🧪 Testes Manual

### Teste 1: Gráfico de Correlação

**Passos:**
1. Adicionar 3 fatos com certezas diferentes (90%, 65%, 30%)
2. Definir pesos diferentes (peso 3, 2, 1)
3. Observar alturas das barras

**Esperado:**
- Altura proporcional ao impacto (certeza × peso)
- Cores corretas por força
- Hover aumenta opacidade

### Teste 2: Heat Map de Lacunas

**Passos:**
1. Analisar caso com lacunas identificadas
2. Observar intensidade das células

**Esperado:**
- Cores gradualmente mais intensas para risco maior
- Resumo de contagem por nível
- Lista de sugestões por lacuna

### Teste 3: Timeline

**Passos:**
1. Adicionar 3 eventos (data, tipo, importância)
2. Associar eventos a fatos
3. Observar ordenação cronológica

**Esperado:**
- Eventos ordenados por data
- Ícones corretos por tipo
- Cores por importância
- Associação visível a fatos

### Teste 4: Dashboard Completo

**Passos:**
1. Abrir DashboardAnalytics
2. Navegar por cada aba
3. Clicar Export JSON
4. Clicar Imprimir

**Esperado:**
- Abas funcionam sem reload
- JSON válido baixado
- Impressão legível

## 🎨 Paleta de Cores Analytics

```
Força Probatória:
- Alta (80%+):      #2E7D32 (Verde)
- Moderada (50-80%): #FFC107 (Amarelo)
- Frágil (<50%):     #D32F2F (Vermelho)

Impacto:
- Crítico:          #D32F2F (Vermelho escuro)
- Alto:             #C41E3A (Vermelho médio)
- Moderado:         #FFC107 (Amarelo)
- Baixo:            #2E7D32 (Verde)

Neutras:
- Primário:         #1A3A52 (Azul)
- Fundo:            #F9F9F9 (Cinza)
- Borda:            #CCCCCC (Cinza)
```

## 📋 Checklist de Qualidade

- [ ] GraficoCorrelacao renderiza SVG sem erros
- [ ] HeatmapLacunas mostra intensidade correta
- [ ] TimelineEventos ordena eventos cronologicamente
- [ ] DashboardAnalytics navega entre abas
- [ ] Export JSON contém todos os dados
- [ ] Impressão remove elementos UI
- [ ] Recomendações aparecem baseadas em análise
- [ ] Cores respeitam paleta CNJ
- [ ] Responsivo em 1280px+
- [ ] Acessibilidade: labels, alt text

## 🔄 Próximas Fases

### FASE 3C: IA Assistant (2 semanas)
- Integração Claude API
- Sugestão automática de hermenêutica blindada
- Geração de resumo executivo
- Predictor de contestações esperadas
- Blindagem preemptiva com IA

### FASE 3D: Python Automation (1-2 semanas)
- Processamento de mídia em lote
- Google Drive sync automática
- Índice semântico para tribunal
- OCR e verificação SHA-256
- Integração com Eproc/PJe/Projudi

### FASE 4: Polish & Testing (1-2 semanas)
- E2E testing com petições reais
- Validação com tribunais
- Performance optimization
- Documentação final
- Publicação produção

## 📚 Referências

### Documentação Interna
- `FASE_3A_VISUAL_LAW_EDITOR_PT.md` - Editor com TipTap
- `docs/GUIA_IMPLEMENTACAO_FASE_2.5_PT.md` - Jurimetria
- `docs/FASE_2_5_MEDIA_OPTIMIZATION_PT.md` - Mídia

### Conceitos Jurídicos
- **TCP (Taxa de Cobertura Probatória)**: % de fatos com prova
- **Score Jurimetria**: Métrica de saúde geral (0-100)
- **Lacunas**: Riscos identificados na prova
- **Hermenêutica Blindada**: 4 pilares (Ethos, Pathos, Logos, Kairos)

## 🔐 Segurança

- JSON export não contém dados sensíveis
- Timeline pode ter eventos sem fatos associados
- Validação de datas em formato ISO 8601
- Sem armazenamento local sem consentimento

---

**FASE 3B Concluída com Sucesso** ✅  
Visual Analytics pronto para análise avançada de dados jurimetria.
