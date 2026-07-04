"""
Demo: 4-Tier LLM Stack em ação

Demonstra como o MultiTierRouter seleciona automaticamente:
- TIER1: Claude para análises críticas
- TIER2: Groq para análises rápidas (GRÁTIS!)
- TIER3: Gemini para tarefas simples (barato)
- TIER4: Ollama para dados sensíveis (privado)
"""

import asyncio
import sys
import logging
from typing import Dict, Any

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

from services.multi_tier_router import MultiTierRouter, LLMTier


async def demo_routing_decisions():
    """Demo: Ver como router toma decisões"""

    logger.info("=" * 80)
    logger.info("🔀 DEMO: Decisões de Roteamento 4-Tier")
    logger.info("=" * 80)

    router = MultiTierRouter(cost_aware=True, fallback_enabled=True)

    test_cases = [
        {
            "task": "hermenautica_juridica",
            "description": "Análise jurídica complexa",
            "urgent": False,
        },
        {
            "task": "analise_rapida",
            "description": "Análise rápida de documento",
            "urgent": False,
        },
        {
            "task": "busca_jurisprudencia",
            "description": "Busca de jurisprudência",
            "urgent": False,
        },
        {
            "task": "analise_dados_sensiveis",
            "description": "Análise de dados confidenciais",
            "urgent": False,
        },
        {
            "task": "classificacao_caso",
            "description": "Classificação de tipo de caso",
            "urgent": True,  # Urgente
        },
    ]

    for test in test_cases:
        logger.info(f"\n📋 {test['description'].upper()}")
        logger.info(f"   Task: {test['task']}")
        logger.info(f"   Urgent: {test['urgent']}")

        primary, secondary = router._select_tiers(
            task_type=test["task"],
            is_urgent=test["urgent"],
            allow_premium=True,
        )

        logger.info(f"   → Primary: {primary.value.upper()} ⭐")
        logger.info(f"   → Fallback: {secondary.value.upper()} 🔄")

        # Mostrar regra
        rule = router.ROUTING_RULES.get(test["task"])
        if rule:
            logger.info(f"   Reason: {rule.reason}")
            logger.info(f"   Expected cost: ${rule.cost_usd_expected}")


async def demo_cost_comparison():
    """Demo: Comparação de custos"""

    logger.info("\n" + "=" * 80)
    logger.info("💰 DEMO: Comparação de Custos (1000 análises/mês)")
    logger.info("=" * 80)

    # Cenário 1: Só Claude
    logger.info("\n❌ CENÁRIO 1: Só Claude Opus (Caro)")
    logger.info("   1000 análises × $0.15 = $150/mês")
    logger.info("   Custo anual: $1,800")

    # Cenário 2: 4-Tier Stack
    logger.info("\n✅ CENÁRIO 2: 4-Tier Stack (Otimizado)")
    logger.info("   300 hermenêuticas (Claude) × $0.15 = $45")
    logger.info("   500 análises rápidas (Groq) × $0 = $0 (GRÁTIS!)")
    logger.info("   150 buscas (Gemini) × $0.001 = $0.15")
    logger.info("   50 sensíveis (Ollama) × $0 = $0 (LOCAL)")
    logger.info("   ────────────────────────────────────")
    logger.info("   TOTAL: $45.15/mês ✅")
    logger.info("   ECONOMIA: $104.85/mês = 70% 🎉")
    logger.info("   ECONOMIA ANUAL: $1,258.20 🚀")

    # Tracking
    logger.info("\n📊 TRACKING DE ESTATÍSTICAS")
    router = MultiTierRouter(cost_aware=True)

    # Simular 1000 análises
    for _ in range(300):
        router._update_stats("claude", {"cost_usd": 0.15, "tokens_used": 500})

    for _ in range(500):
        router._update_stats("groq", {"cost_usd": 0.0, "tokens_used": 200})

    for _ in range(150):
        router._update_stats("gemini", {"cost_usd": 0.001, "tokens_used": 100})

    for _ in range(50):
        router._update_stats("ollama", {"cost_usd": 0.0, "tokens_used": 150})

    stats = router.get_usage_stats()

    logger.info(f"   Total de requisições: {stats['total_calls']}")
    logger.info(f"   Custo total: ${stats['total_cost_usd']:.2f}")
    logger.info(f"   Custo médio/requisição: ${stats['cost_per_call']:.4f}")

    logger.info("\n   Por provider:")
    for provider, data in stats["by_provider"].items():
        if data["calls"] > 0:
            logger.info(
                f"   • {provider:10s}: {data['calls']:3d} calls "
                f"| ${data['cost']:6.2f} | {data['tokens']:5d} tokens"
            )


async def demo_performance_comparison():
    """Demo: Comparação de velocidade"""

    logger.info("\n" + "=" * 80)
    logger.info("⚡ DEMO: Comparação de Velocidade")
    logger.info("=" * 80)

    logger.info("\nLatência por provider (tempo até resposta):")
    logger.info("\n  TIER1 (Claude):")
    logger.info("  ████████████████  5-10s (melhor qualidade)")

    logger.info("\n  TIER2 (Groq):")
    logger.info("  ██                1-2s (4-5x mais rápido! ⚡)")

    logger.info("\n  TIER3 (Gemini):")
    logger.info("  ████              2-3s (rápido e barato)")

    logger.info("\n  TIER4 (Ollama):")
    logger.info("  ████████          3-5s (depende do hardware)")

    logger.info("\n💡 Para operações em tempo real, use GROQ!")
    logger.info("💡 GROQ é 4-5x mais rápido que Claude!")


async def demo_task_routing():
    """Demo: Roteamento por tipo de tarefa"""

    logger.info("\n" + "=" * 80)
    logger.info("🎯 DEMO: Roteamento por Tipo de Tarefa")
    logger.info("=" * 80)

    router = MultiTierRouter()

    routing_map = {
        "hermenautica_juridica": "📋 Análise jurídica profunda",
        "analise_rapida": "⚡ Análise rápida",
        "classificacao_caso": "🏷️ Classificar tipo de caso",
        "busca_jurisprudencia": "🔍 Buscar jurisprudência",
        "sumarizacao": "📝 Sumarizar documento",
        "extracao_entidades": "🏷️ Extrair entidades (nomes, datas)",
        "analise_dados_sensiveis": "🔐 Dados críticos/sensíveis",
    }

    for task_type, description in routing_map.items():
        rule = router.ROUTING_RULES[task_type]
        primary = rule.primary_tier.value.upper()

        logger.info(f"\n{description}")
        logger.info(f"   Task: {task_type}")
        logger.info(f"   → Router: {primary} | Cost: ${rule.cost_usd_expected:.4f}")


def print_summary():
    """Imprimir resumo executivo"""

    logger.info("\n" + "=" * 80)
    logger.info("📊 RESUMO EXECUTIVO: 4-Tier LLM Stack")
    logger.info("=" * 80)

    logger.info("\n✅ VANTAGENS:")
    logger.info("   • Roteamento automático inteligente")
    logger.info("   • Groq GRÁTIS para maioria das tarefas")
    logger.info("   • 70% economia de custos vs só Claude")
    logger.info("   • 4-5x mais rápido para análises rápidas")
    logger.info("   • Privacidade total com Ollama")
    logger.info("   • Fallback automático se algo falhar")

    logger.info("\n🎯 USE CASES:")
    logger.info("   • Hermenêutica jurídica → TIER1 (Claude)")
    logger.info("   • Análises rápidas → TIER2 (Groq GRÁTIS)")
    logger.info("   • Buscas simples → TIER3 (Gemini)")
    logger.info("   • Dados sensíveis → TIER4 (Ollama)")

    logger.info("\n💡 RECOMENDAÇÃO:")
    logger.info("   Implementar 4-Tier Stack hoje!")
    logger.info("   ROI: Imediato (70% economia)")
    logger.info("   Tempo setup: ~30 minutos")


async def main():
    """Executar todas as demos"""

    try:
        await demo_routing_decisions()
        await demo_cost_comparison()
        await demo_performance_comparison()
        await demo_task_routing()
        print_summary()

        logger.info("\n" + "=" * 80)
        logger.info("✅ TODAS AS DEMOS COMPLETADAS COM SUCESSO!")
        logger.info("=" * 80)

    except Exception as e:
        logger.error(f"❌ Erro durante demo: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
