import os
import cv2
import urllib.request
import numpy as np
from pathlib import Path
from typing import Optional

class RealESRGANOnnxService:
    """
    Production ONNX Neural Super-Resolution Service (Remini-Grade Background & Texture).
    Reconstructs high-frequency details (hair, fabric, edges, background) using Real-ESRGAN x4 Plus.
    Includes tiled inference with smooth blending for memory safety and zero seam artifacts.
    """

    MODEL_URL = "https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x4.onnx"

    def __init__(self):
        self.models_dir = Path(__file__).resolve().parent.parent / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.model_path = self.models_dir / "real_esrgan_x4.onnx"
        self.session = None

    def download_model(self, min_size_bytes: int = 50000000) -> bool:
        """Downloads Real-ESRGAN x4 ONNX model weights with verification."""
        if self.model_path.exists() and self.model_path.stat().st_size >= min_size_bytes:
            return True

        temp_path = self.model_path.with_suffix(".download")
        try:
            print(f"[Real-ESRGAN Engine] Downloading neural weights from {self.MODEL_URL}...")
            req = urllib.request.Request(self.MODEL_URL, headers={"User-Agent": "Mozilla/5.0 (ThamizhStudio/1.0)"})
            with urllib.request.urlopen(req, timeout=60) as resp, open(temp_path, "wb") as out_file:
                chunk_size = 1024 * 512
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out_file.write(chunk)

            if temp_path.stat().st_size >= min_size_bytes:
                if self.model_path.exists():
                    self.model_path.unlink()
                temp_path.rename(self.model_path)
                print(f"[Real-ESRGAN Engine] Successfully cached {self.model_path.name} ({round(self.model_path.stat().st_size/(1024*1024), 1)} MB)")
                return True
            else:
                if temp_path.exists():
                    temp_path.unlink()
                return False
        except Exception as e:
            print(f"[Real-ESRGAN Engine] Download failed: {e}")
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            return False

    def ensure_model_loaded(self) -> bool:
        """Initializes ONNX Runtime session."""
        if self.session is not None:
            return True

        if not self.model_path.exists() or self.model_path.stat().st_size < 50000000:
            if not self.download_model():
                return False

        try:
            import onnxruntime as ort
            providers = ["CPUExecutionProvider"]
            self.session = ort.InferenceSession(str(self.model_path), providers=providers)
            print("[Real-ESRGAN Engine] Session initialized on CPU.")
            return True
        except Exception as e:
            print(f"[Real-ESRGAN Engine] Failed to initialize session: {e}")
            return False

    def upscale_tile(self, tile_bgr: np.ndarray) -> np.ndarray:
        """Runs 4x super-resolution on a single normalized BGR tile."""
        # 1. BGR -> RGB float32 [0.0, 1.0]
        tile_rgb = cv2.cvtColor(tile_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        # 2. HWC -> NCHW
        tensor = np.transpose(tile_rgb, (2, 0, 1))[np.newaxis, :, :, :]

        inp_name = self.session.get_inputs()[0].name
        out_name = self.session.get_outputs()[0].name

        out_tensor = self.session.run([out_name], {inp_name: tensor})[0]

        # 3. NCHW -> HWC & clip to [0, 255]
        out_img = np.squeeze(out_tensor, axis=0)
        out_img = np.transpose(out_img, (1, 2, 0))
        out_img = np.clip(out_img * 255.0, 0, 255).astype(np.uint8)
        return cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)

    def upscale_image(self, bgr_img: np.ndarray, tile_size: int = 512, tile_pad: int = 32) -> np.ndarray:
        """
        Performs 4x Super-Resolution using tiled inference to conserve memory.
        Seamlessly blends overlapping tiles to prevent edge seams.
        """
        if not self.ensure_model_loaded():
            h, w = bgr_img.shape[:2]
            return cv2.resize(bgr_img, (w * 4, h * 4), interpolation=cv2.INTER_LANCZOS4)

        h, w = bgr_img.shape[:2]
        scale = 4
        out_h, out_w = h * scale, w * scale

        # If image is small enough, process directly in single forward pass
        if h <= tile_size and w <= tile_size:
            return self.upscale_tile(bgr_img)

        # Output canvas & weight accumulation map
        output = np.zeros((out_h, out_w, 3), dtype=np.float32)
        weight = np.zeros((out_h, out_w, 1), dtype=np.float32)

        y_step = tile_size - (2 * tile_pad)
        x_step = tile_size - (2 * tile_pad)

        y_indices = list(range(0, h, y_step))
        x_indices = list(range(0, w, x_step))

        for y in y_indices:
            for x in x_indices:
                # Calculate tile crop coordinates with padding
                y_start = max(y - tile_pad, 0)
                y_end = min(y + y_step + tile_pad, h)
                x_start = max(x - tile_pad, 0)
                x_end = min(x + x_step + tile_pad, w)

                tile = bgr_img[y_start:y_end, x_start:x_end]
                th, tw = tile.shape[:2]

                tile_up = self.upscale_tile(tile)

                # Create smooth cosine window mask for tile blending
                window_y = np.hanning(th * scale)[:, np.newaxis]
                window_x = np.hanning(tw * scale)[np.newaxis, :]
                mask = window_y * window_x
                mask = np.maximum(mask, 1e-4)[:, :, np.newaxis]

                out_ys = y_start * scale
                out_ye = y_end * scale
                out_xs = x_start * scale
                out_xe = x_end * scale

                output[out_ys:out_ye, out_xs:out_xe] += tile_up.astype(np.float32) * mask
                weight[out_ys:out_ye, out_xs:out_xe] += mask

        output /= np.maximum(weight, 1e-4)
        return np.clip(output, 0, 255).astype(np.uint8)

realesrgan_onnx_service = RealESRGANOnnxService()

