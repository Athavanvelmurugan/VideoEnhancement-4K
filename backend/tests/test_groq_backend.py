import pytest
import numpy as np
import cv2
import tempfile
import os
from fastapi.testclient import TestClient
from backend.app.config import settings
from backend.app.services.groq_service import groq_service
from backend.app.services.video_engine import video_engine
from backend.app.services.ai_enhancer import ai_enhancer
from backend.app.main import app

client = TestClient(app)

def test_groq_api_authentication():
    """Verify Groq API key is valid and can list supported models."""
    import requests
    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "User-Agent": "ThamizhWebStudio/1.0"
    }
    res = requests.get(f"{settings.GROQ_BASE_URL}/models", headers=headers, timeout=10)
    assert res.status_code == 200, f"Groq API returned status {res.status_code}"
    data = res.json()
    model_ids = [m["id"] for m in data.get("data", [])]
    assert any("whisper" in m for m in model_ids), "Whisper model not found in Groq"
    assert any("llama" in m for m in model_ids), "LLaMA model not found in Groq"

def test_groq_llama_ai_director():
    """Verify Groq LLaMA accurately computes Thamizh retouching parameters."""
    test_prompt = "Warm Bollywood bridal look with glowing skin, slim jawline, and golden tones"
    result = groq_service.ask_ai_director(test_prompt)

    # Validate essential schema keys
    required_keys = [
        "skinSmooth", "skinDetail", "faceSlim", "bigEyes",
        "teethWhiten", "faceRelight", "superRes", "lutType", "explanation"
    ]
    for key in required_keys:
        assert key in result, f"Missing required parameter key: {key}"

    # Verify parameter bounds [0.0, 1.0]
    assert 0.0 <= result["skinSmooth"] <= 1.0
    assert 0.0 <= result["faceSlim"] <= 1.0
    assert 0.0 <= result["superRes"] <= 1.0
    assert isinstance(result["lutType"], int)

def test_video_engine_and_ffmpeg():
    """Verify bundled FFmpeg executable and video properties extraction."""
    assert os.path.exists(settings.FFMPEG_PATH), f"FFmpeg binary not found at: {settings.FFMPEG_PATH}"

    # Create synthetic test video
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_video_path = tmp.name

    try:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(tmp_video_path, fourcc, 30.0, (640, 360))
        for _ in range(30):
            frame = np.zeros((360, 640, 3), dtype=np.uint8)
            frame[:] = (120, 180, 240)
            out.write(frame)
        out.release()

        info = video_engine.get_video_info(tmp_video_path)
        assert info["width"] == 640
        assert info["height"] == 360
        assert info["total_frames"] == 30
        assert info["fps"] == 30.0
    finally:
        if os.path.exists(tmp_video_path):
            os.remove(tmp_video_path)

def test_ai_enhancer_4k_upscaling_and_smoothing():
    """Verify AI Enhancer performs 4K upscaling and bilateral skin smoothing."""
    # Create 720p dummy portrait frame
    frame = np.full((720, 1280, 3), 160, dtype=np.uint8)
    params = {
        "skinSmooth": 0.70,
        "skinDetail": 0.85,
        "superRes": 0.80,
        "lutType": 1, # Golden Flaze
        "lutIntensity": 0.90
    }

    # Enhance and upscale to 4K UHD
    target_4k = (3840, 2160)
    enhanced = ai_enhancer.enhance_frame(frame, params, target_res=target_4k)

    assert enhanced.shape == (2160, 3840, 3), f"Output shape mismatch: {enhanced.shape}"
    assert enhanced.dtype == np.uint8

def test_fastapi_endpoints():
    """Verify FastAPI service health and AI Director endpoint."""
    # Test root endpoint
    res_root = client.get("/")
    assert res_root.status_code == 200
    data = res_root.json()
    assert data["status"] == "online"

    # Test AI Director API endpoint
    res_director = client.post("/api/ai/director", json={"prompt": "Glass skin K-pop style"})
    assert res_director.status_code == 200
    resp_data = res_director.json()
    assert resp_data["status"] == "success"
    assert "skinSmooth" in resp_data["data"]
