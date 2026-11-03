import json
import requests
from backend.app.config import settings

class GroqService:
    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.base_url = settings.GROQ_BASE_URL
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": "ThamizhWebStudio/1.0"
        }

    def ask_ai_director(self, prompt: str) -> dict:
        """
        Uses Groq LPU LLM to interpret natural language video retouching prompts
        and return optimal shader & enhancement parameters in structured JSON.
        """
        system_prompt = (
            "You are Thamizh's AI Video Retouch Director. Your job is to analyze user requests for video looks "
            "(e.g., 'Bollywood bridal glow', 'Cyberpunk night', 'Glass skin portrait', 'Moody film documentary') "
            "and compute exact numerical parameters for the Thamizh rendering engine.\n\n"
            "Return a strictly valid JSON object with these exact keys:\n"
            "- skinSmooth: float (0.0 to 1.0)\n"
            "- skinDetail: float (0.0 to 1.0, micro-texture & pore preservation)\n"
            "- faceSlim: float (0.0 to 1.0, jawline V-line reduction)\n"
            "- bigEyes: float (0.0 to 1.0, eye brightening & enlargement)\n"
            "- teethWhiten: float (0.0 to 1.0)\n"
            "- faceRelight: float (0.0 to 1.0, 3D facial contour lighting)\n"
            "- superRes: float (0.0 to 1.0, 4K AI sharpness)\n"
            "- denoise: float (0.0 to 1.0)\n"
            "- deblur: float (0.0 to 1.0)\n"
            "- lowLight: float (0.0 to 1.0)\n"
            "- lutType: int (0=None, 1=Golden Flaze, 2=Teal & Orange, 3=Emerald Film, 4=Cyberpunk, 5=Soft Glamour)\n"
            "- lutIntensity: float (0.0 to 1.0)\n"
            "- styleName: string (Short stylish preset name)\n"
            "- explanation: string (1-2 sentences explaining why these parameters achieve the desired look)"
        )

        payload = {
            "model": "openai/gpt-oss-120b",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3
        }

        response = requests.post(
            f"{self.base_url}/chat/completions",
            headers=self.headers,
            json=payload,
            timeout=20
        )

        if response.status_code != 200:
            raise RuntimeError(f"Groq API Error ({response.status_code}): {response.text}")

        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)

    def transcribe_audio(self, audio_file_path: str) -> dict:
        """
        Uses Groq whisper-large-v3-turbo for high-speed speech-to-text with word-level timestamps.
        """
        with open(audio_file_path, "rb") as f:
            files = {
                "file": (os_path_name(audio_file_path), f, "audio/mpeg")
            }
            data = {
                "model": "whisper-large-v3-turbo",
                "response_format": "verbose_json"
            }
            response = requests.post(
                f"{self.base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                files=files,
                data=data,
                timeout=30
            )

        if response.status_code != 200:
            raise RuntimeError(f"Groq Whisper Error ({response.status_code}): {response.text}")

        return response.json()

def os_path_name(path_str):
    import os
    return os.path.basename(path_str)

groq_service = GroqService()
