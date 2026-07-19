"""
Advanced Research Routes
Endpoints para pesquisa avançada com RAG, roteamento inteligente e histórico
"""

import logging
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from enum import Enum

from services.advanced_research import (
    AdvancedResearchService,
    ResearchMode,
    SearchResult,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/research", tags=["advanced-research"])

# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================


class ResearchModeEnum(str, Enum):
    """Modos de pesquisa"""

    RAG_ENHANCED = "rag_enhanced"
    QUICK_ANALYSIS = "quick_analysis"
    HYBRID = "hybrid"


class AdvancedSearchRequest(BaseModel):
    """Request para pesquisa avançada"""

    query: str = Field(..., description="Consulta de pesquisa")
    mode: ResearchModeEnum = Field(
        default=ResearchModeEnum.HYBRID,
        description="Modo de pesquisa (RAG_ENHANCED, QUICK_ANALYSIS, HYBRID)",
    )
    task_type: str = Field(
        default="hermenautica_juridica",
        description="Tipo de tarefa para roteamento",
    )
    is_urgent: bool = Field(default=False, description="Se pesquisa é urgente")
    conversation_id: Optional[str] = Field(
        default=None, description="ID da conversa para manter histórico"
    )


class SourceInfo(BaseModel):
    """Informação de fonte"""

    type: str
    tribunal_info: str
    relevance: float


class AdvancedSearchResponse(BaseModel):
    """Response de pesquisa avançada"""

    id: str
    analysis: str
    provider: str
    tier: str
    tokens_used: int
    cost_usd: float
    latency_ms: int
    sources: List[SourceInfo]
    confidence: float
    is_fallback: bool
    created_at: str


class ConversationMessage(BaseModel):
    """Mensagem em uma conversa"""

    id: str
    query: str
    analysis: str
    provider: str
    tier: str
    cost_usd: float
    created_at: str


class ConversationHistoryResponse(BaseModel):
    """Histórico de conversa"""

    conversation_id: str
    messages: List[ConversationMessage]
    total_cost_usd: float
    total_queries: int


class ResearchStatisticsResponse(BaseModel):
    """Estatísticas de pesquisa"""

    total_searches: int
    total_cost_usd: float
    total_tokens: int
    conversations: int
    router_stats: Dict[str, Any]


# ============================================================================
# GLOBAL SERVICE INSTANCE
# ============================================================================

try:
    advanced_research = AdvancedResearchService()
    logger.info("✅ AdvancedResearchService inicializado com sucesso")
except Exception as e:
    logger.error(f"❌ Erro ao inicializar AdvancedResearchService: {e}")
    advanced_research = None

# ============================================================================
# ENDPOINTS
# ============================================================================


@router.post("/search/advanced")
async def search_advanced(request: AdvancedSearchRequest) -> AdvancedSearchResponse:
    """
    Executar pesquisa avançada com RAG e roteamento inteligente

    Recursos:
    - RAG com jurisprudência (Pinecone)
    - Roteamento inteligente 4-Tier
    - Histórico de conversa
    - Citation management
    - Semantic search

    Modos:
    - rag_enhanced: Usa jurisprudência do Pinecone
    - quick_analysis: Análise rápida sem RAG
    - hybrid: Combina ambas as abordagens (recomendado)
    """
    if not advanced_research:
        raise HTTPException(
            status_code=503, detail="AdvancedResearchService não disponível"
        )

    try:
        result = await advanced_research.search(
            query=request.query,
            mode=ResearchMode(request.mode),
            task_type=request.task_type,
            is_urgent=request.is_urgent,
            conversation_id=request.conversation_id,
        )

        return AdvancedSearchResponse(
            id=result.query.id,
            analysis=result.analysis,
            provider=result.provider,
            tier=result.tier,
            tokens_used=result.tokens_used,
            cost_usd=result.cost_usd,
            latency_ms=result.latency_ms,
            sources=[
                SourceInfo(
                    type=s.get("type", ""),
                    tribunal_info=s.get("tribunal_info", ""),
                    relevance=s.get("relevance", 0),
                )
                for s in result.sources
            ],
            confidence=result.confidence,
            is_fallback=result.is_fallback,
            created_at=result.created_at.isoformat(),
        )

    except Exception as e:
        logger.error(f"❌ Erro na pesquisa avançada: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao executar pesquisa: {str(e)}")


@router.get("/conversation/{conversation_id}")
async def get_conversation(conversation_id: str) -> ConversationHistoryResponse:
    """
    Obter histórico de conversa

    Retorna:
    - Todas as mensagens/queries da conversa
    - Custo total
    - Número de queries
    """
    if not advanced_research:
        raise HTTPException(
            status_code=503, detail="AdvancedResearchService não disponível"
        )

    try:
        history = advanced_research.get_conversation_history(conversation_id)

        messages = [
            ConversationMessage(
                id=result.query.id,
                query=result.query.query,
                analysis=result.analysis,
                provider=result.provider,
                tier=result.tier,
                cost_usd=result.cost_usd,
                created_at=result.created_at.isoformat(),
            )
            for result in history
        ]

        total_cost = sum(msg.cost_usd for msg in messages)

        return ConversationHistoryResponse(
            conversation_id=conversation_id,
            messages=messages,
            total_cost_usd=total_cost,
            total_queries=len(messages),
        )

    except Exception as e:
        logger.error(f"❌ Erro ao obter histórico: {e}")
        raise HTTPException(
            status_code=500, detail=f"Erro ao obter histórico: {str(e)}"
        )


@router.delete("/conversation/{conversation_id}")
async def delete_conversation(conversation_id: str) -> Dict[str, str]:
    """
    Deletar histórico de conversa

    ⚠️ Use com cuidado - não pode ser recuperado
    """
    if not advanced_research:
        raise HTTPException(
            status_code=503, detail="AdvancedResearchService não disponível"
        )

    try:
        success = advanced_research.clear_conversation(conversation_id)

        if success:
            return {
                "status": "deleted",
                "message": f"Conversa {conversation_id} deletada com sucesso",
            }
        else:
            return {
                "status": "not_found",
                "message": f"Conversa {conversation_id} não encontrada",
            }

    except Exception as e:
        logger.error(f"❌ Erro ao deletar conversa: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao deletar conversa: {str(e)}")


@router.get("/statistics")
async def get_statistics() -> ResearchStatisticsResponse:
    """
    Obter estatísticas de pesquisa avançada

    Retorna:
    - Total de pesquisas realizadas
    - Custo total em USD
    - Total de tokens utilizados
    - Número de conversas
    - Estatísticas do router 4-Tier
    """
    if not advanced_research:
        raise HTTPException(
            status_code=503, detail="AdvancedResearchService não disponível"
        )

    try:
        stats = advanced_research.get_statistics()

        return ResearchStatisticsResponse(
            total_searches=stats.get("total_searches", 0),
            total_cost_usd=stats.get("total_cost_usd", 0),
            total_tokens=stats.get("total_tokens", 0),
            conversations=stats.get("conversations", 0),
            router_stats=stats.get("router_stats", {}),
        )

    except Exception as e:
        logger.error(f"❌ Erro ao obter estatísticas: {e}")
        raise HTTPException(
            status_code=500, detail=f"Erro ao obter estatísticas: {str(e)}"
        )


@router.post("/statistics/clear")
async def clear_all_statistics() -> Dict[str, Any]:
    """
    Limpar todo o histórico de pesquisa

    ⚠️ CUIDADO: Limpa dados de todas as conversas - não pode ser recuperado
    """
    if not advanced_research:
        raise HTTPException(
            status_code=503, detail="AdvancedResearchService não disponível"
        )

    try:
        count = advanced_research.clear_all_history()

        return {
            "status": "cleared",
            "records_deleted": count,
            "message": f"{count} registros de pesquisa foram deletados",
        }

    except Exception as e:
        logger.error(f"❌ Erro ao limpar histórico: {e}")
        raise HTTPException(
            status_code=500, detail=f"Erro ao limpar histórico: {str(e)}"
        )


@router.get("/health")
async def health() -> Dict[str, str]:
    """
    Health check do serviço de pesquisa avançada

    Retorna status de todos os componentes:
    - Router 4-Tier
    - RAG Chain
    - Pinecone Client
    - Embeddings
    """
    if not advanced_research:
        return {
            "status": "unavailable",
            "message": "AdvancedResearchService não inicializado",
        }

    checks = {
        "router": "healthy" if advanced_research.router else "unavailable",
        "rag_chain": "healthy" if advanced_research.rag_chain else "unavailable",
        "pinecone": "healthy" if advanced_research.pinecone else "unavailable",
        "embeddings": "healthy" if advanced_research.embeddings else "unavailable",
    }

    all_healthy = all(status == "healthy" for status in checks.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "message": "Advanced Research Service funcionando normalmente"
        if all_healthy
        else "Alguns componentes não estão disponíveis",
        "components": checks,
    }
