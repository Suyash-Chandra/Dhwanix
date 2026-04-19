import os
import urllib.parse
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

raw_db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./music_ideas.db")

# Parse and safely URL-encode the password if a remote DB is used.
if "://" in raw_db_url:
    scheme, rest = raw_db_url.split("://", 1)
    if scheme in ["postgres", "postgresql", "postgresql+asyncpg"]:
        if "@" in rest:
            user_pass, host_part = rest.rsplit("@", 1)
            if ":" in user_pass:
                user, raw_pass = user_pass.split(":", 1)
                encoded_pass = urllib.parse.quote_plus(raw_pass)
                raw_db_url = f"postgresql+asyncpg://{user}:{encoded_pass}@{host_part}"
            else:
                raw_db_url = f"postgresql+asyncpg://{user_pass}@{host_part}"
        else:
            raw_db_url = f"postgresql+asyncpg://{rest}"

DATABASE_URL = raw_db_url

from sqlalchemy.pool import NullPool

kwargs = {"echo": False}
if "postgresql" in DATABASE_URL:
    kwargs["connect_args"] = {
        "ssl": "require",
        "statement_cache_size": 0,
        "timeout": 5
    }
    kwargs["poolclass"] = NullPool
    # SQLAlchemy dialect-level prepared statement cache must also be disabled
    kwargs["prepared_statement_cache_size"] = 0

engine = create_async_engine(DATABASE_URL, **kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "audio_files")

async def init_db():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    try:
        async with engine.begin() as conn:
            from models import Idea, IdeaVersion  # noqa
            await conn.run_sync(Base.metadata.create_all)
            print("Database initialized successfully.")
    except Exception as e:
        print(f"CRITICAL WARNING: Database initialization failed: {e}")
        # Server stays alive, but DB queries will fail if connection is permanently bad.

async def get_db():
    async with async_session() as session:
        yield session
