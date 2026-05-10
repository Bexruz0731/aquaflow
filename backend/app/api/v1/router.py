from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth, clients, products, regions, users,
    couriers, settings, orders,
    warehouse, treasury, debts, containers,
    statistics, reports, cash_register, client_groups, operator,
    admin_expenses,
)

api_router = APIRouter()

api_router.include_router(auth.router,        prefix="/auth",        tags=["Auth"])
api_router.include_router(clients.router,     prefix="/clients",     tags=["Clients"])
api_router.include_router(products.router,    prefix="/products",    tags=["Products"])
api_router.include_router(regions.router,     prefix="/regions",     tags=["Regions"])
api_router.include_router(users.router,       prefix="/users",       tags=["Users"])
api_router.include_router(couriers.router,    prefix="/couriers",    tags=["Couriers"])
api_router.include_router(settings.router,    prefix="/settings",    tags=["Settings"])
api_router.include_router(orders.router,      prefix="/orders",      tags=["Orders"])
api_router.include_router(warehouse.router,   prefix="/warehouse",   tags=["Warehouse"])
api_router.include_router(treasury.router,    prefix="/treasury",    tags=["Treasury"])
api_router.include_router(debts.router,       prefix="/debts",       tags=["Debts"])
api_router.include_router(containers.router,  prefix="/containers",  tags=["Containers"])
api_router.include_router(statistics.router,     prefix="/statistics",     tags=["Statistics"])
api_router.include_router(reports.router,        prefix="/reports",        tags=["Reports"])
api_router.include_router(cash_register.router,   prefix="/cash-register",   tags=["Cash Register"])
api_router.include_router(client_groups.router,   prefix="/client-groups",   tags=["Client Groups"])
api_router.include_router(operator.router,        prefix="/operator",        tags=["Operator"])
api_router.include_router(admin_expenses.router,  prefix="/admin-expenses",  tags=["Admin Expenses"])
