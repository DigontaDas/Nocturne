from fastapi import APIRouter

from app.api.v1 import concierge, health, menu, payments, reservations, tables, zones

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(zones.router)
api_router.include_router(tables.router)
api_router.include_router(menu.router)
api_router.include_router(reservations.router)
api_router.include_router(payments.router)
api_router.include_router(concierge.router)
