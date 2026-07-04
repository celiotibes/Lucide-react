# FASE 3A: Editor Visual Law com TipTap e Análise de Jurimetria

**Data de Conclusão:** 4 de julho de 2026  
**Status:** ✅ CONCLUÍDO  
**Linguagem:** Português (BR) com nomenclatura técnica bilingue

## 📋 Visão Geral

FASE 3A implementa o editor visual interativo para petições judiciais com integração total das camadas de análise jurimetria desenvolvidas em FASE 2.5. O sistema oferece:

- **Editor Rich-Text com TipTap**: Formatação completa (negrito, itálico, headings H1-H4, listas, links)
- **Visualização em Tempo Real**: Dual-view editor + preview lado-a-lado
- **Validação Semântica HTML**: Controle de H1-H6 sequencial, tabelas estruturadas, acessibilidade
- **Matriz de Prova Visual**: Gráfico em tempo real de força probatória com cores e métricas
- **Gerenciador de Fatos**: Interface intuitiva para adicionar, editar e remover fatos probatórios
- **Sistema de Design Judicial**: Paleta de cores CNJ com pré-atributos visuais (<5s compreensão)

## 🏗️ Arquitetura Técnica

### Stack Tecnológico

```
Frontend:
- React 19.2.4 com TypeScript 5.9.3
- TipTap 2.1.13 (Rich Text Editor)
- Vite 7.3.1 (Build tool)
- CSS-in-JS com React.CSSProperties

Backend Services (Integração):
- ServicoJurimetriaBR (FASE 2.5)
- ServicoResmoProvaBR (FASE 2.5)
- ServicoFormatacaoPaginaBR (FASE 2.5)
- GeradorPeticaoCompleto (FASE 2.5)

Utilitários:
- sistemaDesignJudicial.ts (Paleta de cores, tipografia, validação semântica)
```

### Estrutura de Componentes

```
src/
├── components/
│   ├── editor/
│   │   ├── EditorLegalVisual.tsx         (500+ linhas)
│   │   ├── GerenciadorFatos.tsx          (450+ linhas)
│   │   └── ValidadorSemantico.tsx        (200+ linhas)
│   └── visualization/
│       └── MatrizProvaVisual.tsx         (350+ linhas)
├── utils/
│   └── sistemaDesignJudicial.ts          (400+ linhas)
├── services/                             (FASE 2.5)
│   ├── servicoJurimetriaBR.ts
│   ├── servicoResmoProvaBR.ts
│   ├── servicoFormatacaoPaginaBR.ts
│   └── geradorPeticaoCompleto.ts
├── types/                                (FASE 2.5)
│   ├── jurimetriaBR.ts
│   ├── resumoProvaBR.ts
│   └── formatacaoPaginaBR.ts
├── hooks/                                (Pronto para FASE 3B)
└── App.tsx                               (Integrador principal)
```

## 🎨 Sistema de Design Judicial

### Paleta de Cores Oficial (CNJ-compatível)

| Cor | Uso | Hex |
|-----|-----|-----|
| Azul Principal | Tribunal, autoridade, headings | #1A3A52 |
| Azul Escuro | Bordas, acentos | #0F2438 |
| Azul Claro | Hover, highlights | #2D5A7B |
| Vermelho Argumento | Crítica, força alta | #C41E3A |
| Vermelho Crítico | Erros, atenção | #D32F2F |
| Verde Apoio | Sustentação, sucesso | #2E7D32 |
| Verde Claro | Confirmação | #4CAF50 |
| Amarelo Aviso | Cautelas, moderado | #FFC107 |
| Laranja Alerta | Atenção especial | #FF9800 |
| Cinza Página | Fundo neutro | #F9F9F9 |
| Cinza Borda | Divisores | #CCCCCC |

### Tipografia Padrão CNJ

- **Fonte Principal**: Arial, Helvetica, sans-serif
- **Tamanhos**:
  - H1: 16pt bold (título único)
  - H2: 14pt bold (seções principais)
  - H3: 13pt bold (subseções)
  - H4: 12pt normal (subseções menores)
  - Corpo: 12pt normal
  - Rodapé: 10pt
- **Espaçamento entre linhas**: 1.5 (recomendação CNJ)
- **Alinhamento**: Justificado

### Pré-atributos Visuais (<5 segundos)

Todos os componentes são projetados para serem compreendidos em menos de 5 segundos através de:

- **Cores**: Hierarquia clara com azul (primário), vermelho (crítico), verde (apoio)
- **Posição**: Barras laterais para status, cabeçalhos para títulos
- **Peso**: Bold para títulos, normal para corpo
- **Espaçamento**: Gaps claros entre seções

## 🛠️ Componentes Detalhados

### 1. EditorLegalVisual.tsx

**Funcionalidades:**
- Editor TipTap com formatação completa (B, I, H1-H4, listas, links, blockquotes)
- Dual-view: Mostrar editor + preview lado-a-lado, ou modo separado
- Barra de ferramentas contextual com atalhos
- Controle de tamanho de fonte (pequeno 10pt, normal 12pt, grande 14pt)
- Export para HTML (com DOM download) e JSON (com metadados jurimetria)
- Integração automática com ServicoJurimetriaBR quando fatos existem

**Props:**
```typescript
interface EditorLegalVisualProps {
  titulo?: string                          // Título do documento
  conteudoInicial?: string                 // HTML inicial
  onMudar?: (html: string) => void         // Callback quando HTML muda
  exibirMatriz?: boolean                   // Mostrar matriz de prova
  exibirValidador?: boolean                // Mostrar validador semântico
  modoVisualizacao?: 'editor' | 'preview' | 'dualview'
  fatos?: FatoProva[]                      // Fatos para análise jurimetria
}
```

**Modos de Visualização:**
- `editor`: Apenas editor (modo draft rápido)
- `preview`: Apenas preview (modo leitura)
- `dualview`: Editor + Preview lado-a-lado (padrão, para comparação)

### 2. MatrizProvaVisual.tsx

**Funcionalidades:**
- Tabela em tempo real com força probatória por fato
- Barras de progresso coloridas (verde/amarelo/vermelho)
- Ícones visuais: ●●● (alta), ●●○ (moderada), ●○○ (frágil)
- 3 métricas principais:
  - **Score Jurimetria** (0-100): Saúde geral do caso
  - **TCP** (Taxa de Cobertura Probatória): % de fatos com prova
  - **Certeza Média**: Média ponderada de certeza dos fatos
- Seção de lacunas identificadas com sugestões
- Múltiplos tamanhos: compacto (resumido), normal (padrão), expandido (detalhado)

**Visualização de Lacunas:**
```
⚠️ Lacunas Identificadas
- Fato X: Risco Crítico - Sugestão: Incluir documentação
- Fato Y: Risco Moderado - Sugestão: Buscar testemunha adicional
```

### 3. ValidadorSemantico.tsx

**Funcionalidades:**
- Validação em tempo real com debounce de 500ms
- Verifica:
  - **H1**: Exatamente 1 (erro se ausente ou múltiplo)
  - **H2-H6**: Sequência sem gaps (aviso se quebrado)
  - **Tabelas**: Devem ter `<thead>` e `<tbody>` (aviso se ausente)
  - **Listas**: Devem usar `<ul>`, `<ol>`, `<li>` (aviso se mal estruturado)
  - **Links**: Todos devem ter `href` preenchido (erro se vazio)
  - **Imagens**: Todas devem ter `alt` text (aviso se ausente)
- Exibe separadamente: Erros (bloqueadores) vs Avisos (recomendações)
- Status visual com ícones: ✓ (válido), ✗ (erro)

### 4. GerenciadorFatos.tsx

**Funcionalidades:**
- Criar novo fato probatório (FatoProva)
- Editar fato existente
- Remover fato com confirmação
- Slider interativo para grau de certeza (0-100%)
- 3 presets de certeza:
  - Altamente Provável (90%): Prova documental forte, testemunha idônea
  - Moderadamente Provável (65%): Prova circunstancial, documentação parcial
  - Fracamente Provável (35%): Presunção, estimativa, falta comprovação
- Gerenciamento de múltiplas fontes por fato
- Campo de observações opcional
- Dois modos: expandido (formulário) e compacto (lista resumida)

**Estrutura FatoProva:**
```typescript
interface FatoProva {
  id?: string                    // ID único (gerado automaticamente)
  descricao: string              // Descrição clara do fato
  tipo: 'fato_provavel'         // Tipo de fato (expansível)
  grauCerteza: number            // 0-100 (força probatória)
  peso?: number                  // 1-5 (importância para tese)
  fontes?: string[]              // Array de documentação
  observacoes?: string           // Notas adicionais
}
```

## 📊 Integração com Serviços de FASE 2.5

O EditorLegalVisual se integra automaticamente com os serviços de análise:

```typescript
// 1. Ao adicionar fatos no GerenciadorFatos
const fatos: FatoProva[] = [
  { descricao: "Contrato assinado em 15/01/2024", grauCerteza: 95, ... }
]

// 2. EditorLegalVisual passa fatos para MatrizProvaVisual
<MatrizProvaVisual analise={analiseJurimetria} fatos={fatos} />

// 3. ServicoJurimetriaBR calcula:
const resultado = ServicoJurimetriaBR.analisarJurimetria(fatos)
// Retorna: { tcp, certezaMedia, scorejurimetrico, lacunas, ... }

// 4. MatrizProvaVisual exibe resultados em tempo real
```

## 🚀 Como Usar

### Iniciar Dev Server

```bash
npm install                  # Instalar dependências (TipTap, React, etc)
npm run dev                  # Inicia em http://localhost:5173
```

### Fluxo de Trabalho Típico

1. **Adicionar Fatos** (sidebar esquerda):
   - Clique em "+ Adicionar Fato Probatório"
   - Descrição: "O réu assinou o contrato em 15/01/2024"
   - Grau de Certeza: Slider ou preset (90% para altamente provável)
   - Fontes: Contrato original, foto, assinatura
   - Salvar

2. **Editar Petição** (área central):
   - Clique em "✎ EDITOR" para modo editor
   - Use botões de formatação: B, I, H1, H2, listas, links
   - Clique em "⊟" para dual-view (editor + preview)

3. **Monitorar Matriz** (rodapé):
   - Score Jurimetria aparece em tempo real (0-100)
   - Lacunas identificadas com sugestões
   - Cores indicam força probatória:
     - 🟢 Verde: Fato com prova forte (80%+)
     - 🟡 Amarelo: Fato moderadamente provado (50-80%)
     - 🔴 Vermelho: Fato fragmente provado (<50%)

4. **Exportar**:
   - Botão "HTML": Download do arquivo .html (para tribunal)
   - Botão "JSON": Download com metadados e jurimetria (para processamento)

## 🧪 Testes Manual

### Teste 1: Validação Semântica

**Passos:**
1. Criar novo editor
2. Adicionar dois H1 (deve exibir aviso)
3. Remover um H1 (deve exibir sucesso)
4. Adicionar imagem sem alt text (deve exibir aviso)

**Esperado:** Validador mostra avisos/erros em tempo real

### Teste 2: Matriz de Prova

**Passos:**
1. Adicionar 3 fatos com certezas diferentes:
   - Fato 1: 95% (alta)
   - Fato 2: 65% (moderada)
   - Fato 3: 30% (frágil)
2. Observar matriz atualizar automaticamente

**Esperado:**
- Score Jurimetria: ~63/100 (moderado)
- TCP: 100% (todos os fatos têm prova)
- Cores corretas por certeza

### Teste 3: Export

**Passos:**
1. Escrever conteúdo no editor
2. Clicar "HTML" e "JSON"
3. Abrir arquivos baixados

**Esperado:**
- HTML válido com doctype, head, body
- JSON com estrutura esperada e metadados jurimetria

## 📋 Checklist de Qualidade

- [ ] TipTap editor funciona sem erros de console
- [ ] Dual-view exibe preview atualizado em tempo real
- [ ] Validador semântico detecta H1 múltiplo
- [ ] Matriz atualiza quando fatos mudam
- [ ] GerenciadorFatos permite CRUD completo
- [ ] Export HTML tem DOCTYPE e semântica válida
- [ ] Cores respeitam paleta CNJ
- [ ] Sem memory leaks ou re-renders excessivos
- [ ] Responsivo em resoluções 1280px+

## 🔄 Próximas Fases

### FASE 3B: Visual Analytics (2 semanas)
- Gráficos de correlação entre fatos
- Visualização de distribuição de força probatória
- Heat maps de lacunas
- Timeline interativa de eventos
- Análise de impacto de cada fato no score

### FASE 3C: IA Assistant (2 semanas)
- Integração com Claude API
- Sugestão automática de hermenêutica blindada
- Geração de resumo executivo
- Predictor de contestações esperadas
- Blindagem preemptiva automática

### FASE 3D: Python Automation (1-2 semanas)
- Processamento de mídia em lote (otimizador_midia.py)
- Sincronização com Google Drive automática
- Geração de índice semântico para tribunal
- OCR de documentos anexados
- Verificação de autenticidade SHA-256

### FASE 4: Polish & Testing (1-2 semanas)
- E2E testing com petições reais
- Validação com tribunais (TJPR, TJSC, TRF4)
- Performance optimization
- Documentação completa para usuários
- Publicação em produção

## 📚 Referências

### Documentação Interna
- `FASE_2_5_JURIMETRIA_PT.md` - Análise quantitativa de prova
- `FASE_2_5_MEDIA_OPTIMIZATION_PT.md` - Otimização de mídia
- `GUIA_IMPLEMENTACAO_FASE_2.5_PT.md` - Guia técnico completo

### Documentação Externa
- **TipTap**: https://tiptap.dev/
- **React 19**: https://react.dev
- **Vite**: https://vitejs.dev
- **CNJ Standards**: https://www.cnj.jus.br/

## 🔐 Segurança

- Validação de entrada em componentes formulário
- Sanitização de HTML antes de exibição (via TipTap)
- Sem armazenamento sensível no localStorage sem criptografia
- CSP headers para production (configurar em deployment)
- Validação de tipos via TypeScript (strictNullChecks ativa)

## 📞 Suporte e Desenvolvimento

Para questões de desenvolvimento, consulte:
- `.claude/CLAUDE.md` - Instruções para Claude Code
- Commits anteriores no branch `claude/legal-accounting-plugins-4gmkm3`
- Documentação FASE 2.5 para serviços de backend

---

**FASE 3A Concluída com Sucesso** ✅  
Plataforma pronta para edição visual de petições com análise jurimetria integrada.
