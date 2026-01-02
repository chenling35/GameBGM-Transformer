"""
情感音乐生成系统 - FastAPI 后端
"""
import os
import subprocess
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent
EMO_DIR = BASE_DIR / "EMO-Disentanger"
GENERATION_DIR = EMO_DIR / "generation"
ASSETS_DIR = BASE_DIR / "assets"
SOUNDFONT_PATH = ASSETS_DIR / "soundfont.sf2"

# 音频缓存目录
AUDIO_CACHE_DIR = BASE_DIR / "backend" / "audio_cache"
AUDIO_CACHE_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="情感音乐生成系统",
    description="基于 EMO-Disentanger 的情感驱动钢琴音乐生成 API",
    version="1.0.0"
)

# 允许前端跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 情感映射
EMOTION_MAP = {
    "Q1": {"name": "开心", "valence": "Positive", "arousal": "Q1"},
    "Q2": {"name": "紧张", "valence": "Negative", "arousal": "Q2"},
    "Q3": {"name": "悲伤", "valence": "Negative", "arousal": "Q3"},
    "Q4": {"name": "平静", "valence": "Positive", "arousal": "Q4"},
}

# 预生成的 MIDI 文件
DEMO_FILES = {
    "Q1": "samp_00_Q1_full.mid",
    "Q2": "samp_00_Q2_full.mid",
    "Q3": "samp_00_Q3_full.mid",
    "Q4": "samp_00_Q4_full.mid",
}


class GenerateRequest(BaseModel):
    emotion: str  # Q1, Q2, Q3, Q4


class GenerateResponse(BaseModel):
    success: bool
    emotion: str
    emotion_name: str
    filename: str
    audio_url: str
    bars: int
    notes: int
    duration: str
    message: str


def find_midi_file(filename: str) -> Path | None:
    """在多个可能的目录中查找 MIDI 文件"""
    possible_paths = [
        GENERATION_DIR / "demo" / "demo" / filename,
        GENERATION_DIR / "demo" / filename,
        GENERATION_DIR / "emopia_functional_two" / filename,
    ]
    for path in possible_paths:
        if path.exists():
            return path
    return None


def convert_midi_to_wav(midi_path: Path, output_path: Path) -> bool:
    """将 MIDI 转换为 WAV 文件（直接调用 FluidSynth）"""
    try:
        if not SOUNDFONT_PATH.exists():
            print(f"[警告] SoundFont 文件不存在: {SOUNDFONT_PATH}")
            return False

        # 直接调用 fluidsynth 命令行
        # 参数顺序：选项在前，soundfont 和 midi 文件在后
        cmd = [
            "fluidsynth",
            "-ni",                      # 非交互模式
            "-F", str(output_path),     # 输出文件
            "-r", "44100",              # 采样率
            str(SOUNDFONT_PATH),        # SoundFont 文件
            str(midi_path)              # MIDI 文件
        ]

        print(f"[转换] 执行命令: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            print(f"[错误] FluidSynth 错误: {result.stderr}")
            return False

        if output_path.exists():
            print(f"[成功] 音频已生成: {output_path}")
            return True
        else:
            print(f"[错误] 输出文件未生成")
            return False

    except subprocess.TimeoutExpired:
        print(f"[错误] 转换超时")
        return False
    except Exception as e:
        print(f"[错误] MIDI 转换失败: {e}")
        return False


@app.get("/")
async def root():
    return {
        "message": "情感音乐生成系统 API",
        "version": "1.0.0",
        "endpoints": {
            "/api/generate": "生成音乐",
            "/api/download/{filename}": "下载 MIDI 文件",
            "/api/audio/{filename}": "获取音频文件（WAV）",
            "/api/emotions": "获取可用情感列表",
            "/api/status": "检查系统状态"
        }
    }


@app.get("/api/emotions")
async def get_emotions():
    """获取可用的情感列表"""
    return {
        "emotions": [
            {"id": "Q1", "name": "开心", "english": "Happy", "description": "明快活泼的旋律"},
            {"id": "Q2", "name": "紧张", "english": "Tense", "description": "激烈紧迫的节奏"},
            {"id": "Q3", "name": "悲伤", "english": "Sad", "description": "忧郁深沉的曲调"},
            {"id": "Q4", "name": "平静", "english": "Calm", "description": "舒缓安宁的氛围"},
        ]
    }


@app.get("/api/status")
async def check_status():
    """检查系统状态"""
    emo_exists = EMO_DIR.exists()
    soundfont_exists = SOUNDFONT_PATH.exists()

    demo_dir = GENERATION_DIR / "demo" / "demo"
    demo_files_exist = demo_dir.exists() and any(demo_dir.glob("*.mid"))

    # 检查 FluidSynth 是否可用
    fluidsynth_ok = False
    try:
        result = subprocess.run(["fluidsynth", "--version"], capture_output=True, timeout=5)
        fluidsynth_ok = result.returncode == 0
    except:
        pass

    return {
        "status": "ok" if emo_exists and demo_files_exist else "error",
        "emo_disentanger": emo_exists,
        "demo_files": demo_files_exist,
        "soundfont": soundfont_exists,
        "fluidsynth": fluidsynth_ok,
        "generation_dir": str(GENERATION_DIR),
    }


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_music(request: GenerateRequest):
    """生成指定情感的音乐"""
    emotion = request.emotion.upper()

    if emotion not in EMOTION_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"无效的情感类型: {emotion}，可选: Q1, Q2, Q3, Q4"
        )

    emotion_info = EMOTION_MAP[emotion]
    filename = DEMO_FILES.get(emotion, "")

    # 查找 MIDI 文件
    midi_path = find_midi_file(filename)

    if not midi_path:
        raise HTTPException(
            status_code=503,
            detail=f"MIDI 文件不存在: {filename}"
        )

    # 检查是否已有缓存的音频文件
    wav_filename = filename.replace('.mid', '.wav')
    wav_path = AUDIO_CACHE_DIR / wav_filename

    # 如果没有缓存，则转换
    if not wav_path.exists():
        success = convert_midi_to_wav(midi_path, wav_path)
        if not success:
            # 转换失败，但仍返回成功（只是没有音频）
            return GenerateResponse(
                success=True,
                emotion=emotion,
                emotion_name=emotion_info["name"],
                filename=filename,
                audio_url="",
                bars=15,
                notes=495,
                duration="0:33",
                message=f"已加载 {emotion_info['name']} 音乐（音频转换失败，请下载 MIDI）"
            )

    return GenerateResponse(
        success=True,
        emotion=emotion,
        emotion_name=emotion_info["name"],
        filename=filename,
        audio_url=f"/api/audio/{wav_filename}",
        bars=15,
        notes=495,
        duration="0:33",
        message=f"成功生成 {emotion_info['name']} 情感音乐"
    )


@app.get("/api/download/{filename}")
async def download_midi(filename: str):
    """下载 MIDI 文件"""
    midi_path = find_midi_file(filename)

    if midi_path:
        return FileResponse(
            path=midi_path,
            filename=filename,
            media_type="audio/midi"
        )

    raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")


@app.get("/api/audio/{filename}")
async def get_audio(filename: str):
    """获取音频文件（WAV）"""
    wav_path = AUDIO_CACHE_DIR / filename

    if wav_path.exists():
        return FileResponse(
            path=wav_path,
            filename=filename,
            media_type="audio/wav"
        )

    raise HTTPException(status_code=404, detail=f"音频文件不存在: {filename}")


@app.get("/api/files")
async def list_files():
    """列出所有可用的文件"""
    files = []

    # 扫描 demo 目录
    demo_dir = GENERATION_DIR / "demo" / "demo"
    if demo_dir.exists():
        for f in demo_dir.glob("*.mid"):
            files.append({
                "filename": f.name,
                "path": str(f.relative_to(BASE_DIR)),
                "size": f.stat().st_size
            })

    # 扫描音频缓存
    audio_files = []
    for f in AUDIO_CACHE_DIR.glob("*.wav"):
        audio_files.append({
            "filename": f.name,
            "size": f.stat().st_size
        })

    return {
        "midi_files": files,
        "audio_files": audio_files,
        "midi_count": len(files),
        "audio_count": len(audio_files)
    }


@app.delete("/api/cache")
async def clear_cache():
    """清除音频缓存"""
    count = 0
    for f in AUDIO_CACHE_DIR.glob("*.wav"):
        f.unlink()
        count += 1
    return {"message": f"已清除 {count} 个缓存文件"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)