"""
4-Tier LLM Router - Smart routing entre Claude, Groq, Gemini e Ollama

TIER 1: Claude (Premium) - Hermenêutica jurídica
TIER 2: Groq (Free+Fast) - Análises rápidas, default
TIER 3: Gemini (Cheap) - Buscas simples
TIER 4: Ollama (Private) - Dados sensíveis, local
"""

import logging
import os
from enum import Enum
from dataclasses import dataclass
from typing import Optional, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class LLMTier(Enum):
    """Tiers de LLM com características diferentes"""
    TIER1_PREMIUM = "claude"          # Melhor qualidade, custo médio
    TIER2_FAST_FREE = "groq"          # Rápido e grátis (recomendado)
    TIER3_CHEAP = "gemini"            # Barato, bom para simples
    TIER4_PRIVATE = "ollama"          # Privado, local


@dataclass
class LLMResponse:
    """Response padrão de qualquer LLM"""
    provider: str
    response: str
    tokens_used: int
    cost_usd: float
    latency_ms: int
    confidence: float = 0.80
    tier: str = ""


@dataclass
class RoutingRule:
    """Regra de roteamento para um tipo de tarefa"""
    task_type: str
    primary_tier: LLMTier
    secondary_tier: LLMTier
    reason: str
    cost_usd_expected: float
    quality_threshold: float = 0.70


class MultiTierRouter:
    """
    Router inteligente que escolhe o melhor LLM para cada tarefa

    Características:
    - Automaticamente seleciona melhor provider baseado em task type
    - Fallback automático se provider primário falhar
    - Cost-aware routing (economiza dinheiro)
    - Confidence scoring
    """

    # Regras de roteamento por tipo de tarefa
    ROUTING_RULES = {
        "hermenautica_juridica": RoutingRule(
            task_type="hermenautica_juridica",
            primary_tier=LLMTier.TIER1_PREMIUM,
            secondary_tier=LLMTier.TIER2_FAST_FREE,
            reason="Análise crítica = máxima qualidade (Claude)",
            cost_usd_expected=0.15,
            quality_threshold=0.90,
        ),
        "analise_rapida": RoutingRule(
            task_type="analise_rapida",
            primary_tier=LLMTier.TIER2_FAST_FREE,
            secondary_tier=LLMTier.TIER1_PREMIUM,
            reason="Análise rápida = Groq (grátis + rápido)",
            cost_usd_expected=0.0,
            quality_threshold=0.80,
        ),
        "classificacao_caso": RoutingRule(
            task_type="classificacao_caso",
            primary_tier=LLMTier.TIER2_FAST_FREE,
            secondary_tier=LLMTier.TIER3_CHEAP,
            reason="Classificação = Groq (rápido)",
            cost_usd_expected=0.0,
            quality_threshold=0.75,
        ),
        "busca_jurisprudencia": RoutingRule(
            task_type="busca_jurisprudencia",
            primary_tier=LLMTier.TIER3_CHEAP,
            secondary_tier=LLMTier.TIER2_FAST_FREE,
            reason="Busca simples = Gemini (barato)",
            cost_usd_expected=0.001,
            quality_threshold=0.70,
        ),
        "sumarizacao": RoutingRule(
            task_type="sumarizacao",
            primary_tier=LLMTier.TIER2_FAST_FREE,
            secondary_tier=LLMTier.TIER3_CHEAP,
            reason="Sumarização = Groq (rápido)",
            cost_usd_expected=0.0,
            quality_threshold=0.75,
        ),
        "extracao_entidades": RoutingRule(
            task_type="extracao_entidades",
            primary_tier=LLMTier.TIER3_CHEAP,
            secondary_tier=LLMTier.TIER2_FAST_FREE,
            reason="Extração = Gemini (simples e barato)",
            cost_usd_expected=0.0005,
            quality_threshold=0.70,
        ),
        "analise_dados_sensiveis": RoutingRule(
            task_type="analise_dados_sensiveis",
            primary_tier=LLMTier.TIER4_PRIVATE,
            secondary_tier=LLMTier.TIER1_PREMIUM,
            reason="Privacidade = Ollama local (nunca sai do servidor)",
            cost_usd_expected=0.0,
            quality_threshold=0.70,
        ),
    }

    def __init__(
        self,
        claude_service=None,
        groq_service=None,
        gemini_service=None,
        ollama_service=None,
        cost_aware: bool = True,
        fallback_enabled: bool = True,
    ):
        """
        Inicializar router com serviços opcionais

        Args:
            claude_service: ClaudeService instance (opcional)
            groq_service: GroqService instance (opcional)
            gemini_service: GeminiService instance (opcional)
            ollama_service: OllamaService instance (opcional)
            cost_aware: Se True, prioriza custo
            fallback_enabled: Se True, usa fallback automático
        """
        self.claude_service = claude_service
        self.groq_service = groq_service
        self.gemini_service = gemini_service
        self.ollama_service = ollama_service

        self.cost_aware = cost_aware
        self.fallback_enabled = fallback_enabled

        self.usage_stats = {
            "claude": {"calls": 0, "cost": 0, "tokens": 0},
            "groq": {"calls": 0, "cost": 0, "tokens": 0},
            "gemini": {"calls": 0, "cost": 0, "tokens": 0},
            "ollama": {"calls": 0, "cost": 0, "tokens": 0},
        }

        logger.info("🔀 MultiTierRouter inicializado")

    async def route_and_analyze(
        self,
        prompt: str,
        task_type: str = "hermenautica_juridica",
        is_urgent: bool = False,
        allow_premium: bool = True,
    ) -> Dict[str, Any]:
        """
        Rotear para o melhor LLM e analisar

        Args:
            prompt: Texto a analisar
            task_type: Tipo de tarefa (veja ROUTING_RULES)
            is_urgent: Se True, prioriza velocidade
            allow_premium: Se True, permite usar Claude (caro)

        Returns:
            Dict com resposta, provider usado, custo, etc
        """
        # Selecionar provider
        primary_tier, secondary_tier = self._select_tiers(
            task_type, is_urgent, allow_premium
        )

        logger.info(
            f"📋 Roteando para {primary_tier.value} (tarefa: {task_type})"
        )

        # Tentar provider primário
        try:
            response = await self._call_tier(primary_tier, prompt, task_type)

            if response:
                response["primary_choice"] = True
                self._update_stats(primary_tier.value, response)
                return response

        except Exception as e:
            logger.warning(
                f"⚠️ Provider primário ({primary_tier.value}) falhou: {e}"
            )

            if not self.fallback_enabled:
                raise

        # Fallback para provider secundário
        logger.info(f"🔄 Usando fallback: {secondary_tier.value}")

        try:
            response = await self._call_tier(secondary_tier, prompt, task_type)

            if response:
                response["primary_choice"] = False
                response["fallback_used"] = True
                self._update_stats(secondary_tier.value, response)
                return response

        except Exception as e:
            logger.error(
                f"❌ Ambos providers falharam: {e}"
            )
            raise

    def _select_tiers(
        self,
        task_type: str,
        is_urgent: bool = False,
        allow_premium: bool = True,
    ) -> tuple:
        """Selecionar tiers primário e secundário"""

        # Obter regra de roteamento
        rule = self.ROUTING_RULES.get(
            task_type,
            RoutingRule(
                task_type="default",
                primary_tier=LLMTier.TIER2_FAST_FREE,
                secondary_tier=LLMTier.TIER1_PREMIUM,
                reason="Default routing",
                cost_usd_expected=0.01,
            ),
        )

        primary = rule.primary_tier
        secondary = rule.secondary_tier

        # Override se urgente (prioriza velocidade)
        if is_urgent:
            if primary != LLMTier.TIER2_FAST_FREE:
                logger.info("⚡ Urgente: Prioritizando Groq (rápido)")
                primary = LLMTier.TIER2_FAST_FREE
                secondary = rule.primary_tier

        # Override se cost-aware (prioriza economia)
        if self.cost_aware and allow_premium:
            if primary in [LLMTier.TIER1_PREMIUM]:
                logger.info("💰 Cost-aware: Preferindo Groq (grátis)")
                primary = LLMTier.TIER2_FAST_FREE
                secondary = rule.primary_tier

        # Override se não permitir premium
        if not allow_premium and primary == LLMTier.TIER1_PREMIUM:
            logger.info("🚫 Premium desabilitado: Usando Groq")
            primary = LLMTier.TIER2_FAST_FREE
            secondary = rule.secondary_tier

        return primary, secondary

    async def _call_tier(
        self,
        tier: LLMTier,
        prompt: str,
        task_type: str,
    ) -> Optional[Dict[str, Any]]:
        """Chamar um tier específico"""

        try:
            if tier == LLMTier.TIER1_PREMIUM:
                if not self.claude_service:
                    return None
                return await self.claude_service.analyze(prompt, task_type)

            elif tier == LLMTier.TIER2_FAST_FREE:
                if not self.groq_service:
                    return None
                return await self.groq_service.analyze(prompt, task_type)

            elif tier == LLMTier.TIER3_CHEAP:
                if not self.gemini_service:
                    return None
                return await self.gemini_service.analyze(prompt, task_type)

            elif tier == LLMTier.TIER4_PRIVATE:
                if not self.ollama_service:
                    return None
                return await self.ollama_service.analyze(prompt, task_type)

        except Exception as e:
            logger.error(f"Erro ao chamar {tier.value}: {e}")
            return None

    def _update_stats(self, provider: str, response: Dict):
        """Atualizar estatísticas de uso"""
        if provider in self.usage_stats:
            self.usage_stats[provider]["calls"] += 1
            self.usage_stats[provider]["cost"] += response.get("cost_usd", 0)
            self.usage_stats[provider]["tokens"] += response.get(
                "tokens_used", 0
            )

    def get_usage_stats(self) -> Dict[str, Any]:
        """Obter estatísticas de uso"""
        total_cost = sum(
            stats["cost"] for stats in self.usage_stats.values()
        )
        total_calls = sum(
            stats["calls"] for stats in self.usage_stats.values()
        )

        return {
            "timestamp": datetime.now().isoformat(),
            "total_calls": total_calls,
            "total_cost_usd": round(total_cost, 4),
            "by_provider": self.usage_stats,
            "cost_per_call": round(total_cost / max(total_calls, 1), 4),
        }

    def reset_stats(self):
        """Resetar estatísticas"""
        for provider in self.usage_stats:
            self.usage_stats[provider] = {"calls": 0, "cost": 0, "tokens": 0}

        logger.info("📊 Estatísticas resetadas")
