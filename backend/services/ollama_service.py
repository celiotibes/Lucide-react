"""
Ollama Service - Private + Free LLM (Local)

Ollama permite rodar modelos LLM localmente no seu servidor
Ideal para: dados sensíveis, análise offline, máxima privacidade

Documentação: https://ollama.ai/
Instalação: curl https://ollama.ai/install.sh | sh
"""

import logging
import os
import time
import requests
import json
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class OllamaService:
    """
    Cliente Ollama para análises privadas e locais

    Features:
    - 100% privado (roda localmente)
    - GRÁTIS (código aberto)
    - Nenhum dado sai do servidor
    - Acesso offline
    - Sem limite de rate
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        """
        Inicializar Ollama Service

        Args:
            base_url: URL do servidor Ollama (padrão: localhost:11434)
            model: Modelo Ollama (padrão: mistral)
        """
        self.base_url = (
            base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        )
        self.model = model or os.getenv("OLLAMA_MODEL", "mistral")

        # Testar conexão
        self.available = self._test_connection()

        if self.available:
            logger.info(f"✅ Ollama conectado (modelo: {self.model})")
        else:
            logger.warning(
                f"⚠️ Ollama indisponível em {self.base_url}. "
                f"Instale: curl https://ollama.ai/install.sh | sh"
            )

    def _test_connection(self) -> bool:
        """Testar se Ollama está disponível"""
        try:
            response = requests.get(
                f"{self.base_url}/api/tags",
                timeout=2,
            )
            return response.status_code == 200
        except:
            return False

    async def analyze(
        self,
        prompt: str,
        task_type: str = "analise_dados_sensiveis",
        temperature: float = 0.3,
        max_tokens: int = 1000,
    ) -> Dict[str, Any]:
        """
        Analisar texto via Ollama (PRIVADO + GRÁTIS!)

        Args:
            prompt: Texto a analisar
            task_type: Tipo de tarefa
            temperature: Criatividade (0-1)
            max_tokens: Máximo tokens na resposta

        Returns:
            Dict com resposta e metadados
        """
        if not self.available:
            raise RuntimeError(
                "Ollama não disponível. "
                "Instale em https://ollama.ai/ e execute: ollama serve"
            )

        logger.info(
            f"🔐 Analisando localmente via Ollama ({task_type})..."
        )
        start_time = time.time()

        try:
            # Chamada Ollama
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens,
                    },
                },
                timeout=300,  # 5 minutos timeout
            )

            response.raise_for_status()
            data = response.json()

            latency_ms = int((time.time() - start_time) * 1000)

            # Parse resposta
            content = data.get("response", "").strip()
            tokens_used = data.get("eval_count", 0)

            logger.info(
                f"✅ Ollama respondeu em {latency_ms}ms "
                f"({tokens_used} tokens)"
            )

            return {
                "provider": "ollama",
                "response": content,
                "tokens_used": tokens_used,
                "cost_usd": 0.0,  # ✅ GRÁTIS!
                "latency_ms": latency_ms,
                "confidence": 0.70,  # Mistral 7B qualidade
                "model": self.model,
                "tier": "TIER4_PRIVATE",
                "privacy": "100% (executado localmente)",
            }

        except requests.exceptions.Timeout:
            logger.error("❌ Ollama timeout (resposta muito lenta)")
            raise
        except Exception as e:
            logger.error(f"❌ Erro Ollama: {e}")
            raise

    async def classify(
        self,
        text: str,
        categories: list,
        task_type: str = "classificacao_caso",
    ) -> Dict[str, Any]:
        """
        Classificar texto em categorias (localmente)

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
            temperature=0.0,
            max_tokens=50,
        )

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
        Sumarizar texto (localmente + privado)

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

    def get_available_models(self) -> Dict[str, Any]:
        """
        Obter modelos disponíveis localmente

        Modelos recomendados:
        - mistral (7B, rápido, bom)
        - llama2 (7B, qualidade)
        - neural-chat (7B, conversacional)
        """
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            response.raise_for_status()
            data = response.json()

            models = {}
            if "models" in data:
                for m in data["models"]:
                    models[m.get("name", "unknown")] = {
                        "size": m.get("size", 0),
                        "modified_at": m.get("modified_at", ""),
                    }

            return {
                "available": True,
                "models": models,
                "current_model": self.model,
            }

        except Exception as e:
            logger.error(f"Erro ao listar modelos: {e}")
            return {
                "available": False,
                "error": str(e),
            }

    def get_model_info(self) -> Dict[str, Any]:
        """Obter informações do modelo"""
        return {
            "provider": "ollama",
            "model": self.model,
            "cost": "FREE",
            "latency": "3-5s (depende de hardware)",
            "quality": "70%",
            "privacy": "100% (local)",
            "rate_limit": "Unlimited",
            "tier": "TIER4_PRIVATE",
            "recommendation": "Use para dados sensíveis + máxima privacidade",
        }

    def pull_model(self, model_name: str) -> bool:
        """
        Download um novo modelo (leva tempo!)

        Exemplo:
            ollama_service.pull_model("mistral")

        Modelos populares:
            - mistral: Rápido, bom balanço
            - llama2: Qualidade Llama 2
            - neural-chat: Conversacional
        """
        logger.info(f"📥 Downloading modelo {model_name}...")

        try:
            response = requests.post(
                f"{self.base_url}/api/pull",
                json={"name": model_name},
                stream=True,
                timeout=3600,  # 1 hora timeout
            )

            response.raise_for_status()

            # Stream do download
            for line in response.iter_lines():
                if line:
                    data = json.loads(line)
                    status = data.get("status", "")
                    if status:
                        logger.info(f"  {status}")

            logger.info(f"✅ Modelo {model_name} baixado com sucesso")
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao baixar modelo: {e}")
            return False
