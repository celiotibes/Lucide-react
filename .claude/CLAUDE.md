# Lucide-react: Plataforma de Pesquisa Jurídica, Contábil e Acadêmica

## 📋 Visão Geral

Lucide-react é uma plataforma integrada de pesquisa e análise para profissionais das áreas jurídica, contábil, acadêmica e imobiliária. Combina:

- **Legal Data Hunter**: 230+ jurisdições, pesquisa jurídica avançada (legislação, jurisprudência, doutrinas)
- **PubMed**: Pesquisa de artigos científicos e acadêmicos
- **Google Drive/Gmail**: Integração de documentos e referências
- **Análises avançadas**: Crítica de petições, detecção de falhas estratégicas, simulação de contra-argumentos

## 🛠️ Stack Tecnológico

```
Frontend: React 19.2.4 + TypeScript 5.9.3 + Vite 7.3.1
Styling: CSS3 (responsive, light/dark mode)
State: React Context + Custom Hooks
Dev Tools: ESLint 9.39.2, TypeScript type checking
```

## 📦 Estrutura de Diretórios

```
/home/user/Lucide-react/
├── .claude/                          # ← Configuração Claude Code (NOVO)
│   ├── CLAUDE.md                     # Este arquivo
│   ├── settings.json                 # Config Claude Code (MCP, skills, plugins)
│   ├── plugins.json                  # Definição de plugins
│   └── mcp/                          # MCP Server configurations
│       ├── legal-data-hunter.json
│       ├── pubmed.json
│       └── google-drive.json
│
├── src/
│   ├── App.tsx                       # Entry point da aplicação
│   ├── main.tsx                      # React bootstrap
│   ├── index.css                     # Estilos globais
│   ├── App.css                       # Estilos App
│   ├── assets/                       # Imagens e ícones
│   │
│   ├── components/                   # ← React Components (NOVO)
│   │   ├── research/
│   │   │   ├── LegalResearch.tsx
│   │   │   ├── AcademicResearch.tsx
│   │   │   ├── AccountingResearch.tsx
│   │   │   └── ResearchHub.tsx       # Hub principal
│   │   ├── integration/
│   │   │   ├── GoogleDriveViewer.tsx
│   │   │   └── SlackNotifier.tsx
│   │   └── common/
│   │       ├── SearchBar.tsx
│   │       ├── ResultCard.tsx
│   │       └── LoadingSpinner.tsx
│   │
│   ├── services/                     # ← API Clients (NOVO)
│   │   ├── legalDataHunter.ts
│   │   ├── pubmedClient.ts
│   │   ├── accountingClient.ts
│   │   └── claudeCodeBridge.ts
│   │
│   ├── hooks/                        # ← Custom Hooks (NOVO)
│   │   ├── useLegalSearch.ts
│   │   ├── useAcademicSearch.ts
│   │   ├── useAccountingData.ts
│   │   └── useMcpTools.ts
│   │
│   ├── types/                        # ← TypeScript Interfaces (NOVO)
│   │   ├── legal.ts
│   │   ├── academic.ts
│   │   ├── accounting.ts
│   │   └── mcp.ts
│   │
│   ├── store/                        # ← State Management (NOVO)
│   │   ├── searchStore.ts
│   │   ├── resultsStore.ts
│   │   └── favoritesStore.ts
│   │
│   └── utils/                        # ← Utilities (NOVO)
│       ├── citation.ts
│       ├── formatting.ts
│       └── validators.ts
│
├── docs/                             # ← Documentação técnica (NOVO)
│   ├── ARCHITECTURE.md
│   ├── MCP_CONFIGURATION.md
│   └── API_INTEGRATION.md
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
└── .gitignore
```

## 🔌 Integração MCP Servers

### Legal Data Hunter
Pesquisa jurídica multi-jurisdicional com 230+ jurisdições.

**Recursos:**
- Busca de legislação (statutes, regulations, guidance)
- Pesquisa de jurisprudência (case law, court decisions)
- Doutrinas e análises jurídicas
- Análise comparativa entre jurisdições
- **Análise crítica de documentos** (detecção de falhas em petições, contra-argumentos, blindagem estratégica)

**Configuração:** `.claude/mcp/legal-data-hunter.json`

**Jurisdições principais:** BR (Brasil), US (USA), EU (Europa), GB (UK), CA (Canadá), AU (Austrália)

**Exemplo de uso no Claude Code:**
```
/legal-research "Analise esta petição para falhas de estratégia processual"
/legal-research "Compare legislação imobiliária entre Brasil e Portugal"
```

### PubMed
Pesquisa de artigos científicos em MEDLINE, PubMed Central e EMBASE.

**Recursos:**
- Busca de artigos acadêmicos
- Metadados completos (autores, journal, data, citações)
- Artigos relacionados
- Análise de citações

**Configuração:** `.claude/mcp/pubmed.json`

**Exemplo de uso no Claude Code:**
```
/academic-search "Pesquise artigos sobre compliance fiscal e IRPF"
/academic-search "Encontre meta-análises sobre direito tributário"
```

### Google Drive
Armazenamento e gestão de documentos.

**Recursos:**
- Upload de documentos jurídicos
- Busca de arquivos
- Compartilhamento de resultados
- Sincronização de pesquisa

**Configuração:** `.claude/mcp/google-drive.json`

### Gmail
Leitura e gerenciamento de email (opcional).

**Recursos:**
- Importar referências de email
- Notificações de pesquisa
- Exportar resultados

## 📚 Skills Disponíveis

### legal-research
Pesquisa jurídica com análise crítica.

**Comandos:**
```bash
/legal-research "search query"
/legal-research "analyze-petition" < document.pdf
/legal-research "compare-jurisdictions" "topic" "BR" "US"
/legal-research "strategic-blindage" < petition.docx
```

### accounting-analysis
Análise contábil, fiscal e de conformidade.

```bash
/accounting-analysis "IRPF 2024 regulations"
/accounting-analysis "NF-e validation"
/accounting-analysis "audit-trail" < financials.csv
```

### academic-search
Pesquisa acadêmica com formatação de citações.

```bash
/academic-search "machine learning in law"
/academic-search "cite-format" "APA" < article.txt
```

## 🔧 Configuração para Desenvolvimento

### Variáveis de Ambiente

Criar arquivo `.env.local` na raiz do projeto:

```env
# APIs
VITE_LEGAL_DATA_HUNTER_API_KEY=your_api_key
VITE_PUBMED_API_KEY=optional
VITE_GOOGLE_DRIVE_API_KEY=your_oauth_key

# Claude Code
CLAUDE_CODE_ENVIRONMENT=development
```

### Scripts Disponíveis

```bash
npm run dev       # Dev server (http://localhost:5173)
npm run build     # Build + TypeScript type check
npm run lint      # ESLint validation
npm run preview   # Preview da build
```

## 🧪 Desenvolvimento e Testes

### Iniciar Dev Server

```bash
npm run dev
```

Acesse http://localhost:5173 e você verá:
- ResearchHub com 3 tabs (Jurídico, Acadêmico, Contábil)
- SearchBar integrado em cada tab
- Resultados em tempo real

### Validar Tipos TypeScript

```bash
npm run build
```

Valida todos os types antes de fazer build.

### Rodar Linter

```bash
npm run lint
```

Garante código limpo e sem erros.

### Testar no Claude Code

```bash
/legal-research "test query"
/code-review  # Review de código
/verify       # Verificar implementação
```

## 📖 Padrões de Código

### Services

Padrão Client para cada fonte:

```typescript
// src/services/legalDataHunter.ts
export class LegalDataHunterClient {
  async search(query: LegalQuery): Promise<LegalResult[]> { }
  async analyzePetition(document: File): Promise<PetitionAnalysis> { }
  async compareJurisdictions(topic: string, jurs: string[]): Promise<Comparison> { }
}
```

### Hooks

Padrão com loading/error:

```typescript
// src/hooks/useLegalSearch.ts
export function useLegalSearch() {
  const [results, setResults] = useState<LegalResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const search = useCallback(async (query: LegalQuery) => { }, [])
  
  return { results, loading, error, search }
}
```

### Components

Padrão de componentes reutilizáveis:

```typescript
// src/components/research/LegalResearch.tsx
export function LegalResearch() {
  const { results, loading, error, search } = useLegalSearch()
  
  return (
    <div className="legal-research">
      <SearchBar onSearch={search} />
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      <ResultsList results={results} />
    </div>
  )
}
```

## 🔐 Segurança

- Não commit de `.env.local` (está em `.gitignore`)
- Autenticação OAuth 2.0 para Google Drive
- API keys em variáveis de ambiente
- CORS habilitado apenas para APIs conhecidas
- Rate limiting para PubMed (3 req/sec)

## 📚 Referências

- **Legal Data Hunter**: https://legaldatahunter.com
- **PubMed API**: https://www.ncbi.nlm.nih.gov/pmc/tools/developers/
- **Google Drive API**: https://developers.google.com/drive
- **React 19**: https://react.dev
- **Vite**: https://vitejs.dev
- **TypeScript**: https://www.typescriptlang.org

## 🚀 Próximos Passos

1. ✅ Configuração Claude Code (FASE 1A)
2. 🔄 Criar tipos TypeScript (FASE 1B)
3. 🔄 Implementar Services (FASE 2A)
4. 🔄 Criar Hooks React (FASE 2B)
5. 🔄 Componentes React (FASE 3)

## 📝 Notas para Claude Code

Esta é uma plataforma de pesquisa jurídico-contábil-acadêmica que integra:
- Pesquisa jurídica com análise crítica de documentos
- Análise contábil e fiscal
- Pesquisa acadêmica
- Integração com Google Drive para documentos
- Análises avançadas: detecção de falhas processuais, contra-argumentos, blindagem estratégica

Use o comando `/legal-research` para ativar a suite jurídica com todas essas capacidades.

Quando precisar ajudar com implementação, considere:
- Manter tipos TypeScript bem definidos
- Usar custom hooks para lógica reutilizável
- Componentes pequenos e focados
- Services como camada de integração com APIs
- Documentação inline apenas para lógica não-óbvia
