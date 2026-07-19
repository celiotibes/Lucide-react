"""
Groq Service - Fast + Free LLM Integration

Groq oferece acesso GRÁTIS ao Llama 2 70B com latência ULTRA rápida (1-2s)
Ideal para: análises rápidas, classificações, sumarizações

Documentação: https://console.groq.com/docs/
"""

import logging
import os
import time
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class GroqService:
    """
    Cliente Groq para análises rápidas e gratuitas

    Features:
    - Acesso GRÁTIS ao Llama 2 70B
    - Latência ultra-rápida (1-2 segundos)
    - Rate limit generoso (30K tokens/min)
    - Sem cartão de crédito requerido
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        """
        Inicializar Groq Service

        Args:
            api_key: Groq API key (padrão: GROQ_API_KEY env var)
            model: Modelo Groq (padrão: mixtral-8x7b-32768)
        """
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.model = model or os.getenv("GROQ_MODEL", "mixtral-8x7b-32768")

        if not self.api_key:
            logger.warning("⚠️ GROQ_API_KEY não configurada. Groq indisponível.")
            self.client = None
            return

        # Import Groq client (lazy import)
        try:
            from groq import Groq

            self.client = Groq(api_key=self.api_key)
            logger.info(f"✅ Groq inicializado (modelo: {self.model})")

        except ImportError:
            logger.error(
                "❌ Biblioteca 'groq' não instalada. "
                "Execute: pip install groq"
            )
            self.client = None

    async def analyze(
        self,
        prompt: str,
        task_type: str = "analise_rapida",
        temperature: float = 0.3,
        max_tokens: int = 1000,
    ) -> Dict[str, Any]:
        """
        Analisar texto via Groq (GRÁTIS!)

        Args:
            prompt: Texto a analisar
            task_type: Tipo de tarefa (para contexto do log)
            temperature: Criatividade (0-1)
            max_tokens: Máximo tokens na resposta

        Returns:
            Dict com resposta e metadados
        """
        if not self.client:
            raise RuntimeError(
                "Groq não configurado. "
                "Configure GROQ_API_KEY no .env"
            )

        logger.info(f"🚀 Analisando via Groq ({task_type})...")
        start_time = time.time()

        try:
            # Chamada Groq
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=max_tokens,
            )

            latency_ms = int((time.time() - start_time) * 1000)

            # Parse resposta
            content = response.choices[0].message.content
            tokens_used = response.usage.completion_tokens

            logger.info(
                f"✅ Groq respondeu em {latency_ms}ms "
                f"({tokens_used} tokens)"
            )

            return {
                "provider": "groq",
                "response": content,
                "tokens_used": tokens_used,
                "cost_usd": 0.0,  # ✅ GRÁTIS!
                "latency_ms": latency_ms,
                "confidence": 0.82,  # Llama 2 70B qualidade
                "model": self.model,
                "tier": "TIER2_FAST_FREE",
            }

        except Exception as e:
            logger.error(f"❌ Erro Groq: {e}")
            raise

    async def classify(
        self,
        text: str,
        categories: list,
        task_type: str = "classificacao_caso",
    ) -> Dict[str, Any]:
        """
        Classificar texto em categorias

        Args:
            text: Texto a classificar
            categories: Lista de categorias
            task_type: Tipo de tarefa

        Returns:
            Dict com classificação
        """
        categories_str = ", ".join(categories)

        prompt = f"""Classifique o seguinte texto em uma das categorias: {categories_str}

Texto:
{text}

Responda APENAS com uma das categorias listadas, sem explicação."""

        response = await self.analyze(
            prompt,
            task_type=task_type,
            temperature=0.0,  # Sem criatividade para classificação
            max_tokens=50,
        )

        # Extrair classificação
        classification = response["response"].strip()

        return {
            **response,
            "classification": classification,
            "categories": categories,
        }

    async def summarize(
        self,
        text: str,
        max_length: int = 200,
        task_type: str = "sumarizacao",
    ) -> Dict[str, Any]:
        """
        Sumarizar texto

        Args:
            text: Texto a sumarizar
            max_length: Máximo tamanho do resumo
            task_type: Tipo de tarefa

        Returns:
            Dict com sumarização
        """
        prompt = f"""Sumarize o seguinte texto em no máximo {max_length} palavras:

{text}

Resumo:"""

        response = await self.analyze(
            prompt,
            task_type=task_type,
            temperature=0.3,
            max_tokens=300,
        )

        summary = response["response"].strip()

        return {
            **response,
            "summary": summary,
            "summary_length": len(summary.split()),
        }

    async def extract_entities(
        self,
        text: str,
        entity_types: Optional[list] = None,
        task_type: str = "extracao_entidades",
    ) -> Dict[str, Any]:
        """
        Extrair entidades do texto

        Args:
            text: Texto para extração
            entity_types: Tipos de entidades a extrair
            task_type: Tipo de tarefa

        Returns:
            Dict com entidades extraídas
        """
        entity_prompt = ""
        if entity_types:
            entity_prompt = f"\n\nTipos de entidades esperadas: {', '.join(entity_types)}"

        prompt = f"""Extraia todas as entidades mencionadas no texto:
{text}{entity_prompt}

Responda em formato JSON com as entidades encontradas."""

        response = await self.analyze(
            prompt,
            task_type=task_type,
            temperature=0.0,  # Sem criatividade para extração
            max_tokens=500,
        )

        # Tentar fazer parse JSON
        try:
            import json

            entities = json.loads(response["response"])
        except:
            entities = {"raw": response["response"]}

        return {
            **response,
            "entities": entities,
        }

    def get_model_info(self) -> Dict[str, Any]:
        """Obter informações do modelo"""
        return {
            "provider": "groq",
            "model": self.model,
            "cost": "FREE",
            "latency": "1-2s",
            "quality": "82%",
            "rate_limit": "30K tokens/min",
            "tier": "TIER2_FAST_FREE",
        }
