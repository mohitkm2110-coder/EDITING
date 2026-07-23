import os
import logging
import math

logger = logging.getLogger(__name__)

BUILTIN_TRACKS = {
    "neon": {"bpm": 128, "label": "Neon Nights"},
    "epic": {"bpm": 90, "label": "Epic Rise"},
    "urban": {"bpm": 140, "label": "Urban Flow"},
    "chill": {"bpm": 80, "label": "Chill Wave"},
}

try:
    import numpy as np
    import soundfile as sf
    HAS_NP_SF = True
except ImportError:
    HAS_NP_SF = False


def generate_track(bpm: int, duration: float = 30.0, sample_rate: int = 44100) -> bytes:
    if not HAS_NP_SF:
        return b""
    beats_per_sec = bpm / 60.0
    beat_samples = int(sample_rate / beats_per_sec)
    total_samples = int(sample_rate * duration)
    t = np.arange(total_samples) / sample_rate

    kick_freq = 55
    snare_freq = 200
    hihat_freq = 8000

    audio = np.zeros(total_samples, dtype=np.float32)

    for beat_idx in range(int(duration * beats_per_sec) + 1):
        beat_sample = int(beat_idx * beat_samples)
        if beat_sample >= total_samples:
            break

        env_len = min(int(sample_rate * 0.15), total_samples - beat_sample)
        env = np.exp(-np.arange(env_len) / (sample_rate * 0.04))
        kick = np.sin(2 * math.pi * kick_freq * np.arange(env_len) / sample_rate) * env * 0.6
        end = beat_sample + env_len
        audio[beat_sample:end] += kick * 0.4

        if beat_idx % 2 == 1:
            snare_env_len = min(int(sample_rate * 0.08), total_samples - beat_sample)
            snare_env = np.exp(-np.arange(snare_env_len) / (sample_rate * 0.025))
            noise = np.random.uniform(-1, 1, snare_env_len) * snare_env * 0.3
            snare_end = beat_sample + snare_env_len
            audio[beat_sample:snare_end] += noise * 0.25

        hat_env_len = min(int(sample_rate * 0.03), total_samples - beat_sample)
        hat_env = np.exp(-np.arange(hat_env_len) / (sample_rate * 0.008))
        hat = np.sin(2 * math.pi * hihat_freq * np.arange(hat_env_len) / sample_rate) * hat_env * 0.15
        hat_end = beat_sample + hat_env_len
        audio[beat_sample:hat_end] += hat * 0.12

    peak = np.max(np.abs(audio)) or 1
    audio = (audio / peak * 0.7).astype(np.float32)

    return audio, sample_rate


def ensure_builtin_tracks(upload_dir: str):
    if not HAS_NP_SF:
        logger.warning("numpy/soundfile not available — skipping built-in track generation")
        return
    for track_id, info in BUILTIN_TRACKS.items():
        filename = f"builtin_{track_id}.wav"
        filepath = os.path.join(upload_dir, filename)
        if os.path.exists(filepath):
            continue
        try:
            audio, sr = generate_track(info["bpm"])
            sf.write(filepath, audio, sr)
            logger.info(f"Generated built-in track: {filename}")
        except Exception as e:
            logger.error(f"Failed to generate {filename}: {e}")
