# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Video generation backend: Gemini prompt-refiner -> Veo -> poll -> serve mp4.

Run:
    pip install fastapi uvicorn google-genai
    export GEMINI_API_KEY="..."
    uvicorn server:app --reload --port 8000

Why this exists: Veo returns a long-running *operation*, not a video. The
frontend must (1) start a job, (2) poll for status, (3) play the finished file.
The API key stays on the server and is never exposed to the browser.
"""

import os
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import FileResponse
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

VEO_MODEL = os.environ.get("VEO_MODEL", "veo-3.0-fast-generate-001")
REFINER_MODEL = os.environ.get("REFINER_MODEL", "gemini-2.5-flash")
OUT_DIR = Path(os.environ.get("VIDEO_OUT_DIR", "./generated_videos"))
OUT_DIR.mkdir(parents=True, exist_ok=True)
POLL_SECONDS = 10
TIMEOUT_SECONDS = 600

client = genai.Client()  # reads GEMINI_API_KEY from the environment
app = FastAPI(title="Video Generator")

# In-memory job store. Swap for Redis/DB when the platform scales past one process.
JOBS: dict[str, dict] = {}

REFINER_SYSTEM = """You are the prompt moderator and director for a video generation model.
Rewrite the user's idea as one vivid, concrete video prompt: subject, action, setting,
camera movement, lighting, style, and (optionally) audio/ambience. Keep it under 120 words.
Do not add real people's likenesses, logos, or copyrighted characters.
If the idea is unsafe (sexual content involving minors, graphic violence, harassment,
real-person deepfakes) reply with exactly: REFUSE: <short, kind reason>.
Reply with the prompt only, no preamble."""


class VideoRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    aspect_ratio: Literal["16:9", "9:16"] = "16:9"
    refine: bool = True  # let Gemini sharpen + moderate the prompt first


def refine_prompt(raw: str) -> str:
    resp = client.models.generate_content(
        model=REFINER_MODEL,
        contents=raw,
        config=types.GenerateContentConfig(system_instruction=REFINER_SYSTEM),
    )
    return (resp.text or raw).strip()


def run_job(job_id: str, req: VideoRequest) -> None:
    job = JOBS[job_id]
    try:
        prompt = req.prompt
        if req.refine:
            job["status"] = "refining"
            prompt = refine_prompt(req.prompt)
            if prompt.startswith("REFUSE:"):
                job.update(status="refused", error=prompt.removeprefix("REFUSE:").strip())
                return
        job["final_prompt"] = prompt

        job["status"] = "generating"
        operation = client.models.generate_videos(
            model=VEO_MODEL,
            prompt=prompt,
            config=types.GenerateVideosConfig(aspect_ratio=req.aspect_ratio),
        )

        # THE step most front-ends miss: poll until the operation is done.
        started = time.monotonic()
        while not operation.done:
            if time.monotonic() - started > TIMEOUT_SECONDS:
                raise TimeoutError("Video generation timed out")
            time.sleep(POLL_SECONDS)
            operation = client.operations.get(operation)

        if operation.error:
            raise RuntimeError(str(operation.error))
        videos = getattr(operation.response, "generated_videos", None)
        if not videos:
            # Usually a safety filter on the prompt or output.
            reasons = getattr(operation.response, "rai_media_filtered_reasons", None)
            raise RuntimeError(
                "No video returned (blocked by safety filters: "
                f"{'; '.join(reasons)})" if reasons else "No video returned"
            )

        job["status"] = "downloading"
        video = videos[0]
        client.files.download(file=video.video)
        path = OUT_DIR / f"{job_id}.mp4"
        video.video.save(str(path))
        job.update(status="done", file=str(path))
    except Exception as exc:  # surface any failure to the UI instead of hanging
        job.update(status="error", error=str(exc))


@app.post("/api/video")
def create_video(req: VideoRequest, background: BackgroundTasks):
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"status": "queued", "error": None, "final_prompt": None}
    background.add_task(run_job, job_id, req)  # sync fn -> runs in threadpool
    return {"id": job_id}


@app.get("/api/video/{job_id}")
def video_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job")
    return {
        "id": job_id,
        "status": job["status"],
        "error": job["error"],
        "final_prompt": job["final_prompt"],
        "url": f"/api/video/{job_id}/file" if job["status"] == "done" else None,
    }


@app.get("/api/video/{job_id}/file")
def video_file(job_id: str):
    job = JOBS.get(job_id)
    if not job or job["status"] != "done":
        raise HTTPException(404, "Video not ready")
    return FileResponse(job["file"], media_type="video/mp4")
