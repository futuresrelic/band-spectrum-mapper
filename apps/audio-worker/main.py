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
    YTDLP_COOKIES_CONTENT            — base64-encoded Netscape cookies.txt from a
                                        logged-in YouTube session; primary fix for
                                        429 / 403 / bot-detection errors on cloud IPs
    YTDLP_COOKIES_FILE               — path to a cookies.txt on the container filesystem
                                        (alternative to YTDLP_COOKIES_CONTENT)

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

# ---------------------------------------------------------------------------
# YouTube cookies — loaded once at startup from environment variable.
#
# YTDLP_COOKIES_CONTENT  (preferred on Railway)
#   Set to the base64-encoded contents of a Netscape cookies.txt file
#   exported from a logged-in YouTube browser session.
#   The worker decodes this to a temp file and passes it to yt-dlp.
#
# YTDLP_COOKIES_FILE  (alternative)
#   Path to an already-present cookies.txt on the container filesystem.
#
# Without cookies, YouTube progressively rate-limits and blocks yt-dlp on
# cloud server IPs.  These env vars are the primary fix for 429 / 403 errors.
# ---------------------------------------------------------------------------

_COOKIES_FILE: "str | None" = None

_yt_cookies_content = os.environ.get("YTDLP_COOKIES_CONTENT", "").strip()
_yt_cookies_file    = os.environ.get("YTDLP_COOKIES_FILE",    "").strip()

if _yt_cookies_content:
    import base64 as _b64
    try:
        _decoded = _b64.b64decode(_yt_cookies_content)
        _tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="wb")
        _tmp.write(_decoded)
        _tmp.close()
        _COOKIES_FILE = _tmp.name
        log.info("YouTube cookies loaded from YTDLP_COOKIES_CONTENT (%d bytes)", len(_decoded))
    except Exception as _exc:
        log.warning("Failed to load YTDLP_COOKIES_CONTENT — yt-dlp will run unauthenticated: %s", _exc)
elif _yt_cookies_file and os.path.isfile(_yt_cookies_file):
    _COOKIES_FILE = _yt_cookies_file
    log.info("YouTube cookies loaded from YTDLP_COOKIES_FILE: %s", _yt_cookies_file)
else:
    log.info("No YouTube cookies configured — yt-dlp running unauthenticated (set YTDLP_COOKIES_CONTENT to fix 429/403 errors)")

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


# ---------------------------------------------------------------------------
# Shared yt-dlp helper — used by all YouTube endpoints
# ---------------------------------------------------------------------------


def _download_youtube_audio(url: str, tmpdir: str) -> str:
    """
    Download YouTube audio to tmpdir using yt-dlp.
    Returns the path to the downloaded audio file.
    Raises HTTPException on failure.
    """
    output_template = os.path.join(tmpdir, "audio.%(ext)s")
    log.info("Downloading YouTube audio from %s", url)

    # ios client avoids the SABR streaming experiment that causes 403s on Railway IPs
    # when android is included.  None of these bypass YouTube rate-limiting (429) on
    # cloud IPs — the upload-file path is always the more reliable option.
    cmd = [
        "yt-dlp",
        "-x",                                        # audio only
        "--audio-format", "mp3",
        "--audio-quality", "0",                      # best quality
        "--no-playlist",
        "--extractor-args", "youtube:player_client=ios",
        "--socket-timeout", "30",                    # fail fast on stalled connections
        "--retries", "2",
        "--fragment-retries", "0",
        "-o", output_template,
    ]

    # Use authenticated cookies if available (YTDLP_COOKIES_CONTENT or YTDLP_COOKIES_FILE).
    # Without cookies, Railway IPs are progressively rate-limited by YouTube.
    if _COOKIES_FILE and os.path.isfile(_COOKIES_FILE):
        cmd += ["--cookies", _COOKIES_FILE]

    cmd.append(url)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=120,   # fail faster when yt-dlp hangs
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
            detail="YouTube download timed out (>120 s)",
        )

    if result.returncode != 0:
        log.error("yt-dlp failed:\n%s", result.stderr)
        # 422 (not 502) so the Node.js proxy does NOT auto-retry this.
        # 502 is reserved for Railway cold-start; retrying a yt-dlp 429/403 just
        # accelerates rate-limiting.
        raise HTTPException(
            status_code=422,
            detail=f"yt-dlp failed: {result.stderr[:600] if result.stderr else 'unknown error'}",
        )

    audio_files = [
        f for f in os.listdir(tmpdir)
        if not f.endswith(".part") and not f.endswith(".ytdl")
    ]
    if not audio_files:
        raise HTTPException(status_code=422, detail="yt-dlp ran but produced no audio file")

    audio_path = os.path.join(tmpdir, audio_files[0])
    log.info("Downloaded: %s (%d bytes)", audio_files[0], os.path.getsize(audio_path))
    return audio_path


# ---------------------------------------------------------------------------
# Spectrum analysis — YouTube path (local / personal use only)
# ---------------------------------------------------------------------------

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
        audio_path = _download_youtube_audio(url, tmpdir)

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
# Combined spectrum + rhythm analysis — YouTube path (one download, both results)
# ---------------------------------------------------------------------------

class YouTubeFullRequest(BaseModel):
    youtube_url: str
    lyrics_context: str = ""
    bands: list["BandSpec"] = []


@app.post("/analyze-youtube-full")
async def analyze_youtube_full(body: YouTubeFullRequest):
    """
    Download YouTube audio once, then run BOTH spectrum and rhythm band analysis.
    Halves the number of yt-dlp calls vs. calling /analyze-youtube and
    /analyze-rhythm-youtube separately.

    IMPORTANT: Only enabled when ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true.

    Returns:
        {
            "analysis": AudioAnalysisResult,
            "scores":   Record<axis, ScoreAxisDetail>,
            "rhythm":   RhythmAnalysisResult
        }
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
        audio_path = _download_youtube_audio(url, tmpdir)

        try:
            analysis = analyze_audio(audio_path)
            log.info(
                "Full YouTube analysis: spectrum done — duration=%.1fs bpm=%.1f key=%s",
                analysis["duration"], analysis["bpm"], analysis["key"],
            )
            scores = compute_scores(analysis, body.lyrics_context)
            rhythm = analyze_rhythm_from_file(audio_path, bands_data)
            log.info("Full YouTube analysis: rhythm done — bpm=%.1f", rhythm["globalBpm"])

            return JSONResponse({
                "analysis": analysis,
                "scores": scores,
                "rhythm": rhythm,
            })

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
        audio_path = _download_youtube_audio(url, tmpdir)

        try:
            result = analyze_rhythm_from_file(audio_path, bands_data)
            log.info("Rhythm YouTube analysis complete — bpm=%.1f", result["globalBpm"])
            return JSONResponse(result)
        except RuntimeError as exc:
            log.error("Rhythm analysis failed: %s", exc)
            raise HTTPException(status_code=422, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
