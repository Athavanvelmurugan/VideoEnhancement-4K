import cv2
import numpy as np
import os
import shutil
import tempfile
from backend.app.services.video_engine import video_engine

class AiEnhancer:
    def __init__(self):
        pass

    def enhance_frame(self, frame: np.ndarray, params: dict, target_res: tuple = None) -> np.ndarray:
        """
        Enhance a single video frame with AI 4K Super-Resolution, Bilateral Skin Smoothing,
        High-Pass Texture Preservation, and Cinematic Color Grading.
        """
        h, w = frame.shape[:2]

        # 1. 4K Super-Resolution Upscaling (e.g. to 3840x2160 or 2x input)
        if target_res:
            target_w, target_h = target_res
            frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
            h, w = target_h, target_w

        # Extract parameters with safe defaults
        skin_smooth = float(params.get("skinSmooth", 0.65))
        skin_detail = float(params.get("skinDetail", 0.80))
        super_res = float(params.get("superRes", 0.75))
        deblur = float(params.get("deblur", 0.50))
        low_light = float(params.get("lowLight", 0.40))
        lut_type = int(params.get("lutType", 0))
        lut_intensity = float(params.get("lutIntensity", 0.85))

        # 2. Bilateral Skin Smoothing (Edge-Preserving Filtering)
        if skin_smooth > 0.05:
            d = 9
            sigma_color = 50.0 + skin_smooth * 50.0
            sigma_space = 50.0 + skin_smooth * 50.0
            blurred = cv2.bilateralFilter(frame, d, sigma_color, sigma_space)

            # High-pass micro-texture separation
            high_pass = cv2.subtract(frame, blurred)
            smoothed = cv2.addWeighted(blurred, 1.0, high_pass, skin_detail, 0)
            frame = cv2.addWeighted(frame, 1.0 - skin_smooth, smoothed, skin_smooth, 0)

        # 3. AI 4K Sharpness & Deblur (Unsharp Masking & High-Frequency Boost)
        if super_res > 0.05 or deblur > 0.05:
            strength = (super_res * 0.8 + deblur * 0.5)
            gaussian = cv2.GaussianBlur(frame, (0, 0), 2.0)
            frame = cv2.addWeighted(frame, 1.0 + strength * 0.6, gaussian, -strength * 0.6, 0)

        # 4. Low-Light & Night Gamma Lift
        if low_light > 0.05:
            gamma = 1.0 - low_light * 0.35
            inv_gamma = 1.0 / max(gamma, 0.1)
            table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
            frame = cv2.LUT(frame, table)

        # 5. 3D LUT Cinematic Color Grading Simulation
        if lut_type > 0 and lut_intensity > 0.05:
            graded = frame.copy().astype(np.float32) / 255.0
            b, g, r = cv2.split(graded)

            if lut_type == 1: # Golden Flaze
                r = np.power(r, 0.92) * 1.08
                g = np.power(g, 0.96) * 1.02
                b = np.power(b, 1.15) * 0.88
            elif lut_type == 2: # Teal & Orange
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                r = np.clip(r + (1.0 - lum) * 0.18, 0, 1)
                b = np.clip(b + lum * 0.15, 0, 1)
            elif lut_type == 3: # Emerald Film
                g = np.power(g, 0.93) * 1.10
                r = r * 0.92
            elif lut_type == 4: # Cyberpunk
                r = np.power(r, 0.85) * 1.15
                b = np.power(b, 0.90) * 1.25
            elif lut_type == 5: # Soft Glamour
                r = np.clip(r + 0.05, 0, 1)
                g = np.clip(g + 0.02, 0, 1)

            merged = cv2.merge([b, g, r]) * 255.0
            graded_uint8 = np.clip(merged, 0, 255).astype(np.uint8)
            frame = cv2.addWeighted(frame, 1.0 - lut_intensity, graded_uint8, lut_intensity, 0)

        return frame

    def process_video_pipeline(
        self,
        input_video_path: str,
        output_video_path: str,
        params: dict,
        target_resolution: tuple = (3840, 2160),
        on_progress=None
    ) -> bool:
        """Process full video frame-by-frame with audio track preservation."""
        info = video_engine.get_video_info(input_video_path)
        fps = info["fps"]
        total_frames = info["total_frames"]

        temp_dir = tempfile.mkdtemp(prefix="thamizh_render_")
        frames_dir = os.path.join(temp_dir, "frames")
        os.makedirs(frames_dir, exist_ok=True)
        audio_path = os.path.join(temp_dir, "audio.mp3")

        try:
            # Step 1: Extract audio
            video_engine.extract_audio(input_video_path, audio_path)

            # Step 2: Read and enhance frames
            cap = cv2.VideoCapture(input_video_path)
            frame_idx = 0

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                enhanced = self.enhance_frame(frame, params, target_resolution)
                frame_path = os.path.join(frames_dir, f"frame_{frame_idx:06d}.png")
                cv2.imwrite(frame_path, enhanced)

                frame_idx += 1
                if on_progress and total_frames > 0:
                    percent = int((frame_idx / total_frames) * 100)
                    on_progress(percent, frame_idx, total_frames)

            cap.release()

            # Step 3: Re-encode to 4K Master MP4
            success = video_engine.render_frames_to_video(
                frames_dir=frames_dir,
                audio_path=audio_path if os.path.exists(audio_path) else None,
                output_video_path=output_video_path,
                fps=fps
            )
            return success

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

ai_enhancer = AiEnhancer()
