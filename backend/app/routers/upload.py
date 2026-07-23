import os
import uuid
import aiofiles
from fastapi import APIRouter, UploadFile, File, HTTPException
from ..models.schemas import UploadResponse
from ..services.video_processor import get_video_info

router = APIRouter(prefix="/api", tags=["upload"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_VIDEO = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
ALLOWED_AUDIO = {".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma"}
MAX_SIZE = 2 * 1024 * 1024 * 1024  # 2GB


@router.post("/upload-video", response_model=UploadResponse)
async def upload_video(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "video.mp4")[1].lower()
    if ext not in ALLOWED_VIDEO:
        raise HTTPException(400, f"Unsupported video format: {ext}. Use {', '.join(ALLOWED_VIDEO)}")

    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    async with aiofiles.open(filepath, "wb") as f:
        while chunk := await file.read(8 * 1024 * 1024):
            await f.write(chunk)

    info = get_video_info(filepath)
    return UploadResponse(
        filename=filename,
        url=f"/api/media/{filename}",
        duration=info["duration"],
        width=info["width"],
        height=info["height"],
    )


@router.post("/upload-music", response_model=UploadResponse)
async def upload_music(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "music.mp3")[1].lower()
    if ext not in ALLOWED_AUDIO:
        raise HTTPException(400, f"Unsupported audio format: {ext}. Use {', '.join(ALLOWED_AUDIO)}")

    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    async with aiofiles.open(filepath, "wb") as f:
        while chunk := await file.read(8 * 1024 * 1024):
            await f.write(chunk)

    import soundfile as sf
    data, sr = sf.read(filepath)
    duration = float(len(data) / sr)

    return UploadResponse(
        filename=filename,
        url=f"/api/media/{filename}",
        duration=duration,
        width=0,
        height=0,
    )
