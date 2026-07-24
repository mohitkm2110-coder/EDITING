import logging

logger = logging.getLogger(__name__)

try:
    import librosa
    import numpy as np
    HAS_LIBROSA = True
except ImportError:
    HAS_LIBROSA = False
    logger.warning("librosa not installed — music analysis disabled")


def detect_drop_sections(onset_env, sr, beat_times, total_duration):
    """Find drop/chorus sections — sustained high-energy regions."""
    if len(onset_env) < 10:
        return []
    smoothed = np.convolve(onset_env, np.ones(15) / 15, mode="same")
    threshold = np.mean(smoothed) + 0.5 * np.std(smoothed)
    above = np.where(smoothed > threshold)[0]
    if len(above) == 0:
        return []
    groups = []
    start = above[0]
    for i in range(1, len(above)):
        if above[i] - above[i - 1] > 20:
            groups.append((start, above[i - 1]))
            start = above[i]
    groups.append((start, above[-1]))
    times = librosa.times_like(onset_env, sr=sr)
    drops = []
    for gs, ge in groups:
        t_start = float(times[gs])
        t_end = float(times[ge])
        energy = float(np.median(onset_env[gs:ge + 1]))
        drops.append({"start": t_start, "end": t_end, "energy": energy})
    return drops


def analyze_music(file_path: str) -> dict:
    if not HAS_LIBROSA:
        try:
            import soundfile as sf
            data, sr = sf.read(file_path)
            duration = float(len(data) / sr)
            num_beats = max(1, int(duration / 0.5))
            beats = [i * 0.5 for i in range(num_beats)]
            return {
                "duration": duration, "tempo": 120,
                "beats": beats, "strong_beats": [],
                "beat_energies": [0.5] * len(beats),
                "onset_times": [], "onset_strengths": [],
                "drops": [], "segments": [], "total_beats": len(beats),
                "beat_intervals": [0.5] * len(beats),
                "avg_beat_interval": 0.5,
            }
        except Exception as e:
            logger.warning(f"Soundfile fallback failed: {e}")
            return {"duration": 0, "tempo": 120, "beats": [], "strong_beats": [], "beat_energies": [], "onset_times": [], "onset_strengths": [], "drops": [], "segments": [], "total_beats": 0, "beat_intervals": [], "avg_beat_interval": 0.5}

    try:
        y, sr = librosa.load(file_path, sr=None)
        duration = float(librosa.get_duration(y=y, sr=sr))
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units='time')
        beats = [float(t) for t in beat_frames]
        total_beats = len(beats)

        # Onset strength envelope
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_times = librosa.times_like(onset_env, sr=sr)

        # Per-beat energy — how much audio energy each beat carries
        onset_bpms = librosa.frames_to_time(librosa.onset.onset_detect(y=y, sr=sr, units="frames"), sr=sr)
        beat_energies = []
        for i, bt in enumerate(beats):
            window_start = bt - 0.1
            window_end = bt + 0.15
            mask = (onset_times >= window_start) & (onset_times <= window_end)
            energy = float(np.mean(onset_env[mask])) if np.any(mask) else 0.0
            beat_energies.append(energy)

        # Strong beats — top 25% by energy, plus onset coincidence
        if beat_energies:
            threshold = np.percentile(beat_energies, 75) if len(beat_energies) > 3 else (max(beat_energies) * 0.6 if max(beat_energies) > 0 else 0.5)
        else:
            threshold = 0.5
        strong_indices = [i for i, e in enumerate(beat_energies) if e >= threshold]
        strong_beats = [beats[i] for i in strong_indices if i < len(beats)]

        # Fallback: if no strong beats detected, use PLP
        if len(strong_beats) < max(2, total_beats // 10):
            pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
            pulse_times = librosa.times_like(pulse, sr=sr)
            top_n = max(3, int(len(pulse_times) * 0.12))
            sorted_idx = np.argsort(pulse)[-top_n:]
            strong_beats = sorted(set(
                [float(pulse_times[i]) for i in sorted_idx] +
                [beats[i] for i in range(0, len(beats), 4)]
            ))

        # Beat intervals (time between consecutive beats)
        beat_intervals = []
        for i in range(1, len(beats)):
            beat_intervals.append(beats[i] - beats[i - 1])
        if not beat_intervals:
            beat_intervals = [60.0 / max(tempo, 1)] * max(1, total_beats)
        avg_beat_interval = float(np.mean(beat_intervals)) if beat_intervals else 0.5

        # Drop sections
        drops = detect_drop_sections(onset_env, sr, beats, duration)

        # Energy segments
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        rms_times = librosa.times_like(rms, sr=sr, hop_length=hop_length)
        segments = []
        num_segs = max(4, min(32, int(duration / 2)))
        seg_size = max(1, len(rms_times) // num_segs)
        for i in range(0, len(rms_times), seg_size):
            end = min(i + seg_size, len(rms_times))
            segments.append({
                "start": float(rms_times[i]),
                "end": float(rms_times[min(end, len(rms_times) - 1)]),
                "energy": float(np.mean(rms[i:end])),
            })

        return {
            "duration": duration,
            "tempo": float(tempo),
            "beats": beats,
            "strong_beats": strong_beats,
            "beat_energies": [float(e) for e in beat_energies],
            "onset_times": [float(t) for t in onset_times],
            "onset_strengths": [float(s) for s in onset_env],
            "drops": drops,
            "segments": segments,
            "total_beats": total_beats,
            "beat_intervals": [float(i) for i in beat_intervals],
            "avg_beat_interval": float(avg_beat_interval),
        }
    except Exception as e:
        logger.error(f"Music analysis failed: {e}")
        return {"duration": 0, "tempo": 120, "beats": [], "strong_beats": [], "beat_energies": [], "onset_times": [], "onset_strengths": [], "drops": [], "segments": [], "total_beats": 0, "beat_intervals": [], "avg_beat_interval": 0.5}
