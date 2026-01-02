"""
src/etl/inspect_midi.py
不做任何过滤，只负责看数据长什么样
"""
from pathlib import Path
from symusic import Score
from tqdm import tqdm
import numpy as np

# 路径设置
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent.parent
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"


def inspect():
    print(f"🕵️‍♀️ 正在体检数据: {RAW_DATA_DIR}")

    all_files = list(RAW_DATA_DIR.rglob("*.mid")) + list(RAW_DATA_DIR.rglob("*.midi"))
    print(f"📦 总文件数: {len(all_files)}")

    # 只抽样检查前 100 个文件，为了快
    sample_files = all_files[:100]

    ticks = []
    notes = []

    print("\n🔍 抽样详情 (前10个):")
    for i, f in enumerate(sample_files):
        try:
            score = Score(f)
            # 统计这个文件的总 Note 数
            note_count = sum(len(track.notes) for track in score.tracks)
            # 统计时长 (Ticks)
            max_tick = score.end()

            ticks.append(max_tick)
            notes.append(note_count)

            if i < 10:
                print(f"   [{i + 1}] {f.name}: Ticks={max_tick}, Notes={note_count}")

        except Exception as e:
            if i < 10:
                print(f"   [{i + 1}] {f.name}: ❌ 读取失败 ({e})")

    print("\n📊 统计报告 (基于100个样本):")
    if not ticks:
        print("❌ 没有读取到任何有效文件！")
        return

    print(f"   - 平均时长 (Ticks): {np.mean(ticks):.1f}")
    print(f"   - 中位时长 (Ticks): {np.median(ticks):.1f}")
    print(f"   - 平均音符数: {np.mean(notes):.1f}")
    print(f"   - 中位音符数: {np.median(notes):.1f}")

    # 给出建议
    suggest_tick = max(480, int(np.percentile(ticks, 10)))  # 建议保留 90% 的数据
    print(f"\n💡 建议过滤阈值: if ticks < {suggest_tick}")


if __name__ == "__main__":
    inspect()
