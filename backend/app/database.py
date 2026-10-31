"""SQLite + SQLAlchemy setup for MOSSAM backend.

Deliberately simple: one engine, one sessionmaker, one declarative Base.
No Alembic / migrations - tables are created directly on startup, and the
DB is seeded once if empty. This is fine for a hackathon prototype.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

SQLALCHEMY_DATABASE_URL = "sqlite:///./mossam.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # needed only for SQLite: allows use across the FastAPI threadpool
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
