"""
Multi-Tier LLM Router - Rotas para análise inteligente com 4-Tier Stack

Endpoints:
- POST /api/analyze/intelligent - Análise com roteamento automático
- GET /api/llm/stats - Estatísticas de uso
- GET /api/llm/config - Configuração atual
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from enum import Enum
import os

from services.multi_tier_router import MultiTierRouter, LLMTier

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/llm", tags=["multi-tier-llm"])

# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================


class TaskType(str, Enum):
    """Tipos de tarefas para roteamento"""
    HERMENAUTICA_JURIDICA = "hermenautica_juridica"
    ANALISE_RAPIDA = "analise_rapida"
    CLASSIFICACAO_CASO = "classificacao_caso"
    BUSCA_JURISPRUDENCIA = "busca_jurisprudencia"
    SUMARIZACAO = "sumarizacao"
    EXTRACAO_ENTIDADES = "extracao_entidades"
    ANALISE_DADOS_SENSIVEIS = "analise_dados_sensiveis"


class AnalyzeRequest(BaseModel):
    """Request para análise inteligente"""
    prompt: str = Field(..., description="Texto a analisar")
    task_type: TaskType = Field(
        default=TaskType.ANALISE_RAPIDA,
        description="Tipo de tarefa para roteamento"
    )
    is_urgent: bool = Field(
        default=False,
        description="Se True, prioriza velocidade"
    )
    allow_premium: bool = Field(
        default=True,
        description="Se True, permite usar Claude (pago)"
    )
    temperature: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Criatividade (0=determinístico, 1=criativo)"
    )
    max_tokens: int = Field(
        default=1000,
        ge=100,
        le=4000,
        description="Máximo tokens na resposta"
    )


class AnalyzeResponse(BaseModel):
    """Response de análise"""
    provider: str
    response: str
    task_type: str
    tokens_used: int
    cost_usd: float
    latency_ms: int
    confidence: float
    primary_choice: bool
    fallback_used: Optional[bool] = None
    model: str
    tier: str


# ============================================================================
# GLOBAL ROUTER INSTANCE
# ============================================================================

# Inicializar router com configurações
try:
    multi_tier_router = MultiTierRouter(
        cost_aware=os.getenv("LLM_COST_AWARE", "true").lower() == "true",
        fallback_enabled=os.getenv("LLM_FALLBACK_ENABLED", "true").lower() == "true",
    )
    logger.info("✅ MultiTierRouter inicializado com sucesso")
except Exception as e:
    logger.error(f"❌ Erro ao inicializar MultiTierRouter: {e}")
    multi_tier_router = None

# ============================================================================
# ENDPOINTS
# ============================================================================


@router.post("/analyze/intelligent")
async def analyze_intelligent(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Análise inteligente com roteamento automático 4-Tier

    Características:
    - Rota automaticamente para o melhor LLM (Claude, Groq, Gemini, Ollama)
    - Fallback automático se provider primário falhar
    - Cost-aware (economiza dinheiro por padrão)
    - Tracking de estatísticas

    Tipos de tarefa:
    - hermenautica_juridica: Análise jurídica profunda (usa Claude)
    - analise_rapida: Análise rápida (usa Groq - GRÁTIS)
    - classificacao_caso: Classificar tipo de caso (usa Groq - GRÁTIS)
    - busca_jurisprudencia: Busca simples (usa Gemini - BARATO)
    - sumarizacao: Resumir texto (usa Groq - GRÁTIS)
    - extracao_entidades: Extrair dados (usa Gemini - BARATO)
    - analise_dados_sensiveis: Dados críticos (usa Ollama - PRIVADO)
    """
    if not multi_tier_router:
        raise HTTPException(
            status_code=503,
            detail="MultiTierRouter não disponível"
        )

    try:
        result = await multi_tier_router.route_and_analyze(
            prompt=request.prompt,
            task_type=request.task_type.value,
            is_urgent=request.is_urgent,
            allow_premium=request.allow_premium,
        )

        # Converter result para response
        return AnalyzeResponse(
            provider=result.get("provider"),
            response=result.get("response"),
            task_type=request.task_type.value,
            tokens_used=result.get("tokens_used", 0),
            cost_usd=result.get("cost_usd", 0),
            latency_ms=result.get("latency_ms", 0),
            confidence=result.get("confidence", 0),
            primary_choice=result.get("primary_choice", True),
            fallback_used=result.get("fallback_used", False),
            model=result.get("model", "unknown"),
            tier=result.get("tier", "unknown"),
        )

    except Exception as e:
        logger.error(f"❌ Erro na análise: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar análise: {str(e)}"
        )


@router.get("/stats")
async def get_stats() -> Dict[str, Any]:
    """
    Obter estatísticas de uso do MultiTierRouter

    Retorna:
    - total_calls: Número total de requisições
    - total_cost_usd: Custo total em USD
    - by_provider: Estatísticas por provider (Claude, Groq, Gemini, Ollama)
    - cost_per_call: Custo médio por requisição
    """
    if not multi_tier_router:
        raise HTTPException(
            status_code=503,
            detail="MultiTierRouter não disponível"
        )

    return multi_tier_router.get_usage_stats()


@router.post("/stats/reset")
async def reset_stats() -> Dict[str, str]:
    """
    Resetar estatísticas de uso

    ⚠️ Use com cuidado - limpa histórico de custos
    """
    if not multi_tier_router:
        raise HTTPException(
            status_code=503,
            detail="MultiTierRouter não disponível"
        )

    multi_tier_router.reset_stats()
    return {
        "status": "reset",
        "message": "Estatísticas resetadas com sucesso"
    }


@router.get("/config")
async def get_config() -> Dict[str, Any]:
    """
    Obter configuração atual do MultiTierRouter

    Retorna:
    - cost_aware: Se roteamento é consciente de custo
    - fallback_enabled: Se fallback automático está ativo
    - default_tier: Tier padrão para novas requisições
    - tiers: Informações sobre cada tier
    """
    if not multi_tier_router:
        raise HTTPException(
            status_code=503,
            detail="MultiTierRouter não disponível"
        )

    return {
        "cost_aware": multi_tier_router.cost_aware,
        "fallback_enabled": multi_tier_router.fallback_enabled,
        "default_tier": os.getenv("LLM_DEFAULT_TIER", "TIER2"),
        "tiers": {
            "TIER1_PREMIUM": {
                "provider": "Claude (Anthropic)",
                "cost": "$0.15/análise",
                "latency": "5-10s",
                "quality": "95%",
                "use_case": "Hermenêutica jurídica, análises críticas"
            },
            "TIER2_FAST_FREE": {
                "provider": "Groq",
                "cost": "$0 (GRÁTIS!)",
                "latency": "1-2s",
                "quality": "82%",
                "use_case": "Análises rápidas, classificação, sumarização"
            },
            "TIER3_CHEAP": {
                "provider": "Gemini (Google)",
                "cost": "$0.001/query",
                "latency": "2-3s",
                "quality": "85%",
                "use_case": "Buscas simples, extração básica"
            },
            "TIER4_PRIVATE": {
                "provider": "Ollama (Local)",
                "cost": "$0 (LOCAL)",
                "latency": "3-5s",
                "quality": "70%",
                "use_case": "Dados sensíveis, análise offline, máxima privacidade"
            }
        },
        "task_types": {
            "hermenautica_juridica": "→ TIER1 (Claude)",
            "analise_rapida": "→ TIER2 (Groq)",
            "classificacao_caso": "→ TIER2 (Groq)",
            "busca_jurisprudencia": "→ TIER3 (Gemini)",
            "sumarizacao": "→ TIER2 (Groq)",
            "extracao_entidades": "→ TIER3 (Gemini)",
            "analise_dados_sensiveis": "→ TIER4 (Ollama)"
        }
    }


@router.get("/health")
async def health() -> Dict[str, str]:
    """
    Health check do MultiTierRouter

    Retorna status de todos os 4 tiers
    """
    if not multi_tier_router:
        return {"status": "unavailable", "message": "MultiTierRouter não inicializado"}

    return {
        "status": "healthy",
        "message": "MultiTierRouter funcionando normalmente",
        "router_initialized": multi_tier_router is not None,
    }
