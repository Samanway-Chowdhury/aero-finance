import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import QueuePool

# Load the database URL from environment — Cloud Run injects DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./aerofinance.db")

# Normalise Heroku-style postgres:// to postgresql+psycopg2://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

if DATABASE_URL.startswith("sqlite"):
    # SQLite: used for local development only
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL: production (Cloud SQL via Unix socket or TCP)
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=10,         # number of persistent connections
        max_overflow=20,      # extra connections allowed when pool is full
        pool_recycle=1800,    # recycle connections after 30 min to avoid stale sockets
        pool_pre_ping=True,   # test connection liveness before checkout (auto-reconnect)
        pool_timeout=30,      # max seconds to wait for a connection from the pool
        echo=False,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependency that provides a database session and ensures it is closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
