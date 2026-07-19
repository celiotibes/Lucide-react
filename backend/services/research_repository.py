"""
Research Repository Service
Database abstraction layer for research persistence
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, func

from models.research import (
    ResearchConversation,
    ResearchQuery,
    ResearchStatistics,
    ResearchFavorite,
    ResearchSettings,
)

logger = logging.getLogger(__name__)


class ResearchRepository:
    """Repository para operações CRUD em pesquisa"""

    def __init__(self, session: Session):
        self.session = session

    # ========== CONVERSATION OPERATIONS ==========

    def create_conversation(
        self,
        conversation_id: str,
        mode: str = "hybrid",
        user_id: Optional[str] = None,
        title: Optional[str] = None,
    ) -> ResearchConversation:
        """Criar nova conversa"""
        conversation = ResearchConversation(
            conversation_id=conversation_id,
            mode=mode,
            user_id=user_id,
            title=title or f"Conversa {conversation_id[:8]}",
        )
        self.session.add(conversation)
        self.session.commit()
        logger.info(f"✅ Conversa criada: {conversation_id}")
        return conversation

    def get_conversation(self, conversation_id: str) -> Optional[ResearchConversation]:
        """Obter conversa por ID"""
        return self.session.query(ResearchConversation).filter_by(
            conversation_id=conversation_id
        ).first()

    def get_conversations(
        self, user_id: Optional[str] = None, limit: int = 20, offset: int = 0
    ) -> List[ResearchConversation]:
        """Listar conversas do usuário"""
        query = self.session.query(ResearchConversation)
        if user_id:
            query = query.filter_by(user_id=user_id)
        return (
            query.filter_by(is_archived=False)
            .order_by(desc(ResearchConversation.updated_at))
            .limit(limit)
            .offset(offset)
            .all()
        )

    def update_conversation(
        self, conversation_id: str, title: Optional[str] = None, metadata: Optional[Dict] = None
    ) -> Optional[ResearchConversation]:
        """Atualizar conversa"""
        conversation = self.get_conversation(conversation_id)
        if conversation:
            if title:
                conversation.title = title
            if metadata:
                conversation.metadata = metadata
            conversation.updated_at = datetime.utcnow()
            self.session.commit()
        return conversation

    def delete_conversation(self, conversation_id: str) -> bool:
        """Deletar conversa (marca como arquivada)"""
        conversation = self.get_conversation(conversation_id)
        if conversation:
            conversation.is_archived = True
            self.session.commit()
            logger.info(f"✅ Conversa arquivada: {conversation_id}")
            return True
        return False

    # ========== QUERY OPERATIONS ==========

    def create_query(
        self,
        conversation_id: str,
        query_id: str,
        query_text: str,
        mode: str,
        task_type: str,
        is_urgent: bool,
        provider: str,
        tier: str,
        model: str,
        response_text: str,
        tokens_used: int,
        cost_usd: float,
        latency_ms: int,
        confidence: float,
        is_fallback: bool = False,
        rag_mode_used: bool = False,
        sources: Optional[List[Dict]] = None,
    ) -> ResearchQuery:
        """Criar nova query e atualizar conversa"""
        query = ResearchQuery(
            query_id=query_id,
            conversation_id=conversation_id,
            query_text=query_text,
            mode=mode,
            task_type=task_type,
            is_urgent=is_urgent,
            provider=provider,
            tier=tier,
            model=model,
            response_text=response_text,
            tokens_used=tokens_used,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            confidence=confidence,
            is_fallback=is_fallback,
            rag_mode_used=rag_mode_used,
            sources_count=len(sources) if sources else 0,
            sources_json=sources,
        )
        self.session.add(query)

        # Atualizar estatísticas da conversa
        conversation = self.get_conversation(conversation_id)
        if conversation:
            conversation.total_cost_usd += cost_usd
            conversation.total_tokens += tokens_used
            conversation.query_count += 1
            conversation.updated_at = datetime.utcnow()

        self.session.commit()
        logger.info(f"✅ Query criada: {query_id}")
        return query

    def get_query(self, query_id: str) -> Optional[ResearchQuery]:
        """Obter query por ID"""
        return self.session.query(ResearchQuery).filter_by(query_id=query_id).first()

    def get_conversation_queries(self, conversation_id: str) -> List[ResearchQuery]:
        """Obter todas as queries de uma conversa"""
        return (
            self.session.query(ResearchQuery)
            .filter_by(conversation_id=conversation_id)
            .order_by(ResearchQuery.created_at)
            .all()
        )

    def search_queries(
        self,
        provider: Optional[str] = None,
        task_type: Optional[str] = None,
        min_cost: float = 0.0,
        max_cost: Optional[float] = None,
        limit: int = 50,
    ) -> List[ResearchQuery]:
        """Pesquisar queries por critérios"""
        query = self.session.query(ResearchQuery)

        if provider:
            query = query.filter_by(provider=provider)
        if task_type:
            query = query.filter_by(task_type=task_type)

        query = query.filter(ResearchQuery.cost_usd >= min_cost)
        if max_cost:
            query = query.filter(ResearchQuery.cost_usd <= max_cost)

        return query.order_by(desc(ResearchQuery.created_at)).limit(limit).all()

    # ========== STATISTICS OPERATIONS ==========

    def get_or_create_daily_stats(self, date: str) -> ResearchStatistics:
        """Obter ou criar estatísticas do dia"""
        stats = self.session.query(ResearchStatistics).filter_by(date=date).first()

        if not stats:
            stats = ResearchStatistics(
                date=date,
                provider_stats={},
                task_type_stats={},
                tier_stats={},
            )
            self.session.add(stats)
            self.session.commit()

        return stats

    def update_statistics_from_query(self, query: ResearchQuery) -> None:
        """Atualizar estatísticas agregadas com base em nova query"""
        date = query.created_at.strftime("%Y-%m-%d")
        stats = self.get_or_create_daily_stats(date)

        # Agregações básicas
        stats.total_queries += 1
        stats.total_cost_usd += query.cost_usd
        stats.total_tokens += query.tokens_used
        stats.avg_latency_ms = (
            (stats.avg_latency_ms * (stats.total_queries - 1) + query.latency_ms)
            / stats.total_queries
        )
        stats.avg_confidence = (
            (stats.avg_confidence * (stats.total_queries - 1) + query.confidence)
            / stats.total_queries
        )

        # Contadores
        if query.is_fallback:
            stats.fallback_count += 1
        if query.rag_mode_used:
            stats.rag_enabled_count += 1
        if query.is_urgent:
            stats.urgent_count += 1

        # Provider breakdown
        if not stats.provider_stats:
            stats.provider_stats = {}
        provider_key = query.provider
        if provider_key not in stats.provider_stats:
            stats.provider_stats[provider_key] = {"calls": 0, "cost": 0.0, "tokens": 0}
        stats.provider_stats[provider_key]["calls"] += 1
        stats.provider_stats[provider_key]["cost"] += query.cost_usd
        stats.provider_stats[provider_key]["tokens"] += query.tokens_used

        # Task type breakdown
        if not stats.task_type_stats:
            stats.task_type_stats = {}
        task_key = query.task_type
        if task_key not in stats.task_type_stats:
            stats.task_type_stats[task_key] = {"calls": 0, "cost": 0.0, "tokens": 0}
        stats.task_type_stats[task_key]["calls"] += 1
        stats.task_type_stats[task_key]["cost"] += query.cost_usd
        stats.task_type_stats[task_key]["tokens"] += query.tokens_used

        # Tier breakdown
        if not stats.tier_stats:
            stats.tier_stats = {}
        tier_key = query.tier
        if tier_key not in stats.tier_stats:
            stats.tier_stats[tier_key] = {"calls": 0, "cost": 0.0, "tokens": 0}
        stats.tier_stats[tier_key]["calls"] += 1
        stats.tier_stats[tier_key]["cost"] += query.cost_usd
        stats.tier_stats[tier_key]["tokens"] += query.tokens_used

        stats.updated_at = datetime.utcnow()
        self.session.commit()

    def get_statistics(
        self, start_date: Optional[str] = None, end_date: Optional[str] = None
    ) -> List[ResearchStatistics]:
        """Obter estatísticas em intervalo"""
        query = self.session.query(ResearchStatistics)

        if start_date:
            query = query.filter(ResearchStatistics.date >= start_date)
        if end_date:
            query = query.filter(ResearchStatistics.date <= end_date)

        return query.order_by(desc(ResearchStatistics.date)).all()

    def get_last_30_days_stats(self) -> Dict[str, Any]:
        """Obter estatísticas dos últimos 30 dias"""
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=30)

        stats_list = self.get_statistics(
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
        )

        if not stats_list:
            return {
                "total_queries": 0,
                "total_cost": 0.0,
                "total_tokens": 0,
                "daily_breakdown": [],
            }

        total_queries = sum(s.total_queries for s in stats_list)
        total_cost = sum(s.total_cost_usd for s in stats_list)
        total_tokens = sum(s.total_tokens for s in stats_list)

        return {
            "total_queries": total_queries,
            "total_cost": round(total_cost, 2),
            "total_tokens": total_tokens,
            "daily_breakdown": [s.to_dict() for s in stats_list],
        }

    # ========== FAVORITES OPERATIONS ==========

    def add_favorite(
        self,
        query_id: str,
        name: str,
        user_id: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> ResearchFavorite:
        """Adicionar query aos favoritos"""
        favorite = ResearchFavorite(
            query_id=query_id,
            user_id=user_id,
            name=name,
            description=description,
            tags=tags,
        )
        self.session.add(favorite)
        self.session.commit()
        logger.info(f"⭐ Favorito criado: {name}")
        return favorite

    def get_favorites(self, user_id: Optional[str] = None) -> List[ResearchFavorite]:
        """Obter favoritos do usuário"""
        query = self.session.query(ResearchFavorite)
        if user_id:
            query = query.filter_by(user_id=user_id)
        return query.order_by(desc(ResearchFavorite.created_at)).all()

    def remove_favorite(self, favorite_id: str) -> bool:
        """Remover dos favoritos"""
        favorite = self.session.query(ResearchFavorite).filter_by(id=favorite_id).first()
        if favorite:
            self.session.delete(favorite)
            self.session.commit()
            return True
        return False

    # ========== SETTINGS OPERATIONS ==========

    def get_user_settings(self, user_id: str) -> Optional[ResearchSettings]:
        """Obter configurações do usuário"""
        return self.session.query(ResearchSettings).filter_by(user_id=user_id).first()

    def update_user_settings(self, user_id: str, **kwargs) -> ResearchSettings:
        """Atualizar ou criar configurações do usuário"""
        settings = self.get_user_settings(user_id)

        if not settings:
            settings = ResearchSettings(user_id=user_id)
            self.session.add(settings)

        for key, value in kwargs.items():
            if hasattr(settings, key):
                setattr(settings, key, value)

        settings.updated_at = datetime.utcnow()
        self.session.commit()
        return settings

    # ========== CLEANUP OPERATIONS ==========

    def cleanup_old_conversations(self, days: int = 90) -> int:
        """Limpar conversas antigas (marca como arquivadas)"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        count = (
            self.session.query(ResearchConversation)
            .filter(
                and_(
                    ResearchConversation.updated_at < cutoff_date,
                    ResearchConversation.is_archived == False,
                )
            )
            .update({"is_archived": True})
        )
        self.session.commit()
        logger.info(f"🧹 {count} conversas antigas arquivadas")
        return count
