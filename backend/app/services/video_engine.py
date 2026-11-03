import os
import subprocess
import json
import cv2
from pathlib import Path
from backend.app.config import settings

class VideoEngine:
    def __init__(self):
        self.ffmpeg_bin = settings.FFMPEG_PATH

    def get_video_info(self, video_path: str) -> dict:
        """Read video properties using OpenCV."""
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        cap.release()

        return {
            "width": width,
            "height": height,
            "fps": round(fps, 2),
            "total_frames": total_frames,
            "duration": round(duration, 2)
        }

    def extract_audio(self, video_path: str, output_audio_path: str) -> bool:
        """Extract audio stream from video using bundled FFmpeg."""
        cmd = [
            self.ffmpeg_bin,
            "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "mp3",
            "-ar", "16000",
            "-ac", "1",
            output_audio_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return os.path.exists(output_audio_path) and os.path.getsize(output_audio_path) > 0

    def render_frames_to_video(self, frames_dir: str, audio_path: str, output_video_path: str, fps: float = 30.0) -> bool:
        """Assemble processed frames directory and mux with original audio track."""
        input_pattern = os.path.join(frames_dir, "frame_%06d.png")

        cmd = [
            self.ffmpeg_bin,
            "-y",
            "-framerate", str(fps),
            "-i", input_pattern
        ]

        if audio_path and os.path.exists(audio_path):
            cmd.extend(["-i", audio_path, "-c:a", "aac", "-b:a", "192k"])

        cmd.extend([
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "18",
            "-preset", "fast",
            output_video_path
        ])

        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return os.path.exists(output_video_path) and os.path.getsize(output_video_path) > 0

video_engine = VideoEngine()
