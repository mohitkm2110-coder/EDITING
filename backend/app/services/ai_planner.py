import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

STYLE_PRESETS = {
    "gaming": {
        "label": "Gaming",
        "color_grade": {"contrast": 1.12, "saturation": 1.1, "brightness": 0.0},
        "effects": {"shake": "subtle", "zoom": "clean"},
        "transition_speed": "fast",
        "beat_sync_intensity": 0.7,
        "highlight_threshold": 0.6,
    },
    "viral": {
        "label": "Viral",
        "color_grade": {"contrast": 1.2, "saturation": 1.25, "brightness": 0.02},
        "effects": {"shake": "moderate", "zoom": "dynamic"},
        "transition_speed": "fast",
        "beat_sync_intensity": 0.9,
        "highlight_threshold": 0.4,
    },
    "cinematic": {
        "label": "Cinematic",
        "color_grade": {"contrast": 1.08, "saturation": 0.88, "brightness": -0.04},
        "effects": {"shake": "minimal", "zoom": "slow"},
        "transition_speed": "slow",
        "beat_sync_intensity": 0.5,
        "highlight_threshold": 0.7,
    },
}


def get_style_config(style: str) -> dict:
    return STYLE_PRESETS.get(style, STYLE_PRESETS["gaming"])


async def generate_edit_plan(
    video_info: dict,
    music_analysis: Optional[dict],
    style: str,
) -> dict:
    style_cfg = get_style_config(style)
    beats = music_analysis.get("beats", []) if music_analysis else []
    strong_beats = music_analysis.get("strong_beats", []) if music_analysis else []
    tempo = music_analysis.get("tempo", 120) if music_analysis else 120
    drops = music_analysis.get("drops", []) if music_analysis else []
    bpm = music_analysis.get("beat_intervals", [0.5]) if music_analysis else [0.5]

    # Build a preview of beat-aligned segments for the frontend
    beat_moments = []
    for i, bt in enumerate(beats[:40]):
        is_strong = bt in strong_beats
        beat_moments.append({
            "beat_num": i + 1,
            "time": round(bt, 2),
            "strong": is_strong,
            "effect": "zoom+shake" if is_strong else ("subtle_zoom" if (i % 2 == 0) else "none"),
        })

    plan = {
        "original_duration": video_info.get("duration", 0),
        "music_duration": music_analysis.get("duration") if music_analysis else None,
        "style": style,
        "style_config": style_cfg,
        "tempo": tempo,
        "total_beats": len(beats),
        "strong_beat_count": len(strong_beats),
        "drops": drops,
        "beat_moments": beat_moments,
        "total_segments": min(max(len(beats), 1), 24),
        "expected_final_duration": round(
            (beats[-1] + beats[-1] - beats[-2]) if len(beats) >= 2 else 0, 1
        ) if len(beats) >= 2 else video_info.get("duration", 0),
        "audio": {
            "mix": "balanced",
            "original_volume": 0.3,
            "music_volume": 0.7,
        },
        "beat_sync": {
            "method": "scene_detect + time_stretch + concat",
            "segments_aligned": min(len(beats), 100),
            "strong_beats_aligned": len(strong_beats),
        },
    }

    qwen_key = os.getenv("QWEN_API_KEY")
    if qwen_key:
        try:
            import httpx
            prompt = json.dumps({
                "task": "Generate a video editing plan with precise beat sync",
                "video": video_info,
                "music": music_analysis,
                "style": style,
                "style_config": style_cfg,
            })
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    os.getenv("QWEN_API_URL", "https://api.qwen.ai/v1/chat/completions"),
                    headers={"Authorization": f"Bearer {qwen_key}", "Content-Type": "application/json"},
                    json={
                        "model": "qwen3-72b",
                        "messages": [
                            {"role": "system", "content": "You are the AI brain of Deep Wave. Output a precise JSON editing plan with beat-aligned segments."},
                            {"role": "user", "content": prompt},
                        ],
                        "response_format": {"type": "json_object"},
                    },
                )
                data = resp.json()
                llm_plan = json.loads(data["choices"][0]["message"]["content"])
                plan.update(llm_plan)
        except Exception as e:
            logger.warning(f"Qwen API failed, using preset plan: {e}")

    return plan
