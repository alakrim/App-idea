"""A4 screening, step 1: AudioSet tagging of clips in 1 s frames (PANNs CNN14, Cnn14_mAP=0.431).

Run, from the repo root, with the screening venv (see requirements.txt):
  .cache/venv-screen/bin/python -I scripts/sounds/screen/tag.py <labels.json> <requests.json>

labels.json   the AudioSet display names to keep for every frame. A name that is not in the 527-label
              list is an error, so a typo can never make a deny rule silently inert.
requests.json [{"input": "<f32 file>", "output": "<json file>"}]. The model loads once for all clips.
  input   mono float32 PCM at 32 kHz, written by scripts/sounds/screen-run.mjs with ffmpeg. Frame k is the
          samples [k * 32000, (k + 1) * 32000), so frame k covers second k of the clip.
  output  {"frameSeconds": 1, "frames": N, "labels": [...], "perFrame": [[p per label] per frame],
           "topClasses": [{"label", "max"}] for the 25 highest maxima over all 527 classes}

The checkpoint and the label CSV are read from $HOME/panns_data; the orchestrator sets HOME under .cache/
so nothing is written to the home directory. Missing files are an error: nothing is downloaded here.
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from panns_inference import AudioTagging
from panns_inference.config import labels as AUDIOSET_LABELS

SAMPLE_RATE = 32000
FRAME_SAMPLES = SAMPLE_RATE
BATCH_FRAMES = 64
TOP_CLASSES = 25
DECIMALS = 4


def main() -> None:
    labels_path, requests_path = sys.argv[1:3]
    with open(labels_path, encoding="utf-8") as handle:
        wanted = json.load(handle)
    known = {name: index for index, name in enumerate(AUDIOSET_LABELS)}
    unknown = [name for name in wanted if name not in known]
    if unknown:
        raise SystemExit(f"not AudioSet labels: {unknown}")
    wanted_index = np.array([known[name] for name in wanted], dtype=np.int64)
    with open(requests_path, encoding="utf-8") as handle:
        requests = json.load(handle)

    tagger = AudioTagging(checkpoint_path=_checkpoint_path(), device="cpu")
    model = tagger.model
    model.eval()
    for request in requests:
        result = tag_clip(model, request["input"], wanted, wanted_index)
        with open(request["output"], "w", encoding="utf-8") as handle:
            json.dump(result, handle)


def tag_clip(model, raw_path, wanted, wanted_index):
    samples = np.fromfile(raw_path, dtype=np.float32)
    frames = len(samples) // FRAME_SAMPLES
    if frames == 0:
        raise SystemExit(f"{raw_path}: clip shorter than one frame")
    frame_matrix = samples[: frames * FRAME_SAMPLES].reshape(frames, FRAME_SAMPLES)
    probs = np.zeros((frames, len(AUDIOSET_LABELS)), dtype=np.float32)
    with torch.no_grad():
        for start in range(0, frames, BATCH_FRAMES):
            batch = torch.from_numpy(np.ascontiguousarray(frame_matrix[start : start + BATCH_FRAMES]))
            out = model(batch, None)["clipwise_output"].cpu().numpy()
            probs[start : start + len(out)] = out

    maxima = probs.max(axis=0)
    top = np.argsort(-maxima)[:TOP_CLASSES]
    return {
        "frameSeconds": 1,
        "frames": frames,
        "labels": wanted,
        "perFrame": np.round(probs[:, wanted_index], DECIMALS).tolist(),
        "topClasses": [
            {"label": AUDIOSET_LABELS[i], "max": round(float(maxima[i]), DECIMALS)} for i in top
        ],
    }


def _checkpoint_path() -> str:
    path = Path(os.path.expanduser("~")) / "panns_data" / "Cnn14_mAP=0.431.pth"
    if not path.is_file() or path.stat().st_size < 300_000_000:
        raise SystemExit(f"missing checkpoint {path}; download it from zenodo record 3987831")
    return str(path)


if __name__ == "__main__":
    main()
