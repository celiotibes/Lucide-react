# FASE 3C: IA Assistant - Análise Jurídica com Claude API

**Data de Conclusão:** 4 de julho de 2026  
**Status:** ✅ CONCLUÍDO  
**Linguagem:** Português (BR) | **Modelo:** Claude Opus 4.8

## 🤖 Visão Geral

FASE 3C implementa um assistente IA jurídico inteligente baseado em Claude API que oferece:

- **Geração de Hermenêutica Blindada**: 4 pilares (Ethos, Pathos, Logos, Kairos) automáticos
- **Previsão de Contestações**: Identifica argumentos do réu com probabilidade e resposta preemptiva
- **Blindagem Estratégica**: Sugere reforço de pontos frágeis com documentação
- **Resumo Executivo**: Síntese inteligente de tese, forças, fraquezas e estratégia
- **Modo Offline**: Funciona com mock responses mesmo sem API configurada

## 🏗️ Arquitetura

### Componentes

```
src/
├── services/
│   └── servicoAssistenteIA.ts         (450+ linhas)
├── components/assistant/
│   └── PainelAssistenteIA.tsx         (600+ linhas)
└── .env.example                        (Configuração)
```

### Fluxo de Dados

```
PainelAssistenteIA (Interface)
    ↓
    (Usuário clica em tarefa)
    ↓
ServicoAssistenteIA (Prompts + API)
    ↓
    (Com API configurada)      (Sem API)
    ↓                           ↓
Claude Opus 4.8 API    Mock Responses Padrão
    ↓
Resultado formatado
    ↓
HermenauticaBlindada / ContestacoesPrevistas / BlindagemEstrategica / ResumoExecutivo
```

## 📝 Serviço: servicoAssistenteIA.ts

### Método 1: gerarHermenauticaBlindada()

**Propósito:** Gerar argumentação em 4 pilares (Hermenêutica Blindada)

**Entrada:**
```typescript
fatos: FatoProva[]                        // Fatos do caso
analise: AnalisejurimetricaResult         // Resultado da jurimetria
tituloAcao: string                        // Nome da ação (ex: "Cobrança de Débito")
```

**Saída:**
```typescript
interface PropostaHermenautica {
  ethos: string                          // Argumento de credibilidade
  pathos: string                         // Argumento de justiça/emoção
  logos: string                          // Argumento lógico/silogismo
  kairos: string                         // Argumento de oportunidade/timing
}
```

**Prompt Utilizado:**
```
Você é especialista em estratégia judicial brasileira em Hermenêutica Blindada.
Gere argumentação em 4 pilares para a causa [título].

Fatos: [lista de fatos]
Score: [score jurimetria]/100

1. ETHOS (Credibilidade): [1-2 parágrafos sobre credibilidade das provas]
2. PATHOS (Justiça): [1-2 parágrafos sobre apelo à justiça]
3. LOGOS (Lógica): [Silogismo jurídico: Lei → Fato → Conclusão]
4. KAIROS (Oportunidade): [1-2 parágrafos sobre timing e urgência]

Retorne JSON válido.
```

**Exemplo de Resposta:**
```json
{
  "ethos": "A credibilidade baseia-se em documentos originais datados, assinados pelas partes. Testemunhas idôneas corroboram cada fato alegado.",
  "pathos": "A justiça exige cumprir obrigações livremente assumidas. Negar isto violaria princípios fundamentais.",
  "logos": "Lei contratual estabelece X. Fatos provados demonstram Y. Logo, conclusão Z é inaexpugnável.",
  "kairos": "Tempestividade preserva provas e direitos. A demora causaria dano irreparável."
}
```

### Método 2: preverContestacoes()

**Propósito:** Identificar contestações esperadas com resposta automática

**Entrada:**
```typescript
fatos: FatoProva[]
analise: AnalisejurimetricaResult
teseAutor: string                        // Tese que o autor defende
```

**Saída:**
```typescript
interface ContestacaoEsperada {
  titulo: string                         // Argumento que réu usará
  probabilidade: 'alta' | 'media' | 'baixa'
  descricao: string                      // O que réu pode alegar
  contraproposta: string                 // Nossa resposta (2-3 sentenças)
  citacaoJurisprudencia: string          // Lei/jurisprudência que nos protege
}
```

**Função Cognitiva:**
1. Analisa fatos frágeis (certeza < 50%)
2. Identifica argumentos típicos de defesa
3. Encontra jurisprudência pacífica
4. Monta resposta preemptiva

**Exemplo de Saída:**
```json
[
  {
    "titulo": "Desafio à credibilidade das provas documentais",
    "probabilidade": "media",
    "descricao": "Réu questiona autenticidade dos documentos",
    "contraproposta": "Jurisprudência pacífica reconhece presunção de credibilidade de documentos originais contemporâneos. Ônus de impugnação é do réu.",
    "citacaoJurisprudencia": "STJ Súmula 149: A falsificação deve ser provada por quem a sustenta"
  }
]
```

### Método 3: gerarSugestoesBlindagem()

**Propósito:** Sugerir reforço de pontos frágeis

**Entrada:**
```typescript
fatos: FatoProva[]
analise: AnalisejurimetricaResult
lacunasIdentificadas: any[]              // De analise.lacunas
```

**Saída:**
```typescript
interface SugestaoBlindagem {
  fato: string                           // Fato frágil identificado
  risco: string                          // Por que é risco
  estrategia: string                     // Como reforçar (2-3 sentenças)
  documentacaoSugerida: string[]         // Tipos de documento
}
```

**Exemplo:**
```json
{
  "fato": "Cumprimento parcial da obrigação",
  "risco": "Réu pode alegar impossibilidade de conclusão",
  "estrategia": "Buscar documentos contemporâneos que mostrem execução integral. Testemunhas que viram conclusão. Correspondência que reconheça cumprimento.",
  "documentacaoSugerida": [
    "Documentos originais datados",
    "E-mails de confirmação",
    "Extratos contábeis"
  ]
}
```

### Método 4: gerarResumoExecutivo()

**Propósito:** Sintetizar caso em resumo executivo

**Entrada:**
```typescript
fatos: FatoProva[]
analise: AnalisejurimetricaResult
objetivoAcao: string
```

**Saída:**
```typescript
interface ResumoExecutivoGerado {
  tesecentral: string                    // Uma frase com argumento principal
  pontosFortes: string[]                 // 3-4 pontos fortes
  pontosFrageis: string[]                // 2-3 pontos frágeis
  estrategiaGeral: string                // Abordagem geral (2-3 sentenças)
  chavedeSucesso: string                 // Fator crítico para vencer
}
```

## 💻 Componente: PainelAssistenteIA.tsx

### Interface de Usuário

**Layout:**
```
┌─────────────────────────────────────────┐
│ 🤖 Assistente IA Jurídico               │
│ Análise inteligente com Claude AI       │
├─────────────────────────────────────────┤
│ [Hermenêutica] [Contestações] [etc]    │
├─────────────────────────────────────────┤
│                                         │
│  [Resultado da tarefa selecionada]     │
│                                         │
├─────────────────────────────────────────┤
│ ⚠️ Funciona offline com sugestões padrão
└─────────────────────────────────────────┘
```

### Props

```typescript
interface PainelAssistenteIAProps {
  fatos: FatoProva[]
  analise: AnalisejurimetricaResult | null
  tituloAcao?: string                    // "Cobrança de X reais"
  teseAutor?: string                     // "Fulano é devedor de Beltrano"
  onGenarHermenautica?: (hermenautica: PropostaHermenautica) => void
}
```

### Estados e Eventos

**Estados:**
- `tarefaAtiva`: Qual aba está aberta (hermenautica, contestacoes, blindagem, resumo)
- `tarefas`: Objeto com estado de cada tarefa (carregando, erro, resultado)

**Fluxo:**
1. Usuário clica em botão de tarefa
2. `executarTarefa()` chama `ServicoAssistenteIA.metodo()`
3. Estado muda para `carregando: true`
4. API/Mock responde
5. Resultado exibido em componente específico

## 🔧 Configuração da API

### Modo Offline (Padrão)

✅ **Vantagens:**
- Sem configuração necessária
- Funciona imediatamente
- Mock responses realistas

❌ **Limitações:**
- Respostas genéricas (não customizadas ao caso)
- Sem análise real com IA

### Modo Claude API (Recomendado)

**Passo 1: Obter Chave API**
1. Acesse https://console.anthropic.com
2. Crie conta / faça login
3. Navegue para "API Keys"
4. Clique "Create Key"
5. Copie a chave (começa com `sk-ant-`)

**Passo 2: Configurar Variável de Ambiente**

Copie `.env.example` para `.env.local`:
```bash
cp .env.example .env.local
```

Edite `.env.local`:
```env
VITE_CLAUDE_API_KEY=sk-ant-xxxxx
```

**Passo 3: Reiniciar Dev Server**
```bash
npm run dev
```

**Passo 4: Testar**
1. Abra PainelAssistenteIA
2. Clique em "Hermenêutica Blindada"
3. Aguarde resposta da API (será mais detalhada que mock)

## 📊 Exemplo de Uso Completo

```typescript
import { DashboardAnalytics } from '@/components/analytics/DashboardAnalytics'
import { PainelAssistenteIA } from '@/components/assistant/PainelAssistenteIA'

function MeuComponente() {
  const [fatos, setFatos] = useState<FatoProva[]>([...])
  const [analise, setAnalise] = useState<AnalisejurimetricaResult>({...})

  return (
    <>
      {/* Analytics */}
      <DashboardAnalytics fatos={fatos} analise={analise} />
      
      {/* IA Assistant */}
      <PainelAssistenteIA
        fatos={fatos}
        analise={analise}
        tituloAcao="Cobrança de Débito"
        teseAutor="Réu é devedor de R$ 50.000"
      />
    </>
  )
}
```

## 🔐 Segurança

### API Key

⚠️ **NUNCA commitar .env.local**
- Arquivo está em `.gitignore`
- Contém credenciais sensíveis
- Apenas para desenvolvimento local

**Para produção:**
- Use variáveis de ambiente do servidor
- Implementar backend proxy (não enviar API key ao cliente)
- Usar autenticação OAuth para usuários

### Dados Enviados à API

O que enviamos ao Claude:
- Lista de fatos (descricão, certeza, peso)
- Score jurimetria (número 0-100)
- Título da ação

O que NÃO enviamos:
- Dados pessoais das partes
- Números de processo
- Endereços ou informações identificáveis

## 📈 Performance

**Tempos Esperados:**

| Tarefa | Modo Offline | Com API | Limite |
|--------|--------------|---------|--------|
| Hermenêutica | <100ms | 2-5s | 30s timeout |
| Contestações | <100ms | 3-8s | 30s timeout |
| Blindagem | <100ms | 2-5s | 30s timeout |
| Resumo | <100ms | 2-4s | 30s timeout |

## 🧪 Testes Manual

### Teste 1: Modo Offline

**Passos:**
1. Não configurar VITE_CLAUDE_API_KEY
2. Abrir PainelAssistenteIA
3. Clicar "Hermenêutica Blindada"

**Esperado:**
- Resposta rápida (<100ms)
- Mock response formatada
- Nenhum erro

### Teste 2: Claude API

**Passos:**
1. Configurar VITE_CLAUDE_API_KEY
2. Clicar "Hermenêutica Blindada"
3. Observar tempo de resposta

**Esperado:**
- Resposta dentro de 5 segundos
- Conteúdo customizado ao caso
- 4 pilares bem desenvolvidos

### Teste 3: Tratamento de Erros

**Passos:**
1. Desligar conexão internet
2. Clicar tarefa com API configurada

**Esperado:**
- Fallback para mock (não erro)
- Mensagem informativa

## 🔄 Próximas Fases

### FASE 3D: Python Automation (1-2 semanas)
- Processamento de mídia em lote
- Google Drive sync automática
- Índice semântico para tribunal
- OCR e SHA-256
- Integração Eproc/PJe/Projudi

### FASE 4: Polish & Testing (1-2 semanas)
- E2E testing com petições reais
- Validação com tribunais (TJPR, TJSC, etc)
- Performance optimization
- Documentação final
- Publicação em produção

## 📚 Referências

### Documentação Interna
- `FASE_3A_VISUAL_LAW_EDITOR_PT.md` - Editor com TipTap
- `FASE_3B_VISUAL_ANALYTICS_PT.md` - Gráficos e analytics
- `.env.example` - Configuração de variáveis

### Claude API
- **Docs**: https://docs.anthropic.com
- **Console**: https://console.anthropic.com
- **Modelos**:
  - Claude Opus 4.8 (mais poderoso, mais caro)
  - Claude Sonnet 5 (bom balanço)
  - Claude Haiku 4.5 (rápido, econômico)

### Jurimetria
- **Score**: 0-100 (80+ excelente)
- **TCP**: Taxa de Cobertura Probatória (%)
- **Lacunas**: Riscos identificados

---

**FASE 3C Concluída com Sucesso** ✅  
IA Assistant pronto para análise jurídica avançada com ou sem Claude API.
