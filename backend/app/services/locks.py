from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Iterable

from redis.asyncio import Redis

from app.core.config import settings


def make_lock_key(reservation_date: date, time_slot: str, table_code: str) -> str:
    """Build deterministic Redis key for a table seat hold."""
    return f"lock:table:{reservation_date.isoformat()}:{time_slot.strip()}:{table_code.strip().upper()}"


# Lua script:
# KEYS[1] = lock key
# ARGV[1] = session_id
# ARGV[2] = ttl_seconds
# Returns [acquired_flag (1|0), ttl_remaining]
_ACQUIRE_LUA = """
local current = redis.call('GET', KEYS[1])
if not current then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
  return {1, tonumber(ARGV[2])}
elseif current == ARGV[1] then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
  return {1, tonumber(ARGV[2])}
else
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then ttl = tonumber(ARGV[2]) end
  return {0, ttl}
end
"""

_RELEASE_LUA = """
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


@dataclass(slots=True)
class HoldResult:
    acquired: bool
    ttl_seconds: int
    expires_at: datetime
    holder_session_id: str | None = None


async def acquire_table_hold(
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    table_code: str,
    session_id: str,
    ttl_seconds: int | None = None,
) -> HoldResult:
    """Atomically acquire or refresh a 10-minute Redis seat hold."""
    ttl = ttl_seconds or settings.SEAT_HOLD_TTL_SECONDS
    key = make_lock_key(reservation_date, time_slot, table_code)
    result = await redis.eval(_ACQUIRE_LUA, 1, key, session_id, str(ttl))
    acquired_int, remaining_ttl = int(result[0]), max(0, int(result[1]))
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=remaining_ttl)
    return HoldResult(
        acquired=bool(acquired_int),
        ttl_seconds=remaining_ttl,
        expires_at=expires_at,
        holder_session_id=session_id if acquired_int else None,
    )


async def release_table_hold(
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    table_code: str,
    session_id: str,
) -> bool:
    """Release a Redis seat hold only if owned by the requesting session."""
    key = make_lock_key(reservation_date, time_slot, table_code)
    deleted = await redis.eval(_RELEASE_LUA, 1, key, session_id)
    return bool(int(deleted))


async def verify_table_hold_owner(
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    table_code: str,
    session_id: str,
) -> bool:
    """Verify the requesting session currently holds the Redis lock for this table."""
    key = make_lock_key(reservation_date, time_slot, table_code)
    holder = await redis.get(key)
    return holder == session_id


async def clear_table_hold_after_confirm(
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    table_code: str,
) -> None:
    """Delete temporary Redis lock once PostgreSQL confirmation commits."""
    key = make_lock_key(reservation_date, time_slot, table_code)
    await redis.delete(key)


async def get_slot_locks(
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    table_codes: Iterable[str],
) -> dict[str, tuple[str, int]]:
    """Fetch {table_code: (holder_session_id, ttl_seconds)} via one Redis pipeline."""
    codes = [c.upper() for c in table_codes]
    if not codes:
        return {}
    pipe = redis.pipeline()
    for code in codes:
        key = make_lock_key(reservation_date, time_slot, code)
        pipe.get(key)
        pipe.ttl(key)
    raw = await pipe.execute()

    locks: dict[str, tuple[str, int]] = {}
    for idx, code in enumerate(codes):
        holder = raw[idx * 2]
        ttl = raw[idx * 2 + 1]
        if holder is not None and isinstance(ttl, int) and ttl > 0:
            locks[code] = (str(holder), ttl)
    return locks
