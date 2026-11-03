from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from backend.app.config import settings
from backend.app.api.routes import router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Thamizh Web Studio AI Backend — Powered by Groq LPU & Whisper-large-v3-turbo"
)

# Enable CORS for web studio client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(router)

# Mount frontend root for unified local execution
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent
app.mount("/studio", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="studio")

@app.get("/")
def root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "groq_models": ["openai/gpt-oss-120b", "whisper-large-v3-turbo"],
        "studio_url": "/studio/index.html",
        "api_docs": "/docs"
    }
