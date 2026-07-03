import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from auth import router as auth_router, seed_admins
from crud_routes import router as crud_router, seed_defaults
from database import client, db
from sanad import router as sanad_router

app = FastAPI(title="AZVIO API")

app.include_router(auth_router, prefix="/api")
app.include_router(crud_router, prefix="/api")
app.include_router(sanad_router, prefix="/api")


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
    logger.info("AZVIO startup complete: admins seeded, indexes created")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
