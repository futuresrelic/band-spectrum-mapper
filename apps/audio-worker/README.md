# BSM Audio Worker

Standalone Python microservice for audio analysis. Called by the Band Spectrum
Mapper API when a user uploads audio on the `/song-spectrum` page.

## What it does

Accepts an audio file upload and returns:

- Waveform (amplitude envelope, ~1000 points)
- Spectrogram (frequency heatmap, 64 bins × 200 frames)
- BPM + confidence
- Key + confidence (Krumhansl–Schmuckler profiles)
- Loudness / dynamic range (RMS dB)
- Structural sections (agglomerative segmentation)
- Spectral features (centroid, rolloff, flux, contrast, ZCR)
- Onset density (rhythmic + transient)
- Chroma profile (12 notes)
- First 13 MFCCs

And transparent heuristic scores (0–100) for the six BSM axes:
**Aggression · Complexity · Atmosphere · Emotion · Psychedelic · Concept**

Each score includes: contributing factors, confidence, and a plain-English explanation.

## Supported audio formats

`.mp3` `.wav` `.flac` `.ogg` `.m4a` `.aac` `.opus`

## Requirements

- Python 3.11+
- The packages in `requirements.txt`

## Local development

```bash
cd apps/audio-worker

# Create a virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

pip install -r requirements.txt

uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Then in `apps/api/.env` (or Railway env vars):

```
AUDIO_WORKER_URL=http://localhost:8001
```

If `AUDIO_WORKER_URL` is not set, the `/api/song-spectrum/analyze-audio` endpoint
returns HTTP 503 with a clear message so the rest of the app is unaffected.

## Railway deployment

Add a second Railway service pointing at `apps/audio-worker`:

1. In Railway: **New Service → Deploy from GitHub repo**
2. Set **Root Directory** to `apps/audio-worker`
3. Set **Start Command** to:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. Add env var `MAX_MB=150` (optional, default 150 MB)
5. Copy the internal Railway URL into the API service's `AUDIO_WORKER_URL` env var.

## Local YouTube audio (dev only)

By default the app only fetches YouTube **metadata** (title, channel, description, etc.)
via the YouTube Data API v3. No audio is downloaded.

To enable local dev audio import via `yt-dlp`, set:

```
ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true
```

**This flag must never be set in production.** It is undocumented in the UI and
requires `yt-dlp` to be installed separately (`pip install yt-dlp`). Audio
downloading from YouTube may violate YouTube's Terms of Service — use only with
content you have rights to, for personal or development purposes.

## Environment variables

| Variable | Default  | Description |
|----------|----------|-------------|
| `PORT`   | `8001`   | Listen port (Railway sets this automatically) |
| `MAX_MB` | `150`    | Maximum audio upload size in MB |
