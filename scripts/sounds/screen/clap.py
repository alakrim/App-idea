"""A4 screening, step 2 (re-rank): CLAP text-audio similarity (laion/clap-htsat-unfused).

Run, from the repo root, with the screening venv (see requirements.txt):
  .cache/venv-screen/bin/python -I scripts/sounds/screen/clap.py <requests.json> <output.json>

requests.json  [{"id": "<freesound id>", "audio": "<preview .mp3>", "startSeconds": n, "lengthSeconds": n,
                 "prompt": "<text>"}]
output.json    {"scores": {"<id>": cosine similarity}}

Each window is decoded here with ffmpeg (48 kHz mono), cut into 10 s chunks, embedded, averaged and
compared with the prompt. The model is read from the Hugging Face cache under .cache/ (HF_HOME, set by the
orchestrator); it is downloaded there on first use and never written anywhere else.
"""

import json
import os
import subprocess
import sys

import numpy as np
import torch
from transformers import ClapModel, ClapProcessor

SAMPLE_RATE = 48000
CHUNK_SECONDS = 10
MODEL_ID = "laion/clap-htsat-unfused"


def decode_window(path: str, start: float, length: float) -> np.ndarray:
    args = [
        os.environ.get("FFMPEG_PATH", "ffmpeg"),
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{length:.3f}",
        "-i",
        path,
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-f",
        "f32le",
        "-",
    ]
    done = subprocess.run(args, capture_output=True, check=True)
    return np.frombuffer(done.stdout, dtype=np.float32).copy()


def main() -> None:
    requests_path, out_path = sys.argv[1:3]
    with open(requests_path, encoding="utf-8") as handle:
        requests = json.load(handle)

    processor = ClapProcessor.from_pretrained(MODEL_ID, cache_dir=os.environ.get("HF_HOME"))
    model = ClapModel.from_pretrained(MODEL_ID, cache_dir=os.environ.get("HF_HOME"))
    model.eval()

    scores: dict[str, float] = {}
    text_cache: dict[str, np.ndarray] = {}
    with torch.no_grad():
        for request in requests:
            prompt = request["prompt"]
            if prompt not in text_cache:
                tokens = processor(text=[prompt], return_tensors="pt", padding=True)
                text = model.get_text_features(**tokens)[0].numpy()
                text_cache[prompt] = text / np.linalg.norm(text)

            audio = decode_window(request["audio"], request["startSeconds"], request["lengthSeconds"])
            chunk = CHUNK_SECONDS * SAMPLE_RATE
            chunks = [audio[i : i + chunk] for i in range(0, len(audio) - chunk + 1, chunk)]
            if not chunks:
                raise SystemExit(f"window for {request['id']} is shorter than one chunk")
            inputs = processor(audio=chunks, sampling_rate=SAMPLE_RATE, return_tensors="pt")
            embeddings = model.get_audio_features(**inputs).numpy()
            embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
            mean = embeddings.mean(axis=0)
            mean = mean / np.linalg.norm(mean)
            scores[str(request["id"])] = round(float(mean @ text_cache[prompt]), 4)

    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump({"scores": scores}, handle)


if __name__ == "__main__":
    main()
