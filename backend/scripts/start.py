"""Resilient cloud startup entrypoint for Nocturne backend."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.bootstrap import bootstrap_database  # noqa: E402, F401


def main() -> None:
    """Bind the HTTP port immediately so cloud health probes succeed during DB cold-start."""
    port = int(os.getenv("PORT", "8000"))
    print(f"[start] Launching Uvicorn immediately on 0.0.0.0:{port}", flush=True)
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
