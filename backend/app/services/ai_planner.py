import json
import logging
import os
from typing import Optional
from ..models.schemas import EditingOptions, EditPlan

logger = logging.getLogger(__name__)

QWEN_API_KEY = os.getenv("QWEN_API_KEY", "")
QWEN_API_URL = os.getenv("QWEN_API_URL", "https://api.qwen.ai/v1/chat/completions")

SYSTEM_PROMPT = """You are Qwen 3, the AI editing brain for Deep Wave video editor.
Generate a structured JSON editing plan based on video analysis and user options.
Never modify footage unless explicitly enabled. Return ONLY valid JSON."""

async def generate_edit_plan(
    video_info: dict,
    music_analysis: Optional[dict],
    options: EditingOptions,
    grade_preset: str = "natural",
    grade_intensity: float = 0.5,
) -> EditPlan:
    prompt = {
        "video": video_info,
        "music": music_analysis,
        "options": options.model_dump(),
        "grade": {"preset": grade_preset, "intensity": grade_intensity},
    }

    if QWEN_API_KEY:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    QWEN_API_URL,
                    headers={"Authorization": f"Bearer {QWEN_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "qwen3-72b",
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": json.dumps(prompt)},
                        ],
                        "response_format": {"type": "json_object"},
                    },
                )
                data = resp.json()
                plan_data = json.loads(data["choices"][0]["message"]["content"])
                return EditPlan(**plan_data)
        except Exception as e:
            logger.warning(f"Qwen API call failed, using fallback: {e}")

    return _fallback_plan(video_info, music_analysis, options, grade_preset, grade_intensity)


def _fallback_plan(
    video_info: dict,
    music_analysis: Optional[dict],
    options: EditingOptions,
    grade_preset: str,
    grade_intensity: float,
) -> EditPlan:
    duration = video_info.get("duration", 0)
    music_duration = music_analysis.get("duration") if music_analysis else None
    beats = music_analysis.get("beats", []) if music_analysis else []

    return EditPlan(
        original_duration=duration,
        music_duration=music_duration,
        detected_moments=video_info.get("moments", []),
        detected_beats=[{"time": b, "strong": b in music_analysis.get("strong_beats", [])} for b in beats] if beats else [],
        enabled_options=options.model_dump(),
        planned_edits=[],
        planned_effects=[],
        planned_transitions=[],
        color_grading={"preset": grade_preset, "intensity": grade_intensity} if options.ai_color_grading else {},
        audio_settings={
            "original_volume": 0.7,
            "music_volume": 0.5,
            "use_music": music_analysis is not None,
        },
        expected_final_duration=duration,
    )
