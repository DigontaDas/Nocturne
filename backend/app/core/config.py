from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _strip_wrapping_quotes(raw: object) -> str:
    text = str(raw).strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in ('"', "'"):
        return text[1:-1].strip()
    return text


def normalize_database_url(raw: object) -> str:
    """Normalize Postgres URLs for asyncpg + cloud hosts like Neon/Railway."""
    url = _strip_wrapping_quotes(raw)
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]

    if not url.startswith("postgresql+asyncpg://"):
        return url

    parts = urlsplit(url)
    if not parts.query:
        return url

    params: list[tuple[str, str]] = []
    has_ssl = False
    sslmode_val: str | None = None
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered in {"channel_binding", "uselibpqcompat"}:
            continue
        if lowered == "sslmode":
            sslmode_val = value.lower()
            continue
        if lowered == "ssl":
            has_ssl = True
        params.append((key, value))

    if sslmode_val in {"require", "verify-ca", "verify-full"} and not has_ssl:
        params.append(("ssl", "require"))

    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(params), parts.fragment))


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
    ENABLE_LOCAL_TRANSFORMER_EMBEDDINGS: bool = False

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    LLAMA_API_KEY: str = ""
    LLAMA_BASE_URL: str = ""
    LLAMA_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    OLLAMA_TIMEOUT_SECONDS: float = 2.0

    FRONTEND_URL: str = "http://localhost:3300"
    TABLE_DEPOSIT_BDT: int = 1000
    FREE_CANCELLATION_HOURS: int = 4
    NO_SHOW_GRACE_MINUTES: int = 15

    # bKash Tokenized Checkout (aligned with Clarity server/services/bkash.js)
    BKASH_GRANT_URL: str = (
        "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant"
    )
    BKASH_BASE_URL: str = (
        "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
    )
    BKASH_APP_KEY: str = ""
    BKASH_APP_SECRET: str = ""
    BKASH_USERNAME: str = ""
    BKASH_PASSWORD: str = ""

    # Card Payments via Stripe Checkout
    STRIPE_SECRET_KEY: str = ""
    STRIPE_CURRENCY: str = "bdt"

    PAYMENT_ALLOW_DEMO_SIMULATION: bool = True

    # Boss Admin Credentials & Token Signing
    ADMIN_USERNAME: str = "boss"
    ADMIN_PASSWORD: str = "NocturneBoss2026"
    ADMIN_SECRET_KEY: str = "nocturne-admin-signing-key-change-in-production"
    ADMIN_TOKEN_TTL_SECONDS: int = 43200

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def validate_database_url(cls, v: object) -> str:
        cleaned = normalize_database_url(v)
        if not cleaned:
            return "postgresql+asyncpg://nocturne:nocturne_secret@localhost:5433/nocturne"
        return cleaned

    @field_validator(
        "REDIS_URL",
        "FRONTEND_URL",
        "GROQ_API_KEY",
        "GROQ_MODEL",
        "LLAMA_API_KEY",
        "LLAMA_BASE_URL",
        "LLAMA_MODEL",
        "OLLAMA_BASE_URL",
        "OLLAMA_MODEL",
        "STRIPE_SECRET_KEY",
        "BKASH_APP_KEY",
        "BKASH_APP_SECRET",
        "BKASH_USERNAME",
        "BKASH_PASSWORD",
        "ADMIN_USERNAME",
        "ADMIN_PASSWORD",
        "ADMIN_SECRET_KEY",
        mode="before",
    )
    @classmethod
    def strip_url_quotes(cls, v: object) -> str:
        if v is None:
            return ""
        return _strip_wrapping_quotes(v)

    @field_validator(
        "TABLE_DEPOSIT_BDT",
        "FREE_CANCELLATION_HOURS",
        "NO_SHOW_GRACE_MINUTES",
        mode="before",
    )
    @classmethod
    def empty_int_to_default(cls, v: object, info) -> object:
        if isinstance(v, str) and not v.strip():
            defaults = {
                "TABLE_DEPOSIT_BDT": 1000,
                "FREE_CANCELLATION_HOURS": 4,
                "NO_SHOW_GRACE_MINUTES": 15,
            }
            return defaults[info.field_name]
        return v

    @field_validator("PAYMENT_ALLOW_DEMO_SIMULATION", mode="before")
    @classmethod
    def empty_bool_to_default(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return True
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        default_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3300",
            "http://127.0.0.1:3300",
        ]
        if isinstance(v, str):
            raw = _strip_wrapping_quotes(v)
            if not raw:
                return default_origins
            if raw.startswith("["):
                import ast
                import json

                for parser in (json.loads, ast.literal_eval):
                    try:
                        parsed = parser(raw)
                        if isinstance(parsed, list):
                            return [str(item).strip() for item in parsed if str(item).strip()]
                    except Exception:
                        pass
                raw = raw.strip("[]")
            return [
                item.strip().strip('"').strip("'")
                for item in raw.split(",")
                if item.strip().strip('"').strip("'")
            ] or default_origins
        if isinstance(v, list):
            return v
        return default_origins


settings = Settings()
