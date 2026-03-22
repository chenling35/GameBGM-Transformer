"""
工具函数：MIDI→WAV 转换、路径安全校验
"""
import re
import subprocess
from pathlib import Path

from fastapi import HTTPException

from config import SOUNDFONT_PATH, FLUIDSYNTH_CMD

# ═══════════════ 路径安全 ═══════════════
# glob 模式白名单：只允许单层通配，禁止 ** 递归和路径分隔符
_SAFE_PATTERN = re.compile(r'^[a-zA-Z0-9_\-.*?]+$')


def _resolve_safe(path: Path, base: Path) -> Path:
    """解析路径并确保其在 base 目录内，否则抛出 400"""
    resolved = path.resolve()
    if not str(resolved).startswith(str(base.resolve())):
        raise HTTPException(status_code=400, detail="不允许访问项目目录以外的路径")
    return resolved


# ═══════════════ MIDI 转 WAV ═══════════════
def convert_midi_to_wav(midi_path: Path, output_path: Path) -> bool:
    """将 MIDI 转换为 WAV（调用 FluidSynth）"""
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
