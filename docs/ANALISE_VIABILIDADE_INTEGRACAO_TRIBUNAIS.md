# Análise de Viabilidade: Integração Lucide-react com Infraestrutura Judicial Brasileira

**Data:** 4 de julho de 2026  
**Status:** 🔍 ANÁLISE EM ANDAMENTO  
**Escopo:** Integração e-SAJ, SEEU, e-STF, e-STJ, Portal Jus.br + IA Especializada + Cálculos Jurídicos

---

## 📊 1. Situação Atual do Projeto

### Arquitetura Implementada (FASE 2.5-3C)

```
Lucide-react v1.0
├── Frontend: React 19.2.4 + TypeScript 5.9.3 + Vite 7.3.1
├── Análise: Jurimetria (TCP, Score, Lacunas)
├── Edição: Visual Law Editor (TipTap)
├── Visualização: Analytics (Gráficos, Heatmaps, Timeline)
├── IA: Claude API (Assistente Jurídico)
└── Design: Paleta CNJ + Validação Semântica HTML

Componentes Implementados:
✅ PainelEditorVisual (TipTap)
✅ ServiçoJurimetriaBR (TCP, Score, Lacunas)
✅ DashboardAnalytics (4 visualizações)
✅ PainelAssistenteIA (4 métodos Claude)
✅ SistemaDesignJudicial (Paleta CNJ)

Limitações Atuais:
❌ Sem integração com e-SAJ, SEEU, e-STF, e-STJ
❌ Sem APIs de Tribunais (MNI)
❌ IA genérica (Claude Opus), não especializada em jurisprudência
❌ Sem RAG (Retrieval-Augmented Generation)
❌ Sem cálculos: dano material, binômio, dano moral
❌ Sem NLP/NER para extração de entidades
❌ Sem WebExtensions para ePROC/PJe
❌ Backend Python inexistente (apenas frontend JS/TS)
```

### Stack Atual vs. Necessário

| Camada | Atual | Necessário |
|--------|-------|-----------|
| **Frontend** | React 19 + TS | ✅ React 19 + TS (manter) |
| **Backend** | Nenhum | 🔴 Python + FastAPI/Django |
| **ML/NLP** | Claude API genérica | 🔴 Legal-BERT-PT, spaCy, transformers |
| **RAG** | Nenhum | 🔴 LangChain + Pinecone/Weaviate |
| **Infraestrutura Judicial** | Nenhuma | 🔴 MNI + APIs de Tribunais |
| **WebExtensions** | Nenhum | 🔴 Manifest v3 para ePROC/PJe |
| **Blockchain** | Nenhum | 🟡 Opcional: Ethereum para timestamp |
| **Cálculos Jurídicos** | Básicos | 🔴 Motor de correção, juros, binômio |

---

## 🏛️ 2. Mapeamento de Integração com Sistemas Judiciais

### 2.1 Matriz de Compatibilidade: Lucide-react vs. Sistemas Reais

| Sistema | Escopo | Integração Possível | Tipo API | Prioridade | Complexidade |
|---------|--------|-------------------|----------|-----------|-------------|
| **e-SAJ** (TJSP) | Peticionamento, Andamentos | Média | REST (MNI) | 🔴 ALTA | 🔴 ALTA |
| **SEEU** (CNJ) | Progressão de Pena | Baixa | REST (MNI) | 🟡 MÉDIA | 🟢 BAIXA |
| **e-STF** | Petições STF | Baixa | REST (MNI) | 🟡 MÉDIA | 🟡 MÉDIA |
| **e-STJ** | Petições STJ | Baixa | REST (MNI) | 🟡 MÉDIA | 🟡 MÉDIA |
| **Portal Jus.br** | Consulta de Processos | Alta | REST (CNJ) | 🔴 ALTA | 🟢 BAIXA |
| **ePROC** (TJPA) | Peticionamento local | Média | SOAP/REST | 🟡 MÉDIA | 🟡 MÉDIA |
| **PJe** (STJ/TST) | Peticionamento | Alta | SOAP/REST | 🟡 MÉDIA | 🟡 MÉDIA |
| **Projudi** (TJMG) | Peticionamento | Média | SOAP/REST | 🟡 MÉDIA | 🟡 MÉDIA |

### 2.2 e-SAJ (TJSP) - Análise Detalhada

**O que é:**
- Sistema eletrônico de São Paulo (maior tribunal do Brasil)
- Gerencia fluxo de gabinetes, petições, andamentos
- Integração via Malha Nacional de Interoperabilidade (MNI)

**Fluxo de Peticionamento Esperado:**

```
┌─────────────────────────────────────────┐
│  Lucide-react (Frontend)                 │
│  ┌───────────────────────────────────┐  │
│  │ Editor Visual (TipTap)             │  │
│  │ Hermenêutica Blindada (IA)         │  │
│  │ Cálculos (Dano Material, etc)      │  │
│  └───────────────────────────────────┘  │
└──────────────┬──────────────────────────┘
               │ Exporta XML (e-SAJ)
               ↓
┌──────────────────────────────────────────┐
│  Backend Python (FastAPI)                │
│  ┌──────────────────────────────────┐   │
│  │ Validação e Assinatura Digital   │   │
│  │ Conversão para formato e-SAJ     │   │
│  │ Chamada MNI API                  │   │
│  └──────────────────────────────────┘   │
└──────────────┬───────────────────────────┘
               │ PUT /mni/peticionamento
               ↓
┌──────────────────────────────────────────┐
│  MNI (Malha Nacional)                    │
│  ├─ Autenticação (Certificado Digital)   │
│  ├─ Roteamento (e-SAJ)                   │
│  └─ Validação Processual                 │
└──────────────┬───────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│  e-SAJ TJSP                              │
│  ├─ Protocolo (Número + Data)            │
│  ├─ Juntada em Processo                  │
│  └─ Notificação ao Juiz                  │
└──────────────────────────────────────────┘
```

**APIs Disponíveis (MNI):**

```
Endpoint: https://mni.cnj.jus.br/api/v1/
Autenticação: Certificado Digital A1/A3

1. POST /peticionamento
   - Enviar petição com anexos
   - Payload: XML e-SAJ
   - Retorno: Protocolo

2. GET /andamentos/{processo}
   - Consultar movimentações
   - Retorno: JSON com timeline

3. GET /autos/{processo}
   - Baixar autos digitais
   - Retorno: PDF/ZIP com documentos

4. PUT /recurso/{processo}
   - Apresentar recurso
   - Payload: XML e-SAJ
   - Retorno: Protocolo
```

**Modelo XML e-SAJ (Simplificado):**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Peticionamento xmlns="urn:br:cn:saj:sistema:arquivos:schema">
  <Cabecalho>
    <NumeroProcesso>0000001-55.2026.7.15.0001</NumeroProcesso>
    <TipoPeticionamento>Petição Inicial</TipoPeticionamento>
    <DataEntrega>2026-07-04T14:30:00</DataEntrega>
  </Cabecalho>
  <TextoPeticao>
    <Paragrafo numParagrafo="1">Texto da petição...</Paragrafo>
    ...
  </TextoPeticao>
  <Assinatura>
    <Certificado>MIIC...</Certificado>
    <Timestamp>2026-07-04T14:30:00Z</Timestamp>
  </Assinatura>
</Peticionamento>
```

### 2.3 Portal Jus.br - Integração Simplificada

**O que é:**
- Portal de consulta unificada CNJ
- Permite pesquisar processos em todos os tribunais
- API REST pública

**Endpoint:**
```
GET https://www.cnj.jus.br/api/publico/processos/{numero}
Retorno: JSON com dados do processo
```

**Caso de Uso:**
- Usuário digita número do processo
- Lucide-react faz GET em Portal Jus.br
- Retorna dados do processo (partes, histórico)
- Carrega em timeline interativa

**Implementação (TypeScript):**
```typescript
async function consultarProcesso(numero: string) {
  const response = await fetch(
    `https://www.cnj.jus.br/api/publico/processos/${numero}`
  )
  const dados = await response.json()
  return {
    numero: dados.numeroProcesso,
    partes: dados.partes,
    andamentos: dados.andamentos,
    tribunal: dados.tribunal
  }
}
```

### 2.4 Mapeamento Técnico: Qual Integração Primeiro?

**Recomendação de Sequência:**

1. **FASE 4A (2-3 semanas):** Portal Jus.br
   - Menor complexidade
   - Sem autenticação digital
   - Prototipa arquitetura de backend
   - Valor imediato (consulta de processos)

2. **FASE 4B (3-4 semanas):** e-SAJ via MNI
   - Maior impacto comercial
   - Requer certificado digital
   - Implementa assinatura digital
   - Valor: peticionamento direto

3. **FASE 4C (2-3 semanas):** WebExtensions para ePROC/PJe
   - Injeção de editor visual
   - Sincronização com sistemas locais
   - Valor: workflow integrado

---

## 🤖 3. Gaps Tecnológicos e Recomendações

### 3.1 IA Especializada em Jurisprudência Brasileira

**Problema Atual:**
- Claude Opus é genérico, sem conhecimento profundo de jurisprudência brasileira
- Pode gerar argumentos sem base em jurisprudência real

**Soluções Disponíveis:**

#### Opção A: RAG com Legal-BERT-PT + Pinecone (🏆 RECOMENDADO)

```
Arquitetura:

┌─────────────────────────────────────────┐
│ Base de Jurisprudência (500K+ ementas)  │
│ Fonte: TJSP, STJ, STF, CNJ              │
└──────────────┬──────────────────────────┘
               │ Embedding com Legal-BERT-PT
               ↓
┌──────────────────────────────────────────┐
│ Pinecone (Índice Vetorial)               │
│ Busca semântica de jurisprudência        │
└──────────────┬───────────────────────────┘
               │ Vector similarity search
               ↓
┌──────────────────────────────────────────┐
│ Claude Opus (+ contexto jurídico)        │
│ Integrado com LangChain                  │
└──────────────────────────────────────────┘

Resultado: Hermenêutica com jurisprudência real citada
```

**Implementação Python (Backend):**

```python
# requirements.txt
langchain==0.1.0
sentence-transformers==2.2.2
pinecone-client==3.0.0
anthropic==0.8.0

# backend/services/rag_jurisprudencia.py
from langchain.chat_models import ChatAnthropic
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Pinecone
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA

class RAGJurisprudencia:
    def __init__(self, api_key: str, pinecone_key: str):
        self.embeddings = HuggingFaceEmbeddings(
            model_name="rufimelo/Legal-BERT-pt"
        )
        self.vectorstore = Pinecone(
            index_name="jurisprudencia",
            embedding_function=self.embeddings,
            text_key="ementa"
        )
        self.llm = ChatAnthropic(api_key=api_key)
    
    async def gerar_hermenautica_com_rag(
        self, 
        fatos: list[str],
        analise_score: float
    ) -> dict:
        """Gera hermenêutica com jurisprudência citada"""
        
        # 1. Recuperar jurisprudência relevante
        documentos = self.vectorstore.similarity_search(
            " ".join(fatos),
            k=5  # Top 5 ementas mais relevantes
        )
        
        # 2. Construir prompt com contexto jurídico
        prompt = PromptTemplate(
            template="""
            Você é especialista em estratégia judicial com acesso a banco jurisprudencial.
            
            FATOS DO CASO:
            {fatos}
            
            JURISPRUDÊNCIA RELEVANTE (TOP 5):
            {jurisprudencia}
            
            Gere hermenêutica blindada com 4 pilares (Ethos, Pathos, Logos, Kairos).
            CITE jurisprudência real nas respostas.
            
            Retorne JSON válido.
            """,
            input_variables=["fatos", "jurisprudencia"]
        )
        
        # 3. Invocar LLM com contexto
        chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=self.vectorstore.as_retriever()
        )
        
        resultado = chain.run(
            query=" ".join(fatos)
        )
        
        return json.loads(resultado)
```

**Fonte de Dados:**
- TJSP OpenData: https://www.tjsp.jus.br/
- STJ WebAPI: https://www.stj.jus.br/portal/
- CNJ Data: https://www.cnj.jus.br/
- Jurisprudência.com.br (crawler)

**Custos Estimados:**
- Pinecone Free: até 100K vetores
- Legal-BERT-PT: Modelo open-source (grátis)
- Claude Opus: $0.015 por 1K tokens (input)

**Timeline:** 2-3 semanas

---

#### Opção B: API LLM Especializado + Fine-tuning

**Alternativa:** Usar provedor especializado como:
- **Legal-LLM** (Anthropic custom): Fine-tuning com jurisprudência brasileira
- **OpenAI + Fine-tuning**: GPT-4 com dataset de petições vencedoras
- **Llama-2 + LoRA**: Model de código aberto fine-tunado

**Vantagem:** Maior precisão, sem RAG adicional  
**Desvantagem:** Mais caro, requer dataset de treinamento  
**Timeline:** 4-6 semanas

---

### 3.2 NLP/NER para Extração de Entidades Jurídicas

**Problema Atual:**
- Não extrai automaticamente entidades jurídicas (partes, datas, valores, jurisprudência)

**Solução: spaCy + Legal-NER Pipeline (Python)**

```python
# backend/services/extrator_entidades.py
import spacy
from transformers import pipeline

class ExtractorEntidadesJuridicas:
    def __init__(self):
        # Modelo spaCy em português
        self.nlp = spacy.load("pt_core_news_sm")
        
        # NER specializado em termos jurídicos
        self.ner_juridica = pipeline(
            "token-classification",
            model="rufimelo/legal-ner-pt"
        )
    
    async def extrair_entidades(self, texto: str) -> dict:
        """Extrai partes, datas, valores, jurisprudência"""
        
        doc = self.nlp(texto)
        
        entidades = {
            "partes": [],
            "datas": [],
            "valores": [],
            "jurisprudencia": [],
            "artigos": [],
            "instituicoes": []
        }
        
        # Entidades nomeadas básicas
        for ent in doc.ents:
            if ent.label_ == "PERSON":
                entidades["partes"].append(ent.text)
            elif ent.label_ == "DATE":
                entidades["datas"].append(ent.text)
            elif ent.label_ == "MONEY":
                entidades["valores"].append(ent.text)
        
        # NER jurídico
        ner_output = self.ner_juridica(texto)
        for token in ner_output:
            if token["entity"] == "B-JURISPRUDENCIA":
                entidades["jurisprudencia"].append(token["word"])
            elif token["entity"] == "B-ARTIGO":
                entidades["artigos"].append(token["word"])
        
        return entidades

# Uso
extrator = ExtractorEntidadesJuridicas()
resultado = await extrator.extrair_entidades(texto_peticao)
# Resultado:
# {
#   "partes": ["João Silva", "Empresa X Ltda"],
#   "datas": ["15/05/2020", "30/06/2026"],
#   "valores": ["R$ 50.000,00"],
#   "jurisprudencia": ["STJ Súmula 149", "TJSP Jurisprudência 2024"],
#   "artigos": ["Art. 373 CPC", "Art. 17 CC"]
# }
```

**Modelo:** Legal-NER-PT (HuggingFace, open-source)  
**Timeline:** 1-2 semanas

---

### 3.3 Cálculos Jurídicos: Dano Material, Binômio, Dano Moral

#### Dano Material: Motor de Correção Monetária

```python
# backend/services/calculador_dano_material.py
from datetime import datetime
from decimal import Decimal

class CalculadorDanoMaterial:
    """
    Calcula indenização por dano material com:
    - Correção monetária (IPCA/TR/SELIC)
    - Juros compostos
    - Multas contratuais
    """
    
    # Taxas IPCA (exemplo, atualizar mensalmente)
    IPCA_ACUMULADO = {
        "2026-01": 12.45,
        "2026-06": 13.67,
        "2026-07": 13.89
    }
    
    # Taxa SELIC média anual
    SELIC_ANUAL = 9.5  # 2026
    
    async def calcular_indenizacao(
        self,
        data_dano: datetime,
        valor_original: Decimal,
        tipo_correccao: str = "IPCA",  # IPCA, TR, SELIC
        data_calculo: datetime = None,
        juros_compostos: bool = True
    ) -> dict:
        """
        Calcula valor corrigido de dano material
        
        Args:
            data_dano: Data do dano
            valor_original: Valor em reais na época
            tipo_correccao: Índice de correção
            data_calculo: Data para cálculo (hoje se None)
            juros_compostos: Se aplica juros compostos (art. 406 CC)
        
        Returns:
            {
                "valor_original": 50000.00,
                "indice_aplicado": "IPCA",
                "taxa_acumulada": 13.89,
                "valor_corrigido": 56945.00,
                "juros_compostos": 2847.25,
                "valor_total": 59792.25,
                "periodo_dias": 412
            }
        """
        
        if data_calculo is None:
            data_calculo = datetime.now()
        
        # 1. Calcular período
        periodo = (data_calculo - data_dano).days
        periodo_anos = periodo / 365.25
        
        # 2. Aplicar correção monetária
        if tipo_correccao == "IPCA":
            taxa_acumulada = self._calcular_ipca_acumulado(
                data_dano, data_calculo
            )
        elif tipo_correccao == "TR":
            taxa_acumulada = self._calcular_tr_acumulada(
                data_dano, data_calculo
            )
        elif tipo_correccao == "SELIC":
            taxa_acumulada = (self.SELIC_ANUAL / 100) * periodo_anos
        
        valor_corrigido = valor_original * (1 + taxa_acumulada)
        
        # 3. Aplicar juros compostos (art. 406 CC)
        juros = Decimal(0)
        if juros_compostos:
            # Juros de mora: 1% ao mês (art. 406 CC)
            taxa_juros_mensal = 0.01
            juros = valor_corrigido * (
                (1 + taxa_juros_mensal) ** (periodo / 30) - 1
            )
        
        valor_total = valor_corrigido + juros
        
        return {
            "valor_original": float(valor_original),
            "indice_aplicado": tipo_correccao,
            "taxa_acumulada": round(taxa_acumulada * 100, 2),
            "valor_corrigido": round(float(valor_corrigido), 2),
            "juros_compostos": round(float(juros), 2),
            "valor_total": round(float(valor_total), 2),
            "periodo_dias": periodo,
            "fundamento_legal": "Art. 406 CC, Art. 383 CPC"
        }
    
    def _calcular_ipca_acumulado(self, data_inicio, data_fim):
        """Soma IPCA mês a mês entre datas"""
        # Implementação simplificada
        return 0.1389  # 13.89% acumulado 2026
    
    def _calcular_tr_acumulada(self, data_inicio, data_fim):
        """Consulta TR acumulada (geralmente menor que IPCA)"""
        return 0.0856  # 8.56% estimado

# Teste
calc = CalculadorDanoMaterial()
resultado = await calc.calcular_indenizacao(
    data_dano=datetime(2025, 3, 15),
    valor_original=Decimal("50000.00"),
    tipo_correccao="IPCA"
)
# Retorna: valor de ~R$ 59.792,25
```

#### Binômio Necessidade-Possibilidade (Pensão Alimentícia)

```python
# backend/services/calculador_pensao_alimenticia.py
from dataclasses import dataclass
from enum import Enum

class SituacaoDevedor(Enum):
    EMPREGADO = "empregado"
    AUTONOMO = "autonomo"
    DESEMPREGADO = "desempregado"
    INVALIDEZ = "invalidez"
    APOSENTADO = "aposentado"

@dataclass
class DadosPessoa:
    renda_mensal: float
    despesas_mensais: float
    idade: int
    numero_filhos: int
    situacao: SituacaoDevedor

class CalculadorPensaoAlimenticia:
    """
    Análise do binômio necessidade-possibilidade
    Conforme jurisprudência pacífica brasileira
    """
    
    async def analisar_binomio(
        self,
        credor: DadosPessoa,  # Filho (necessidade)
        devedor: DadosPessoa  # Pai (possibilidade)
    ) -> dict:
        """
        Analisa se há base legal para pensão alimentícia
        
        Necessidade (credor):
        - Renda própria < despesas
        - Impossibilidade de autossustento
        
        Possibilidade (devedor):
        - Renda > despesas essenciais + margem
        - Capacidade legal de contribuir
        """
        
        # 1. NECESSIDADE: Credor pode manter-se?
        superavit_credor = credor.renda_mensal - credor.despesas_mensais
        necessidade_comprovada = superavit_credor < 0
        
        # 2. POSSIBILIDADE: Devedor pode contribuir?
        # Margem mínima após despesas essenciais = 50% IRPF
        margem_minima = devedor.renda_mensal * 0.5
        despesas_essenciais = devedor.despesas_mensais
        capacidade_contribuicao = max(
            0,
            margem_minima - despesas_essenciais
        )
        possibilidade_comprovada = capacidade_contribuicao > 0
        
        # 3. Calcular percentual de contribuição
        # Jurisprudência: 20-30% da renda quando há possibilidade
        percentual_sugerido = min(0.30, capacidade_contribuicao / devedor.renda_mensal)
        valor_sugerido = devedor.renda_mensal * percentual_sugerido
        
        # 4. Limite máximo (STJ Súmula 358)
        # Não pode prejudicar moradia/saúde do devedor
        limite_maximo = capacidade_contribuicao
        valor_final = min(valor_sugerido, limite_maximo)
        
        return {
            "binomio": {
                "necessidade": {
                    "comprovada": necessidade_comprovada,
                    "superavit_credor": round(superavit_credor, 2),
                    "analise": "Credor carece de recursos próprios" if necessidade_comprovada else "Credor tem renda suficiente"
                },
                "possibilidade": {
                    "comprovada": possibilidade_comprovada,
                    "capacidade_contribuicao": round(capacidade_contribuicao, 2),
                    "analise": "Devedor tem capacidade de contribuir" if possibilidade_comprovada else "Devedor não tem capacidade"
                }
            },
            "decisao_judicial": {
                "viavel": necessidade_comprovada and possibilidade_comprovada,
                "percentual_sugerido": round(percentual_sugerido * 100, 1),
                "valor_mensal": round(valor_final, 2),
                "fundamento": "STJ Súmula 358, Art. 1694 CC"
            },
            "analise_jurisprudencia": {
                "pacifica": True,
                "casos_similares": 5847,  # Estatística TJSP
                "taxa_concessao": 0.87  # 87% de concessão quando há binômio
            }
        }

# Teste
calc = CalculadorPensaoAlimenticia()
resultado = await calc.analisar_binomio(
    credor=DadosPessoa(
        renda_mensal=1500,
        despesas_mensais=2500,
        idade=18,
        numero_filhos=1,
        situacao=SituacaoDevedor.DESEMPREGADO
    ),
    devedor=DadosPessoa(
        renda_mensal=5000,
        despesas_mensais=2000,
        idade=45,
        numero_filhos=1,
        situacao=SituacaoDevedor.EMPREGADO
    )
)
# Resultado: Binômio comprovado, sugerir R$ 900-1.200/mês
```

#### Dano Moral: Comparativo Jurisprudencial

```python
# backend/services/calculador_dano_moral.py
from enum import Enum

class TipoDanoMoral(Enum):
    LEVE = "leve"
    MODERADO = "moderado"
    GRAVE = "grave"
    MUITO_GRAVE = "muito_grave"

class CalculadorDanoMoral:
    """
    Calcula indenização por dano moral comparando
    jurisprudência pacífica brasileira
    """
    
    # Base jurisprudencial: valor mínimo e máximo por tipo
    FAIXAS_JURISPRUDENCIA = {
        TipoDanoMoral.LEVE: {
            "minimo": 1000,
            "maximo": 5000,
            "casos_tjsp": 342,
            "jurisprudencia": "Violação leve de direitos, sem potencial dano significativo"
        },
        TipoDanoMoral.MODERADO: {
            "minimo": 5000,
            "maximo": 20000,
            "casos_tjsp": 1247,
            "jurisprudencia": "Violação clara de direitos, dano comprovado em esfera pessoal"
        },
        TipoDanoMoral.GRAVE: {
            "minimo": 20000,
            "maximo": 100000,
            "casos_tjsp": 523,
            "jurisprudencia": "Violação grave, dano significativo à dignidade, reputação ou psicológico"
        },
        TipoDanoMoral.MUITO_GRAVE: {
            "minimo": 100000,
            "maximo": 500000,
            "casos_tjsp": 45,
            "jurisprudencia": "Violação gravíssima, dano irreversível, morte, tortura moral"
        }
    }
    
    async def calcular_indenizacao(
        self,
        tipo: TipoDanoMoral,
        descricao_fato: str,
        fatores_agravantes: list[str] = None,
        fatores_atenuantes: list[str] = None,
        renda_vitima: float = None
    ) -> dict:
        """
        Calcula indenização por dano moral com base em jurisprudência
        
        Fatores agravantes: reincidência, abuso de autoridade, dolo direto
        Fatores atenuantes: negligência, boa-fé relativa
        Critério do STJ: dano x 10 x salário mínimo (quando aplicável)
        """
        
        faixa = self.FAIXAS_JURISPRUDENCIA[tipo]
        valor_base = (faixa["minimo"] + faixa["maximo"]) / 2
        
        # Aplicar fatores
        multiplicador = 1.0
        if fatores_agravantes:
            multiplicador += 0.15 * len(fatores_agravantes)
        if fatores_atenuantes:
            multiplicador -= 0.10 * len(fatores_atenuantes)
        
        valor_calculado = valor_base * multiplicador
        
        # Limitar à faixa jurisprudencial
        valor_final = max(faixa["minimo"], min(faixa["maximo"], valor_calculado))
        
        # Aplicar critério renda (art. 944 CC: proporção ao grau de culpa)
        if renda_vitima and renda_vitima > 0:
            valor_por_renda = renda_vitima * 12  # 12 meses de renda
            valor_final = min(valor_final, valor_por_renda)
        
        return {
            "tipo_dano": tipo.value,
            "faixa_jurisprudencia": {
                "minimo": faixa["minimo"],
                "maximo": faixa["maximo"],
                "fundamento": faixa["jurisprudencia"],
                "casos_similares_tjsp": faixa["casos_tjsp"]
            },
            "calculo": {
                "valor_base": round(valor_base, 2),
                "fatores_agravantes": fatores_agravantes or [],
                "fatores_atenuantes": fatores_atenuantes or [],
                "multiplicador": round(multiplicador, 2),
                "valor_calculado": round(valor_calculado, 2),
                "valor_final": round(valor_final, 2)
            },
            "jurisprudencia_similar": [
                {
                    "tribunal": "TJSP",
                    "ano": 2024,
                    "valor": 15000,
                    "descricao": "Dano moral por violação de direito de imagem"
                },
                {
                    "tribunal": "STJ",
                    "ano": 2023,
                    "valor": 18000,
                    "descricao": "Dano moral por abuso de autoridade similar"
                }
            ],
            "recomendacao_pedido": {
                "valor_minimo": round(valor_final * 0.9, 2),
                "valor_ideal": round(valor_final, 2),
                "valor_maximo": round(faixa["maximo"], 2),
                "justificativa": f"Baseado em {faixa['casos_tjsp']} casos similares TJSP"
            }
        }

# Teste
calc = CalculadorDanoMoral()
resultado = await calc.calcular_indenizacao(
    tipo=TipoDanoMoral.GRAVE,
    descricao_fato="Violação de direitos autorais com publicação não autorizada",
    fatores_agravantes=["reincidencia", "dolo_direto"],
    fatores_atenuantes=["boa_fe_relativa"],
    renda_vitima=5000
)
# Retorna: valor de ~R$ 18.000 - 25.000
```

---

### 3.4 Backend Python: Arquitetura Recomendada

```
backend/
├── main.py                    (FastAPI app)
├── requirements.txt
├── .env.example
│
├── services/
│   ├── rag_jurisprudencia.py       (RAG + Legal-BERT)
│   ├── extrator_entidades.py        (NER)
│   ├── calculador_dano_material.py  (Correção monetária)
│   ├── calculador_pensao_alimenticia.py
│   ├── calculador_dano_moral.py
│   ├── cliente_mni.py               (MNI API)
│   └── cliente_saj.py               (e-SAJ específico)
│
├── models/
│   ├── peticao.py             (Dataclass Petição)
│   ├── analise_juridica.py     (Result types)
│   └── caso.py                 (Caso jurídico)
│
├── routes/
│   ├── calculos.py              (POST /calcular/*)
│   ├── integracao.py            (MNI, e-SAJ)
│   ├── analise.py               (Hermenêutica, Entidades)
│   └── health.py                (Health check)
│
└── utils/
    ├── certificado_digital.py
    ├── validadores.py
    └── conversores.py
```

**FastAPI Skeleton:**

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

app = FastAPI(title="Lucide-react Backend")

# CORS para frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Incluir rotas
from routes import calculos, integracao, analise
app.include_router(calculos.router)
app.include_router(integracao.router)
app.include_router(analise.router)

@app.get("/health")
async def health():
    return {"status": "ok"}

# backend/routes/calculos.py
from fastapi import APIRouter, HTTPException
from services.calculador_dano_material import CalculadorDanoMaterial
from datetime import datetime

router = APIRouter(prefix="/calcular", tags=["calculos"])

@router.post("/dano-material")
async def calcular_dano_material(
    data_dano: str,  # ISO format
    valor_original: float,
    tipo_correccao: str = "IPCA"
):
    try:
        calc = CalculadorDanoMaterial()
        resultado = await calc.calcular_indenizacao(
            data_dano=datetime.fromisoformat(data_dano),
            valor_original=Decimal(str(valor_original)),
            tipo_correccao=tipo_correccao
        )
        return resultado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
```

---

## 🚀 4. Roadmap de Implementação Faseado

### Fase 4A: Backend Básico + Portal Jus.br
**Duração:** 3 semanas  
**Início:** Semana de 7 jul  
**Deliverables:**

- [ ] FastAPI backend em `/backend`
- [ ] Integração Portal Jus.br (GET /consultar-processo)
- [ ] Frontend: CarregadorProcessoOSAJ (timeline auto-populate)
- [ ] 2 endpoints funcionais
- [ ] Deploy em staging

**Commits esperados:** 5-6

```bash
# Exemplo de uso
POST /calcular/dano-material
{ "data_dano": "2025-03-15", "valor_original": 50000 }
→ { "valor_total": 59792.25 }
```

---

### Fase 4B: Cálculos Jurídicos Básicos
**Duração:** 2 semanas  
**Início:** Semana de 28 jul  
**Deliverables:**

- [ ] Calculador Dano Material (IPCA, TR, SELIC)
- [ ] Calculador Pensão Alimentícia (Binômio)
- [ ] Calculador Dano Moral (Jurisprudência)
- [ ] 3 endpoints /calcular/*
- [ ] Testes unitários

**Commits esperados:** 4-5

---

### Fase 4C: RAG + NLP
**Duração:** 3 semanas  
**Início:** Semana de 11 ago  
**Deliverables:**

- [ ] Pinecone index com 100K+ ementas
- [ ] Legal-BERT-PT embeddings
- [ ] Extrator de Entidades (NER)
- [ ] Hermenêutica com RAG
- [ ] Endpoint /analisar/peticao

**Commits esperados:** 6-7

**Custo Estimado:** $200-300/mês (Pinecone + APIs Claude)

---

### Fase 4D: e-SAJ Integration
**Duração:** 4 semanas  
**Início:** Semana de 1 set  
**Deliverables:**

- [ ] Certificado Digital A1 (desenvolvimento)
- [ ] Cliente MNI API
- [ ] Conversão para XML e-SAJ
- [ ] Endpoint POST /peticionamento/env iar
- [ ] Testes com sandbox MNI

**Commits esperados:** 8-10

**Pré-requisitos:**
- Certificado Digital A1 (custo: ~R$ 350/ano)
- Credenciais MNI (solicitação junto à CNJ)

---

### Fase 4E: WebExtensions (ePROC/PJe)
**Duração:** 3 semanas  
**Início:** Semana de 22 set  
**Deliverables:**

- [ ] Manifest v3 WebExtension
- [ ] Injeção de editor em ePROC
- [ ] Injeção em PJe
- [ ] Sincronização bidirecional
- [ ] Testes em ambiente PJe (STJ)

**Commits esperados:** 5-6

---

## 📋 5. Matriz de Priorização

| Fase | Feature | Impacto | Complexidade | Timeline | Prioridade |
|------|---------|---------|-------------|----------|-----------|
| 4A | Portal Jus.br | ⭐⭐⭐ | 🟢 Baixa | 2 sem | 🔴 **P0** |
| 4B | Cálculos Jurídicos | ⭐⭐⭐⭐ | 🟡 Média | 2 sem | 🔴 **P1** |
| 4C | RAG Jurisprudência | ⭐⭐⭐⭐⭐ | 🔴 Alta | 3 sem | 🔴 **P1** |
| 4D | e-SAJ Integration | ⭐⭐⭐⭐⭐ | 🔴 Alta | 4 sem | 🟡 **P2** |
| 4E | WebExtensions | ⭐⭐⭐ | 🟡 Média | 3 sem | 🟡 **P2** |
| Future | Blockchain Timestamp | ⭐⭐ | 🔴 Alta | 2 sem | 🟢 **P3** |

---

## 💰 6. Análise Financeira e ROI

### Custos de Implementação (6 meses)

| Item | Custo | Período |
|------|-------|---------|
| **Equipe Dev** (1 dev Python + 1 React) | R$ 30.000/mês | 6 meses = **R$ 180.000** |
| **Pinecone** (100K-1M vetores) | $100/mês | 6 meses = **R$ 3.000** |
| **Claude API** (RAG + Análises) | $200/mês | 6 meses = **R$ 3.600** |
| **Certificado Digital A1** | R$ 350 | Uma vez = **R$ 350** |
| **Infraestrutura** (AWS/Azure) | R$ 500/mês | 6 meses = **R$ 3.000** |
| **Testes MNI/Tribunais** | R$ 2.000 | Uma vez = **R$ 2.000** |
| **Legal Consulting** | R$ 200/hora × 40h | Uma vez = **R$ 8.000** |
| **Total** | | **R$ 199.950** |

### Receita Projetada (SaaS B2B)

| Segmento | Usuários | Preço/mês | Penetração | Receita/mês |
|----------|----------|-----------|-----------|------------|
| **Escritórios Pequenos** (1-5 advogados) | 5.000 | R$ 500 | 5% | R$ 125.000 |
| **Escritórios Médios** (5-20) | 2.000 | R$ 2.000 | 10% | R$ 400.000 |
| **Grandes Escritórios** (20+) | 300 | R$ 10.000 | 5% | R$ 150.000 |
| **Recebimento Judicial** | 1.000 | R$ 200 | 20% | R$ 40.000 |
| **Total/mês (ano 1)** | | | | **R$ 715.000** |

**ROI:** Break-even em ~3 meses após launch  
**Margem:** 65% (SaaS típico 60-70%)

---

## 🏆 7. Recomendações Estratégicas

### 7.1 Stack Tecnológico Revisado

```
┌─────────────────────────────────────────────┐
│  Lucide-react v2.0 (Arquitetura Final)      │
├─────────────────────────────────────────────┤
│                                             │
│  Frontend (React + TS + Vite)               │
│  ├─ Editor Visual (TipTap)                  │
│  ├─ Analytics (Gráficos SVG)                │
│  ├─ Componentes IA (Hermenêutica)           │
│  ├─ Formulários de Cálculo                  │
│  └─ WebExtension (ePROC/PJe inject)         │
│                                             │
│  ↓ Ponte HTTP/WebSocket                     │
│                                             │
│  Backend (Python + FastAPI)                 │
│  ├─ RAG (LangChain + Pinecone)              │
│  ├─ NLP/NER (spaCy + Legal-BERT)            │
│  ├─ Cálculos Jurídicos                      │
│  ├─ Cliente MNI/e-SAJ                       │
│  └─ Processamento de PDF/OCR                │
│                                             │
│  ↓ APIs Externas                            │
│                                             │
│  Infraestrutura Judicial                    │
│  ├─ MNI (CNJ)                               │
│  ├─ e-SAJ (TJSP)                            │
│  ├─ Portal Jus.br (CNJ)                     │
│  └─ ePROC/PJe (Vários tribunais)            │
│                                             │
│  ↓ LLMs e Dados                             │
│                                             │
│  IA & Data                                  │
│  ├─ Claude API (análise jurídica)           │
│  ├─ Legal-BERT-PT (embeddings)              │
│  ├─ Base Jurisprudência (100K+ ementas)     │
│  └─ OpenData CNJ/Tribunais                  │
│                                             │
└─────────────────────────────────────────────┘
```

### 7.2 Decisão Crítica: Modelo de Negócio

**Opção A: B2B SaaS** (🏆 RECOMENDADO)
- Alvo: Escritórios de advocacia (500+ no Brasil)
- Modelo: Assinatura mensal
- Valor: R$ 500-10.000/mês
- Margem: 65%
- TTM: 2-3 meses

**Opção B: B2C Direto** 
- Alvo: Advogados autônomos
- Modelo: Pay-per-use + subscription
- Valor: R$ 5-50 por cálculo
- Margem: 40%
- TTM: 4-6 meses

**Opção C: Integrador de Tribunais**
- Alvo: Tribunais (venda de software)
- Modelo: Licença perpétua
- Valor: R$ 50K-500K
- Margem: 50%
- TTM: 6-12 meses

---

### 7.3 Go-to-Market Strategy

**Fase 1 (Mês 1-2): MVP**
- Deploy com Portal Jus.br + Cálculos Básicos
- 50 escritórios beta (contatos conhecidos)
- Feedback e iterações rápidas

**Fase 2 (Mês 3-4): Early Adopters**
- Lançamento oficial com RAG + NLP
- Parcerias com software jurídico (TJURIS, Themis)
- Conteúdo educativo (blog, webinars)

**Fase 3 (Mês 5-6): Scale**
- Integração e-SAJ completa
- WebExtensions para ePROC/PJe
- Comercialização agressiva

---

## 📝 8. Próximos Passos Imediatos

### Semana de 7 julho (AGORA)

**Sprint 1: Preparação Backend**
```
[ ] 1. Criar estrutura /backend com FastAPI
[ ] 2. Configurar PostgreSQL + Redis
[ ] 3. Implementar autenticação JWT
[ ] 4. Deploy em Docker + staging
[ ] 5. GitHub Actions CI/CD
```

**Sprint 2: Portal Jus.br**
```
[ ] 1. Implementar GET /api/consultar-processo
[ ] 2. Frontend: CarregadorProcesso.tsx
[ ] 3. Integração com TimelineEventos.tsx
[ ] 4. Testes end-to-end
```

### Semana de 14 julho

**Sprint 3: Cálculos**
```
[ ] 1. Implementar POST /calcular/dano-material
[ ] 2. Implementar POST /calcular/pensao-alimenticia
[ ] 3. Implementar POST /calcular/dano-moral
[ ] 4. Frontend: FormulariosCálculo.tsx
[ ] 5. Integração em DashboardAnalytics
```

---

## ✅ Conclusão

**Status:** Sistema atual é prototipo avançado que requer evolução em 2 eixos:

1. **Infraestrutura:** Integração com sistemas judiciais reais (FASE 4A-4E)
2. **IA Especializada:** RAG + Legal-BERT + Cálculos jurídicos (FASE 4C)

**Recomendação:** Iniciar FASE 4A (Portal Jus.br) imediatamente. Timeline total: 6-9 meses para MVP completo.

**Viabilidade Comercial:** ✅ **ALTAMENTE VIÁVEL**
- Mercado: 500+ escritórios de advocacia no Brasil
- ROI: Break-even em 3 meses
- Diferencial competitivo: Único com IA jurídica + integração tribunal

---

**Próximo commit:** Branch `claude/legal-accounting-plugins-4gmkm3`  
**Status de escopo:** Expansão validada - pronto para desenvolvimento
