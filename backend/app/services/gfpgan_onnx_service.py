import os
import cv2
import urllib.request
import numpy as np
from pathlib import Path
from typing import List, Tuple, Optional

class GfpganOnnxService:
    """
    Production ONNX Neural Face Restoration Service (Remini-Grade).
    Uses OpenCV YuNet for 15ms Face Detection & 5-point alignment,
    and GFPGAN v1.4 ONNX for photorealistic facial hallucination & reconstruction.
    """

    YUNET_URL = "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx"
    GFPGAN_URL = "https://huggingface.co/hacksider/deep-live-cam/resolve/main/GFPGANv1.4.onnx"

    def __init__(self):
        self.models_dir = Path(__file__).resolve().parent.parent / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.yunet_path = self.models_dir / "face_detection_yunet.onnx"
        self.gfpgan_path = self.models_dir / "GFPGANv1.4.onnx"

        self.yunet_detector = None
        self.gfpgan_session = None
        self.is_downloading = False

    def download_file_with_retry(self, url: str, dest_path: Path, min_size_bytes: int = 10000) -> bool:
        """Download remote model weight file with user-agent headers and size verification."""
        if dest_path.exists() and dest_path.stat().st_size >= min_size_bytes:
            return True

        temp_path = dest_path.with_suffix(".download")
        try:
            print(f"[AI Model Loader] Downloading neural weights from {url} to {dest_path.name}...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ThamizhAI/1.0)"})
            with urllib.request.urlopen(req, timeout=30) as response, open(temp_path, "wb") as out_file:
                chunk_size = 1024 * 512 # 512KB chunks
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    out_file.write(chunk)

            if temp_path.stat().st_size >= min_size_bytes:
                if dest_path.exists():
                    dest_path.unlink()
                temp_path.rename(dest_path)
                print(f"[AI Model Loader] Successfully cached {dest_path.name} ({round(dest_path.stat().st_size/(1024*1024), 1)} MB)")
                return True
            else:
                if temp_path.exists():
                    temp_path.unlink()
                return False
        except Exception as e:
            print(f"[AI Model Loader] Download failed for {dest_path.name}: {e}")
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            return False

    def ensure_yunet_loaded(self, img_w: int = 640, img_h: int = 640) -> bool:
        """Ensure YuNet Face Detector ONNX model is downloaded and instantiated."""
        if not self.yunet_path.exists() or self.yunet_path.stat().st_size < 100000:
            self.download_file_with_retry(self.YUNET_URL, self.yunet_path, min_size_bytes=100000)

        if not self.yunet_path.exists():
            return False

        try:
            self.yunet_detector = cv2.FaceDetectorYN.create(
                model=str(self.yunet_path),
                config="",
                input_size=(img_w, img_h),
                score_threshold=0.55,
                nms_threshold=0.3,
                top_k=20
            )
            return True
        except Exception as e:
            print(f"[YuNet Detector] Failed to initialize: {e}")
            return False

    def ensure_gfpgan_loaded(self) -> bool:
        """Ensure GFPGAN v1.4 ONNX model is downloaded and session is created."""
        if self.gfpgan_session is not None:
            return True

        if not self.gfpgan_path.exists() or self.gfpgan_path.stat().st_size < 50000000:
            success = self.download_file_with_retry(self.GFPGAN_URL, self.gfpgan_path, min_size_bytes=50000000)
            if not success:
                return False

        try:
            import onnxruntime as ort
            providers = ["CPUExecutionProvider"]
            self.gfpgan_session = ort.InferenceSession(str(self.gfpgan_path), providers=providers)
            print("[GFPGAN Engine] ONNX Inference Session initialized successfully on CPU.")
            return True
        except Exception as e:
            print(f"[GFPGAN Engine] Failed to load ONNX model: {e}")
            return False

    def detect_faces(self, bgr_img: np.ndarray) -> List[np.ndarray]:
        """Detect all face bounding boxes and landmarks in image."""
        h, w = bgr_img.shape[:2]
        if not self.ensure_yunet_loaded(w, h):
            return []

        try:
            self.yunet_detector.setInputSize((w, h))
            _, faces = self.yunet_detector.detect(bgr_img)
            if faces is None or len(faces) == 0:
                return []
            return [f for f in faces]
        except Exception as e:
            print(f"[Face Detection Error]: {e}")
            return []

    def align_and_crop_face(self, bgr_img: np.ndarray, face: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Crops face using canonical eye-landmark similarity alignment (rotation + scale)
        for GFPGAN 512x512 standard facial prior.
        """
        h, w = bgr_img.shape[:2]
        fx, fy, fw, fh = face[0:4]

        # Use 5-point facial landmarks from YuNet:
        # face[4:6] = Right eye, face[6:8] = Left eye
        r_eye = np.array([face[4], face[5]], dtype=np.float32)
        l_eye = np.array([face[6], face[7]], dtype=np.float32)

        d_x = l_eye[0] - r_eye[0]
        d_y = l_eye[1] - r_eye[1]
        eye_dist = np.sqrt(d_x**2 + d_y**2)

        if eye_dist > 4.0:
            # Canonical FFHQ/GFPGAN 512x512 eye template
            angle = float(np.degrees(np.arctan2(d_y, d_x)))
            eye_center = (float((r_eye[0] + l_eye[0]) * 0.5), float((r_eye[1] + l_eye[1]) * 0.5))
            desired_eye_dist = 135.0
            scale = desired_eye_dist / max(eye_dist, 1e-4)

            # Rotation and scaling matrix around eye center
            affine_matrix = cv2.getRotationMatrix2D(eye_center, angle, scale)
            # Anchor eye midpoint at (256, 240) in 512x512 space
            affine_matrix[0, 2] += (256.0 - eye_center[0])
            affine_matrix[1, 2] += (240.0 - eye_center[1])
            inv_affine_matrix = cv2.invertAffineTransform(affine_matrix)
        else:
            # Fallback to bounding-box affine transform
            cx = fx + fw * 0.5
            cy = fy + fh * 0.45
            size = max(fw, fh) * 1.55
            src_pts = np.float32([
                [cx - size * 0.5, cy - size * 0.5],
                [cx + size * 0.5, cy - size * 0.5],
                [cx + size * 0.5, cy + size * 0.5]
            ])
            dst_pts = np.float32([[0, 0], [512, 0], [512, 512]])
            affine_matrix = cv2.getAffineTransform(src_pts, dst_pts)
            inv_affine_matrix = cv2.getAffineTransform(dst_pts, src_pts)

        face_512 = cv2.warpAffine(
            bgr_img, affine_matrix, (512, 512),
            flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT
        )
        return face_512, affine_matrix, inv_affine_matrix

    def restore_single_face_512(self, face_512: np.ndarray) -> np.ndarray:
        """
        Runs GFPGAN v1.4 ONNX inference on a 512x512 BGR face crop.
        Normalizes input to [-1, 1], RGB, float32, NCHW.
        """
        if not self.ensure_gfpgan_loaded():
            return face_512

        # 1. BGR to RGB
        face_rgb = cv2.cvtColor(face_512, cv2.COLOR_BGR2RGB).astype(np.float32)
        # 2. Normalize [0, 255] -> [-1, 1]
        face_norm = (face_rgb / 127.5) - 1.0
        # 3. HWC to NCHW
        tensor = np.transpose(face_norm, (2, 0, 1))[np.newaxis, :, :, :]

        input_name = self.gfpgan_session.get_inputs()[0].name
        output_name = self.gfpgan_session.get_outputs()[0].name

        # 4. Neural Generative Inference
        out_tensor = self.gfpgan_session.run([output_name], {input_name: tensor})[0]

        # 5. NCHW to HWC
        out_img = np.squeeze(out_tensor, axis=0)
        out_img = np.transpose(out_img, (1, 2, 0))
        # 6. [-1, 1] -> [0, 255]
        out_img = np.clip((out_img + 1.0) * 127.5, 0, 255).astype(np.uint8)
        # 7. RGB to BGR
        return cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)

    def blend_face_back(
        self,
        base_img: np.ndarray,
        restored_512: np.ndarray,
        inv_affine: np.ndarray
    ) -> np.ndarray:
        """
        Blends 512x512 restored face back into the source image with soft Gaussian feathering.
        """
        h, w = base_img.shape[:2]

        # Create smooth elliptical feathered 512x512 alpha mask focused on face & eyes
        mask_512 = np.zeros((512, 512), dtype=np.float32)
        cv2.ellipse(mask_512, (256, 260), (195, 225), 0, 0, 360, 1.0, -1)
        mask_512 = cv2.GaussianBlur(mask_512, (65, 65), 21.0)

        # Warp restored face and mask back to source image coordinates
        restored_warped = cv2.warpAffine(restored_512, inv_affine, (w, h), flags=cv2.INTER_LINEAR)
        mask_warped = cv2.warpAffine(mask_512, inv_affine, (w, h), flags=cv2.INTER_LINEAR)

        # 3-channel alpha mask
        alpha = np.repeat(np.expand_dims(mask_warped, axis=2), 3, axis=2)

        # Alpha composite
        base_float = base_img.astype(np.float32)
        restored_float = restored_warped.astype(np.float32)
        blended = base_float * (1.0 - alpha) + restored_float * alpha
        return np.clip(blended, 0, 255).astype(np.uint8)

    def restore_faces_in_image(self, bgr_img: np.ndarray) -> Tuple[np.ndarray, int]:
        """
        Detects, restores, and blends all human faces present in the image.
        Returns the enhanced image and the count of restored faces.
        """
        faces = self.detect_faces(bgr_img)
        if len(faces) == 0:
            print("[AI Face Restorer] No faces detected or YuNet model unavailable; continuing pipeline.")
            return bgr_img, 0

        print(f"[AI Face Restorer] Detected {len(faces)} face(s). Restoring high-frequency details...")
        output = bgr_img.copy()
        restored_count = 0

        for idx, face in enumerate(faces):
            score = face[14]
            if score < 0.45:
                continue

            try:
                face_512, affine_matrix, inv_affine = self.align_and_crop_face(output, face)
                restored_512 = self.restore_single_face_512(face_512)
                output = self.blend_face_back(output, restored_512, inv_affine)
                restored_count += 1
                print(f"[AI Face Restorer] Restored face #{idx + 1} with score {round(score, 2)}")
            except Exception as e:
                print(f"[AI Face Restorer] Error restoring face #{idx + 1}: {e}")

        return output, restored_count

gfpgan_onnx_service = GfpganOnnxService()

