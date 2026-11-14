from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_ENV) if ROOT_ENV.exists() else ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Nocturne Flagship API"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    DATABASE_URL: str = (
        "postgresql+asyncpg://nocturne:nocturne_secret@localhost:5433/nocturne"
    )
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3300",
        "http://127.0.0.1:3300",
    ]

    SEAT_HOLD_TTL_SECONDS: int = 600
    EMBEDDING_DIM: int = 384
    EMBEDDING_MODEL_NAME: str = "sentence-transformers/all-MiniLM-L6-v2"

    GROQ_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            raw = v.strip()
            if raw.startswith("["):
                import json

                return json.loads(raw)
            return [item.strip() for item in raw.split(",") if item.strip()]
        if isinstance(v, list):
            return v
        return ["http://localhost:3000"]


settings = Settings()
