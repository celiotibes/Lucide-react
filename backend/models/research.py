"""
Database Models for Advanced Research
Stores conversation history, search queries, and results with multi-tier routing metadata
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    Column,
    String,
    Text,
    Float,
    Integer,
    DateTime,
    Boolean,
    JSON,
    ForeignKey,
    Index,
    create_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
import uuid

Base = declarative_base()


class ResearchConversation(Base):
    """Conversa de pesquisa com histórico de queries"""

    __tablename__ = "research_conversations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(50), unique=True, nullable=False, index=True)
    user_id = Column(String(36), nullable=True, index=True)  # Para multi-usuário futura
    title = Column(String(255), nullable=True)
    mode = Column(String(20), default="hybrid")  # RAG_ENHANCED, QUICK_ANALYSIS, HYBRID
    total_cost_usd = Column(Float, default=0.0)
    total_tokens = Column(Integer, default=0)
    query_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_archived = Column(Boolean, default=False)
    metadata = Column(JSON, nullable=True)  # Custom metadata

    # Relationships
    queries = relationship("ResearchQuery", back_populates="conversation", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        """Converter para dicionário"""
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "title": self.title,
            "mode": self.mode,
            "total_cost_usd": round(self.total_cost_usd, 4),
            "total_tokens": self.total_tokens,
            "query_count": self.query_count,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "is_archived": self.is_archived,
        }

    def __repr__(self):
        return f"<ResearchConversation {self.conversation_id} - {self.query_count} queries>"


class ResearchQuery(Base):
    """Query individual em uma conversa"""

    __tablename__ = "research_queries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    query_id = Column(String(50), unique=True, nullable=False, index=True)
    conversation_id = Column(String(36), ForeignKey("research_conversations.id"), index=True)
    query_text = Column(Text, nullable=False)
    mode = Column(String(20))  # RAG_ENHANCED, QUICK_ANALYSIS, HYBRID
    task_type = Column(String(50), default="hermenautica_juridica", index=True)
    is_urgent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Response metadata
    provider = Column(String(20), index=True)  # claude, groq, gemini, ollama
    tier = Column(String(30), index=True)  # TIER1_PREMIUM, TIER2_FAST_FREE, etc
    model = Column(String(100))
    response_text = Column(Text, nullable=True)
    tokens_used = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    latency_ms = Column(Integer, default=0)
    confidence = Column(Float, default=0.0)
    is_fallback = Column(Boolean, default=False)

    # RAG metadata
    rag_mode_used = Column(Boolean, default=False)
    sources_count = Column(Integer, default=0)
    sources_json = Column(JSON, nullable=True)  # Store source information

    # Relationships
    conversation = relationship("ResearchConversation", back_populates="queries")

    # Indexes for common queries
    __table_args__ = (
        Index("idx_conversation_created", "conversation_id", "created_at"),
        Index("idx_provider_tier", "provider", "tier"),
        Index("idx_task_type_created", "task_type", "created_at"),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Converter para dicionário"""
        return {
            "id": self.id,
            "query_id": self.query_id,
            "query_text": self.query_text,
            "mode": self.mode,
            "task_type": self.task_type,
            "is_urgent": self.is_urgent,
            "provider": self.provider,
            "tier": self.tier,
            "model": self.model,
            "response_text": self.response_text,
            "tokens_used": self.tokens_used,
            "cost_usd": round(self.cost_usd, 4),
            "latency_ms": self.latency_ms,
            "confidence": round(self.confidence, 2),
            "is_fallback": self.is_fallback,
            "rag_mode_used": self.rag_mode_used,
            "sources_count": self.sources_count,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<ResearchQuery {self.query_id} - {self.provider}/{self.tier}>"


class ResearchStatistics(Base):
    """Estatísticas agregadas de pesquisa por período"""

    __tablename__ = "research_statistics"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    date = Column(String(10), unique=True, index=True)  # YYYY-MM-DD
    total_queries = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)
    total_tokens = Column(Integer, default=0)
    avg_latency_ms = Column(Float, default=0.0)
    avg_confidence = Column(Float, default=0.0)

    # Provider breakdown
    provider_stats = Column(JSON)  # {provider: {calls, cost, tokens, avg_latency}}

    # Task type breakdown
    task_type_stats = Column(JSON)  # {task_type: {calls, cost, tokens}}

    # Tier breakdown
    tier_stats = Column(JSON)  # {tier: {calls, cost, tokens}}

    fallback_count = Column(Integer, default=0)
    rag_enabled_count = Column(Integer, default=0)
    urgent_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """Converter para dicionário"""
        return {
            "id": self.id,
            "date": self.date,
            "total_queries": self.total_queries,
            "total_cost_usd": round(self.total_cost_usd, 2),
            "total_tokens": self.total_tokens,
            "avg_latency_ms": round(self.avg_latency_ms, 1),
            "avg_confidence": round(self.avg_confidence, 2),
            "provider_stats": self.provider_stats,
            "task_type_stats": self.task_type_stats,
            "tier_stats": self.tier_stats,
            "fallback_count": self.fallback_count,
            "rag_enabled_count": self.rag_enabled_count,
            "urgent_count": self.urgent_count,
        }

    def __repr__(self):
        return f"<ResearchStatistics {self.date} - {self.total_queries} queries>"


class ResearchFavorite(Base):
    """Marcadores/favoritos de pesquisa para rápido acesso"""

    __tablename__ = "research_favorites"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=True, index=True)  # Para multi-usuário futura
    query_id = Column(String(50), ForeignKey("research_queries.query_id"), index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)  # ['legal', 'dano-moral', 'jurisprudência']
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self) -> Dict[str, Any]:
        """Converter para dicionário"""
        return {
            "id": self.id,
            "query_id": self.query_id,
            "name": self.name,
            "description": self.description,
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<ResearchFavorite {self.name}>"


class ResearchSettings(Base):
    """Configurações por usuário para pesquisa"""

    __tablename__ = "research_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), unique=True, nullable=True, index=True)
    default_mode = Column(String(20), default="hybrid")  # RAG_ENHANCED, QUICK_ANALYSIS, HYBRID
    default_task_type = Column(String(50), default="hermenautica_juridica")
    enable_rag = Column(Boolean, default=True)
    enable_fallback = Column(Boolean, default=True)
    cost_aware = Column(Boolean, default=True)
    min_relevance = Column(Float, default=0.3)
    max_cost_per_query = Column(Float, nullable=True)  # Limite de custo opcional
    auto_save_favorites = Column(Boolean, default=True)
    preferences = Column(JSON, nullable=True)  # Custom preferences

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """Converter para dicionário"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "default_mode": self.default_mode,
            "default_task_type": self.default_task_type,
            "enable_rag": self.enable_rag,
            "enable_fallback": self.enable_fallback,
            "cost_aware": self.cost_aware,
            "min_relevance": self.min_relevance,
            "max_cost_per_query": self.max_cost_per_query,
            "auto_save_favorites": self.auto_save_favorites,
        }

    def __repr__(self):
        return f"<ResearchSettings user={self.user_id}>"


# Database utilities

def init_db(database_url: str = "sqlite:///./research.db"):
    """Inicializar banco de dados"""
    engine = create_engine(database_url, echo=False)
    Base.metadata.create_all(bind=engine)
    return engine


def get_session(database_url: str = "sqlite:///./research.db"):
    """Obter sessão SQLAlchemy"""
    engine = create_engine(database_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()
