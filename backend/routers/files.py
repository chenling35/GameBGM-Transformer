"""
文件操作接口：浏览、播放、搜索、下载、音频、缓存清理
"""
import shutil
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from config import (
    BASE_DIR, EMO_DIR,
    MIDI_LIBRARY_DIR, DEMO_DIR, GENERATION_DIR,
    AUDIO_CACHE_DIR,
)
from models import BrowseRequest, PlayFileRequest
from utils import convert_midi_to_wav, _resolve_safe, _SAFE_PATTERN

router = APIRouter(tags=["文件"])


# ═══════════════ 文件浏览 ═══════════════
@router.post("/api/files/browse")
async def browse_files(req: BrowseRequest):
    # glob pattern 白名单校验：只允许单层通配，禁止 ** 递归和路径分隔符
    if not _SAFE_PATTERN.match(req.pattern):
        raise HTTPException(status_code=400, detail="不支持的 glob 模式，请使用 *.mid 等简单通配符")

    if req.directory:
        dir_path = Path(req.directory)
        if not dir_path.is_absolute():
            dir_path = BASE_DIR / req.directory
    else:
        dir_path = MIDI_LIBRARY_DIR

    # 路径穿越防护
    dir_path = _resolve_safe(dir_path, BASE_DIR)

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


@router.post("/api/files/play")
async def play_local_file(req: PlayFileRequest):
    """播放本地文件（自动转换 MIDI 为 WAV）"""
    file_path = Path(req.file_path)
    if not file_path.is_absolute():
        file_path = EMO_DIR / req.file_path

    # 路径穿越防护，只允许访问项目目录内文件
    file_path = _resolve_safe(file_path, BASE_DIR)

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


@router.get("/api/files/search")
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


# ═══════════════ 文件下载/音频 ═══════════════
@router.get("/api/download/{filename}")
async def download_midi(filename: str):
    for d in [MIDI_LIBRARY_DIR, DEMO_DIR, GENERATION_DIR]:
        path = d / filename
        if path.exists():
            return FileResponse(path=path, filename=filename, media_type="audio/midi")
    raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")


@router.get("/api/audio/{filename}")
async def get_audio(filename: str):
    wav_path = AUDIO_CACHE_DIR / filename
    if wav_path.exists():
        return FileResponse(path=wav_path, filename=filename, media_type="audio/wav")
    raise HTTPException(status_code=404, detail=f"音频不存在: {filename}")


@router.delete("/api/cache")
async def clear_cache():
    count = 0
    for f in AUDIO_CACHE_DIR.glob("*.wav"):
        f.unlink()
        count += 1
    return {"message": f"已清除 {count} 个缓存文件"}
