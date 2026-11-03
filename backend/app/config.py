import os
from pathlib import Path
import imageio_ffmpeg

from dotenv import load_dotenv

# Load local .env file from workspace root
BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = BASE_DIR.parent
load_dotenv(dotenv_path=WORKSPACE_ROOT / ".env")

STORAGE_DIR = BASE_DIR / "storage"
UPLOAD_DIR = STORAGE_DIR / "uploads"
EXPORT_DIR = STORAGE_DIR / "exports"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

class Settings:
    PROJECT_NAME: str = "Thamizh Web Studio AI Backend"
    VERSION: str = "2.23.0"
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    FFMPEG_PATH: str = imageio_ffmpeg.get_ffmpeg_exe()
    UPLOAD_DIR: Path = UPLOAD_DIR
    EXPORT_DIR: Path = EXPORT_DIR

settings = Settings()
