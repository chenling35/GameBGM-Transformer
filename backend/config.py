"""
全局配置：路径、FluidSynth 检测、默认权重/配置、情感映射
"""
import sys
import glob as _glob
import shutil
from pathlib import Path

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
        search_patterns = [
            "D:/Program Files/fluidsynth*/bin/fluidsynth.exe",
            "C:/Program Files/fluidsynth*/bin/fluidsynth.exe",
            "C:/Program Files (x86)/fluidsynth*/bin/fluidsynth.exe",
            str(BASE_DIR / "tools" / "fluidsynth*" / "bin" / "fluidsynth.exe"),
        ]
        for pattern in search_patterns:
            matches = _glob.glob(pattern)
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

EMOTION_TO_VALENCE = {
    "Q1": "Positive",  # 开心 → 正效价
    "Q2": "Negative",  # 紧张 → 负效价
    "Q3": "Negative",  # 悲伤 → 负效价
    "Q4": "Positive",  # 平静 → 正效价
}
