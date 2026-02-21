import asyncio
import io
import os
import random

import torch
from diffusers import QwenImageEditPlusPipeline
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from PIL import Image

pipeline: QwenImageEditPlusPipeline | None = None
gpu_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    model_path = os.environ.get("MODEL_PATH", "Qwen/Qwen-Image-Edit-2509")
    print(f"Loading pipeline from {model_path} ...")
    pipeline = QwenImageEditPlusPipeline.from_pretrained(
        model_path, torch_dtype=torch.bfloat16
    )
    pipeline.to("cuda")
    print("Pipeline ready.")
    yield
    pipeline = None


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


def _generate(
    images: list[Image.Image],
    prompt: str,
    seed: int,
    num_inference_steps: int,
    true_cfg_scale: float,
    width: int,
    height: int,
) -> bytes:
    generator = torch.manual_seed(seed)
    with torch.inference_mode():
        result = pipeline(
            image=images,
            prompt=prompt,
            negative_prompt=" ",
            generator=generator,
            true_cfg_scale=true_cfg_scale,
            num_inference_steps=num_inference_steps,
            width=width,
            height=height,
            num_images_per_prompt=1,
        )
    buf = io.BytesIO()
    result.images[0].save(buf, format="PNG")
    return buf.getvalue()


@app.post("/generate")
async def generate(
    prompt: str = Form(...),
    reference_image_1: UploadFile = File(...),
    reference_image_2: UploadFile = File(...),
    seed: int = Form(-1),
    num_inference_steps: int = Form(40),
    true_cfg_scale: float = Form(4.0),
    width: int = Form(1280),
    height: int = Form(720),
):
    bytes_1 = await reference_image_1.read()
    bytes_2 = await reference_image_2.read()
    image_1 = Image.open(io.BytesIO(bytes_1)).convert("RGB")
    image_2 = Image.open(io.BytesIO(bytes_2)).convert("RGB")

    if seed < 0:
        seed = random.randint(0, 2**32 - 1)

    async with gpu_lock:
        png_bytes = await asyncio.to_thread(
            _generate,
            [image_1, image_2],
            prompt,
            seed,
            num_inference_steps,
            true_cfg_scale,
            width,
            height,
        )

    return StreamingResponse(io.BytesIO(png_bytes), media_type="image/png")
