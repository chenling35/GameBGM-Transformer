"""
EMOPIA / VGMIDI → midi-emotion 训练格式预处理

用法示例:
  # EMOPIA
  python src/midi_emotion/preprocess.py \
    --dataset emopia \
    --midi_dir data/raw/emopia/EMOPIA_1.0/midis \
    --label_csv data/raw/emopia/EMOPIA_1.0/label.csv \
    --output_dir data/processed/emopia

  # VGMIDI
  python src/midi_emotion/preprocess.py \
    --dataset vgmidi \
    --midi_dir data/raw/vgmidi/clean/labelled \
    --label_csv data/raw/vgmidi/vgmidi_labelled.csv \
    --output_dir data/processed/vgmidi

输出结构:
  data/processed/emopia/
    ├── Q1_xxx.pt, Q2_xxx.pt, ...   (每首曲子的 bars)
    ├── maps.pt                      (token 映射，供 Loader 使用)
    └── features.csv                 (file, valence, arousal, split)
"""

import sys
import os
import argparse
import random
from pathlib import Path

import torch
import numpy as np
import pandas as pd
import pretty_midi
from tqdm import tqdm

# 把 midi-emotion/src 加入 Python 路径
_HERE = Path(__file__).resolve().parent
_MIDI_EMOTION_SRC = _HERE.parent.parent / "midi-emotion" / "src"
sys.path.insert(0, str(_MIDI_EMOTION_SRC))

from data.data_processing import mid_to_bars, get_maps  # noqa: E402

# Q1-Q4 到连续 V/A 的标准映射（Russell 模型四个象限中心点）
Q_TO_VA = {
    "Q1": ( 0.8,  0.8),   # 开心：正效价，高唤醒
    "Q2": (-0.8,  0.8),   # 紧张：负效价，高唤醒
    "Q3": (-0.8, -0.8),   # 悲伤：负效价，低唤醒
    "Q4": ( 0.8, -0.8),   # 平静：正效价，低唤醒
}

# General MIDI program → midi-emotion 乐器类别
def get_instrument_name(ins: pretty_midi.Instrument) -> str:
    """把 pretty_midi 的乐器映射到 midi-emotion 的 5 种类别"""
    if ins.is_drum:
        return "DRUMS"
    p = ins.program
    if 32 <= p <= 39:   # 低音吉他 / 贝司
        return "BASS"
    if 24 <= p <= 31:   # 吉他
        return "GUITAR"
    if 40 <= p <= 51:   # 弦乐合奏
        return "STRINGS"
    return "PIANO"       # 其余（钢琴、键盘、管风琴等）统一归 PIANO


def load_midi(midi_path: Path) -> pretty_midi.PrettyMIDI | None:
    """加载 MIDI 并重命名乐器，跳过损坏文件"""
    try:
        mid = pretty_midi.PrettyMIDI(str(midi_path))
    except Exception:
        return None

    for ins in mid.instruments:
        ins.name = get_instrument_name(ins)

    # 过滤掉没有音符的轨道
    mid.instruments = [ins for ins in mid.instruments if ins.notes]
    if not mid.instruments:
        return None

    return mid


def process_file(midi_path: Path, event_sym2idx: dict) -> list | None:
    """MIDI 文件 → bars（list of np.ndarray）"""
    mid = load_midi(midi_path)
    if mid is None:
        return None
    bars = mid_to_bars(mid, event_sym2idx)
    if bars is None or len(bars) == 0:
        return None
    return bars


def preprocess_emopia(midi_dir: Path, label_csv: Path, output_dir: Path,
                      maps: dict, test_ratio: float = 0.1, max_files: int = None):
    """处理 EMOPIA 数据集（Q1-Q4 → 连续 V/A）"""
    df = pd.read_csv(label_csv)
    # label.csv 格式: ID, 4Q, annotator
    id_to_q = {row["ID"]: f"Q{int(row['4Q'])}" for _, row in df.iterrows()}

    midi_files = sorted(midi_dir.glob("*.mid"))
    if max_files:
        midi_files = midi_files[:max_files]

    records = []
    skipped = 0

    for midi_path in tqdm(midi_files, desc="EMOPIA 预处理"):
        stem = midi_path.stem
        if stem not in id_to_q:
            skipped += 1
            continue

        q = id_to_q[stem]
        valence, arousal = Q_TO_VA[q]

        bars = process_file(midi_path, maps["event2idx"])
        if bars is None:
            skipped += 1
            continue

        bars_tensors = [torch.from_numpy(bar) for bar in bars]
        torch.save({"file": stem + ".pt", "bars": bars_tensors}, output_dir / f"{stem}.pt")

        records.append({"file": stem, "valence": valence, "arousal": arousal, "quadrant": q})

    # 按象限分层划分 train/test，保持各类别比例
    random.shuffle(records)
    n_test = max(1, round(len(records) * test_ratio))
    for i, r in enumerate(records):
        r["split"] = "test" if i < n_test else "train"

    print(f"EMOPIA: 处理 {len(records)} 首，跳过 {skipped} 首")
    return records


def preprocess_vgmidi(midi_dir: Path, label_csv: Path, output_dir: Path,
                      maps: dict, test_ratio: float = 0.1, max_files: int = None):
    """处理 VGMIDI 数据集（已有连续 V/A 标签）"""
    df = pd.read_csv(label_csv)
    # vgmidi_labelled.csv 格式: id, series, console, game, piece, midi, valence, arousal

    records = []
    skipped = 0

    rows = df.iterrows()
    for _, row in tqdm(rows, total=len(df), desc="VGMIDI 预处理"):
        if max_files and len(records) >= max_files:
            break

        # midi 列是相对路径，如 "labelled/phrases/xxx.mid"
        midi_rel = str(row["midi"]).replace("\\", "/")
        # 先在 midi_dir 下找，再试 midi_dir/labelled/phrases
        candidate_paths = [
            midi_dir / midi_rel,
            midi_dir / Path(midi_rel).name,
        ]
        midi_path = next((p for p in candidate_paths if p.exists()), None)
        if midi_path is None:
            skipped += 1
            continue

        # VGMIDI 的 V/A 是整数 {-1, 0, 1}，归一化到 ±0.8（避免边界值）
        valence = float(row["valence"]) * 0.8
        arousal = float(row["arousal"]) * 0.8

        bars = process_file(midi_path, maps["event2idx"])
        if bars is None:
            skipped += 1
            continue

        stem = midi_path.stem
        bars_tensors = [torch.from_numpy(bar) for bar in bars]
        torch.save({"file": stem + ".pt", "bars": bars_tensors}, output_dir / f"{stem}.pt")

        records.append({"file": stem, "valence": valence, "arousal": arousal})

    random.shuffle(records)
    n_test = max(1, round(len(records) * test_ratio))
    for i, r in enumerate(records):
        r["split"] = "test" if i < n_test else "train"

    print(f"VGMIDI: 处理 {len(records)} 首，跳过 {skipped} 首")
    return records


def main():
    parser = argparse.ArgumentParser(description="预处理 EMOPIA/VGMIDI 为 midi-emotion 格式")
    parser.add_argument("--dataset", choices=["emopia", "vgmidi"], required=True)
    parser.add_argument("--midi_dir", type=str, required=True, help="MIDI 文件目录")
    parser.add_argument("--label_csv", type=str, required=True, help="情感标签 CSV")
    parser.add_argument("--output_dir", type=str, required=True, help="输出目录")
    parser.add_argument("--test_ratio", type=float, default=0.1, help="测试集比例")
    parser.add_argument("--max_files", type=int, default=None, help="最多处理文件数（调试用）")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 生成 token 映射（与预训练模型保持一致）
    print("生成 token 映射...")
    maps = get_maps()

    # maps.pt 必须保存在 output_dir 的父目录（Loader 的硬编码路径逻辑）
    maps_path = output_dir.parent / "maps.pt"
    torch.save(maps, maps_path)
    print(f"maps.pt 保存至 {maps_path}")

    midi_dir = Path(args.midi_dir)
    label_csv = Path(args.label_csv)

    if args.dataset == "emopia":
        records = preprocess_emopia(midi_dir, label_csv, output_dir, maps,
                                    test_ratio=args.test_ratio, max_files=args.max_files)
    else:
        records = preprocess_vgmidi(midi_dir, label_csv, output_dir, maps,
                                    test_ratio=args.test_ratio, max_files=args.max_files)

    # 保存 features CSV
    feat_df = pd.DataFrame(records)
    feat_csv = output_dir / "features.csv"
    feat_df.to_csv(feat_csv, index=False)

    # 打印统计
    train_n = sum(1 for r in records if r["split"] == "train")
    test_n  = sum(1 for r in records if r["split"] == "test")
    print(f"\n完成！")
    print(f"  训练集: {train_n} 首")
    print(f"  测试集: {test_n} 首")
    print(f"  .pt 文件: {output_dir}/")
    print(f"  features: {feat_csv}")
    print(f"  maps.pt:  {maps_path}")
    print(f"\n下一步运行微调:")
    print(f"  python src/midi_emotion/finetune.py --data_dir {output_dir}")


if __name__ == "__main__":
    main()
