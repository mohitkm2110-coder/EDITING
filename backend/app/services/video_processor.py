import subprocess
import os
import logging
from typing import Optional
from .job_manager import update_job

logger = logging.getLogger(__name__)

STYLE_FILTERS = {
    "gaming": "eq=contrast=1.12:saturation=1.1:brightness=0.0",
    "viral": "eq=contrast=1.2:saturation=1.25:brightness=0.02",
    "cinematic": "eq=contrast=1.08:saturation=0.88:brightness=-0.04",
}


def get_video_info(file_path: str) -> dict:
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file_path]
    try:
        import json
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


def process_video(
    video_path: str,
    music_path: Optional[str],
    output_path: str,
    style: str,
    orig_vol: float = 0.7,
    music_vol: float = 0.5,
    job_id: Optional[str] = None,
):
    update_job(job_id, "processing", 0.1, "Building edit...")

    filter_str = STYLE_FILTERS.get(style, STYLE_FILTERS["gaming"])
    cmd = ["ffmpeg", "-y", "-i", video_path]

    music_input = music_path and os.path.exists(music_path)
    filter_parts = []

    if music_input:
        cmd.extend(["-i", music_path])
        filter_parts.append(
            f"[0:a]volume={orig_vol}[a0];"
            f"[1:a]volume={music_vol}[a1];"
            f"[a0][a1]amix=inputs=2:duration=first[aout]"
        )

    filter_parts.append(f"[0:v]{filter_str}[vout]")
    cmd.extend(["-filter_complex", ";".join(filter_parts)])
    cmd.extend(["-map", "[vout]"])
    cmd.extend(["-map", "[aout]"] if music_input else ["-map", "0:a"])
    cmd.extend(["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", output_path])

    update_job(job_id, "processing", 0.2, f"Running FFmpeg...")

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
                    info = get_video_info(video_path)
                    total = info["duration"]
                    progress = 0.2 + min(0.7, elapsed / total * 0.7) if total > 0 else 0.5
                    update_job(job_id, "processing", progress, f"Encoding: {parts}")
                except:
                    pass
        proc.wait()
        update_job(job_id, "completed" if proc.returncode == 0 else "failed", 1.0,
                   "Edit complete!" if proc.returncode == 0 else "FFmpeg failed")
    except Exception as e:
        logger.error(f"FFmpeg: {e}")
        update_job(job_id, "failed", 1.0, f"Error: {str(e)}")
