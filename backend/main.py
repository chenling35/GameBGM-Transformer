"""
情感音乐生成系统 - FastAPI 后端
支持真实模型推理、训练管理和文件播放
"""
import os
import sys
import uuid
import shutil
import subprocess
import threading
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ═══════════════ 路径配置 ═══════════════
BASE_DIR = Path(__file__).resolve().parent.parent
EMO_DIR = BASE_DIR / "EMO-Disentanger"
GENERATION_DIR = EMO_DIR / "generation"
MIDI_LIBRARY_DIR = GENERATION_DIR / "emopia_functional_two"
DEMO_DIR = GENERATION_DIR / "demo" / "demo"
ASSETS_DIR = BASE_DIR / "assets"
SOUNDFONT_PATH = ASSETS_DIR / "soundfont.sf2"
AUDIO_CACHE_DIR = BASE_DIR / "backend" / "audio_cache"
AUDIO_CACHE_DIR.mkdir(exist_ok=True)

# ═══════════════ FluidSynth 路径检测 ═══════════════
def _find_fluidsynth() -> str:
    """自动检测 FluidSynth 可执行文件路径"""
    # 1) 先看 PATH 里有没有
    found = shutil.which("fluidsynth")
    if found:
        return found
    # 2) 常见 Windows 安装目录
    if sys.platform == "win32":
        import glob
        search_patterns = [
            "D:/Program Files/fluidsynth*/bin/fluidsynth.exe",
            "C:/Program Files/fluidsynth*/bin/fluidsynth.exe",
            "C:/Program Files (x86)/fluidsynth*/bin/fluidsynth.exe",
            str(BASE_DIR / "tools" / "fluidsynth*" / "bin" / "fluidsynth.exe"),
        ]
        for pattern in search_patterns:
            matches = glob.glob(pattern)
            if matches:
                return matches[0]
    return "fluidsynth"  # fallback，可能会失败

FLUIDSYNTH_CMD = _find_fluidsynth()
print(f"[信息] FluidSynth 路径: {FLUIDSYNTH_CMD}")

# ═══════════════ 默认权重路径 ═══════════════
DEFAULT_WEIGHTS = {
    "stage1": "best_weight/Functional-two/emopia_lead_sheet_finetune/ep016_loss0.685_params.pt",
    "stage2_gpt2": "best_weight/Functional-two/emopia_acccompaniment_finetune_gpt2/ep300_loss0.120_params.pt",
    "stage2_performer": "best_weight/Functional-two/emopia_acccompaniment_finetune/ep300_loss0.338_params.pt",
}

DEFAULT_CONFIGS = {
    "stage1_finetune": "stage1_compose/config/emopia_finetune.yaml",
    "stage2_finetune_gpt2": "stage2_accompaniment/config/emopia_finetune_gpt2.yaml",
    "stage2_finetune_performer": "stage2_accompaniment/config/emopia_finetune.yaml",
}

# ═══════════════ 情感映射 ═══════════════
EMOTION_MAP = {
    "Q1": {"name": "开心", "en": "Happy", "desc": "正效价, 高唤醒"},
    "Q2": {"name": "紧张", "en": "Tense", "desc": "负效价, 高唤醒"},
    "Q3": {"name": "悲伤", "en": "Sad", "desc": "负效价, 低唤醒"},
    "Q4": {"name": "平静", "en": "Calm", "desc": "正效价, 低唤醒"},
}

# ═══════════════ 任务管理 ═══════════════
active_tasks = {}


class TaskInfo:
    def __init__(self, task_id: str, task_type: str, description: str):
        self.task_id = task_id
        self.task_type = task_type
        self.description = description
        self.status = "running"
        self.logs: list[str] = []
        self.process: Optional[subprocess.Popen] = None
        self.start_time = datetime.now().isoformat()
        self.end_time: Optional[str] = None
        self.result_files: list[str] = []

    def to_dict(self):
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "description": self.description,
            "status": self.status,
            "logs": self.logs[-200:],
            "log_count": len(self.logs),
            "start_time": self.start_time,
            "end_time": self.end_time,
            "result_files": self.result_files,
        }


def run_subprocess_task(task: TaskInfo, command: list[str], cwd: str):
    """在后台线程中运行子进程并捕获输出"""
    try:
        task.logs.append(f"[系统] 启动命令: {' '.join(command)}")
        task.logs.append(f"[系统] 工作目录: {cwd}")
        task.logs.append("")

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=cwd,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        task.process = process

        for line in iter(process.stdout.readline, ""):
            task.logs.append(line.rstrip())

        process.wait()

        if process.returncode == 0:
            task.status = "completed"
            task.logs.append("")
            task.logs.append("[系统] 任务完成!")
        else:
            task.status = "failed"
            task.logs.append("")
            task.logs.append(f"[系统] 任务失败，返回码: {process.returncode}")

    except Exception as e:
        task.status = "failed"
        task.logs.append(f"[系统] 错误: {str(e)}")
    finally:
        task.end_time = datetime.now().isoformat()
        task.process = None


# ═══════════════ FastAPI App ═══════════════
app = FastAPI(
    title="情感音乐生成系统",
    description="基于 EMO-Disentanger 的情感驱动钢琴音乐生成",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════ 情感 → 效价映射 ═══════════════
EMOTION_TO_VALENCE = {
    "Q1": "Positive",  # 开心 → 正效价
    "Q2": "Negative",  # 紧张 → 负效价
    "Q3": "Negative",  # 悲伤 → 负效价
    "Q4": "Positive",  # 平静 → 正效价
}

# ═══════════════ 请求模型 ═══════════════
class GenerateRequest(BaseModel):
    emotion: str = "Q1"
    n_groups: int = 1
    output_dir: str = "generation/emopia_functional_two"
    model_type: str = "gpt2"
    stage1_weights: str = ""
    stage2_weights: str = ""


class TrainRequest(BaseModel):
    stage: str = "stage1"
    model_type: str = "gpt2"
    representation: str = "functional"
    config: str = "stage1_finetune"


class PlayFileRequest(BaseModel):
    file_path: str


class BrowseRequest(BaseModel):
    directory: str = ""
    pattern: str = "*.mid"


# ═══════════════ 工具函数 ═══════════════
def convert_midi_to_wav(midi_path: Path, output_path: Path) -> bool:
    """将 MIDI 转换为 WAV"""
    try:
        if not SOUNDFONT_PATH.exists():
            print(f"[错误] SoundFont 不存在: {SOUNDFONT_PATH}")
            return False
        cmd = [
            FLUIDSYNTH_CMD, "-ni",
            "-F", str(output_path),
            "-r", "44100",
            str(SOUNDFONT_PATH),
            str(midi_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return result.returncode == 0 and output_path.exists()
    except Exception as e:
        print(f"[错误] MIDI 转换失败: {e}")
        return False


# ═══════════════ 系统信息 ═══════════════
@app.get("/")
async def root():
    return {"message": "情感音乐生成系统 API v2.0", "status": "running"}


@app.get("/api/emotions")
async def get_emotions():
    return {
        "emotions": [
            {"id": k, "name": v["name"], "english": v["en"], "description": v["desc"]}
            for k, v in EMOTION_MAP.items()
        ]
    }


@app.get("/api/status")
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


# ═══════════════ 音乐生成 ═══════════════
def run_full_generation(task: TaskInfo, req: GenerateRequest):
    """完整的两阶段生成流程：Stage1 Lead Sheet → Stage2 Accompaniment"""
    try:
        emotion = req.emotion
        valence = EMOTION_TO_VALENCE.get(emotion, "Positive")
        emotion_name = EMOTION_MAP.get(emotion, {}).get("name", emotion)

        task.logs.append(f"[系统] 目标情感: {emotion} {emotion_name}")
        task.logs.append(f"[系统] 效价: {valence} | 模型: {req.model_type}")
        task.logs.append("")
        task.logs.append("=" * 50)
        task.logs.append("  Stage 1: 生成 Lead Sheet (主旋律 + 和弦)")
        task.logs.append("=" * 50)
        task.logs.append("")

        # Stage 1: Lead Sheet
        s1_weights = req.stage1_weights if req.stage1_weights else DEFAULT_WEIGHTS["stage1"]
        stage1_cmd = [
            sys.executable,
            "stage1_compose/inference.py",
            "-c", DEFAULT_CONFIGS["stage1_finetune"],
            "-r", "functional",
            "-m", "lead_sheet",
            "-i", s1_weights,
            "-o", req.output_dir,
            "-n", str(req.n_groups),
        ]
        task.logs.append(f"[Stage1] 命令: {' '.join(stage1_cmd)}")
        task.logs.append("")

        process = subprocess.Popen(
            stage1_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, cwd=str(EMO_DIR), bufsize=1, encoding="utf-8", errors="replace",
        )
        task.process = process
        for line in iter(process.stdout.readline, ""):
            task.logs.append(line.rstrip())
        process.wait()

        if process.returncode != 0:
            task.status = "failed"
            task.logs.append(f"[Stage1] 失败，返回码: {process.returncode}")
            return

        task.logs.append("")
        task.logs.append("[Stage1] Lead Sheet 生成完成!")

        # 优化: 移除不需要的效价文件，减少 Stage2 处理量
        opposite_valence = "Negative" if valence == "Positive" else "Positive"
        output_path = EMO_DIR / req.output_dir
        removed_count = 0
        for f in output_path.glob(f"samp_*_{opposite_valence}*"):
            f.unlink()
            removed_count += 1
        if removed_count > 0:
            task.logs.append(f"[优化] 跳过 {opposite_valence} 效价，移除 {removed_count} 个无关文件")

        task.logs.append("")
        task.logs.append("=" * 50)
        task.logs.append(f"  Stage 2: 生成 {emotion} 完整演奏 (伴奏 + 表现力)")
        task.logs.append("=" * 50)
        task.logs.append("")

        # Stage 2: Accompaniment
        stage2_config = "stage2_finetune_gpt2" if req.model_type == "gpt2" else "stage2_finetune_performer"
        stage2_weights_key = "stage2_gpt2" if req.model_type == "gpt2" else "stage2_performer"
        s2_weights = req.stage2_weights if req.stage2_weights else DEFAULT_WEIGHTS[stage2_weights_key]

        stage2_cmd = [
            sys.executable,
            "stage2_accompaniment/inference.py",
            "-m", req.model_type,
            "-c", DEFAULT_CONFIGS[stage2_config],
            "-r", "functional",
            "-i", s2_weights,
            "-o", req.output_dir,
        ]
        task.logs.append(f"[Stage2] 命令: {' '.join(stage2_cmd)}")
        task.logs.append("")

        process2 = subprocess.Popen(
            stage2_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, cwd=str(EMO_DIR), bufsize=1, encoding="utf-8", errors="replace",
        )
        task.process = process2
        for line in iter(process2.stdout.readline, ""):
            task.logs.append(line.rstrip())
        process2.wait()

        if process2.returncode != 0:
            task.status = "failed"
            task.logs.append(f"[Stage2] 失败，返回码: {process2.returncode}")
            return

        # 列出生成的目标情感文件
        output_path = EMO_DIR / req.output_dir
        result_files = sorted(output_path.glob(f"*_{emotion}_full.mid"))

        task.logs.append("")
        task.logs.append("=" * 50)
        task.logs.append(f"  生成完成! 目标情感 {emotion} {emotion_name} 的文件:")
        task.logs.append("=" * 50)
        for f in result_files:
            task.logs.append(f"  {f.name}  ({f.stat().st_size / 1024:.1f} KB)")
            task.result_files.append(str(f))

        if not result_files:
            task.logs.append(f"  (未找到 {emotion} 文件，请检查生成目录)")

        task.status = "completed"
        task.logs.append("")
        task.logs.append("[系统] 全部完成!")

    except Exception as e:
        task.status = "failed"
        task.logs.append(f"[系统] 错误: {str(e)}")
    finally:
        task.end_time = datetime.now().isoformat()
        task.process = None


@app.post("/api/tasks/generate")
async def start_generate(req: GenerateRequest):
    """统一的情感音乐生成接口 (Stage1 + Stage2)"""
    task_id = str(uuid.uuid4())[:8]
    emotion_name = EMOTION_MAP.get(req.emotion, {}).get("name", req.emotion)

    task = TaskInfo(task_id, "generate", f"生成 {req.emotion} {emotion_name} 风格音乐")
    active_tasks[task_id] = task

    thread = threading.Thread(
        target=run_full_generation,
        args=(task, req),
        daemon=True,
    )
    thread.start()

    return {"task_id": task_id, "message": f"开始生成 {req.emotion} {emotion_name} 风格音乐"}


# ═══════════════ 训练 ═══════════════
@app.post("/api/tasks/train")
async def start_training(req: TrainRequest):
    task_id = str(uuid.uuid4())[:8]

    config_path = DEFAULT_CONFIGS.get(req.config, req.config)

    if req.stage == "stage1":
        command = [
            sys.executable,
            "stage1_compose/train.py",
            "-c", config_path,
            "-r", req.representation,
        ]
        desc = f"Stage1 训练 ({req.representation})"
    else:
        command = [
            sys.executable,
            "stage2_accompaniment/train.py",
            "-m", req.model_type,
            "-c", config_path,
            "-r", req.representation,
        ]
        desc = f"Stage2 训练 ({req.model_type}, {req.representation})"

    task = TaskInfo(task_id, "training", desc)
    active_tasks[task_id] = task

    thread = threading.Thread(
        target=run_subprocess_task,
        args=(task, command, str(EMO_DIR)),
        daemon=True,
    )
    thread.start()

    return {"task_id": task_id, "message": f"训练任务已启动: {desc}"}


# ═══════════════ 任务管理 ═══════════════
@app.get("/api/tasks")
async def list_tasks():
    return {"tasks": [t.to_dict() for t in active_tasks.values()]}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str, offset: int = 0):
    task = active_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = task.to_dict()
    if offset > 0:
        result["logs"] = task.logs[offset:]
    result["log_offset"] = len(task.logs)
    return result


@app.post("/api/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    task = active_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.process:
        task.process.terminate()
        task.status = "stopped"
        task.logs.append("[系统] 任务已手动终止")
        task.end_time = datetime.now().isoformat()
        return {"message": "任务已终止"}
    return {"message": "任务未在运行"}


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    task = active_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status == "running":
        raise HTTPException(status_code=400, detail="无法删除正在运行的任务")
    del active_tasks[task_id]
    return {"message": "任务已删除"}


# ═══════════════ 文件浏览 ═══════════════
@app.post("/api/files/browse")
async def browse_files(req: BrowseRequest):
    if req.directory:
        dir_path = Path(req.directory)
        if not dir_path.is_absolute():
            dir_path = EMO_DIR / req.directory
    else:
        dir_path = MIDI_LIBRARY_DIR

    if not dir_path.exists():
        return {"files": [], "directory": str(dir_path), "error": "目录不存在"}

    files = []
    for f in sorted(dir_path.glob(req.pattern)):
        if f.is_file():
            files.append({
                "filename": f.name,
                "path": str(f),
                "size": f.stat().st_size,
                "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })

    return {"files": files, "directory": str(dir_path), "count": len(files)}


@app.post("/api/files/play")
async def play_local_file(req: PlayFileRequest):
    """播放本地文件（自动转换 MIDI 为 WAV）"""
    file_path = Path(req.file_path)
    if not file_path.is_absolute():
        file_path = EMO_DIR / req.file_path

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {req.file_path}")

    if file_path.suffix.lower() == ".wav":
        wav_name = file_path.name
        cache_path = AUDIO_CACHE_DIR / wav_name
        if not cache_path.exists():
            shutil.copy2(file_path, cache_path)
        return {
            "success": True,
            "audio_url": f"/api/audio/{wav_name}",
            "filename": file_path.name,
            "file_path": str(file_path),
        }

    if file_path.suffix.lower() in (".mid", ".midi"):
        wav_name = file_path.stem + ".wav"
        wav_path = AUDIO_CACHE_DIR / wav_name
        if not wav_path.exists():
            success = convert_midi_to_wav(file_path, wav_path)
            if not success:
                raise HTTPException(status_code=500, detail="MIDI 转 WAV 失败，请检查 FluidSynth")
        return {
            "success": True,
            "audio_url": f"/api/audio/{wav_name}",
            "filename": file_path.name,
            "file_path": str(file_path),
        }

    raise HTTPException(status_code=400, detail="不支持的文件格式，请使用 .mid 或 .wav")


@app.get("/api/files/search")
async def search_files(query: str = "", directory: str = ""):
    search_dirs = []
    if directory:
        dir_path = Path(directory)
        if not dir_path.is_absolute():
            dir_path = EMO_DIR / directory
        search_dirs.append(dir_path)
    else:
        search_dirs.extend([MIDI_LIBRARY_DIR, DEMO_DIR, GENERATION_DIR])

    results = []
    for d in search_dirs:
        if not d.exists():
            continue
        for pattern in ["**/*.mid", "**/*.midi", "**/*.wav"]:
            for f in d.glob(pattern):
                if query and query.lower() not in f.name.lower():
                    continue
                results.append({
                    "filename": f.name,
                    "path": str(f),
                    "size": f.stat().st_size,
                    "type": f.suffix.lower(),
                })

    return {"files": results[:100], "count": len(results)}


# ═══════════════ 文件下载/播放 ═══════════════
@app.get("/api/download/{filename}")
async def download_midi(filename: str):
    for d in [MIDI_LIBRARY_DIR, DEMO_DIR, GENERATION_DIR]:
        path = d / filename
        if path.exists():
            return FileResponse(path=path, filename=filename, media_type="audio/midi")
    raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")


@app.get("/api/audio/{filename}")
async def get_audio(filename: str):
    wav_path = AUDIO_CACHE_DIR / filename
    if wav_path.exists():
        return FileResponse(path=wav_path, filename=filename, media_type="audio/wav")
    raise HTTPException(status_code=404, detail=f"音频不存在: {filename}")


@app.delete("/api/cache")
async def clear_cache():
    count = 0
    for f in AUDIO_CACHE_DIR.glob("*.wav"):
        f.unlink()
        count += 1
    return {"message": f"已清除 {count} 个缓存文件"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
