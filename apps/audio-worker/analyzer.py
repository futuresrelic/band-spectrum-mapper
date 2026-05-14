"""
Audio analysis module using librosa.

Returns a deterministic JSON structure (AudioAnalysisResult) that the
Node.js API and frontend consume directly. Keep computation under ~30s
for typical 3–10 minute songs by aggressively downsampling where possible.
"""

from __future__ import annotations

import numpy as np
import librosa
import librosa.segment
import librosa.onset
import scipy.signal


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Load audio at reduced sample rate — sufficient for most features and faster.
TARGET_SR = 22050
# Number of amplitude points in the exported waveform.
WAVEFORM_POINTS = 1000
# Spectrogram export resolution (time frames × freq bins).
SPEC_TIME_FRAMES = 200
SPEC_FREQ_BINS = 64
# Maximum audio duration to analyse (seconds). Longer files are trimmed.
MAX_DURATION_SEC = 900  # 15 min


# ---------------------------------------------------------------------------
# Key estimation helper
# ---------------------------------------------------------------------------

CHROMA_LABELS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl–Schmuckler key profiles (major and minor)
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                           2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                           2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def estimate_key(chroma_mean: np.ndarray) -> tuple[str, float]:
    """Return (key_label, confidence) using Krumhansl-Schmuckler profiles."""
    best_label, best_r = "Unknown", -1.0
    for i, root in enumerate(CHROMA_LABELS):
        for mode, profile, suffix in [
            (MAJOR_PROFILE, np.roll(MAJOR_PROFILE, i), "major"),
            (MINOR_PROFILE, np.roll(MINOR_PROFILE, i), "minor"),
        ]:
            r = float(np.corrcoef(chroma_mean, profile)[0, 1])
            if r > best_r:
                best_r = r
                best_label = f"{root} {suffix}"
    # Normalise confidence to 0–1
    confidence = max(0.0, min(1.0, (best_r + 1) / 2))
    return best_label, round(confidence, 3)


# ---------------------------------------------------------------------------
# Waveform downsampling
# ---------------------------------------------------------------------------

def downsample_waveform(y: np.ndarray, n_points: int) -> list[float]:
    """Return peak-amplitude envelope with `n_points` data points."""
    hop = max(1, len(y) // n_points)
    frames = [float(np.max(np.abs(y[i : i + hop]))) for i in range(0, len(y), hop)]
    # Trim / pad to exactly n_points
    frames = frames[:n_points]
    if len(frames) < n_points:
        frames += [0.0] * (n_points - len(frames))
    return frames


# ---------------------------------------------------------------------------
# Structural segmentation
# ---------------------------------------------------------------------------

def detect_sections(y: np.ndarray, sr: int, n_sections: int = 8) -> list[dict]:
    """Segment audio into up to n_sections labelled A, B, C, …"""
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    # Recurrence matrix + laplacian segmentation
    try:
        bounds_frames = librosa.segment.agglomerative(mfcc, k=min(n_sections, mfcc.shape[1] - 1))
        bound_times = librosa.frames_to_time(bounds_frames, sr=sr)
    except Exception:
        # Fallback: evenly spaced sections
        duration = librosa.get_duration(y=y, sr=sr)
        n = min(4, n_sections)
        bound_times = np.linspace(0, duration, n + 1)[1:-1]

    duration = librosa.get_duration(y=y, sr=sr)
    boundaries = [0.0] + list(bound_times) + [duration]
    letters = "ABCDEFGHIJKLMNOP"
    sections = []
    label_idx = 0
    for i in range(len(boundaries) - 1):
        sections.append({
            "start": round(float(boundaries[i]), 2),
            "end": round(float(boundaries[i + 1]), 2),
            "label": letters[label_idx % len(letters)],
        })
        label_idx += 1
    return sections


# ---------------------------------------------------------------------------
# Time signature / meter detection
# ---------------------------------------------------------------------------

# Candidate meter numerators (beats per measure)
_CANDIDATE_METERS = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13]

# Default librosa hop length — must match what onset_strength uses
_HOP = 512


def _sig_string(numerator: int, bpm: float) -> str:
    """Map a meter numerator to a conventional time-signature string."""
    simple = {2: "2/4", 3: "3/4", 4: "4/4", 6: "6/8", 8: "8/8", 12: "12/8"}
    if numerator in simple:
        return simple[numerator]
    # Odd / compound: denominator 8 for fast tempos (subdivided pulse), 4 for slow
    denom = 8 if bpm >= 100 else 4
    return f"{numerator}/{denom}"


def _acf_at_lag(env: np.ndarray, lag: int) -> float:
    """Pearson correlation of `env` with itself shifted by `lag` samples."""
    if lag <= 0 or lag >= len(env):
        return 0.0
    n = len(env) - lag
    if n < 20:
        return 0.0
    r = float(np.corrcoef(env[lag:], env[:n])[0, 1])
    return r if not np.isnan(r) else 0.0


def detect_time_signature(y: np.ndarray, sr: int) -> tuple[str, bool]:
    """
    Estimate the most likely time signature and whether the track is polyrhythmic.

    Method
    ------
    1. Beat-track to find the quarter-note BPM.
    2. Compute frame-level onset-strength autocorrelation (ACF) at lags that
       correspond to N beats at *both* the quarter-note AND eighth-note level.
       Using frame-level ACF avoids the "every 2nd beat looks similar in 4/4"
       bias that plagues beat-sampled ACF.
    3. For each candidate N, compute a "primary-period score":
         acf[N] - max(acf[M] for M in strict-divisors-of-N) * 0.75
       This penalises lags that are already explained by a shorter sub-period,
       so 4/4 is preferred over 2/4 when both ACF values are similar.
    4. Polyrhythmic: True when the best meter is odd/compound (5, 7, 9, 11, 13)
       OR when the inter-beat-interval coefficient of variation is high (> 0.25),
       indicating that the pulse is unsteady / the meter changes across sections.

    Returns
    -------
    (time_signature: str, polyrhythmic: bool)  e.g. ("7/8", True)
    """
    try:
        tempo_arr, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units='frames',
                                                          hop_length=_HOP)
        bpm = float(np.mean(tempo_arr)) if hasattr(tempo_arr, '__len__') else float(tempo_arr)
    except Exception:
        return "4/4", False

    if bpm <= 0 or len(beat_frames) < 8:
        return "4/4", False

    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=_HOP)
    except Exception:
        return "4/4", False

    fps = sr / _HOP  # frames per second

    # --- Frame-level ACF at candidate meter lags ----------------------------
    # Try both quarter-note and eighth-note pulse levels so we catch odd
    # time signatures like 7/8 even when librosa tracks quarter-note BPM.
    frames_per_qtr  = fps * 60.0 / bpm          # quarter note pulse
    frames_per_8th  = fps * 60.0 / (bpm * 2.0)  # eighth note pulse

    acf: dict[int, float] = {}
    for n in _CANDIDATE_METERS:
        # Quarter-note level
        lag_q = int(round(n * frames_per_qtr))
        r_q   = _acf_at_lag(onset_env, lag_q)
        # Eighth-note level (same N but at 2× pulse rate)
        lag_8 = int(round(n * frames_per_8th))
        r_8   = _acf_at_lag(onset_env, lag_8)
        # Keep the stronger of the two interpretations
        acf[n] = max(r_q, r_8)

    # --- Primary-period score: penalise sub-harmonics -----------------------
    def primary_score(n: int) -> float:
        r = acf[n]
        # Find the highest ACF value among strict divisors present in our set
        divisor_acfs = [acf[m] for m in _CANDIDATE_METERS if m < n and n % m == 0]
        if divisor_acfs:
            # n is penalised if a sub-divisor already captures most of the periodicity
            sub = max(divisor_acfs)
            r -= sub * 0.75
        return r

    primary_scores = {n: primary_score(n) for n in _CANDIDATE_METERS if acf[n] > 0}
    if not primary_scores:
        return "4/4", False

    best_n = max(primary_scores, key=lambda k: primary_scores[k])
    time_sig = _sig_string(best_n, bpm)

    # --- Polyrhythmic flag --------------------------------------------------
    ibis = np.diff(beat_frames.astype(float))
    ibi_cv = float(np.std(ibis) / (np.mean(ibis) + 1e-6))
    complex_meter  = best_n not in (2, 3, 4, 6, 8, 12)
    # IBI CV > 0.25 → beat intervals are uneven → mixed/changing meter
    irregular_pulse = ibi_cv > 0.25

    polyrhythmic = bool(complex_meter or (irregular_pulse and best_n not in (2, 4, 8)))
    return time_sig, polyrhythmic


# ---------------------------------------------------------------------------
# Main analysis function
# ---------------------------------------------------------------------------

def analyze_audio(file_path: str) -> dict:
    """
    Analyse an audio file and return the AudioAnalysisResult structure.
    Raises RuntimeError on unreadable files.
    """
    try:
        y, sr = librosa.load(file_path, sr=TARGET_SR, mono=True,
                              duration=MAX_DURATION_SEC)
    except Exception as exc:
        raise RuntimeError(f"Cannot read audio file: {exc}") from exc

    duration = float(librosa.get_duration(y=y, sr=sr))

    # ---- BPM ----------------------------------------------------------------
    tempo_arr, _ = librosa.beat.beat_track(y=y, sr=sr, hop_length=_HOP)
    bpm = float(np.mean(tempo_arr)) if hasattr(tempo_arr, "__len__") else float(tempo_arr)
    # Rough confidence from onset strength variance
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=_HOP)
    bpm_confidence = round(
        float(np.clip(np.std(onset_env) / (np.mean(onset_env) + 1e-6), 0, 1)), 3
    )

    # ---- Key / Chroma -------------------------------------------------------
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    key_label, key_confidence = estimate_key(chroma_mean)

    # ---- Loudness / Energy --------------------------------------------------
    rms = librosa.feature.rms(y=y)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    mean_db = float(np.mean(rms_db))
    peak_db = float(np.max(rms_db))
    dynamic_range = round(float(peak_db - np.min(rms_db)), 2)

    # Downsample RMS envelope to 200 points (0–1 normalised)
    rms_norm = (rms - rms.min()) / (rms.max() - rms.min() + 1e-6)
    rms_envelope = downsample_waveform(rms_norm, 200)

    # ---- Waveform -----------------------------------------------------------
    waveform = downsample_waveform(y, WAVEFORM_POINTS)

    # ---- Spectrogram --------------------------------------------------------
    D = librosa.stft(y)
    S_db = librosa.amplitude_to_db(np.abs(D), ref=np.max)
    # Downsample to SPEC_FREQ_BINS × SPEC_TIME_FRAMES
    freq_factor = max(1, S_db.shape[0] // SPEC_FREQ_BINS)
    time_factor = max(1, S_db.shape[1] // SPEC_TIME_FRAMES)
    S_small = S_db[::freq_factor, ::time_factor]
    S_small = S_small[:SPEC_FREQ_BINS, :SPEC_TIME_FRAMES]
    # Shift to 0–1 range for compact JSON
    S_min, S_max = S_small.min(), S_small.max()
    S_norm = ((S_small - S_min) / (S_max - S_min + 1e-6))

    freqs = librosa.fft_frequencies(sr=sr)
    times = librosa.frames_to_time(np.arange(S_db.shape[1]), sr=sr)
    spec_freqs = [round(float(f), 1) for f in freqs[::freq_factor][:SPEC_FREQ_BINS]]
    spec_times = [round(float(t), 3) for t in times[::time_factor][:SPEC_TIME_FRAMES]]
    spec_data = [[round(float(v), 3) for v in row] for row in S_norm]

    # ---- Structural sections ------------------------------------------------
    sections = detect_sections(y, sr)

    # ---- Time signature / polyrhythm ----------------------------------------
    # Per-section detection (≥ 3 s sections only)
    for sec in sections:
        sec_dur = sec["end"] - sec["start"]
        if sec_dur >= 3.0:
            s0 = int(sec["start"] * sr)
            s1 = int(sec["end"] * sr)
            y_sec = y[s0:s1]
            try:
                sec_ts, _ = detect_time_signature(y_sec, sr)
                sec["timeSignature"] = sec_ts
            except Exception:
                pass

    # Global time signature: computed on full audio
    time_signature, polyrhythmic = detect_time_signature(y, sr)

    # If sections show multiple distinct time signatures → strengthen polyrhythmic flag
    sec_ts_set = {s["timeSignature"] for s in sections if "timeSignature" in s}
    if len(sec_ts_set) > 1:
        polyrhythmic = True
        # Show all unique signatures detected (most-common first by section count)
        from collections import Counter
        ts_counts = Counter(s["timeSignature"] for s in sections if "timeSignature" in s)
        time_signature = " / ".join(ts for ts, _ in ts_counts.most_common())

    # ---- Spectral features --------------------------------------------------
    spec_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    spec_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
    spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    zcr = librosa.feature.zero_crossing_rate(y)[0]

    # Spectral flux (frame-to-frame change in magnitude spectrum)
    mag = np.abs(D)
    flux = np.mean(np.diff(mag, axis=1) ** 2)

    # Onset / transient density
    onsets = librosa.onset.onset_detect(y=y, sr=sr)
    rhythmic_density = round(float(len(onsets)) / max(duration, 1), 3)

    # Hard transients: onsets with high onset strength
    onset_env_full = librosa.onset.onset_strength(y=y, sr=sr)
    threshold = float(np.mean(onset_env_full) + np.std(onset_env_full))
    hard_onsets = librosa.onset.onset_detect(y=y, sr=sr,
                                              delta=threshold / (onset_env_full.max() + 1e-6))
    transient_density = round(float(len(hard_onsets)) / max(duration, 1), 3)

    # MFCC means (first 13 coefficients)
    mfcc_means = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_list = [round(float(v), 3) for v in np.mean(mfcc_means, axis=1)]

    return {
        "duration": round(duration, 2),
        "sampleRate": int(sr),
        "bpm": round(bpm, 1),
        "bpmConfidence": bpm_confidence,
        "key": key_label,
        "keyConfidence": key_confidence,
        "timeSignature": time_signature,
        "polyrhythmic": polyrhythmic,
        "loudness": {
            "meanDb": round(mean_db, 2),
            "peakDb": round(peak_db, 2),
            "dynamicRange": dynamic_range,
            "rmsEnvelope": rms_envelope,
        },
        "waveform": waveform,
        "spectrogram": {
            "data": spec_data,
            "times": spec_times,
            "freqs": spec_freqs,
        },
        "sections": sections,
        "features": {
            "spectralCentroid": round(float(np.mean(spec_centroid)), 1),
            "spectralRolloff": round(float(np.mean(spec_rolloff)), 1),
            "spectralFlux": round(float(flux), 6),
            "spectralContrast": round(float(np.mean(spec_contrast)), 3),
            "zeroCrossingRate": round(float(np.mean(zcr)), 5),
            "rhythmicDensity": rhythmic_density,
            "transientDensity": transient_density,
            "chromaProfile": [round(float(v), 4) for v in chroma_mean],
            "mfcc": mfcc_list,
        },
    }
