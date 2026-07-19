"""
Database Configuration and Session Management
"""

import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from models.research import Base

logger = logging.getLogger(__name__)

# Database URL from environment or default SQLite
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./research.db"
)

# Create engine with appropriate options based on database type
if DATABASE_URL.startswith("sqlite"):
    # SQLite configuration
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    # PostgreSQL or other databases
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Database initialized")


def get_db() -> Session:
    """Dependency injection for database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Initialize database on module import
try:
    init_db()
except Exception as e:
    logger.error(f"❌ Error initializing database: {e}")
