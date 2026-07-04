# FASE 2.5: Jurimetria Avançada & Framework de Resumo de Prova
## Guia Completo de Implementação em Português

**Status**: ✅ COMPLETO - Todas as 4 camadas + Framework de Resumo implementados

---

## Visão Geral: 4 Camadas Críticas + Estrutura Estratégica

```
┌─────────────────────────────────────────────────────────────────┐
│ FRAMEWORK DE RESUMO DE PROVA (Caminho B - Camada de Conteúdo)   │
│ ├─ ResumoExecutivo: Tese, provas-chave, avaliação risco         │
│ ├─ Hermenêutica Blindada: Ethos, Pathos, Logos, Kairos          │
│ ├─ MatrizRespostaContestacao: Refutações preemptivas            │
│ └─ GeraçãoHTML: Inclusão direta em petição                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ CAMADA 1: JURIMETRIA (Análise Quantitativa de Prova)            │
│ ├─ ServicoJurimetriaBR.ts                                       │
│ ├─ TCP: Taxa de Cobertura Probatória (%)                        │
│ ├─ Distribuição de Força: alta/moderada/frágil                  │
│ ├─ Análise de Lacunas: Identificação de fatos vulneráveis       │
│ └─ Score Jurimetria: 0-100 saúde geral                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ CAMADA 2: OTIMIZAÇÃO DE MÍDIA (Visão Computacional)             │
│ ├─ otimizador_midia.py                                          │
│ ├─ Dimensões Padrão: 1200×675, 800×1000, 150 DPI               │
│ ├─ OCR: Extração de texto em português (Pytesseract)           │
│ ├─ SHA-256: Verificação de autenticidade                        │
│ └─ Compressão: Alvo <500KB por imagem                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ CAMADA 3: ENGENHARIA DE CONTINGÊNCIA (Anexos Ilegíveis)         │
│ ├─ ContingenciaAtivoIlegivel TypeScript interface               │
│ ├─ Tradução Semântica: Transcrição/sumarização                  │
│ ├─ Prova Autenticidade: Referência notarial, SHA-256            │
│ └─ Validação Legal: Jurisprudência aceitando mídia ilegível     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ CAMADA 4: AUTOMAÇÃO AVANÇADA (Google Drive + Índice Semântico)  │
│ ├─ automacao_avancada.py                                        │
│ ├─ Varrer & Registrar: Metadados de arquivo com inferência      │
│ ├─ Sincronização Drive: OAuth2, compartilhamento restrito       │
│ ├─ Índice Semântico: JSON compatível Legal-BERT-PT, TF-IDF      │
│ └─ Exportação Markdown: Incorporação direta em petições          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Camada 1: Serviço de Jurimetria

### Arquivos
- `src/types/jurimetriaBR.ts`: Definições de tipos
- `src/services/servicoJurimetriaBR.ts`: Lógica de cálculo

### Métodos Principais

```typescript
// Ponto de entrada
ServicoJurimetriaBR.analisarJurimetria(fatos: FatoProva[]): Analisejurimetrica

// Cálculos individuais
ServicoJurimetriaBR.calcularTCP(fatos): number // Taxa Cobertura
ServicoJurimetriaBR.calcularCertezaMedia(fatos): number // Média ponderada
ServicoJurimetriaBR.analisarDistribuicaoForca(fatos): DistribuicaoForcaFatos
ServicoJurimetriaBR.identificarLacunasRisco(fatos): string[] // Lacunas críticas
ServicoJurimetriaBR.calcularScorejurimetrico(fatos): number // 0-100
ServicoJurimetriaBR.gerarMatrizVisual(fatos): MatrizProvaVisual[]
ServicoJurimetriaBR.gerarMatrizHtml(analise): string // Para petição
```

### Exemplo de Uso

```typescript
import { ServicoJurimetriaBR } from '@/services/servicoJurimetriaBR'
import type { FatoProva } from '@/types/jurimetriaBR'

const fatos: FatoProva[] = [
  {
    idFato: 'F1',
    alegacao: 'Contrato assinado em 01/2023',
    tipoProva: 'documental',
    grauCerteza: 99,
    pesoProva: 'substancial',
    fontes: ['ANEXO_01_Contrato.pdf']
  },
  // ... mais fatos
]

// Analisar jurimetria
const analise = ServicoJurimetriaBR.analisarJurimetria(fatos)
console.log(`TCP: ${analise.tcp.toFixed(1)}%`)
console.log(`Score: ${analise.scorejurimetrico.toFixed(1)}/100`)

// Gerar HTML para petição
const html = ServicoJurimetriaBR.gerarMatrizHtml(analise)
// Inserir em template de petição
```

### Estrutura de Saída

```typescript
interface Analisejurimetrica {
  tcp: number // 66.7% (Exemplo: 2/3 fatos com prova substancial)
  grauCertezaMedia: number // 77.7% (Exemplo)
  distribuicaoForcaFatos: {
    alta: 2    // 80-100% de certeza
    moderada: 1 // 50-80%
    fragil: 0  // <50%
  }
  matrizArgumentoProva: CorrelacaoArgumentoProva[]
  lacunasRisco: ['Fato X carece de corroboração', ...]
  scorejurimetrico: number // 0-100 (saúde geral)
  matrizVisual: MatrizProvaVisual[] // Barras ASCII para exibição
}
```

---

## Camada 2: Otimização de Mídia

### Arquivo
- `scripts/otimizador_midia.py`

### Instalação

```bash
# Dependências principais
pip install Pillow

# Opcional: OCR
pip install pytesseract
# Também instalar binário Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
```

### Uso

```bash
# Otimização básica
python scripts/otimizador_midia.py ./imagens

# Com diretório de saída personalizado
python scripts/otimizador_midia.py ./imagens --saida ./otimizadas

# Sem OCR (se Tesseract não disponível)
python scripts/otimizador_midia.py ./imagens  # Pula OCR graciosamente
```

### Arquivos de Saída

1. **otimizado_*.png**: Imagens redimensionadas (1200×675 ou 800×1000)
2. **metadados_midia.json**: Estrutura JSON para React
3. **galeria_midia.html**: Tabela HTML com texto OCR

### Estrutura metadados_midia.json

```json
{
  "totalAtivos": 3,
  "economiaCompressaoTotal": 245.5,
  "todosProntosParaCnn": true,
  "ativos": [
    {
      "nomeArquivoOriginal": "PaginaContrato1.jpg",
      "nomeArquivoOtimizado": "otimizado_PaginaContrato1.png",
      "dimensoes": "1200x675",
      "tamanhoOrigemKb": 450.2,
      "tamanhoOtimizadoKb": 204.7,
      "percentualCompressao": 54.6,
      "textoOcr": "Contrato de Prestação de Serviços...",
      "sha256": "a8f5c3b9e2d1f4c7a5b8e1d9c2f5a8b1",
      "prontoParaCnn": true,
      "metadados": {
        "hashAutenticidade": "a8f5c3b9..."
      }
    }
  ]
}
```

### Integração com CNNs

Os metadados otimizados são compatíveis com:
- **YOLO v8**: Detecção de objetos em documentos judiciais
- **ResNet**: Classificação de imagens (tipo documento, nível dano)
- **Tesseract OCR**: Extração de texto de imagens
- **IA Tribunal**: Pipelines de processamento automatizado

---

## Camada 3: Engenharia de Contingência

### Definição de Tipo
- `src/types/jurimetriaBR.ts`: `ContingenciaAtivoInlegivel`

### Caso de Uso: Arquivo de Áudio Corrompido

```markdown
---

## QUADRO DE HOMOLOGAÇÃO SEMÂNTICA DE ANEXOS ILEGÍVEIS

### ANEXO_04: Audio_WhatsApp_Confissao.mp3
**Status**: Anexo não-estruturado (mídia de áudio)

**Metadados de Autenticidade**:
- Hash SHA-256 Original: `a8f5c3b9e2d1f4c7a5b8e1d9c2f5a8b1`
- Plataforma de Registro: Verifact (certificado)
- Data de Captura: 15/03/2026

**Transcrição/Sumarização para IA**:
```
[00:00 - 02:14] Diálogo inicial entre Autor e Réu
[02:14 - 02:47] ⚠️ TRECHO CRÍTICO - Réu afirma:
  "Não vou pagar esta parcela"
[02:47 - 03:42] Discussão sobre prazos
```

**Jurisprudência Validadora**:
STJ EREsp 1.654.567/MG - "Áudio como prova não-estruturada 
desde que acompanhado de transcrição e hash de autenticidade"

**Acesso Rápido**:
📥 [CLIQUE PARA OUVIR]
   Protocolo: Compartilhado com @tjpr.jus.br

---
```

### Implementação TypeScript

```typescript
interface ContingenciaAtivoInlegivel {
  idAnexo: 'ANEXO_04'
  nomeArquivoOriginal: 'Audio_WhatsApp_Confissao.mp3'
  motivoInlegivel: 'danificadoDigitalizacao'
  traducaoSemantica: {
    transcricao: '[00:00-02:47] Confissão crítica do réu...',
    descricao: 'Prova de áudio de admissão do réu',
    provaAutenticidade: {
      ataNotarial: 'Ato de cartório #12345',
      sha256Original: 'a8f5c3b9e2d1f4c7a5b8e1d9c2f5a8b1',
      dataRecuperada: new Date('2026-03-15')
    }
  },
  alternativaAcessibilidade: {
    linkGoogleDrive: 'https://drive.google.com/file/d/.../view',
    descricao: 'Áudio completo com divisão por timestamp',
    restritoBancada: true
  },
  citacaoJurisprudencial: 'STJ EREsp 1.654.567/MG'
}
```

---

## Camada 4: Automação Avançada

### Arquivo
- `scripts/automacao_avancada.py`

### Instalação

```bash
# API Google Drive
pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client

# Configurar credenciais OAuth2 no Google Cloud Console
# Salvar como credentials.json na raiz do projeto
```

### Uso

```bash
# Registrar arquivos localmente apenas
python scripts/automacao_avancada.py ./ativos_peticao --tribunal TJPR

# Registrar e enviar para Google Drive
python scripts/automacao_avancada.py ./ativos_peticao --tribunal TJPR --upload

# Especificar número do processo para índice semântico
python scripts/automacao_avancada.py ./ativos_peticao --tribunal TJPR --upload --processo 0012345-67.2026.8.16.0001
```

### Arquivos de Saída

1. **indice_semantico.json**: Índice completo de arquivos
2. **INDICE_ANEXOS.md**: Tabela Markdown para incluir em petição
3. **Sincronização Google Drive**: Arquivos com compartilhamento restrito

### Estrutura indice_semantico.json

```json
{
  "metadadosCaso": {
    "numeroProcesso": "0012345-67.2026.8.16.0001",
    "tribunal": "TJPR",
    "exportadoEm": "2026-07-04T15:30:00Z"
  },
  "indiceAnexos": [
    {
      "idAnexo": "ANEXO_01",
      "nomeArquivo": "Contrato.pdf",
      "tipo": "documento_estruturado",
      "hash": "a8f5c3b9e2d1f4c7a5b8e1d9c2f5a8b1",
      "link": "https://drive.google.com/file/d/.../view",
      "protocoloCompartilhamento": "dominio_restrito",
      "acessivelPor": ["tjpr.jus.br", "cnj.jus.br"],
      "conteudoExtraido": {
        "textoCompleto": null,
        "entidades": ["Empresa XYZ", "Sr. João Silva"],
        "palavraschave": ["contrato", "prestação", "serviços"]
      }
    }
  ]
}
```

### Domínios de Tribunal Suportados

```python
DOMINIOS_TRIBUNAL = {
    'TJPR': 'tjpr.jus.br',      # Tribunal Estadual Paraná
    'TJSC': 'tjsc.jus.br',      # Tribunal Estadual Santa Catarina
    'TJMT': 'tjmt.jus.br',      # Tribunal Estadual Mato Grosso
    'TJRO': 'tjro.jus.br',      # Tribunal Estadual Rondônia
    'TRF4': 'trf4.jus.br',      # Tribunal Regional Federal 4
    'JFPR': 'jfpr.jus.br',      # Justiça Federal Paraná
    'CNJ': 'cnj.jus.br'         # Conselho Nacional de Justiça
}
```

---

## Framework de Resumo de Prova

### Arquivos
- `src/types/resumoProvaBR.ts`: Definições de tipos
- `src/services/servicoResmoProvaBR.ts`: Lógica de geração

### Métodos Principais

```typescript
// Ponto de entrada
ServicoResmoProvaBR.gerarResmoProva(
  idPeticao: string,
  fatos: FatoProva[],
  jurisprudencia?: any[]
): FrameworkResmoProva

// Análise estratégica
ServicoResmoProvaBR.gerarMatrizRespostaContestacao(
  fatos: FatoProva[],
  contestacoesEsperadas: string[]
): MatrizRespostaContestacao

// Geração HTML
ServicoResmoProvaBR.gerarHtmlResmoProva(
  framework: FrameworkResmoProva
): string
```

### Exemplo de Uso

```typescript
import { ServicoResmoProvaBR } from '@/services/servicoResmoProvaBR'
import { ServicoJurimetriaBR } from '@/services/servicoJurimetriaBR'

const fatos = [...] // FatoProva[]

// Passo 1: Obter análise jurimetria
const analiseJurimetrica = ServicoJurimetriaBR.analisarJurimetria(fatos)

// Passo 2: Gerar framework de resumo de prova
const resmoProva = ServicoResmoProvaBR.gerarResmoProva(
  'PETICAO_001',
  fatos,
  jurisprudencia
)

// Passo 3: Analisar contestações esperadas
const contestacoesEsperadas = [
  'Desafio à credibilidade da testemunha',
  'Argumento de insuficiência de prova',
  'Ataque ao procedimento de coleta de prova'
]

const matrizResposta = ServicoResmoProvaBR.gerarMatrizRespostaContestacao(
  fatos,
  contestacoesEsperadas
)

// Passo 4: Gerar HTML para petição
const htmlFramework = ServicoResmoProvaBR.gerarHtmlResmoProva(resmoProva)
```

### Hermenêutica Blindada: 4 Pilares

#### 1. Ethos (Credibilidade)
- Autoridade baseada em prova documental
- Marcadores de credibilidade: Documentos contemporâneos, prova digital, testemunho pericial
- Presunção de boa-fé em procedimentos legais

#### 2. Pathos (Apelo Emocional & Justiça)
- A justiça exige respeito às obrigações contratuais
- Prevenção de enriquecimento injustificado
- Proteção de interesses de confiança razoável
- Prevenção de abuso de direitos processuais

#### 3. Logos (Estrutura Lógica)
- Cadeias silogísticas: Lei → Fato → Conclusão
- Padrão de preponderância das provas
- Alocação de ônus de prova
- Precedente jurisprudencial

#### 4. Kairos (Oportunidade & Timeliness)
- Resolução ágil evita decadência de provas
- Apresentação oportuna previne indisponibilidade de testemunhas
- Oportunidade de justiça não deve ser perdida por atrasos procedimentais
- Proteção de expectativas legítimas

### Estrutura de Saída

```typescript
interface FrameworkResmoProva {
  idPeticao: string
  resumoExecutivo: {
    argumentoPrincipal: string // Tese de 1 frase
    provasChave: string[] // 3-5 provas mais fortes
    resultadoEsperado: string
    avaliacaoRisco: string
    escudoHermenautico: string
  }
  resumoFatos: FatoResmoProva[] // Cada com peso, escudos, citações
  analiseContestacao: {
    contestacoesEsperadas: string[]
    areasVulneraveis: string[]
    refutacoesPreemptivas: string[]
  }
  hermenauticaEstrategica: {
    abordagemEthos: {...}
    abordagemPathos: {...}
    abordagemLogos: {
      cadeiassilogisticas: CadeiasilogisticaBR[]
    }
    abordagemKairos: {...}
  }
  sintesesnclusiva: {
    declaracaoSintese: string
    pedidoPrincipal: string
    pedidoAlternativo: string
    salvaguardasProcessuais: string[]
  }
  geradoEm: Date
}
```

### Matriz de Resposta a Contestações

Cada contestação esperada recebe:
1. **Resposta Direta**: Refutação factual
2. **Base Lógica**: Por que nossa posição é mais forte
3. **Prova de Apoio**: Anexos específicos ou jurisprudência
4. **Resposta Secundária**: Argumento alternativo se primário contestado
5. **Rating de Força**: 0-100 confiança

---

## Fluxo de Integração Completa

### Workflow Completo de Geração de Petição

```
1. COLETAR FATOS
   ├─ Usuário fornece alegações + provas
   └─ Cria array FatoProva[]

2. ANÁLISE JURIMETRIA (Camada 1)
   ├─ ServicoJurimetriaBR.analisarJurimetria(fatos)
   ├─ Saída: TCP, certeza, distribuição força, lacunas risco
   └─ Tabela HTML com matriz visual de provas

3. OTIMIZAÇÃO DE MÍDIA (Camada 2)
   ├─ python otimizador_midia.py ./imagens
   ├─ Saída: Texto OCR, hashes SHA-256, dimensões otimizadas
   └─ metadados.json para integração React

4. FRAMEWORK DE RESUMO DE PROVA
   ├─ ServicoResmoProvaBR.gerarResmoProva(fatos)
   ├─ Analisa contestações esperadas
   ├─ Constrói escudos hermenêuticos (Ethos/Pathos/Logos/Kairos)
   └─ HTML pronto para petição

5. AUTOMAÇÃO AVANÇADA (Camada 4)
   ├─ python automacao_avancada.py ./ativos --upload
   ├─ Sincronização Google Drive com compartilhamento restrito domínio
   ├─ Índice semântico (compatível Legal-BERT-PT)
   └─ Tabela Markdown para petição

6. TRATAMENTO DE CONTINGÊNCIA (Camada 3)
   ├─ Para ativos ilegíveis: Criar ContingenciaAtivoInlegivel
   ├─ Adicionar tradução semântica + transcrição
   ├─ Incluir referência notarial + citação jurisprudência
   └─ Link alternativo Google Drive com domínio tribunal

7. PETIÇÃO FINAL
   ├─ Combinar todas as seções HTML
   ├─ Aplicar formatação CSS @page (Caminho A - próxima fase)
   ├─ Exportar como PDF via Eproc/PJe/Projudi
   └─ Todos os sistemas IA de tribunal conseguem ler & indexar
```

---

## Próximos Passos: Caminho A (Implementação CSS @page)

O Framework de Resumo de Prova (Caminho B) fornece a **camada de conteúdo**.
O Caminho A fornecerá a **camada de apresentação** via regras CSS @page:

```css
@page {
  margin: 3cm 2.5cm;
  @top-left {
    content: "Nome do Tribunal";
  }
  @top-right {
    content: "Número da Petição";
  }
  @bottom-center {
    content: "Página " counter(page) " de " counter(pages);
  }
}

@page :first {
  margin-top: 5cm; /* Espaço extra para caption */
}
```

Isso garante:
- Formatação judicial perfeita por padrões do tribunal
- Quebras de página automáticas após seções-chave
- Cabeçalhos/rodapés com metadados de petição
- Validação HTML semântico (H1-H6, tabelas, listas)
- Pronto para submissão direta em Eproc/PJe/Projudi

---

## Lista de Verificação de Testes

- [x] Jurimetria: Cálculo TCP, distribuição força, identificação lacunas
- [x] Otimizador Mídia: Redimensionamento imagem, OCR, SHA-256, compressão
- [x] Contingência: Tipos UnreadableAssetContingency e templates
- [x] Automação Avançada: Registro arquivo, sincronização Google Drive, indexação semântica
- [x] Resumo Prova: Framework hermenêutico, análise contestação, matrizes resposta
- [ ] CSS @page: Templates de formatação judicial (Caminho A - próximo)
- [ ] Componentes React: Integração editor visual (FASE 3A)
- [ ] Claude API: Geração automática texto para resumos (FASE 3C)

---

## Status de Resumo

**Conclusão FASE 2.5**:
- ✅ Serviço Jurimetria (ServicoJurimetriaBR.ts, types/jurimetriaBR.ts)
- ✅ Otimizador Mídia (otimizador_midia.py)
- ✅ Framework Contingência (tipos ContingenciaAtivoInlegivel)
- ✅ Automação Avançada (automacao_avancada.py)
- ✅ Framework Resumo Prova (ServicoResmoProvaBR.ts, types/resumoProvaBR.ts)

**Pronto para FASE 3A** (Editor Visual Law):
- Integração TipTap com validação semântica
- Geração prova matriz em tempo real
- Visualização escudo hermenêutico
- Preview ao vivo com visão dupla (visual + HTML)
- Exportação para Eproc/PJe/Projudi

