"""
Testes para Multi-Tier Router (4-Tier LLM Stack)

Valida:
- Roteamento correto baseado em task type
- Fallback automático
- Cost tracking
- Suporte para todos os 4 tiers
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from backend.services.multi_tier_router import (
    MultiTierRouter,
    LLMTier,
    RoutingRule,
)


class TestMultiTierRouting:
    """Testes de roteamento multi-tier"""

    def test_routing_rules_exist(self):
        """Teste: Regras de roteamento existem"""
        router = MultiTierRouter()

        # Verificar que regras essenciais existem
        assert "hermenautica_juridica" in router.ROUTING_RULES
        assert "analise_rapida" in router.ROUTING_RULES
        assert "classificacao_caso" in router.ROUTING_RULES
        assert "busca_jurisprudencia" in router.ROUTING_RULES

    def test_select_tiers_hermenautica(self):
        """Teste: Hermenêutica com cost-aware desabilitado usa TIER1 (Claude)"""
        router = MultiTierRouter(cost_aware=False)

        primary, secondary = router._select_tiers(
            task_type="hermenautica_juridica",
            is_urgent=False,
            allow_premium=True,
        )

        assert primary == LLMTier.TIER1_PREMIUM  # Claude
        assert secondary == LLMTier.TIER2_FAST_FREE  # Groq fallback

    def test_select_tiers_hermenautica_cost_aware(self):
        """Teste: Hermenêutica com cost-aware usa TIER2 (Groq - grátis)"""
        router = MultiTierRouter(cost_aware=True)

        primary, secondary = router._select_tiers(
            task_type="hermenautica_juridica",
            is_urgent=False,
            allow_premium=True,
        )

        # Com cost-aware, prefere Groq (grátis)
        assert primary == LLMTier.TIER2_FAST_FREE  # Groq
        assert secondary == LLMTier.TIER1_PREMIUM  # Claude fallback

    def test_select_tiers_analise_rapida(self):
        """Teste: Análise rápida usa TIER2 (Groq)"""
        router = MultiTierRouter()

        primary, secondary = router._select_tiers(
            task_type="analise_rapida",
            is_urgent=False,
            allow_premium=True,
        )

        assert primary == LLMTier.TIER2_FAST_FREE  # Groq
        assert secondary == LLMTier.TIER1_PREMIUM  # Claude fallback

    def test_select_tiers_busca_simples(self):
        """Teste: Busca simples usa TIER3 (Gemini)"""
        router = MultiTierRouter()

        primary, secondary = router._select_tiers(
            task_type="busca_jurisprudencia",
            is_urgent=False,
            allow_premium=True,
        )

        assert primary == LLMTier.TIER3_CHEAP  # Gemini
        assert secondary == LLMTier.TIER2_FAST_FREE  # Groq fallback

    def test_select_tiers_dados_sensiveis(self):
        """Teste: Dados sensíveis usa TIER4 (Ollama)"""
        router = MultiTierRouter()

        primary, secondary = router._select_tiers(
            task_type="analise_dados_sensiveis",
            is_urgent=False,
            allow_premium=True,
        )

        assert primary == LLMTier.TIER4_PRIVATE  # Ollama
        assert secondary == LLMTier.TIER1_PREMIUM  # Claude fallback

    def test_select_tiers_urgent_uses_groq(self):
        """Teste: Análise urgente usa Groq (rápido)"""
        router = MultiTierRouter()

        primary, secondary = router._select_tiers(
            task_type="hermenautica_juridica",
            is_urgent=True,
            allow_premium=True,
        )

        # Quando urgente, prioriza Groq (1-2s) ao invés de Claude (5-10s)
        assert primary == LLMTier.TIER2_FAST_FREE  # Groq (rápido)
        assert secondary == LLMTier.TIER1_PREMIUM  # Claude fallback

    def test_cost_aware_routing(self):
        """Teste: Cost-aware prefere Groq (grátis)"""
        router = MultiTierRouter(cost_aware=True)

        primary, secondary = router._select_tiers(
            task_type="hermenautica_juridica",
            is_urgent=False,
            allow_premium=True,
        )

        # Mesmo para hermenêutica, cost-aware prefere Groq
        assert primary == LLMTier.TIER2_FAST_FREE  # Groq (grátis!)

    def test_no_premium_uses_free(self):
        """Teste: Sem premium, usa Groq/Gemini (grátis)"""
        router = MultiTierRouter()

        primary, secondary = router._select_tiers(
            task_type="hermenautica_juridica",
            is_urgent=False,
            allow_premium=False,  # Desabilitar premium
        )

        # Sem premium, usa TIER2 ou TIER3 (grátis)
        assert primary == LLMTier.TIER2_FAST_FREE  # Groq (grátis)

    def test_stats_tracking(self):
        """Teste: Rastreamento de estatísticas"""
        router = MultiTierRouter()

        # Simular algumas chamadas
        mock_response = {
            "provider": "groq",
            "cost_usd": 0.0,
            "tokens_used": 100,
        }

        router._update_stats("groq", mock_response)
        router._update_stats("groq", mock_response)
        router._update_stats("claude", {"provider": "claude", "cost_usd": 0.15, "tokens_used": 200})

        stats = router.get_usage_stats()

        assert stats["total_calls"] == 3
        assert stats["by_provider"]["groq"]["calls"] == 2
        assert stats["by_provider"]["claude"]["calls"] == 1
        assert stats["by_provider"]["groq"]["cost"] == 0.0
        assert stats["by_provider"]["claude"]["cost"] == 0.15

    def test_stats_reset(self):
        """Teste: Reset de estatísticas"""
        router = MultiTierRouter()

        # Adicionar estatísticas
        mock_response = {"provider": "groq", "cost_usd": 0.0, "tokens_used": 100}
        router._update_stats("groq", mock_response)

        # Verificar que foram registradas
        assert router.get_usage_stats()["total_calls"] == 1

        # Reset
        router.reset_stats()

        # Verificar que foram limpas
        assert router.get_usage_stats()["total_calls"] == 0
        assert router.get_usage_stats()["total_cost_usd"] == 0.0


class TestTierSpecificFeatures:
    """Testes de features específicas de cada tier"""

    def test_tier1_claude_for_critical(self):
        """Teste: TIER1 para análises críticas"""
        rule = MultiTierRouter.ROUTING_RULES["hermenautica_juridica"]

        assert rule.primary_tier == LLMTier.TIER1_PREMIUM
        assert rule.quality_threshold == 0.90
        assert rule.cost_usd_expected == 0.15

    def test_tier2_groq_default(self):
        """Teste: TIER2 como default (rápido + grátis)"""
        rule = MultiTierRouter.ROUTING_RULES["analise_rapida"]

        assert rule.primary_tier == LLMTier.TIER2_FAST_FREE
        assert rule.cost_usd_expected == 0.0
        assert "grátis" in rule.reason.lower()

    def test_tier3_gemini_cheap(self):
        """Teste: TIER3 para tarefas simples (barato)"""
        rule = MultiTierRouter.ROUTING_RULES["busca_jurisprudencia"]

        assert rule.primary_tier == LLMTier.TIER3_CHEAP
        assert rule.cost_usd_expected < 0.01

    def test_tier4_ollama_private(self):
        """Teste: TIER4 para dados sensíveis (privado)"""
        rule = MultiTierRouter.ROUTING_RULES["analise_dados_sensiveis"]

        assert rule.primary_tier == LLMTier.TIER4_PRIVATE
        assert rule.cost_usd_expected == 0.0
        assert "privacidade" in rule.reason.lower() or "privado" in rule.reason.lower()


class TestRoutingRuleStructure:
    """Testes da estrutura de regras de roteamento"""

    def test_all_rules_have_required_fields(self):
        """Teste: Todas as regras têm campos requeridos"""
        for task_type, rule in MultiTierRouter.ROUTING_RULES.items():
            assert rule.task_type is not None
            assert rule.primary_tier is not None
            assert rule.secondary_tier is not None
            assert rule.reason is not None
            assert rule.cost_usd_expected >= 0

    def test_cost_order_tier1_to_tier4(self):
        """Teste: Custo decresce de TIER1 para TIER4"""
        # TIER1 (Claude) é mais caro
        rule1 = MultiTierRouter.ROUTING_RULES["hermenautica_juridica"]
        cost1 = rule1.cost_usd_expected

        # TIER3 (Gemini) é mais barato
        rule3 = MultiTierRouter.ROUTING_RULES["busca_jurisprudencia"]
        cost3 = rule3.cost_usd_expected

        # TIER4 (Ollama) é grátis
        rule4 = MultiTierRouter.ROUTING_RULES["analise_dados_sensiveis"]
        cost4 = rule4.cost_usd_expected

        assert cost1 > cost3 > cost4
        assert cost4 == 0.0  # Ollama é grátis


class TestCostAnalysis:
    """Testes de análise de custos"""

    def test_monthly_cost_estimate(self):
        """Teste: Estimativa de custo mensal"""
        router = MultiTierRouter(cost_aware=True)

        # Simular 1000 análises/mês com 4-tier
        for _ in range(300):  # 300 hermenêuticas (Claude)
            router._update_stats("claude", {"cost_usd": 0.15, "tokens_used": 500})

        for _ in range(500):  # 500 análises rápidas (Groq)
            router._update_stats("groq", {"cost_usd": 0.0, "tokens_used": 200})

        for _ in range(150):  # 150 buscas (Gemini)
            router._update_stats("gemini", {"cost_usd": 0.001, "tokens_used": 100})

        for _ in range(50):  # 50 sensíveis (Ollama)
            router._update_stats("ollama", {"cost_usd": 0.0, "tokens_used": 150})

        stats = router.get_usage_stats()

        # Custo esperado: (300*0.15) + (500*0) + (150*0.001) + (50*0)
        # = 45 + 0 + 0.15 + 0 = ~45.15/mês
        expected_cost = (300 * 0.15) + (150 * 0.001)

        assert stats["total_cost_usd"] == pytest.approx(expected_cost, rel=0.01)
        assert stats["total_calls"] == 1000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
