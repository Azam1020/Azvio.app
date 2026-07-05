import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from auth import router as auth_router, public_router as auth_public_router, seed_admins
from crud_routes import router as crud_router, seed_defaults
from database import client, db
from sanad import router as sanad_router
from google_calendar import router as google_router, public_router as google_public_router
from supabase_storage import ensure_bucket, is_configured as supabase_configured
from user_settings import router as user_settings_router
from whatsapp_analysis import router as whatsapp_router
from portfolio import router as portfolio_router
from team import router as team_router
from notifications import router as notifications_router, run_daily_reminders

app = FastAPI(title="AZVIO API")

app.include_router(auth_router, prefix="/api")
app.include_router(auth_public_router, prefix="/api")
app.include_router(crud_router, prefix="/api")
app.include_router(sanad_router, prefix="/api")
app.include_router(google_router, prefix="/api")
app.include_router(google_public_router, prefix="/api")
app.include_router(user_settings_router, prefix="/api")
app.include_router(whatsapp_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")
app.include_router(team_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")


@app.get("/api/")
async def root():
    return {"message": "AZVIO API is running"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await seed_admins()
    await seed_defaults()
    await db.users.create_index("email_lower", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.google_accounts.create_index([("user_id", 1), ("email", 1)], unique=True)
    if supabase_configured():
        ok = await ensure_bucket()
        logger.info(f"Supabase bucket ready: {ok}")
    scheduler = AsyncIOScheduler(timezone="Asia/Riyadh")
    scheduler.add_job(run_daily_reminders, "cron", hour=8, minute=0)
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("AZVIO startup complete: admins seeded, indexes created, daily reminders scheduled 08:00 Riyadh")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
