import subprocess
import os
import json
import logging
from typing import Optional
from ..models.schemas import EditPlan, EditingOptions
from .job_manager import update_job

logger = logging.getLogger(__name__)

def get_video_info(file_path: str) -> dict:
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", file_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        video_stream = next((s for s in streams if s["codec_type"] == "video"), {})
        return {
            "duration": float(data.get("format", {}).get("duration", 0)),
            "width": int(video_stream.get("width", 0)),
            "height": int(video_stream.get("height", 0)),
            "codec": video_stream.get("codec_name", "h264"),
            "fps": eval(video_stream.get("r_frame_rate", "30/1")) if isinstance(video_stream.get("r_frame_rate"), str) else 30,
        }
    except Exception as e:
        logger.error(f"FFprobe failed: {e}")
        return {"duration": 0, "width": 0, "height": 0, "codec": "h264", "fps": 30}


def process_video(
    video_path: str,
    music_path: Optional[str],
    output_path: str,
    plan: EditPlan,
    options: EditingOptions,
    job_id: Optional[str] = None,
):
    update_job(job_id, "processing", 0.1, "Building FFmpeg command...")

    filters = []
    audio_inputs = []
    filter_complex_parts = []

    # Color grading via FFmpeg curves/eq filter
    if options.ai_color_grading:
        grade = plan.color_grading
        preset = grade.get("preset", "natural")
        intensity = grade.get("intensity", 0.5)
        if preset == "gaming":
            filters.extend([f"eq=contrast={1.0 + 0.15 * intensity}:brightness={0.0}:saturation={1.0 + 0.1 * intensity}"])
        elif preset == "cinematic":
            filters.extend([f"eq=contrast={1.0 + 0.08 * intensity}:brightness={-0.04 * intensity}:saturation={1.0 - 0.1 * intensity}"])
        elif preset == "viral":
            filters.extend([f"eq=contrast={1.0 + 0.2 * intensity}:brightness={0.02 * intensity}:saturation={1.0 + 0.2 * intensity}"])

    # Beat-sync effects via detected moments (rendered as drawtext/overlay)
    if options.auto_beat_sync and plan.detected_moments:
        pass  # Effect overlay handled externally or via complex filter script

    filter_str = ",".join(filters) if filters else "null"

    cmd = ["ffmpeg", "-y", "-i", video_path]

    if music_path and os.path.exists(music_path):
        audio_inputs.extend(["-i", music_path])
        # Mix original audio with music
        amix_parts = "[0:a]"
        music_label = "[1:a]"
        ac = f"[0:a]volume={options.original_audio_volume or 0.7}[a0];"
        ac += f"{music_label}volume={options.music_volume or 0.5}[a1];"
        ac += "[a0][a1]amix=inputs=2:duration=first[aout]"
        filter_complex_parts.append(ac)

    update_job(job_id, "processing", 0.2, "Applying video filters...")

    if filter_str != "null":
        filter_complex_parts.append(f"[0:v]{filter_str}[vout]")
    else:
        filter_complex_parts.append("[0:v]copy[vout]")

    if filter_complex_parts:
        cmd.extend(["-filter_complex", ";".join(filter_complex_parts)])

    if audio_inputs:
        cmd.extend(["-map", "[vout]", "-map", "[aout]"])
    else:
        cmd.extend(["-map", "[vout]", "-map", "0:a"])

    cmd.extend(["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", output_path])

    update_job(job_id, "processing", 0.3, f"Running: {' '.join(cmd[:6])}...")

    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            universal_newlines=True, creationflags=subprocess.CREATE_NO_WINDOW,
        )
        for line in proc.stdout:
            if "time=" in line and job_id:
                try:
                    parts = line.split("time=")[1].split()[0]
                    h, m, s = parts.split(":")
                    elapsed = int(h) * 3600 + int(m) * 60 + float(s)
                    total = plan.original_duration
                    progress = 0.3 + min(0.6, elapsed / total * 0.6) if total > 0 else 0.5
                    update_job(job_id, "processing", progress, f"Encoding: {parts}")
                except:
                    pass
        proc.wait()
        if proc.returncode == 0:
            update_job(job_id, "completed", 1.0, "Edit complete!")
        else:
            update_job(job_id, "failed", 1.0, "FFmpeg processing failed")
    except Exception as e:
        logger.error(f"FFmpeg error: {e}")
        update_job(job_id, "failed", 1.0, f"FFmpeg error: {str(e)}")
