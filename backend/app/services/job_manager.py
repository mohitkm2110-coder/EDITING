import uuid
import threading
import logging
from typing import Dict, Optional
from ..models.schemas import JobStatus

logger = logging.getLogger(__name__)

jobs: Dict[str, JobStatus] = {}
_lock = threading.Lock()


def create_job() -> str:
    job_id = str(uuid.uuid4())
    with _lock:
        jobs[job_id] = JobStatus(job_id=job_id, status="queued", progress=0.0, message="Job queued")
    return job_id


def update_job(job_id: str, status: str, progress: float, message: str):
    with _lock:
        if job_id in jobs:
            jobs[job_id] = JobStatus(job_id=job_id, status=status, progress=progress, message=message)


def get_job(job_id: str) -> Optional[JobStatus]:
    with _lock:
        return jobs.get(job_id)


def run_in_background(target, **kwargs):
    job_id = kwargs.get("job_id")
    if job_id:
        update_job(job_id, "processing", 0.05, "Starting processing...")

    def wrapper():
        try:
            target(**kwargs)
        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}")
            if job_id:
                update_job(job_id, "failed", 1.0, f"Failed: {str(e)}")

    thread = threading.Thread(target=wrapper, daemon=True)
    thread.start()
