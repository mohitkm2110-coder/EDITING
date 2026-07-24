import subprocess
import os
import re
import json
import logging
import math
from typing import Optional
from .job_manager import update_job

logger = logging.getLogger(__name__)

STYLE_FILTERS = {
    "gaming": {"contrast": 1.12, "saturation": 1.1, "brightness": 0.0, "shake_intensity": 0.4, "flash_intensity": 0.15, "zoom_intensity": 0.3},
    "viral": {"contrast": 1.2, "saturation": 1.25, "brightness": 0.02, "shake_intensity": 0.6, "flash_intensity": 0.3, "zoom_intensity": 0.5},
    "cinematic": {"contrast": 1.08, "saturation": 0.88, "brightness": -0.04, "shake_intensity": 0.15, "flash_intensity": 0.05, "zoom_intensity": 0.15},
}

SHAKE_PATTERNS = {
    "gaming": {"x_amp": 4, "y_amp": 3, "freq": 3.0},
    "viral": {"x_amp": 7, "y_amp": 5, "freq": 4.0},
    "cinematic": {"x_amp": 2, "y_amp": 1, "freq": 1.5},
}


def get_video_info(file_path: str) -> dict:
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file_path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        data = json.loads(result.stdout)
        vs = next((s for s in data.get("streams", []) if s["codec_type"] == "video"), {})
        fps_str = vs.get("r_frame_rate", "30/1")
        try:
            num, den = fps_str.split("/")
            fps = float(num) / float(den)
        except:
            fps = 30
        return {
            "duration": float(data.get("format", {}).get("duration", 0)),
            "width": int(vs.get("width", 0)),
            "height": int(vs.get("height", 0)),
            "fps": fps,
        }
    except Exception as e:
        logger.error(f"FFprobe: {e}")
        return {"duration": 0, "width": 0, "height": 0, "fps": 30}


def detect_scenes(video_path: str, video_duration: float) -> list:
    """Detect scene changes using FFmpeg scene detection filter."""
    scenes = [0.0]
    try:
        cmd = [
            "ffmpeg", "-i", video_path,
            "-filter:v", "select='gt(scene,0.3)',showinfo",
            "-f", "null", "-",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        for line in result.stderr.split("\n"):
            m = re.search(r"pts_time:([\d.]+)", line)
            if m:
                t = float(m.group(1))
                if t > 0.5 and t < video_duration - 0.5:
                    scenes.append(t)
    except Exception as e:
        logger.warning(f"Scene detection failed: {e}")

    if len(scenes) < 2:
        num_fallback = max(2, min(16, int(video_duration / 2)))
        interval = video_duration / num_fallback
        scenes = [i * interval for i in range(num_fallback)]
    scenes.sort()
    if scenes[-1] < video_duration - 0.5:
        scenes.append(video_duration)
    return scenes


MAX_SEGMENTS = 24


def build_edit_segments(
    video_duration: float,
    video_fps: float,
    beats: list,
    strong_beats: set,
    beat_energies: list,
    beat_intervals: list,
    avg_beat_interval: float,
    scene_changes: list,
    style: str,
) -> list:
    style_cfg = STYLE_FILTERS.get(style, STYLE_FILTERS["gaming"])

    if not beats:
        num_seg = max(2, min(16, int(video_duration / 3)))
        seg_dur = video_duration / num_seg
        return [{
            "video_start": round(i * seg_dur, 3),
            "video_end": round((i + 1) * seg_dur, 3),
            "target_duration": round(seg_dur, 3),
            "speed": 1.0,
            "effect": "none",
            "beat_time": round(i * seg_dur, 3),
            "is_strong": False,
            "shake": 0.0,
            "zoom": 0.0,
            "energy": 0.0,
        } for i in range(num_seg)]

    # Group beats into MAX_SEGMENTS clusters, preserving strong beat positions
    num_beats = len(beats)
    if num_beats > MAX_SEGMENTS:
        # Pick the top strong beats + evenly spaced filler beats
        strong_indices = sorted([i for i, bt in enumerate(beats) if bt in strong_beats])
        filler_count = MAX_SEGMENTS - len(strong_indices)
        if filler_count < 0:
            strong_indices = strong_indices[:MAX_SEGMENTS]
            filler_count = 0
        filler_indices = []
        if filler_count > 0 and num_beats > len(strong_indices):
            step = max(1, (num_beats - 1) / (filler_count + 1))
            for k in range(filler_count):
                idx = min(int(step * (k + 1)), num_beats - 1)
                if idx not in strong_indices:
                    filler_indices.append(idx)
        selected = sorted(set(strong_indices + filler_indices))
        if len(selected) < 2:
            selected = [i * (num_beats - 1) // (MAX_SEGMENTS - 1) for i in range(min(MAX_SEGMENTS, num_beats))]
        beats_trimmed = [(i, beats[i]) for i in selected]
    else:
        beats_trimmed = list(enumerate(beats))

    segments = []
    scene_idx = 0

    for seg_idx, (beat_idx, beat_time) in enumerate(beats_trimmed):
        is_strong = beat_time in strong_beats
        energy = beat_energies[beat_idx] if beat_idx < len(beat_energies) else 0.5

        # Target duration = time until next beat (or music remaining)
        if seg_idx < len(beats_trimmed) - 1:
            target_dur = beats_trimmed[seg_idx + 1][1] - beat_time
        else:
            target_dur = max(beat_intervals[-1] if beat_intervals else avg_beat_interval, 0.5)
        target_dur = max(0.3, min(target_dur, 4.0))

        # Map this beat cluster to a video position
        beat_frac = beat_idx / max(num_beats - 1, 1)
        ideal_video_pos = beat_frac * video_duration

        while scene_idx < len(scene_changes) - 1 and scene_changes[scene_idx + 1] <= ideal_video_pos:
            scene_idx += 1

        scene_start = scene_changes[scene_idx] if scene_idx < len(scene_changes) else max(0, ideal_video_pos - 0.5)
        next_scene = scene_changes[scene_idx + 1] if scene_idx + 1 < len(scene_changes) else video_duration

        # Assign video portion proportional to segment's share
        is_last = seg_idx == len(beats_trimmed) - 1
        if is_last:
            video_end = video_duration
        else:
            next_beat_frac = beats_trimmed[seg_idx + 1][0] / max(num_beats - 1, 1)
            portion = (next_beat_frac - beat_frac) if next_beat_frac > beat_frac else 0.5 / max(num_beats, 1)
            portion = max(0.1, portion)
            video_end = min(scene_start + portion * video_duration, next_scene)

        video_start = scene_start
        min_dur = max(0.5, 2.0 / video_fps)
        if video_end - video_start < min_dur:
            video_end = min(video_start + min_dur, video_duration)

        video_dur = video_end - video_start
        speed = round(video_dur / max(target_dur, 0.1), 4)
        speed = max(0.25, min(speed, 4.0))

        # Effects based on beat strength
        shake_amount = 0.0
        zoom_amount = 0.0
        effect = "none"
        if is_strong or energy > 0.8:
            shake_amount = style_cfg["shake_intensity"]
            zoom_amount = style_cfg["zoom_intensity"]
            effect = "full"
        elif energy > 0.5:
            zoom_amount = style_cfg["zoom_intensity"] * 0.4
            effect = "subtle"

        segments.append({
            "video_start": round(video_start, 3),
            "video_end": round(video_end, 3),
            "target_duration": round(target_dur, 3),
            "speed": speed,
            "effect": effect,
            "beat_time": round(beat_time, 3),
            "is_strong": is_strong,
            "shake": round(shake_amount, 3),
            "zoom": round(zoom_amount, 3),
            "energy": round(float(energy), 4),
        })

    if segments:
        last = segments[-1]
        if last["video_end"] < video_duration - 0.5:
            remaining = video_duration - last["video_end"]
            segments.append({
                "video_start": round(last["video_end"], 3),
                "video_end": round(video_duration, 3),
                "target_duration": round(remaining, 3),
                "speed": 1.0,
                "effect": "none",
                "beat_time": round(last["beat_time"] + 1, 3),
                "is_strong": False,
                "shake": 0.0,
                "zoom": 0.0,
                "energy": 0.0,
            })

    return segments


def _build_segment_filter(
    seg: dict,
    idx: int,
    fps: float,
    w: int,
    h: int,
    style_conf: dict,
) -> str:
    vs = seg["video_start"]
    ve = seg["video_end"]
    speed = seg["speed"]
    shake = seg["shake"]
    zoom = seg["zoom"]

    contrast = style_conf["contrast"]
    saturation = style_conf["saturation"]
    brightness = style_conf["brightness"]

    chain = [
        f"trim=start={vs}:end={ve}",
        f"setpts=PTS/{speed}",
        f"eq=contrast={contrast}:saturation={saturation}:brightness={brightness}",
    ]

    if zoom > 0.01 and w > 0 and h > 0:
        zf = 1.0 + zoom * 0.3
        chain.append(f"scale=iw*{zf}:ih*{zf}:flags=lanczos,crop={w}:{h}:0:0")

    if shake > 0.01 and w > 0 and h > 0:
        sc = shake * 5.0
        freq = SHAKE_PATTERNS.get(style_conf.get("_style", "gaming"), SHAKE_PATTERNS["gaming"])["freq"]
        chain.append(f"crop={w}:{h}:iw/2-{w}/2+sin(t*{freq})*{sc}:ih/2-{h}/2+cos(t*{freq}*1.3)*{sc}")

    return f"[0:v]{','.join(chain)}[v{idx}]"


def process_video(
    video_path: str,
    music_path: Optional[str],
    output_path: str,
    style: str,
    orig_vol: float = 0.7,
    music_vol: float = 0.5,
    job_id: Optional[str] = None,
    music_analysis: Optional[dict] = None,
):
    update_job(job_id, "processing", 0.05, "Analyzing video scenes...")

    style_conf = STYLE_FILTERS.get(style, STYLE_FILTERS["gaming"]).copy()
    style_conf["_style"] = style

    # Video info
    info = get_video_info(video_path)
    video_duration = info["duration"]
    fps = info["fps"]
    w = info["width"]
    h = info["height"]

    update_job(job_id, "processing", 0.1, "Detecting scene changes...")
    scenes = detect_scenes(video_path, video_duration)
    update_job(job_id, "processing", 0.15, f"Found {len(scenes)} scenes, aligning with beats...")

    # Music analysis
    beats = music_analysis.get("beats", []) if music_analysis else []
    strong_beats = set(music_analysis.get("strong_beats", [])) if music_analysis else set()
    beat_energies = music_analysis.get("beat_energies", []) if music_analysis else []
    beat_intervals = music_analysis.get("beat_intervals", []) if music_analysis else []
    avg_beat_interval = music_analysis.get("avg_beat_interval", 0.5) if music_analysis else 0.5

    update_job(job_id, "processing", 0.2, f"Building edit plan ({len(beats)} beats)...")
    segments = build_edit_segments(
        video_duration, fps, beats, strong_beats, beat_energies,
        beat_intervals, avg_beat_interval, scenes, style,
    )

    update_job(job_id, "processing", 0.25, f"Editing {len(segments)} segments...")

    ffmpeg_cmd = ["ffmpeg", "-y", "-i", video_path]
    has_music = music_path and os.path.exists(music_path)
    if has_music:
        ffmpeg_cmd.extend(["-i", music_path])

    # Build filter graph
    filter_parts = []
    for i, seg in enumerate(segments):
        seg_filter = _build_segment_filter(seg, i, fps, w, h, style_conf)
        filter_parts.append(seg_filter)

    # Concat all video segments
    n = len(segments)
    concat_labels = "".join(f"[v{i}]" for i in range(n))
    concat_filter = f"{concat_labels}concat=n={n}:v=1:a=0[outv]"
    filter_parts.append(concat_filter)

    # Audio mixing
    if has_music:
        filter_parts.append(f"[0:a]volume={orig_vol}[a0]")
        filter_parts.append(f"[1:a]volume={music_vol}[a1]")
        filter_parts.append("[a0][a1]amix=inputs=2:duration=first[aout]")

    filter_graph = ";".join(filter_parts)

    ffmpeg_cmd.extend(["-filter_complex", filter_graph])
    ffmpeg_cmd.extend(["-map", "[outv]"])
    if has_music:
        ffmpeg_cmd.extend(["-map", "[aout]"])
    else:
        ffmpeg_cmd.extend(["-map", "0:a"])
    ffmpeg_cmd.extend(["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", output_path])

    update_job(job_id, "processing", 0.3, "Starting FFmpeg beat-sync encoding...")

    try:
        proc = subprocess.Popen(
            ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            universal_newlines=True, creationflags=subprocess.CREATE_NO_WINDOW,
        )
        last_err = ""
        for line in proc.stdout:
            logger.debug(line.rstrip())
            if "error" in line.lower() or "fail" in line.lower() or "invalid" in line.lower():
                last_err = line.rstrip()
            if "time=" in line and job_id:
                try:
                    m = re.search(r"time=(\d+):(\d+):([\d.]+)", line)
                    if m:
                        elapsed = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
                        total = video_duration
                        progress = 0.3 + min(0.65, elapsed / max(total, 1) * 0.65) if total > 0 else 0.5
                        update_job(job_id, "processing", progress, f"Beat-sync encoding: {elapsed:.1f}s / {total:.1f}s")
                except:
                    pass
        proc.wait()
        if proc.returncode == 0:
            update_job(job_id, "completed", 1.0, "Beat-synced edit complete!")
        else:
            msg = f"FFmpeg failed: {last_err[:300]}" if last_err else "FFmpeg processing failed"
            logger.error(f"FFmpeg error (rc={proc.returncode}): {last_err}")
            update_job(job_id, "failed", 1.0, msg)
    except Exception as e:
        logger.error(f"Beat-sync FFmpeg error: {e}")
        update_job(job_id, "failed", 1.0, f"Error: {str(e)}")
