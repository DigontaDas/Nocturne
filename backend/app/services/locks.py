from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Iterable

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)


def make_lock_key(reservation_date: date, time_slot: str, table_code: str) -> str:
    """Build deterministic Redis key for a table seat hold."""
    return f"lock:table:{reservation_date.isoformat()}:{time_slot.strip()}:{table_code.strip().upper()}"


class _InMemoryHoldStore:
    """Process-local TTL lock store used transparently when Redis is unreachable."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._entries: dict[str, tuple[str, datetime]] = {}

    def _prune(self, now: datetime) -> None:
        expired = [k for k, (_, exp) in self._entries.items() if exp <= now]
        for k in expired:
            self._entries.pop(k, None)

    async def acquire(self, key: str, session_id: str, ttl_seconds: int) -> HoldResult:
        now = datetime.now(timezone.utc)
        async with self._lock:
            self._prune(now)
            current = self._entries.get(key)
            if current is None or current[0] == session_id:
                expires_at = now + timedelta(seconds=ttl_seconds)
                self._entries[key] = (session_id, expires_at)
                return HoldResult(
                    acquired=True,
                    ttl_seconds=ttl_seconds,
                    expires_at=expires_at,
                    holder_session_id=session_id,
                )
            holder, exp = current
            rem = max(0, int((exp - now).total_seconds()))
            return HoldResult(
                acquired=False,
                ttl_seconds=rem,
                expires_at=exp,
                holder_session_id=None,
            )

    async def release(self, key: str, session_id: str) -> bool:
        now = datetime.now(timezone.utc)
        async with self._lock:
            self._prune(now)
            current = self._entries.get(key)
            if current is not None and current[0] == session_id:
                self._entries.pop(key, None)
                return True
            return False

    async def verify(self, key: str, session_id: str) -> bool:
        now = datetime.now(timezone.utc)
        async with self._lock:
            self._prune(now)
            current = self._entries.get(key)
            return current is not None and current[0] == session_id

    async def clear(self, key: str) -> None:
        async with self._lock:
            self._entries.pop(key, None)

    async def get_many(self, keys_to_codes: list[tuple[str, str]]) -> dict[str, tuple[str, int]]:
        now = datetime.now(timezone.utc)
        locks: dict[str, tuple[str, int]] = {}
        async with self._lock:
            self._prune(now)
            for key, code in keys_to_codes:
                entry = self._entries.get(key)
                if entry is not None:
                    holder, exp = entry
                    rem = max(0, int((exp - now).total_seconds()))
                    if rem > 0:
                        locks[code] = (holder, rem)
        return locks


_FALLBACK_LOCKS = _InMemoryHoldStore()


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
    """Atomically acquire or refresh a 10-minute seat hold (Redis primary, in-memory fallback)."""
    ttl = ttl_seconds or settings.SEAT_HOLD_TTL_SECONDS
    key = make_lock_key(reservation_date, time_slot, table_code)
    try:
        result = await redis.eval(_ACQUIRE_LUA, 1, key, session_id, str(ttl))
        acquired_int, remaining_ttl = int(result[0]), max(0, int(result[1]))
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=remaining_ttl)
        if acquired_int:
            # Clear any prior Redis-outage fallback entry now that Redis owns the authoritative TTL.
            await _FALLBACK_LOCKS.clear(key)
        return HoldResult(
            acquired=bool(acquired_int),
            ttl_seconds=remaining_ttl,
            expires_at=expires_at,
            holder_session_id=session_id if acquired_int else None,
        )
    except (RedisError, OSError, TimeoutError) as exc:
        logger.warning("Redis acquire_table_hold failed (%s); using in-memory lock fallback", exc)
        return await _FALLBACK_LOCKS.acquire(key, session_id, ttl)


async def release_table_hold(
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    table_code: str,
    session_id: str,
) -> bool:
    """Release a seat hold only if owned by the requesting session."""
    key = make_lock_key(reservation_date, time_slot, table_code)
    fallback_released = await _FALLBACK_LOCKS.release(key, session_id)
    try:
        deleted = await redis.eval(_RELEASE_LUA, 1, key, session_id)
        return bool(int(deleted)) or fallback_released
    except (RedisError, OSError, TimeoutError) as exc:
        logger.warning("Redis release_table_hold failed (%s); released fallback lock", exc)
        return fallback_released


async def verify_table_hold_owner(
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    table_code: str,
    session_id: str,
) -> bool:
    """Verify the requesting session currently holds the lock for this table."""
    key = make_lock_key(reservation_date, time_slot, table_code)
    try:
        holder = await redis.get(key)
        if holder is not None:
            return holder == session_id
        return await _FALLBACK_LOCKS.verify(key, session_id)
    except (RedisError, OSError, TimeoutError) as exc:
        logger.warning("Redis verify_table_hold_owner failed (%s); checking fallback lock", exc)
        return await _FALLBACK_LOCKS.verify(key, session_id)


async def clear_table_hold_after_confirm(
    redis: Redis,
    reservation_date: date,
    time_slot: str,
    table_code: str,
) -> None:
    """Delete temporary lock once PostgreSQL confirmation commits."""
    key = make_lock_key(reservation_date, time_slot, table_code)
    await _FALLBACK_LOCKS.clear(key)
    try:
        await redis.delete(key)
    except (RedisError, OSError, TimeoutError) as exc:
        logger.warning("Redis clear_table_hold_after_confirm failed (%s); ignored", exc)


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
    keys_to_codes = [(make_lock_key(reservation_date, time_slot, code), code) for code in codes]
    fallback_locks = await _FALLBACK_LOCKS.get_many(keys_to_codes)
    try:
        pipe = redis.pipeline()
        for key, _code in keys_to_codes:
            pipe.get(key)
            pipe.ttl(key)
        raw = await pipe.execute()

        locks: dict[str, tuple[str, int]] = dict(fallback_locks)
        for idx, code in enumerate(codes):
            holder = raw[idx * 2]
            ttl = raw[idx * 2 + 1]
            if holder is not None and isinstance(ttl, int) and ttl > 0:
                locks[code] = (str(holder), ttl)
        return locks
    except (RedisError, OSError, TimeoutError) as exc:
        logger.warning("Redis get_slot_locks failed (%s); returning fallback locks", exc)
        return fallback_locks
