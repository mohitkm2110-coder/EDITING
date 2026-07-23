from pydantic import BaseModel, Field
from typing import Optional, List

class UploadResponse(BaseModel):
    filename: str
    url: str
    duration: float
    width: int
    height: int

class EditingOptions(BaseModel):
    auto_cut_boring_clips: bool = False
    auto_detect_highlights: bool = False
    auto_add_captions: bool = False
    auto_add_transitions: bool = False
    auto_add_effects: bool = False
    auto_zoom_effects: bool = False
    auto_beat_sync: bool = True
    ai_color_grading: bool = False
    music_sync: bool = False
    audio_enhancement: bool = False
    video_quality_enhancement: bool = False

class GenerateRequest(BaseModel):
    video_filename: str
    music_filename: Optional[str] = None
    music_offset: float = 0.0
    original_audio_volume: float = 0.7
    music_volume: float = 0.5
    options: EditingOptions = Field(default_factory=EditingOptions)
    grade_preset: str = "natural"
    grade_intensity: float = 0.5
    aspect_ratio: str = "original"

class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: float
    message: str

class EditPlan(BaseModel):
    original_duration: float
    music_duration: Optional[float]
    detected_moments: List[dict] = []
    detected_beats: List[dict] = []
    enabled_options: dict = {}
    planned_edits: List[dict] = []
    planned_effects: List[dict] = []
    planned_transitions: List[dict] = []
    color_grading: dict = {}
    audio_settings: dict = {}
    expected_final_duration: float
