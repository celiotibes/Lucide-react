"""
Rotas RAG para análise jurídica com hermenêutica blindada

Endpoints:
- POST /analisar/hermenautica: Gera hermenêutica completa
- POST /responder/pergunta: Responde pergunta específica
- GET /jurisprudencia: Busca jurisprudência similar
"""

import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from decimal import Decimal

from services.legal_embeddings import LegalEmbeddings
from services.pinecone_client import PineconeClient
from services.rag_chain import RAGChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["RAG"])

# Inicializar serviços globais
try:
    embeddings_service = LegalEmbeddings()
    pinecone_service = PineconeClient()
    rag_chain = RAGChain(embeddings_service, pinecone_service)
    logger.info("✅ Serviços RAG inicializados")
except Exception as e:
    logger.error(f"❌ Erro ao inicializar RAG: {e}")
    embeddings_service = None
    pinecone_service = None
    rag_chain = None


# ============================================================================
# MODELOS REQUEST/RESPONSE
# ============================================================================


class AnalisarHermenauticaRequest(BaseModel):
    """Request para análise de hermenêutica"""

    fatos: List[str] = Field(..., description="Lista de fatos do caso")
    calculador_dados: Optional[Dict] = Field(
        None,
        description="Dados dos calculadores (dano_material, pensao, dano_moral)",
    )
    top_k: int = Field(5, ge=1, le=20, description="Top K jurisprudências a trazer")
    temperatura: float = Field(0.3, ge=0.0, le=1.0, description="Criatividade da resposta")


class HermenauticaResponse(BaseModel):
    """Response com hermenêutica gerada"""

    hermeneutica: str = Field(..., description="Texto da hermenêutica")
    citacoes: List[str] = Field(..., description="Citações jurídicas principais")
    confianca: float = Field(..., description="Score de confiança [0-1]")
    fontes_usadas: int = Field(..., description="Número de fontes jurisprudenciais")
    modelo: str = Field(..., description="Modelo Claude usado")
    tokens_usados: int = Field(..., description="Tokens consumidos")


class ResponderPerguntaRequest(BaseModel):
    """Request para responder pergunta"""

    pergunta: str = Field(..., description="Pergunta jurídica")


class ResponderPerguntaResponse(BaseModel):
    """Response com resposta à pergunta"""

    pergunta: str
    resposta: str
    fontes: List[Dict] = Field(..., description="Jurisprudência citada")
    confianca: float


class BuscarJurisprudenciaRequest(BaseModel):
    """Request para buscar jurisprudência"""

    query: str = Field(..., description="Texto de busca")
    top_k: int = Field(5, ge=1, le=20)
    filtro: Optional[Dict] = Field(None, description="Filtro por metadados (tribunal, ano, etc)")


class JurisprudenciaResult(BaseModel):
    """Um resultado de jurisprudência"""

    id: str
    score: float
    metadata: Dict


class BuscarJurisprudenciaResponse(BaseModel):
    """Response com resultados de jurisprudência"""

    total_encontrados: int
    resultados: List[JurisprudenciaResult]


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.post("/analisar/hermenautica", response_model=HermenauticaResponse)
async def analisar_hermenautica(request: AnalisarHermenauticaRequest):
    """
    Gerar hermenêutica blindada com jurisprudência via RAG

    Args:
        fatos: Lista de fatos/argumentos do caso
        calculador_dados: Opcional - dados dos calculadores jurídicos
        top_k: Número de fontes jurisprudenciais a trazer (padrão 5)
        temperatura: Controle de criatividade (0.3 = preciso, 1.0 = criativo)

    Returns:
        Hermenêutica com 4 pilares + jurisprudência citada

    Exemplo:
        ```json
        {
            "fatos": [
                "Cliente sofreu violação de direitos autorais",
                "Publicação não autorizada em rede social"
            ],
            "calculador_dados": {
                "dano_moral": {
                    "tipo_dano": "moderado",
                    "valor_recomendado": 15000
                }
            },
            "top_k": 5
        }
        ```
    """
    if not rag_chain:
        raise HTTPException(
            status_code=503,
            detail="Serviço RAG não disponível. Verificar configuração Pinecone/Embeddings",
        )

    try:
        # Juntar fatos
        query_text = "\n".join(request.fatos)

        # Gerar hermenêutica
        resultado = rag_chain.gerar_hermeneutica(
            query=query_text,
            top_k=request.top_k,
            calculador_dados=request.calculador_dados,
            temperatura=request.temperatura,
        )

        logger.info("✅ Hermenêutica gerada com sucesso")
        return HermenauticaResponse(**resultado)

    except Exception as e:
        logger.error(f"❌ Erro ao gerar hermenêutica: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/responder/pergunta", response_model=ResponderPerguntaResponse)
async def responder_pergunta(request: ResponderPerguntaRequest):
    """
    Responder pergunta jurídica com jurisprudência

    Args:
        pergunta: Pergunta específica sobre o caso

    Returns:
        Resposta fundamentada com fontes

    Exemplo:
        ```json
        {
            "pergunta": "Qual o prazo de prescrição para indenização por dano moral?"
        }
        ```
    """
    if not rag_chain:
        raise HTTPException(status_code=503, detail="Serviço RAG não disponível")

    try:
        resultado = rag_chain.responder_pergunta(pergunta=request.pergunta)

        logger.info("✅ Pergunta respondida com sucesso")
        return ResponderPerguntaResponse(**resultado)

    except Exception as e:
        logger.error(f"❌ Erro ao responder pergunta: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/buscar/jurisprudencia", response_model=BuscarJurisprudenciaResponse)
async def buscar_jurisprudencia(request: BuscarJurisprudenciaRequest):
    """
    Buscar jurisprudência similar por query de texto

    Args:
        query: Texto para buscar (será convertido para embedding)
        top_k: Número de resultados
        filtro: Filtrar por tribunal, ano, etc

    Returns:
        Lista de jurisprudências similares com scores

    Exemplo:
        ```json
        {
            "query": "Abuso de autoridade por policial civil",
            "top_k": 5,
            "filtro": {"tribunal": "TJSP", "ano": 2024}
        }
        ```
    """
    if not rag_chain:
        raise HTTPException(status_code=503, detail="Serviço RAG não disponível")

    try:
        # Gerar embedding da query
        query_embedding = embeddings_service.embeddings_from_text(request.query)

        # Buscar no Pinecone
        resultados = pinecone_service.buscar_similaridade(
            query_embedding=query_embedding.tolist(),
            top_k=request.top_k,
            filter_dict=request.filtro,
        )

        logger.info(f"✅ {len(resultados)} jurisprudências encontradas")

        return BuscarJurisprudenciaResponse(
            total_encontrados=len(resultados),
            resultados=[JurisprudenciaResult(**r) for r in resultados],
        )

    except Exception as e:
        logger.error(f"❌ Erro ao buscar jurisprudência: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rag/status")
async def rag_status():
    """Status dos serviços RAG"""
    try:
        if not rag_chain:
            return {
                "status": "unavailable",
                "reason": "RAG services not initialized",
            }

        stats = pinecone_service.stats()
        return {
            "status": "ready",
            "pinecone": stats,
            "embedding_model": embeddings_service.model_name,
            "embedding_dimension": embeddings_service.get_embedding_dimension(),
            "llm_model": rag_chain.model,
        }
    except Exception as e:
        logger.error(f"❌ Erro ao obter status: {e}")
        return {"status": "error", "detail": str(e)}
