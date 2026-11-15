"""Boss authentication and stateless HMAC token verification for /admin."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException, status

from app.core.config import settings


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(encoded: str) -> bytes:
    padding = "=" * (-len(encoded) % 4)
    return base64.urlsafe_b64decode(f"{encoded}{padding}".encode("ascii"))


def _sign_segment(segment: str) -> str:
    digest = hmac.new(
        settings.ADMIN_SECRET_KEY.encode("utf-8"),
        segment.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _b64url_encode(digest)


def verify_admin_credentials(username: str, password: str) -> bool:
    """Verify Boss credentials using constant-time comparison."""
    expected_user = settings.ADMIN_USERNAME.strip()
    expected_pass = settings.ADMIN_PASSWORD
    if not expected_user or not expected_pass:
        return False
    return secrets.compare_digest(username.strip(), expected_user) and secrets.compare_digest(
        password, expected_pass
    )


def issue_admin_token(username: str) -> tuple[str, datetime]:
    """Mint a signed bearer token scoped to the configured Boss account."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=max(300, int(settings.ADMIN_TOKEN_TTL_SECONDS)))
    payload = {
        "sub": username.strip(),
        "role": "boss",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    payload_seg = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature_seg = _sign_segment(payload_seg)
    return f"{payload_seg}.{signature_seg}", expires_at


def verify_admin_token(token: str) -> str:
    """Validate token signature, expiry, and subject; return Boss username."""
    clean = token.strip()
    parts = clean.split(".")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Boss authentication token.",
        )

    payload_seg, signature_seg = parts
    expected_sig = _sign_segment(payload_seg)
    if not secrets.compare_digest(signature_seg, expected_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Boss authentication signature mismatch.",
        )

    try:
        payload = json.loads(_b64url_decode(payload_seg).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed Boss authentication token.",
        ) from exc

    exp = int(payload.get("exp", 0))
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if exp <= now_ts:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Boss session expired. Please sign in again.",
        )

    subject = str(payload.get("sub", ""))
    expected_user = settings.ADMIN_USERNAME.strip()
    if not expected_user or not secrets.compare_digest(subject, expected_user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Boss credentials revoked.",
        )
    return subject


async def require_admin(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> str:
    """FastAPI dependency enforcing Boss authentication on admin endpoints."""
    token: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_admin_token:
        token = x_admin_token.strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Boss authentication required.",
        )
    return verify_admin_token(token)
