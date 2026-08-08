import subprocess
import tempfile
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/tts", tags=["tts"])

# espeak-ng Croatian voice parameters
# Quality note: espeak-ng is a formant synthesizer (fast, no GPU needed).
# To upgrade to neural TTS, replace _synthesize() with Coqui tts_models/hr/cv/vits
# (BSD licensed, requires adding torch to requirements.txt).

VOICES = {
    "female": {"lang": "hr+f3", "speed": "145", "pitch": "58", "amplitude": "160"},
    "male":   {"lang": "hr+m3", "speed": "130", "pitch": "38", "amplitude": "160"},
}


class TTSRequest(BaseModel):
    text: str
    voice: str = "female"  # "male" | "female"


def _synthesize(text: str, voice: str) -> str:
    """Run espeak-ng and return path to a temporary WAV file."""
    params = VOICES.get(voice, VOICES["female"])

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()

    try:
        subprocess.run(
            [
                "espeak-ng",
                "-v", params["lang"],
                "-s", params["speed"],
                "-p", params["pitch"],
                "-a", params["amplitude"],
                "-w", tmp.name,
                text,
            ],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {e.stderr.decode()}")
    except FileNotFoundError:
        os.unlink(tmp.name)
        raise HTTPException(status_code=500, detail="espeak-ng not installed in container")

    return tmp.name


@router.post("/synthesize")
async def synthesize(req: TTSRequest):
    """
    Synthesize Croatian text to speech.
    Returns audio/wav binary.
    voice: "female" (default) | "male"
    """
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="text cannot be empty")
    if req.voice not in VOICES:
        raise HTTPException(status_code=422, detail=f"voice must be one of: {list(VOICES.keys())}")

    wav_path = _synthesize(req.text, req.voice)

    return FileResponse(
        wav_path,
        media_type="audio/wav",
        filename="speech.wav",
        background=None,
    )


@router.get("/voices")
async def list_voices():
    return {"voices": list(VOICES.keys())}
