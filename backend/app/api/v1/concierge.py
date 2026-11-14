from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis
from app.db.session import get_db
from app.schemas.hospitality import ConciergeStreamRequest
from app.services.concierge import stream_concierge_response

router = APIRouter(prefix="/concierge", tags=["concierge"])


@router.post("/stream")
async def stream_concierge(
    payload: ConciergeStreamRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> StreamingResponse:
    """Stream LangChain + pgvector hybrid RAG & SQL tool-calling concierge response."""
    return StreamingResponse(
        stream_concierge_response(payload=payload, db=db, redis=redis),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
