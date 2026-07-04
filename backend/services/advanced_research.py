"""
Advanced Research Service
Integrates 4-Tier LLM Stack with RAG for intelligent legal research
With persistent storage via SQLAlchemy ORM
"""

import logging
import time
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum
from sqlalchemy.orm import Session

from services.multi_tier_router import MultiTierRouter, LLMTier
from services.research_repository import ResearchRepository

logger = logging.getLogger(__name__)


class ResearchMode(str, Enum):
    """Modos de pesquisa disponíveis"""
    RAG_ENHANCED = "rag_enhanced"  # Com jurisprudência do Pinecone
    QUICK_ANALYSIS = "quick_analysis"  # Análise rápida sem RAG
    HYBRID = "hybrid"  # Combina ambas as abordagens


class SearchQuery:
    """Representa uma consulta de pesquisa"""

    def __init__(
        self,
        query: str,
        mode: ResearchMode = ResearchMode.HYBRID,
        task_type: str = "hermenautica_juridica",
        is_urgent: bool = False,
        include_citations: bool = True,
        min_relevance: float = 0.3,
    ):
        self.query = query
        self.mode = mode
        self.task_type = task_type
        self.is_urgent = is_urgent
        self.include_citations = include_citations
        self.min_relevance = min_relevance
        self.created_at = datetime.now()
        self.id = f"search_{int(time.time() * 1000)}"


class SearchResult:
    """Resultado de uma pesquisa"""

    def __init__(
        self,
        query: SearchQuery,
        analysis: str,
        provider: str,
        tier: str,
        tokens_used: int,
        cost_usd: float,
        latency_ms: int,
        sources: List[Dict[str, Any]] = None,
        confidence: float = 0.0,
        is_fallback: bool = False,
    ):
        self.query = query
        self.analysis = analysis
        self.provider = provider
        self.tier = tier
        self.tokens_used = tokens_used
        self.cost_usd = cost_usd
        self.latency_ms = latency_ms
        self.sources = sources or []
        self.confidence = confidence
        self.is_fallback = is_fallback
        self.created_at = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        """Converter para dicionário"""
        return {
            "id": self.query.id,
            "query": self.query.query,
            "analysis": self.analysis,
            "provider": self.provider,
            "tier": self.tier,
            "tokens_used": self.tokens_used,
            "cost_usd": self.cost_usd,
            "latency_ms": self.latency_ms,
            "sources": self.sources,
            "confidence": self.confidence,
            "is_fallback": self.is_fallback,
            "created_at": self.created_at.isoformat(),
        }


class AdvancedResearchService:
    """
    Serviço de pesquisa avançada com suporte a:
    - RAG com jurisprudência
    - 4-Tier LLM routing
    - Conversation history (persistente no banco)
    - Citation management
    - Semantic search
    - Database persistence com SQLAlchemy
    """

    def __init__(
        self,
        multi_tier_router: Optional[MultiTierRouter] = None,
        rag_chain: Optional[Any] = None,
        legal_embeddings: Optional[Any] = None,
        pinecone_client: Optional[Any] = None,
        db_session: Optional[Session] = None,
    ):
        self.router = multi_tier_router or MultiTierRouter(cost_aware=True, fallback_enabled=True)
        self.rag_chain = rag_chain
        self.embeddings = legal_embeddings
        self.pinecone = pinecone_client
        self.db_session = db_session
        self.repository = ResearchRepository(db_session) if db_session else None

        # Conversation history (cache em memória para rápido acesso)
        self.history: Dict[str, List[SearchResult]] = {}

        logger.info("🔬 AdvancedResearchService inicializado com persistência em banco")

    async def search(
        self,
        query: str,
        mode: ResearchMode = ResearchMode.HYBRID,
        task_type: str = "hermenautica_juridica",
        is_urgent: bool = False,
        conversation_id: Optional[str] = None,
    ) -> SearchResult:
        """
        Executar busca avançada com RAG e roteamento inteligente

        Args:
            query: Consulta de pesquisa
            mode: Modo de pesquisa (RAG_ENHANCED, QUICK_ANALYSIS, HYBRID)
            task_type: Tipo de tarefa para roteamento
            is_urgent: Se análise é urgente
            conversation_id: ID da conversa para manter histórico

        Returns:
            SearchResult com análise e metadados
        """
        search_query = SearchQuery(
            query=query,
            mode=mode,
            task_type=task_type,
            is_urgent=is_urgent,
        )

        start_time = time.time()

        try:
            # Montar contexto RAG se necessário
            rag_context = None
            sources = []

            if mode in [ResearchMode.RAG_ENHANCED, ResearchMode.HYBRID]:
                if self.rag_chain and self.embeddings and self.pinecone:
                    try:
                        rag_context = self._build_rag_context(query)
                        sources = self._extract_sources(rag_context)
                        logger.info(f"📚 RAG context montado com {len(sources)} fontes")
                    except Exception as e:
                        logger.warning(f"⚠️ Erro ao montar RAG context: {e}")
                        rag_context = None

            # Montar prompt com contexto
            enhanced_prompt = self._build_prompt(query, rag_context, mode)

            # Rotear e analisar
            result = await self.router.route_and_analyze(
                prompt=enhanced_prompt,
                task_type=task_type,
                is_urgent=is_urgent,
                allow_premium=True,
            )

            # Criar resultado
            latency_ms = int((time.time() - start_time) * 1000)

            search_result = SearchResult(
                query=search_query,
                analysis=result.get("response", ""),
                provider=result.get("provider", "unknown"),
                tier=result.get("tier", "unknown"),
                tokens_used=result.get("tokens_used", 0),
                cost_usd=result.get("cost_usd", 0),
                latency_ms=latency_ms,
                sources=sources,
                confidence=result.get("confidence", 0),
                is_fallback=result.get("fallback_used", False),
            )

            # Guardar no histórico em memória
            if conversation_id:
                if conversation_id not in self.history:
                    self.history[conversation_id] = []
                self.history[conversation_id].append(search_result)

            # Persiste no banco de dados se disponível
            if self.repository and conversation_id:
                try:
                    # Criar/atualizar conversa
                    db_conversation = self.repository.get_conversation(conversation_id)
                    if not db_conversation:
                        db_conversation = self.repository.create_conversation(conversation_id, mode=mode)

                    # Criar query no banco
                    self.repository.create_query(
                        conversation_id=db_conversation.id,
                        query_id=search_query.id,
                        query_text=query,
                        mode=mode.value,
                        task_type=task_type,
                        is_urgent=is_urgent,
                        provider=result.get("provider", "unknown"),
                        tier=result.get("tier", "unknown"),
                        model=result.get("model", "unknown"),
                        response_text=result.get("response", ""),
                        tokens_used=result.get("tokens_used", 0),
                        cost_usd=result.get("cost_usd", 0),
                        latency_ms=latency_ms,
                        confidence=result.get("confidence", 0),
                        is_fallback=result.get("fallback_used", False),
                        rag_mode_used=mode in [ResearchMode.RAG_ENHANCED, ResearchMode.HYBRID],
                        sources=sources,
                    )

                    logger.info(f"💾 Pesquisa salva no banco: {search_query.id}")
                except Exception as e:
                    logger.warning(f"⚠️ Erro ao salvar no banco: {e}")

            logger.info(
                f"✅ Pesquisa concluída ({search_result.provider}/"
                f"{search_result.tier}) em {latency_ms}ms"
            )

            return search_result

        except Exception as e:
            logger.error(f"❌ Erro ao executar pesquisa: {e}", exc_info=True)
            raise

    def _build_rag_context(self, query: str, top_k: int = 5) -> str:
        """Montar contexto RAG com jurisprudência"""
        if not self.rag_chain or not self.embeddings or not self.pinecone:
            return ""

        try:
            # Gerar embedding da query
            query_embedding = self.embeddings.embeddings_from_text(query)

            # Buscar jurisprudência similar
            results = self.pinecone.buscar_similaridade(
                query_embedding=query_embedding.tolist(),
                top_k=top_k,
            )

            context_parts = []

            if results:
                context_parts.append("## JURISPRUDÊNCIA RELEVANTE\n")
                for i, result in enumerate(results, 1):
                    metadata = result.get("metadata", {})
                    score = result.get("score", 0)

                    context_parts.append(
                        f"{i}. [{metadata.get('tribunal', 'Tribunal')} "
                        f"{metadata.get('ano', 'XXXX')}] "
                        f"(relevância: {score:.1%})\n"
                        f"   {metadata.get('resumo', 'N/A')}\n"
                    )

            return "\n".join(context_parts)

        except Exception as e:
            logger.warning(f"⚠️ Erro ao construir RAG context: {e}")
            return ""

    def _extract_sources(self, rag_context: str) -> List[Dict[str, Any]]:
        """Extrair fontes do contexto RAG"""
        sources = []

        lines = rag_context.split("\n")
        for line in lines:
            if "[" in line and "]" in line:
                # Extrair informações da jurisprudência
                tribunal_start = line.find("[")
                tribunal_end = line.find("]")

                if tribunal_start >= 0 and tribunal_end > tribunal_start:
                    tribunal_info = line[tribunal_start + 1 : tribunal_end]
                    relevance_match = line.find("relevância:")

                    if relevance_match >= 0:
                        try:
                            relevance_str = line[
                                relevance_match + 11 : relevance_match + 16
                            ].replace("%", "")
                            relevance = float(relevance_str) / 100
                        except ValueError:
                            relevance = 0.0
                    else:
                        relevance = 0.0

                    sources.append(
                        {
                            "type": "jurisprudencia",
                            "tribunal_info": tribunal_info,
                            "relevance": relevance,
                        }
                    )

        return sources

    def _build_prompt(
        self, query: str, rag_context: Optional[str], mode: ResearchMode
    ) -> str:
        """Construir prompt com contexto apropriado"""
        if mode == ResearchMode.QUICK_ANALYSIS:
            return query

        if mode == ResearchMode.RAG_ENHANCED and rag_context:
            return (
                f"Baseado na seguinte jurisprudência:\n\n{rag_context}\n\n"
                f"Responda a seguinte questão:\n\n{query}"
            )

        if mode == ResearchMode.HYBRID and rag_context:
            return (
                f"Forneça análise considerando:\n\n{rag_context}\n\n"
                f"Questão: {query}\n\n"
                f"Combine jurisprudência com análise original."
            )

        return query

    def get_conversation_history(self, conversation_id: str) -> List[SearchResult]:
        """
        Obter histórico de conversa
        Primeiro tenta cache em memória, depois banco de dados
        """
        # Tentar cache em memória
        if conversation_id in self.history:
            return self.history[conversation_id]

        # Tentar banco de dados
        if self.repository:
            try:
                db_conversation = self.repository.get_conversation(conversation_id)
                if db_conversation:
                    db_queries = self.repository.get_conversation_queries(db_conversation.id)
                    # Converter para SearchResult
                    results = []
                    for db_query in db_queries:
                        search_query = SearchQuery(
                            query=db_query.query_text,
                            mode=ResearchMode(db_query.mode),
                            task_type=db_query.task_type,
                            is_urgent=db_query.is_urgent,
                        )
                        search_query.id = db_query.query_id
                        search_query.created_at = db_query.created_at

                        search_result = SearchResult(
                            query=search_query,
                            analysis=db_query.response_text or "",
                            provider=db_query.provider,
                            tier=db_query.tier,
                            tokens_used=db_query.tokens_used,
                            cost_usd=db_query.cost_usd,
                            latency_ms=db_query.latency_ms,
                            sources=db_query.sources_json or [],
                            confidence=db_query.confidence,
                            is_fallback=db_query.is_fallback,
                        )
                        results.append(search_result)

                    # Cache em memória
                    self.history[conversation_id] = results
                    return results
            except Exception as e:
                logger.warning(f"⚠️ Erro ao buscar histórico no banco: {e}")

        return []

    def get_statistics(self) -> Dict[str, Any]:
        """Obter estatísticas de uso"""
        total_searches = sum(len(results) for results in self.history.values())
        total_cost = sum(
            r.cost_usd for results in self.history.values() for r in results
        )
        total_tokens = sum(
            r.tokens_used for results in self.history.values() for r in results
        )

        return {
            "total_searches": total_searches,
            "total_cost_usd": round(total_cost, 4),
            "total_tokens": total_tokens,
            "conversations": len(self.history),
            "router_stats": self.router.get_usage_stats() if self.router else {},
        }

    def clear_conversation(self, conversation_id: str) -> bool:
        """Limpar histórico de conversa (memória e banco)"""
        # Limpar cache em memória
        if conversation_id in self.history:
            del self.history[conversation_id]

        # Limpar no banco de dados
        if self.repository:
            try:
                return self.repository.delete_conversation(conversation_id)
            except Exception as e:
                logger.warning(f"⚠️ Erro ao limpar conversa no banco: {e}")
                return False

        return True

    def clear_all_history(self) -> int:
        """Limpar todo o histórico (memória e banco)"""
        count = sum(len(results) for results in self.history.values())
        self.history.clear()

        # Limpar no banco de dados
        if self.repository:
            try:
                # Arquivar todas as conversas
                from database import SessionLocal
                db = SessionLocal()
                from sqlalchemy import update
                from models.research import ResearchConversation
                db.execute(update(ResearchConversation).values(is_archived=True))
                db.commit()
                db.close()
                logger.info(f"🧹 Todos os históricos limpos ({count} resultados em memória)")
            except Exception as e:
                logger.warning(f"⚠️ Erro ao limpar histórico no banco: {e}")

        return count
