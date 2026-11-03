import os
import uuid
from typing import Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from backend.app.config import settings
from backend.app.services.groq_service import groq_service
from backend.app.services.video_engine import video_engine
from backend.app.services.ai_enhancer import ai_enhancer

router = APIRouter(prefix="/api")

# In-memory Task Queue
tasks_db: Dict[str, Dict[str, Any]] = {}

class AiDirectorRequest(BaseModel):
    prompt: str

@router.post("/ai/director")
async def ai_director_endpoint(req: AiDirectorRequest):
    """
    LLM AI Retouch Director: Translates natural language styling prompts into exact
    Thamizh beauty, 4K repair, and 3D LUT parameter values using Groq LLaMA 3.3 70B.
    """
    try:
        result = groq_service.ask_ai_director(req.prompt)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ai/transcribe")
async def ai_transcribe_endpoint(video: UploadFile = File(...)):
    """
    Speech AI: Transcribes spoken dialogue from uploaded video using Groq Whisper-large-v3-turbo,
    returning millisecond-accurate word-level subtitle timestamps.
    """
    temp_video_path = os.path.join(settings.UPLOAD_DIR, f"temp_{uuid.uuid4().hex}_{video.filename}")
    temp_audio_path = temp_video_path + ".mp3"

    try:
        with open(temp_video_path, "wb") as f:
            content = await video.read()
            f.write(content)

        # Extract audio track
        has_audio = video_engine.extract_audio(temp_video_path, temp_audio_path)
        if not has_audio:
            # Fallback to transcribe the video file directly if format is accepted
            temp_audio_path = temp_video_path

        # Call Groq Whisper
        transcription = groq_service.transcribe_audio(temp_audio_path)
        return {"status": "success", "transcription": transcription}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_video_path):
            os.remove(temp_video_path)
        if os.path.exists(temp_audio_path) and temp_audio_path != temp_video_path:
            os.remove(temp_audio_path)

@router.post("/video/upload")
async def upload_video_endpoint(file: UploadFile = File(...)):
    """Upload and inspect video properties."""
    video_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1] or ".mp4"
    save_path = os.path.join(settings.UPLOAD_DIR, f"{video_id}{ext}")

    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        info = video_engine.get_video_info(save_path)
        return {
            "video_id": video_id,
            "filename": file.filename,
            "path": save_path,
            "info": info
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid video file: {str(e)}")

def background_render_worker(task_id: str, input_path: str, output_path: str, params: dict, resolution: str):
    """Background execution worker for 4K video rendering."""
    tasks_db[task_id]["status"] = "processing"

    res_map = {
        "4k": (3840, 2160),
        "1080p": (1920, 1080),
        "720p": (1280, 720)
    }
    target_res = res_map.get(resolution, (3840, 2160))

    def on_progress(percent, current_frame, total_frames):
        tasks_db[task_id]["progress"] = percent
        tasks_db[task_id]["current_frame"] = current_frame
        tasks_db[task_id]["total_frames"] = total_frames

    try:
        success = ai_enhancer.process_video_pipeline(
            input_video_path=input_path,
            output_video_path=output_path,
            params=params,
            target_resolution=target_res,
            on_progress=on_progress
        )

        if success:
            tasks_db[task_id]["status"] = "completed"
            tasks_db[task_id]["progress"] = 100
            tasks_db[task_id]["download_url"] = f"/api/tasks/{task_id}/download"
        else:
            tasks_db[task_id]["status"] = "failed"
            tasks_db[task_id]["error"] = "FFmpeg encoding pipeline failed."
    except Exception as e:
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["error"] = str(e)

@router.post("/video/render-4k")
async def start_render_job(
    background_tasks: BackgroundTasks,
    video_id: str = Form(...),
    resolution: str = Form("4k"),
    params: str = Form("{}")
):
    """Submit a full neural 4K video rendering job."""
    import json
    params_dict = json.loads(params)

    # Locate uploaded video
    matching_files = [f for f in os.listdir(settings.UPLOAD_DIR) if f.startswith(video_id)]
    if not matching_files:
        raise HTTPException(status_code=404, detail="Video file not found.")

    input_path = os.path.join(settings.UPLOAD_DIR, matching_files[0])
    task_id = str(uuid.uuid4())
    output_filename = f"Thamizh_VIP_Master_{task_id[:8]}.mp4"
    output_path = os.path.join(settings.EXPORT_DIR, output_filename)

    tasks_db[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "progress": 0,
        "current_frame": 0,
        "total_frames": 0,
        "output_path": output_path,
        "download_url": None
    }

    background_tasks.add_task(
        background_render_worker,
        task_id=task_id,
        input_path=input_path,
        output_path=output_path,
        params=params_dict,
        resolution=resolution
    )

    return {"status": "queued", "task_id": task_id}

@router.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str):
    """Query progress and state of an asynchronous render job."""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task not found.")
    return tasks_db[task_id]

@router.get("/tasks/{task_id}/download")
async def download_task_result(task_id: str):
    """Download the completed 4K enhanced video file."""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task not found.")
    task = tasks_db[task_id]
    if task["status"] != "completed" or not os.path.exists(task["output_path"]):
        raise HTTPException(status_code=400, detail="Video rendering is not completed yet.")
    return FileResponse(
        task["output_path"],
        media_type="video/mp4",
        filename=os.path.basename(task["output_path"])
    )
