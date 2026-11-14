from __future__ import annotations

import hashlib
import math
import re
from functools import lru_cache
from typing import Sequence

from app.core.config import settings

_TOKEN_RE = re.compile(r"[a-z0-9_]+")


def _deterministic_hash_embedding(text: str, dim: int = settings.EMBEDDING_DIM) -> list[float]:
    """Deterministic L2-normalized feature-hashing fallback when offline."""
    vec = [0.0] * dim
    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        vec[0] = 1.0
        return vec
    grams = tokens + [f"{tokens[i]}_{tokens[i + 1]}" for i in range(len(tokens) - 1)]
    for gram in grams:
        digest = hashlib.blake2b(gram.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(digest[:4], "little") % dim
        sign = 1.0 if (digest[4] & 1) == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


@lru_cache(maxsize=1)
def _load_sentence_transformer():
    """Lazily load local HuggingFace sentence-transformer if cached/reachable."""
    try:
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
    except Exception:
        return None


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """Embed text chunks into 384-d unit vectors with offline fallback."""
    if not texts:
        return []
    model = _load_sentence_transformer()
    if model is not None:
        try:
            vectors = model.encode(
                list(texts),
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            return [vec.tolist() for vec in vectors]
        except Exception:
            pass
    return [_deterministic_hash_embedding(t) for t in texts]


def embed_query(query: str) -> list[float]:
    """Embed a single query string into a 384-d unit vector."""
    return embed_texts([query])[0]
