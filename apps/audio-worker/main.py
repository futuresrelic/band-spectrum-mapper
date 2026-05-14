"""
BSM Audio Worker — FastAPI service for server-side audio analysis.

Usage (local dev):
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload

Environment variables:
    PORT        — override listen port (default 8001)
    MAX_MB      — maximum upload size in MB (default 150)

The Node.js API calls this service via AUDIO_WORKER_URL.
"""

import os
import tempfile
import logging
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from analyzer import analyze_audio
from scorer import compute_scores

# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("audio-worker")

MAX_MB = int(os.environ.get("MAX_MB", "150"))
MAX_BYTES = MAX_MB * 1024 * 1024

SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".opus"}

app = FastAPI(
    title="BSM Audio Worker",
    description="Librosa-based audio analysis service for Band Spectrum Mapper",
    version="1.0.0",
)

# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    return {"status": "ok", "service": "bsm-audio-worker"}


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    lyrics_context: str = Form(default=""),
):
    """
    Accept an audio file, run librosa analysis, return AudioAnalysisResult + ScoreAxisDetail map.

    Returns:
        {
            "analysis": AudioAnalysisResult,
            "scores":   Record<axis, ScoreAxisDetail>
        }
    """
    # --- Validate file size ---
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_MB} MB.",
        )

    # --- Validate extension ---
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported format '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    # --- Write to temp file ---
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        log.info("Analysing %s (%d bytes)", filename, len(content))
        analysis = analyze_audio(tmp_path)
        log.info("Analysis complete — duration=%.1fs bpm=%.1f key=%s",
                 analysis["duration"], analysis["bpm"], analysis["key"])

        scores = compute_scores(analysis, lyrics_context)
        log.info("Scoring complete")

        return JSONResponse({"analysis": analysis, "scores": scores})

    except RuntimeError as exc:
        log.error("Analysis failed: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
