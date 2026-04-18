import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes.capture import router as capture_router
from routes.ideas import router as ideas_router
from routes.search import router as search_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Git Music - AI Musical Idea Version Control",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: read allowed origins from env (comma-separated) with sensible defaults
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(capture_router)
app.include_router(ideas_router)
app.include_router(search_router)


@app.get("/")
async def root():
    return {"message": "Git Music API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
