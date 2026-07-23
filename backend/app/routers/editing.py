import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from ..models.schemas import GenerateRequest, JobStatus
from ..services.music_analyzer import analyze_music
from ..services.ai_planner import generate_edit_plan
from ..services.video_processor import get_video_info, process_video
from ..services.job_manager import create_job, get_job, run_in_background

router = APIRouter(prefix="/api", tags=["editing"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"))
EXPORT_DIR = os.getenv("EXPORT_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "exports"))
os.makedirs(EXPORT_DIR, exist_ok=True)


@router.post("/generate", response_model=dict)
async def generate_edit(req: GenerateRequest):
    video_path = os.path.join(UPLOAD_DIR, req.video_filename)
    if not os.path.exists(video_path):
        raise HTTPException(404, "Video file not found. Upload first.")

    music_path = None
    music_analysis = None
    if req.music_filename:
        music_path = os.path.join(UPLOAD_DIR, req.music_filename)
        if not os.path.exists(music_path):
            raise HTTPException(404, "Music file not found.")
        music_analysis = analyze_music(music_path)

    video_info = get_video_info(video_path)
    video_info["moments"] = []  # Placeholder for AI-detected moments

    plan = await generate_edit_plan(
        video_info=video_info,
        music_analysis=music_analysis,
        options=req.options,
        grade_preset=req.grade_preset,
        grade_intensity=req.grade_intensity,
    )

    job_id = create_job()
    output_filename = f"{job_id}.mp4"
    output_path = os.path.join(EXPORT_DIR, output_filename)

    run_in_background(
        target=process_video,
        job_id=job_id,
        video_path=video_path,
        music_path=music_path,
        output_path=output_path,
        plan=plan,
        options=req.options,
    )

    return {"job_id": job_id, "plan": plan.model_dump()}


@router.get("/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/download/{filename}")
async def download(filename: str):
    filepath = os.path.join(EXPORT_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "File not found or not ready yet")
    return FileResponse(filepath, media_type="video/mp4", filename="deepwave-edit.mp4")
