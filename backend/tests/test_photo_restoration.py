import pytest
import numpy as np
import cv2
import io
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.photo_restoration_service import photo_restoration_service
from backend.app.services.gfpgan_onnx_service import gfpgan_onnx_service
from backend.app.services.realesrgan_onnx_service import realesrgan_onnx_service

client = TestClient(app)

def test_gfpgan_service_face_crop_and_blend():
    """Verify face cropping to 512x512 and feathered inverse affine blending."""
    canvas = np.full((600, 400, 3), 40, dtype=np.uint8)
    mock_face = np.array([100, 150, 120, 140, 130, 180, 190, 180, 160, 210, 140, 250, 180, 250, 0.95], dtype=np.float32)

    face_512, affine, inv_affine = gfpgan_onnx_service.align_and_crop_face(canvas, mock_face)
    assert face_512.shape == (512, 512, 3), "Cropped face must be exactly 512x512x3"
    assert affine.shape == (2, 3), "Affine matrix must be 2x3"
    assert inv_affine.shape == (2, 3), "Inverse affine matrix must be 2x3"

    # Test blending back
    restored_512 = np.full((512, 512, 3), 200, dtype=np.uint8)
    blended = gfpgan_onnx_service.blend_face_back(canvas, restored_512, inv_affine)
    assert blended.shape == (600, 400, 3), "Blended image must preserve original canvas shape"
    assert not np.isnan(blended).any(), "No NaN values allowed in blended output"
    assert np.max(blended) > 40, "Restored face must be composited into canvas"

def test_gfpgan_yunet_model_download():
    """Verify YuNet 227KB face detector downloads and instantiates properly."""
    loaded = gfpgan_onnx_service.ensure_yunet_loaded(400, 400)
    assert loaded is True, "YuNet model should download and load into cv2.FaceDetectorYN"
    assert gfpgan_onnx_service.yunet_path.exists()
    assert gfpgan_onnx_service.yunet_path.stat().st_size > 100000

def test_compute_4k_dimensions():
    """Verify 4K dimension computation scales longest edge to >= 3840px."""
    # Case 1: 670x1194 (User's uploaded portrait)
    w1, h1 = photo_restoration_service.compute_4k_dimensions(670, 1194, target_long_edge=3840)
    assert h1 == 3840, f"Expected height 3840, got {h1}"
    assert w1 == 2155, f"Expected width 2155, got {w1}"
    assert max(w1, h1) >= 3840, "Longest edge must meet or exceed 3840px"

    # Case 2: 1920x1080 (Landscape)
    w2, h2 = photo_restoration_service.compute_4k_dimensions(1920, 1080, target_long_edge=3840)
    assert w2 == 3840, f"Expected width 3840, got {w2}"
    assert h2 == 2160, f"Expected height 2160, got {h2}"

    # Case 3: 4000x3000 (Already > 3840)
    w3, h3 = photo_restoration_service.compute_4k_dimensions(4000, 3000, target_long_edge=3840)
    assert w3 >= 4000 and h3 >= 3000, "Should preserve or 2x already large images"

def test_photo_restoration_service_enhancement():
    """Verify photo_restoration_service generates True 4K enhanced PNG bytes."""
    # Create small test synthetic portrait image
    test_img = np.zeros((300, 200, 3), dtype=np.uint8)
    cv2.circle(test_img, (100, 120), 50, (200, 150, 120), -1)
    cv2.circle(test_img, (85, 110), 8, (255, 255, 255), -1)
    cv2.circle(test_img, (115, 110), 8, (255, 255, 255), -1)

    _, encoded = cv2.imencode(".png", test_img)
    input_bytes = encoded.tobytes()

    params = {
        "clarity": 0.85,
        "skinDetail": 0.80,
        "denoise": 0.50,
        "deblur": 0.60
    }
    enhanced_bytes, target_w, target_h = photo_restoration_service.enhance_photo(input_bytes, params)

    assert isinstance(enhanced_bytes, bytes)
    assert len(enhanced_bytes) > 0
    assert target_h == 3840 or target_w == 3840
    assert max(target_w, target_h) >= 3840

    # Verify output decodes cleanly
    nparr = np.frombuffer(enhanced_bytes, np.uint8)
    decoded = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    assert decoded is not None
    assert decoded.shape[0] == target_h
    assert decoded.shape[1] == target_w

def test_canonical_eye_alignment_horizontal_leveling():
    """Verify that canonical similarity alignment rotates tilted faces so eyes become horizontal."""
    canvas = np.full((1000, 1000, 3), 50, dtype=np.uint8)
    # Tilted face: Right eye at (400, 480), Left eye at (520, 440) -> ~18 degree tilt
    mock_tilted_face = np.array([
        350, 400, 200, 220,
        400, 480, # right eye
        520, 440, # left eye
        460, 520, # nose
        420, 560, # right mouth
        500, 550, # left mouth
        0.96
    ], dtype=np.float32)

    face_512, affine, inv_affine = gfpgan_onnx_service.align_and_crop_face(canvas, mock_tilted_face)
    assert face_512.shape == (512, 512, 3)

    # In canonical 512x512 space, transforming the two eye coordinates should yield horizontal leveling (y1 ~= y2)
    r_eye_orig = np.array([400.0, 480.0, 1.0])
    l_eye_orig = np.array([520.0, 440.0, 1.0])

    r_eye_512 = affine.dot(r_eye_orig)
    l_eye_512 = affine.dot(l_eye_orig)

    # Both eyes should have almost identical y coordinate (~240px)
    assert abs(r_eye_512[1] - l_eye_512[1]) < 0.1, f"Eyes must be horizontal in 512x512: got y1={r_eye_512[1]}, y2={l_eye_512[1]}"
    assert abs(r_eye_512[1] - 240.0) < 1.0, f"Eye Y level must anchor at ~240px: got {r_eye_512[1]}"
    # Eye center X should anchor at ~256px
    eye_mid_x = (r_eye_512[0] + l_eye_512[0]) * 0.5
    assert abs(eye_mid_x - 256.0) < 1.0, f"Eye midpoint X must anchor at ~256px: got {eye_mid_x}"

def test_realesrgan_onnx_service_upscale():
    """Verify RealESRGANOnnxService downloads/loads model and upscales image 4x."""
    small_canvas = np.zeros((32, 32, 3), dtype=np.uint8)
    cv2.rectangle(small_canvas, (8, 8), (24, 24), (200, 200, 200), -1)
    
    # ensure_model_loaded downloads if not present
    loaded = realesrgan_onnx_service.ensure_model_loaded()
    assert loaded is True, "Real-ESRGAN x4 ONNX model should successfully initialize"
    
    upscaled = realesrgan_onnx_service.upscale_image(small_canvas)
    assert upscaled.shape == (128, 128, 3), f"Expected (128, 128, 3) 4x upscale, got {upscaled.shape}"
    assert not np.isnan(upscaled).any(), "No NaN values in Real-ESRGAN super-resolution output"

def test_api_photo_enhance_endpoint():
    """Verify POST /api/photo/enhance endpoint returns 4K PNG stream."""
    test_img = np.full((200, 150, 3), 128, dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", test_img)
    image_bytes = encoded.tobytes()

    files = {
        "file": ("test_portrait.jpg", image_bytes, "image/jpeg")
    }
    data = {
        "params": '{"clarity": 0.90, "skinDetail": 0.85}'
    }

    res = client.post("/api/photo/enhance", files=files, data=data)
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert "X-Enhanced-Width" in res.headers
    assert "X-Enhanced-Height" in res.headers
    assert int(res.headers["X-Enhanced-Height"]) >= 3840 or int(res.headers["X-Enhanced-Width"]) >= 3840
