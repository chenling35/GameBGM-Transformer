"""
系统信息接口：根路由、状态检查、情感列表、设备检测、模型列表
"""
import sys
import subprocess
import json
import platform

from fastapi import APIRouter

from config import (
    BASE_DIR, EMO_DIR, MIDI_LIBRARY_DIR, DEMO_DIR,
    SOUNDFONT_PATH, FLUIDSYNTH_CMD,
    DEFAULT_WEIGHTS, DEFAULT_CONFIGS, EMOTION_MAP,
)
from tasks import active_tasks

router = APIRouter(tags=["系统"])


@router.get("/")
async def root():
    return {"message": "情感音乐生成系统 API v2.0", "status": "running"}


@router.get("/api/emotions")
async def get_emotions():
    return {
        "emotions": [
            {"id": k, "name": v["name"], "english": v["en"], "description": v["desc"]}
            for k, v in EMOTION_MAP.items()
        ]
    }


@router.get("/api/status")
async def check_status():
    library_stats = {}
    if MIDI_LIBRARY_DIR.exists():
        for emo in ["Q1", "Q2", "Q3", "Q4"]:
            library_stats[emo] = len(list(MIDI_LIBRARY_DIR.glob(f"*_{emo}_full.mid")))

    fluidsynth_ok = False
    try:
        result = subprocess.run([FLUIDSYNTH_CMD, "--version"], capture_output=True, timeout=5)
        fluidsynth_ok = result.returncode == 0
    except Exception:
        pass

    gpu_info = "未检测到"
    try:
        result = subprocess.run(
            [sys.executable, "-c",
             "import torch; print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else '无GPU')"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            gpu_info = result.stdout.strip()
    except Exception:
        pass

    weights_status = {}
    for key, path in DEFAULT_WEIGHTS.items():
        weights_status[key] = (EMO_DIR / path).exists()

    return {
        "status": "ok" if EMO_DIR.exists() else "error",
        "emo_disentanger": EMO_DIR.exists(),
        "midi_library": MIDI_LIBRARY_DIR.exists(),
        "midi_library_stats": library_stats,
        "demo_files": DEMO_DIR.exists() and any(DEMO_DIR.glob("*.mid")),
        "soundfont": SOUNDFONT_PATH.exists(),
        "fluidsynth": fluidsynth_ok,
        "gpu": gpu_info,
        "weights": weights_status,
        "configs": {k: (EMO_DIR / v).exists() for k, v in DEFAULT_CONFIGS.items()},
        "active_tasks": len([t for t in active_tasks.values() if t.status == "running"]),
    }


@router.get("/api/devices")
async def get_devices():
    """
    检测当前系统所有可用计算设备（CPU + GPU）
    三层检测策略：torch.cuda → nvidia-smi → 仅 CPU
    确保任何环境都能正确识别硬件
    """
    devices = []

    # ── CPU 信息 ──
    cpu_name = "CPU"
    if sys.platform == "win32":
        try:
            r = subprocess.run(
                ["wmic", "cpu", "get", "Name", "/value"],
                capture_output=True, text=True, timeout=5,
            )
            for line in r.stdout.strip().split("\n"):
                if line.strip().startswith("Name="):
                    cpu_name = line.strip().split("=", 1)[1].strip()
                    break
        except Exception:
            cpu_name = platform.processor() or "CPU"
    else:
        cpu_name = platform.processor() or platform.machine() or "CPU"

    devices.append({"id": "cpu", "name": cpu_name, "type": "CPU", "memory": None})

    # ── GPU 检测 ──
    gpu_found = False

    # 方法 1: 通过 torch.cuda（最准确，能拿到 CUDA 设备 ID）
    try:
        result = subprocess.run(
            [sys.executable, "-c", """
import torch, json
gpus = []
if torch.cuda.is_available():
    for i in range(torch.cuda.device_count()):
        props = torch.cuda.get_device_properties(i)
        gpus.append({
            "id": f"cuda:{i}",
            "name": props.name,
            "type": "CUDA",
            "memory": props.total_mem // (1024*1024),
        })
print(json.dumps(gpus))
"""],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0 and result.stdout.strip():
            gpus = json.loads(result.stdout.strip())
            if gpus:
                devices.extend(gpus)
                gpu_found = True
    except Exception:
        pass

    # 方法 2: 通过 nvidia-smi（兜底）
    if not gpu_found:
        try:
            nvsmi = subprocess.run(
                ["nvidia-smi", "--query-gpu=index,name,memory.total",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=10,
            )
            if nvsmi.returncode == 0 and nvsmi.stdout.strip():
                for line in nvsmi.stdout.strip().split("\n"):
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 3:
                        idx, name, mem = parts[0], parts[1], parts[2]
                        devices.append({
                            "id": f"cuda:{idx}",
                            "name": name,
                            "type": "CUDA",
                            "memory": int(float(mem)),
                        })
                        gpu_found = True
        except FileNotFoundError:
            pass
        except Exception:
            pass

    return {"devices": devices, "gpu_available": gpu_found}


@router.get("/api/models/midi_emotion")
async def list_midi_emotion_models():
    """
    扫描 midi-emotion/output/ 下可用的模型
    只返回包含 model.pt 的目录（真正能用于推理的模型）
    """
    output_dir = BASE_DIR / "midi-emotion" / "output"
    models = []

    if not output_dir.exists():
        return {"models": models}

    for d in sorted(output_dir.iterdir()):
        if not d.is_dir():
            continue
        model_file = d / "model.pt"
        if not model_file.exists():
            continue  # 没有 model.pt 的目录不可用，直接跳过
        size_mb = model_file.stat().st_size / (1024 * 1024)
        models.append({
            "id": d.name,
            "path": str(d),
            "size_mb": round(size_mb, 1),
        })

    return {"models": models}
