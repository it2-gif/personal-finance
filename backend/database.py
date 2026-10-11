import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv(Path(__file__).with_name(".env"))

database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL is missing")

url = make_url(database_url).set(drivername="postgresql+psycopg")

engine = create_engine(
    url,
    pool_pre_ping=True,
    connect_args={
        "connect_timeout": 10,
        "sslmode": "require",
    },
)

SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    with SessionLocal() as session:
        yield session