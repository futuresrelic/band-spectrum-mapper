"""
BSM Audio Worker — FastAPI service for server-side audio analysis.

Usage (local dev):
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload

Environment variables:
    PORT                             — override listen port (default 8001)
    MAX_MB                           — maximum upload size in MB (default 150)
    ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT — set "true" to allow /analyze-youtube
                                        (local / personal use only, never in production)

The Node.js API calls this service via AUDIO_WORKER_URL.
"""

import os
import subprocess
import tempfile
import logging
from pathlib import Path
from pydantic import BaseModel

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from analyzer import analyze_audio, analyze_rhythm_from_file, analyze_rhythm_bands, TARGET_SR
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


class YouTubeRequest(BaseModel):
    youtube_url: str
    lyrics_context: str = ""


@app.post("/analyze-youtube")
async def analyze_youtube(body: YouTubeRequest):
    """
    Download audio from YouTube via yt-dlp and run the same analysis pipeline.

    IMPORTANT: Only enabled when ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true.
    For personal/local use only. Never set that flag in production.
    Requires yt-dlp: pip install yt-dlp
    """
    if os.environ.get("ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT") != "true":
        raise HTTPException(
            status_code=403,
            detail=(
                "YouTube audio import is disabled. "
                "Set ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true to enable "
                "(local / personal use only)."
            ),
        )

    url = body.youtube_url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="youtube_url is required")

    with tempfile.TemporaryDirectory() as tmpdir:
        output_template = os.path.join(tmpdir, "audio.%(ext)s")
        log.info("Downloading YouTube audio from %s", url)

        # Build yt-dlp command.
        # player_client=android avoids both bot-detection and the GVS PO Token
        # requirement that YouTube now enforces for the iOS client on server IPs.
        # mweb is used as a fallback; android does not require a PO token.
        cmd = [
            "yt-dlp",
            "-x",                                        # extract audio only
            "--audio-format", "mp3",                     # convert to mp3
            "--audio-quality", "0",                      # best quality
            "--no-playlist",                             # single video only
            "--extractor-args", "youtube:player_client=android,mweb",
            "-o", output_template,
        ]

        # Optional: cookies file path from env (set YTDLP_COOKIES_FILE on Railway
        # if the iOS client alone is not enough — unlikely but possible).
        cookies_file = os.environ.get("YTDLP_COOKIES_FILE", "").strip()
        if cookies_file and os.path.isfile(cookies_file):
            cmd += ["--cookies", cookies_file]

        cmd.append(url)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=180,
                text=True,
            )
        except FileNotFoundError:
            raise HTTPException(
                status_code=503,
                detail="yt-dlp is not installed. Run: pip install yt-dlp",
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(
                status_code=504,
                detail="YouTube download timed out (>180 s)",
            )

        if result.returncode != 0:
            log.error("yt-dlp failed:\n%s", result.stderr)
            raise HTTPException(
                status_code=502,
                detail=f"yt-dlp failed: {result.stderr[:500] if result.stderr else 'unknown error'}",
            )

        # Find downloaded audio file (skip partial files)
        audio_files = [
            f for f in os.listdir(tmpdir)
            if not f.endswith(".part") and not f.endswith(".ytdl")
        ]
        if not audio_files:
            raise HTTPException(status_code=502, detail="No audio file was downloaded")

        audio_path = os.path.join(tmpdir, audio_files[0])
        log.info("Downloaded: %s (%d bytes)", audio_files[0], os.path.getsize(audio_path))

        try:
            analysis = analyze_audio(audio_path)
            log.info(
                "YouTube audio analysis complete — duration=%.1fs bpm=%.1f key=%s",
                analysis["duration"], analysis["bpm"], analysis["key"],
            )
            scores = compute_scores(analysis, body.lyrics_context)
            return JSONResponse({"analysis": analysis, "scores": scores})

        except RuntimeError as exc:
            log.error("Analysis failed: %s", exc)
            raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Rhythm band analysis — file upload path
# ---------------------------------------------------------------------------

class BandSpec(BaseModel):
    label: str
    min_hz: float
    max_hz: float


_DEFAULT_BANDS = [
    {"label": "Kick",   "min_hz": 40,   "max_hz": 120},
    {"label": "Snare",  "min_hz": 150,  "max_hz": 600},
    {"label": "Hi-hat", "min_hz": 5000, "max_hz": 12000},
    {"label": "Cymbal", "min_hz": 8000, "max_hz": 18000},
]


@app.post("/analyze-rhythm")
async def analyze_rhythm(
    file: UploadFile = File(...),
    bands: str = Form(default=""),
):
    """
    Upload audio + optional JSON-encoded band specs; returns RhythmAnalysisResult.

    bands (form field): JSON array of {label, min_hz, max_hz}.
    Defaults to kick / snare / hi-hat / cymbal when omitted.
    """
    import json

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_MB} MB.",
        )

    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported format '{ext}'")

    try:
        bands_data: list[dict] = json.loads(bands) if bands.strip() else []
    except Exception:
        bands_data = []

    if not bands_data:
        bands_data = _DEFAULT_BANDS

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        log.info("Rhythm analysis: %s (%d bytes), %d bands", filename, len(content), len(bands_data))
        result = analyze_rhythm_from_file(tmp_path, bands_data)
        log.info("Rhythm analysis complete — bpm=%.1f, %d bands", result["globalBpm"], len(result["bands"]))
        return JSONResponse(result)
    except RuntimeError as exc:
        log.error("Rhythm analysis failed: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Rhythm band analysis — YouTube path (local / personal use only)
# ---------------------------------------------------------------------------

class RhythmYouTubeRequest(BaseModel):
    youtube_url: str
    bands: list[BandSpec] = []


@app.post("/analyze-rhythm-youtube")
async def analyze_rhythm_youtube(body: RhythmYouTubeRequest):
    """
    Download audio from YouTube and run rhythm band analysis.

    IMPORTANT: Only enabled when ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true.
    """
    if os.environ.get("ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT") != "true":
        raise HTTPException(
            status_code=403,
            detail=(
                "YouTube audio import is disabled. "
                "Set ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true to enable "
                "(local / personal use only)."
            ),
        )

    url = body.youtube_url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="youtube_url is required")

    bands_data: list[dict] = (
        [{"label": b.label, "min_hz": b.min_hz, "max_hz": b.max_hz} for b in body.bands]
        if body.bands
        else _DEFAULT_BANDS
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        output_template = os.path.join(tmpdir, "audio.%(ext)s")
        log.info("Rhythm analysis: downloading YouTube audio from %s", url)

        cmd = [
            "yt-dlp",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--no-playlist",
            "--extractor-args", "youtube:player_client=android,mweb",
            "-o", output_template,
        ]

        cookies_file = os.environ.get("YTDLP_COOKIES_FILE", "").strip()
        if cookies_file and os.path.isfile(cookies_file):
            cmd += ["--cookies", cookies_file]

        cmd.append(url)

        try:
            result_proc = subprocess.run(cmd, capture_output=True, timeout=180, text=True)
        except FileNotFoundError:
            raise HTTPException(status_code=503, detail="yt-dlp is not installed")
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="YouTube download timed out (>180 s)")

        if result_proc.returncode != 0:
            log.error("yt-dlp failed:\n%s", result_proc.stderr)
            raise HTTPException(
                status_code=502,
                detail=f"yt-dlp failed: {result_proc.stderr[:500] if result_proc.stderr else 'unknown error'}",
            )

        audio_files = [
            f for f in os.listdir(tmpdir)
            if not f.endswith(".part") and not f.endswith(".ytdl")
        ]
        if not audio_files:
            raise HTTPException(status_code=502, detail="No audio file was downloaded")

        audio_path = os.path.join(tmpdir, audio_files[0])
        log.info("Downloaded: %s (%d bytes)", audio_files[0], os.path.getsize(audio_path))

        try:
            import librosa
            y, sr = librosa.load(audio_path, sr=TARGET_SR, mono=True, duration=900)
            result = analyze_rhythm_bands(y, sr, bands_data)
            log.info("Rhythm analysis complete — bpm=%.1f", result["globalBpm"])
            return JSONResponse(result)
        except RuntimeError as exc:
            log.error("Rhythm analysis failed: %s", exc)
            raise HTTPException(status_code=422, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
