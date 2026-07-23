from pydantic import BaseModel
from typing import Optional

class UploadResponse(BaseModel):
    filename: str
    url: str
    duration: float
    width: int
    height: int

class GenerateRequest(BaseModel):
    video_filename: str
    music_filename: Optional[str] = None
    music_offset: float = 0.0
    original_audio_volume: float = 0.7
    music_volume: float = 0.5
    style: str = "gaming"

class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: float
    message: str
