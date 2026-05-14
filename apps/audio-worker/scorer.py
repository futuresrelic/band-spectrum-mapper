"""
Heuristic spectrum scorer.

Takes the AudioAnalysisResult dict produced by analyzer.py and produces
a ScoreAxisDetail for each of the six BSM axes:
  aggression, complexity, atmosphere, emotion, psychedelic, concept

Each score is:
  - Fully transparent: every contributing factor is listed with its value.
  - Independently explainable: no black-box neural network.
  - Extensible: add new feature → new subscore → update weights.

Score range: 0–100 (integer).
Confidence: 0.0–1.0 (how clearly the features point to this score).
"""

from __future__ import annotations

import math
from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clamp(val: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, val))


def normalise(val: float, lo: float, hi: float) -> float:
    """Map val from [lo, hi] to [0, 1], clamped."""
    return clamp((val - lo) / (hi - lo + 1e-9), 0.0, 1.0)


def factor(label: str, value: Any, contribution: float) -> dict:
    """Build a human-readable factor entry."""
    return {"label": label, "value": value, "contribution": round(contribution, 1)}


# ---------------------------------------------------------------------------
# Individual axis scorers
# Signature: (analysis: dict, features: dict, loudness: dict) -> (score 0-100, confidence, factors, explanation)
# ---------------------------------------------------------------------------

def score_aggression(a: dict, f: dict, loud: dict) -> tuple[int, float, list[str], str]:
    factors = []
    total, weight = 0.0, 0.0

    # BPM: high tempo → aggressive
    bpm = a.get("bpm", 100)
    bpm_score = normalise(bpm, 60, 180) * 100
    w = 0.25
    total += bpm_score * w; weight += w
    factors.append(f"BPM {bpm:.0f} → {bpm_score:.0f}/100")

    # Rhythmic density: many onsets per second → aggressive
    rd = f.get("rhythmicDensity", 3)
    rd_score = normalise(rd, 1, 8) * 100
    w = 0.25
    total += rd_score * w; weight += w
    factors.append(f"Rhythmic density {rd:.2f} onset/s → {rd_score:.0f}/100")

    # Transient density: hard attacks → aggressive
    td = f.get("transientDensity", 1)
    td_score = normalise(td, 0, 4) * 100
    w = 0.20
    total += td_score * w; weight += w
    factors.append(f"Transient density {td:.2f}/s → {td_score:.0f}/100")

    # Spectral contrast: wide dynamic bands → aggressive
    sc = f.get("spectralContrast", 20)
    sc_score = normalise(sc, 10, 50) * 100
    w = 0.15
    total += sc_score * w; weight += w
    factors.append(f"Spectral contrast {sc:.1f} dB → {sc_score:.0f}/100")

    # Loudness: louder → more aggressive (mean dB, less negative = louder)
    db = loud.get("meanDb", -20)
    db_score = normalise(db, -40, -5) * 100
    w = 0.15
    total += db_score * w; weight += w
    factors.append(f"Mean loudness {db:.1f} dBFS → {db_score:.0f}/100")

    score = int(clamp(total / (weight + 1e-9)))
    confidence = round(min(1.0, weight / 1.0), 2)

    if score > 70:
        expl = "High BPM, dense rhythmic activity, and strong transients suggest an aggressive, intense delivery."
    elif score > 40:
        expl = "Moderate energy and rhythm density; assertive but not relentlessly intense."
    else:
        expl = "Slow tempo, sparse onsets, and low spectral contrast point to a restrained, non-aggressive character."

    return score, confidence, factors, expl


def score_complexity(a: dict, f: dict, loud: dict) -> tuple[int, float, list[str], str]:
    factors = []
    total, weight = 0.0, 0.0

    # Number of structural sections → structural complexity
    n_sections = len(a.get("sections", []))
    sec_score = normalise(n_sections, 2, 10) * 100
    w = 0.25
    total += sec_score * w; weight += w
    factors.append(f"{n_sections} structural sections → {sec_score:.0f}/100")

    # Duration: longer songs tend to be more complex
    dur = a.get("duration", 180)
    dur_score = normalise(dur, 60, 600) * 100
    w = 0.15
    total += dur_score * w; weight += w
    factors.append(f"Duration {dur:.0f}s → {dur_score:.0f}/100")

    # Spectral flux: rapidly changing spectrum → complex arrangement
    flux = f.get("spectralFlux", 0.0)
    flux_score = normalise(math.log1p(flux * 1e6), 0, 15) * 100
    w = 0.20
    total += flux_score * w; weight += w
    factors.append(f"Spectral flux {flux:.4f} → {flux_score:.0f}/100")

    # Spectral contrast variation → tonal complexity
    sc = f.get("spectralContrast", 20)
    sc_score = normalise(sc, 5, 40) * 100
    w = 0.20
    total += sc_score * w; weight += w
    factors.append(f"Spectral contrast {sc:.1f} dB → {sc_score:.0f}/100")

    # ZCR: high zero-crossing rate → noisy / tonally complex
    zcr = f.get("zeroCrossingRate", 0.05)
    zcr_score = normalise(zcr, 0.02, 0.15) * 100
    w = 0.20
    total += zcr_score * w; weight += w
    factors.append(f"Zero-crossing rate {zcr:.4f} → {zcr_score:.0f}/100")

    score = int(clamp(total / (weight + 1e-9)))
    confidence = round(min(1.0, weight / 1.0), 2)

    if score > 70:
        expl = "Rich structural variety, rapidly evolving textures, and tonal breadth indicate a highly complex composition."
    elif score > 40:
        expl = "Moderate structural and tonal complexity; several distinct sections with varied instrumentation."
    else:
        expl = "Simpler structure with consistent texture throughout; straightforward arrangement."

    return score, confidence, factors, expl


def score_atmosphere(a: dict, f: dict, loud: dict) -> tuple[int, float, list[str], str]:
    factors = []
    total, weight = 0.0, 0.0

    # Low BPM → spacious, atmospheric
    bpm = a.get("bpm", 100)
    # Inverse: slow = high atmosphere
    atm_bpm = normalise(180 - bpm, 0, 120) * 100
    w = 0.20
    total += atm_bpm * w; weight += w
    factors.append(f"BPM {bpm:.0f} (slower → atmospheric) → {atm_bpm:.0f}/100")

    # Low spectral centroid → dark, atmospheric texture
    sc_hz = f.get("spectralCentroid", 3000)
    atm_sc = normalise(8000 - sc_hz, 0, 7000) * 100
    w = 0.20
    total += atm_sc * w; weight += w
    factors.append(f"Spectral centroid {sc_hz:.0f} Hz (lower → darker) → {atm_sc:.0f}/100")

    # High dynamic range → breathes, feels expansive
    dr = loud.get("dynamicRange", 10)
    dr_score = normalise(dr, 5, 30) * 100
    w = 0.20
    total += dr_score * w; weight += w
    factors.append(f"Dynamic range {dr:.1f} dB → {dr_score:.0f}/100")

    # Low rhythmic density → less driving, more ambient
    rd = f.get("rhythmicDensity", 3)
    atm_rd = normalise(8 - rd, 0, 7) * 100
    w = 0.20
    total += atm_rd * w; weight += w
    factors.append(f"Rhythmic density {rd:.2f} (sparser → atmospheric) → {atm_rd:.0f}/100")

    # Low spectral flux → sustained, evolving texture
    flux = f.get("spectralFlux", 0.0)
    atm_flux = normalise(1.0 - math.log1p(flux * 1e6) / 15, 0, 1) * 100
    w = 0.20
    total += atm_flux * w; weight += w
    factors.append(f"Spectral flux (lower → sustained) → {atm_flux:.0f}/100")

    score = int(clamp(total / (weight + 1e-9)))
    confidence = round(min(1.0, weight / 1.0), 2)

    if score > 70:
        expl = "Slow tempo, dark tonal centre, wide dynamic range, and sparse rhythm create a deeply atmospheric and immersive soundscape."
    elif score > 40:
        expl = "Some atmospheric qualities — moments of space and texture — balanced with more active passages."
    else:
        expl = "Fast, dense, and bright; not designed for immersive atmosphere."

    return score, confidence, factors, expl


def score_emotion(a: dict, f: dict, loud: dict) -> tuple[int, float, list[str], str]:
    factors = []
    total, weight = 0.0, 0.0

    # High dynamic range → emotional peaks and valleys
    dr = loud.get("dynamicRange", 10)
    dr_score = normalise(dr, 5, 35) * 100
    w = 0.30
    total += dr_score * w; weight += w
    factors.append(f"Dynamic range {dr:.1f} dB → {dr_score:.0f}/100")

    # RMS envelope variance → emotional movement through time
    rms_env = loud.get("rmsEnvelope", [0.5])
    env_var = float(max(rms_env) - min(rms_env)) if rms_env else 0.0
    env_score = normalise(env_var, 0.1, 0.8) * 100
    w = 0.25
    total += env_score * w; weight += w
    factors.append(f"Energy envelope range {env_var:.3f} → {env_score:.0f}/100")

    # Chroma: dominant chroma spread → harmonic emotion
    chroma = f.get("chromaProfile", [1/12] * 12)
    chroma_std = float(max(chroma) - min(chroma)) if chroma else 0.0
    chroma_score = normalise(chroma_std, 0.05, 0.5) * 100
    w = 0.20
    total += chroma_score * w; weight += w
    factors.append(f"Chroma spread {chroma_std:.3f} → {chroma_score:.0f}/100")

    # Minor key bias → emotional / melancholic
    key = a.get("key", "")
    minor_bonus = 15.0 if "minor" in key.lower() else 0.0
    minor_score = minor_bonus
    w = 0.25
    total += minor_score * w; weight += w
    factors.append(f"Key {key} ({'minor — emotional bias' if minor_bonus else 'major'}) → {minor_score:.0f}/25 bonus")

    score = int(clamp(total / (weight + 1e-9)))
    confidence = round(min(1.0, weight / 1.0), 2)

    if score > 70:
        expl = "Wide dynamic swings, varied energy arc, and minor-mode harmonics suggest strong emotional content."
    elif score > 40:
        expl = "Moderate emotional expressiveness; some dynamic variation but generally contained."
    else:
        expl = "Relatively flat dynamic profile in major tonality; more mechanical than expressive."

    return score, confidence, factors, expl


def score_psychedelic(a: dict, f: dict, loud: dict) -> tuple[int, float, list[str], str]:
    factors = []
    total, weight = 0.0, 0.0

    # Unusual spectral centroid (very high or very low)
    sc_hz = f.get("spectralCentroid", 3000)
    # Score peaks at 0 Hz and 8000 Hz, valley at 3500 Hz
    deviation = abs(sc_hz - 3500) / 3500
    sc_score = normalise(deviation, 0, 1.5) * 100
    w = 0.20
    total += sc_score * w; weight += w
    factors.append(f"Spectral centroid deviation from 3.5 kHz: {deviation:.2f} → {sc_score:.0f}/100")

    # High spectral flux → constantly changing, hallucinogenic
    flux = f.get("spectralFlux", 0.0)
    flux_score = normalise(math.log1p(flux * 1e6), 0, 15) * 100
    w = 0.25
    total += flux_score * w; weight += w
    factors.append(f"Spectral flux {flux:.4f} → {flux_score:.0f}/100")

    # Unusual chroma distribution → non-standard tonality
    chroma = f.get("chromaProfile", [1/12] * 12)
    chroma_arr = [max(0.0, v) for v in chroma]
    chroma_sum = sum(chroma_arr) + 1e-9
    chroma_norm = [v / chroma_sum for v in chroma_arr]
    # Entropy: high entropy = many chroma classes active = unusual tonality
    entropy = -sum(v * math.log2(v + 1e-9) for v in chroma_norm)
    max_entropy = math.log2(12)
    entropy_score = normalise(entropy, 2.0, max_entropy) * 100
    w = 0.25
    total += entropy_score * w; weight += w
    factors.append(f"Chroma entropy {entropy:.2f} bits (/{max_entropy:.2f}) → {entropy_score:.0f}/100")

    # Duration: long songs more likely to journey into psychedelic territory
    dur = a.get("duration", 180)
    dur_score = normalise(dur, 120, 900) * 100
    w = 0.15
    total += dur_score * w; weight += w
    factors.append(f"Duration {dur:.0f}s → {dur_score:.0f}/100")

    # Low BPM with high complexity → trancelike
    bpm = a.get("bpm", 100)
    n_sections = len(a.get("sections", []))
    trance_score = normalise((n_sections * 10) / (bpm + 1), 0, 1) * 100
    w = 0.15
    total += trance_score * w; weight += w
    factors.append(f"Structural density / tempo ratio → {trance_score:.0f}/100")

    score = int(clamp(total / (weight + 1e-9)))
    confidence = round(min(1.0, weight / 1.0), 2)

    if score > 70:
        expl = "Extreme spectral character, high harmonic entropy, and long duration suggest a disorienting, psychedelic soundscape."
    elif score > 40:
        expl = "Some unusual tonal qualities and structural wandering; moments of the surreal."
    else:
        expl = "Conventional spectral and tonal profile; grounded and direct."

    return score, confidence, factors, expl


def score_concept(a: dict, f: dict, loud: dict) -> tuple[int, float, list[str], str]:
    factors = []
    total, weight = 0.0, 0.0

    # Duration: concept pieces tend to be long
    dur = a.get("duration", 180)
    dur_score = normalise(dur, 120, 900) * 100
    w = 0.35
    total += dur_score * w; weight += w
    factors.append(f"Duration {dur:.0f}s → {dur_score:.0f}/100")

    # Many structural sections → narrative arc
    n_sections = len(a.get("sections", []))
    sec_score = normalise(n_sections, 3, 12) * 100
    w = 0.35
    total += sec_score * w; weight += w
    factors.append(f"{n_sections} sections → {sec_score:.0f}/100")

    # High dynamic range → purposeful dynamic architecture
    dr = loud.get("dynamicRange", 10)
    dr_score = normalise(dr, 5, 30) * 100
    w = 0.15
    total += dr_score * w; weight += w
    factors.append(f"Dynamic range {dr:.1f} dB → {dr_score:.0f}/100")

    # Structural flux (spectral flux) → thematic development
    flux = f.get("spectralFlux", 0.0)
    flux_score = normalise(math.log1p(flux * 1e6), 0, 15) * 100
    w = 0.15
    total += flux_score * w; weight += w
    factors.append(f"Spectral flux (thematic development) → {flux_score:.0f}/100")

    score = int(clamp(total / (weight + 1e-9)))
    confidence = round(min(1.0, weight / 1.0), 2)

    if score > 70:
        expl = "Extended duration, rich multi-part structure, and purposeful dynamics point to a conceptually ambitious composition."
    elif score > 40:
        expl = "Some conceptual ambition — several distinct movements and dynamic shaping."
    else:
        expl = "Short, single-movement song; concept depth is limited by duration and structure."

    return score, confidence, factors, expl


# ---------------------------------------------------------------------------
# Main scorer
# ---------------------------------------------------------------------------

AXES = [
    ("aggression",  score_aggression),
    ("complexity",  score_complexity),
    ("atmosphere",  score_atmosphere),
    ("emotion",     score_emotion),
    ("psychedelic", score_psychedelic),
    ("concept",     score_concept),
]


def compute_scores(analysis: dict, lyrics_context: str = "") -> dict:
    """
    Compute ScoreAxisDetail for all six axes.

    `lyrics_context` is ignored in this version (audio-only scoring).
    Future: pass to a small LLM for lyrics-informed adjustments.
    """
    features = analysis.get("features", {})
    loudness = analysis.get("loudness", {})

    result = {}
    for axis_name, scorer_fn in AXES:
        score, confidence, factor_list, explanation = scorer_fn(analysis, features, loudness)
        result[axis_name] = {
            "score": score,
            "confidence": confidence,
            "audioFeatures": factor_list,
            "lyricsFeatures": [],
            "explanation": explanation,
        }

    return result
