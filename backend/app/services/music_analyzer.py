import logging
import os

logger = logging.getLogger(__name__)

try:
    import librosa
    import numpy as np
    HAS_LIBROSA = True
except ImportError:
    HAS_LIBROSA = False
    logger.warning("librosa not installed — music analysis disabled")


def analyze_music(file_path: str) -> dict:
    if not HAS_LIBROSA:
        try:
            import soundfile as sf
            data, sr = sf.read(file_path)
            duration = float(len(data) / sr)
            return {
                "duration": duration,
                "tempo": 120,
                "beats": [],
                "strong_beats": [],
                "segments": [],
                "total_beats": 0,
            }
        except Exception as e:
            logger.warning(f"Soundfile fallback failed: {e}")
            return {"duration": 0, "tempo": 120, "beats": [], "strong_beats": [], "segments": [], "total_beats": 0}

    try:
        y, sr = librosa.load(file_path, sr=None)
        duration = float(librosa.get_duration(y=y, sr=sr))
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units='time')
        beats = [float(t) for t in beat_frames]

        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
        beat_times = librosa.times_like(pulse, sr=sr)
        strong_beats = [float(beat_times[i]) for i in np.argsort(pulse)[-int(len(pulse) * 0.15):]]

        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        times = librosa.times_like(rms, sr=sr, hop_length=hop_length)
        segments = []
        for i in range(0, len(times) - 1, max(1, int(len(times) / 20))):
            end = min(i + max(1, int(len(times) / 20)), len(times))
            segments.append({
                "start": float(times[i]),
                "end": float(times[min(end, len(times) - 1)]),
                "energy": float(np.mean(rms[i:end])),
            })

        return {
            "duration": duration,
            "tempo": float(tempo),
            "beats": beats,
            "strong_beats": strong_beats,
            "segments": segments,
            "total_beats": len(beats),
        }
    except Exception as e:
        logger.error(f"Music analysis failed: {e}")
        return {"duration": 0, "tempo": 120, "beats": [], "strong_beats": [], "segments": [], "total_beats": 0}
