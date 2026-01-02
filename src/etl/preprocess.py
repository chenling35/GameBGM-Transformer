"""
数据预处理脚本
功能：读取MIDI文件，提取特征，自动标注情感，生成训练数据集
"""
import os
os.environ["MIDITOK_DISABLE_WARNING"] = "True"

from pathlib import Path
from miditok import REMI, TokenizerConfig
from symusic import Score
from tqdm import tqdm
from datasets import Dataset
from multiprocessing import Pool, cpu_count
import numpy as np
import json
import time
from collections import Counter

# ==================== 配置 ====================
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
MAX_SEQ_LEN = 512

# 情感分类定义
EMOTIONS = {
    "BATTLE": {
        "keywords": ["battle", "boss", "fight", "combat", "war", "enemy"],
        "tempo_range": (140, 200)
    },
    "PEACEFUL": {
        "keywords": ["town", "village", "peaceful", "calm", "rest", "safe", "home"],
        "tempo_range": (60, 100)
    },
    "SAD": {
        "keywords": ["sad", "sorrow", "melancholy", "tragic", "lament", "requiem"],
        "tempo_range": (40, 80)
    },
    "HAPPY": {
        "keywords": ["happy", "joy", "victory", "celebration", "festival"],
        "tempo_range": (120, 180)
    },
    "MYSTERIOUS": {
        "keywords": ["mystery", "dungeon", "cave", "forest", "explore"],
        "tempo_range": (80, 120)
    },
    "EPIC": {
        "keywords": ["epic", "heroic", "legend", "final", "climax"],
        "tempo_range": (100, 140)
    }
}

# 全局tokenizer（多进程共享）
tokenizer = None


def init_tokenizer():
    """初始化tokenizer"""
    global tokenizer
    config = TokenizerConfig(
        pitch_range=(21, 109),
        num_velocities=32,
        special_tokens=["PAD", "BOS", "EOS", "MASK"] + list(EMOTIONS.keys()) + ["UNKNOWN"],
        use_chords=True,
        use_rests=True,
        use_tempos=True,
        use_programs=True,
    )
    tokenizer = REMI(config)


def extract_features(midi):
    """从MIDI文件中提取音乐特征"""
    features = {
        "tempo": 0.0,
        "avg_pitch": 0.0,
        "avg_velocity": 0.0,
        "note_density": 0.0,
        "duration": 0.0
    }

    try:
        # 时长
        features["duration"] = midi.end() / midi.ticks_per_quarter

        # 速度
        if len(midi.tempos) > 0:
            features["tempo"] = float(midi.tempos[0].tempo)

        # 统计所有音符
        pitches = []
        velocities = []
        for track in midi.tracks:
            for note in track.notes:
                pitches.append(note.pitch)
                velocities.append(note.velocity)

        if pitches:
            features["avg_pitch"] = float(np.mean(pitches))
            features["avg_velocity"] = float(np.mean(velocities))
            features["note_density"] = len(pitches) / max(features["duration"], 1.0)
    except:
        pass

    return features


def classify_emotion(features, filename):
    """
    混合情感分类算法
    - 文件名关键词匹配 (权重40%)
    - 音乐特征分析 (权重60%)
    """
    scores = {e: 0.0 for e in EMOTIONS}
    filename_lower = filename.lower()

    # 1. 文件名关键词匹配 (40%)
    for emotion, props in EMOTIONS.items():
        for keyword in props["keywords"]:
            if keyword in filename_lower:
                scores[emotion] += 0.4
                break

    # 2. 速度匹配 (30%)
    tempo = features.get("tempo", 0)
    if tempo > 0:
        for emotion, props in EMOTIONS.items():
            t_min, t_max = props["tempo_range"]
            if t_min <= tempo <= t_max:
                center = (t_min + t_max) / 2
                dist = abs(tempo - center) / ((t_max - t_min) / 2)
                scores[emotion] += 0.3 * (1 - dist)

    # 3. 力度和音高特征 (30%)
    pitch = features.get("avg_pitch", 60)
    velocity = features.get("avg_velocity", 64)
    density = features.get("note_density", 0)

    if pitch > 65 and velocity > 80:
        scores["HAPPY"] += 0.15
        scores["BATTLE"] += 0.15
    if pitch < 55 and velocity < 50:
        scores["SAD"] += 0.3
    if 55 <= pitch <= 65 and 40 <= velocity <= 70 and density < 5:
        scores["PEACEFUL"] += 0.3
    if density > 10:
        scores["BATTLE"] += 0.15
        scores["EPIC"] += 0.15

    # 返回得分最高的情感
    if max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return "UNKNOWN"


def process_file(file_path):
    """处理单个MIDI文件"""
    try:
        # 跳过太小的文件
        if file_path.stat().st_size < 100:
            return None

        # 读取MIDI
        midi = Score(str(file_path))

        # 提取特征
        features = extract_features(midi)

        # 情感分类
        emotion = classify_emotion(features, file_path.name)

        # Tokenize
        tokens = tokenizer(midi)
        if not tokens:
            return None

        # 获取token ids
        if isinstance(tokens, list):
            ids = tokens[0].ids if hasattr(tokens[0], 'ids') else tokens[0]
        else:
            ids = tokens.ids if hasattr(tokens, 'ids') else tokens

        if hasattr(ids, 'tolist'):
            ids = ids.tolist()

        # 长度检查
        if len(ids) < 20:
            return None

        # 截断并添加特殊token
        ids = ids[:MAX_SEQ_LEN - 3]
        bos_id = tokenizer["BOS_None"]
        eos_id = tokenizer["EOS_None"]
        emotion_id = tokenizer.get(f"{emotion}_None", tokenizer["UNKNOWN_None"])

        final_ids = [bos_id, emotion_id] + ids + [eos_id]

        return {
            "input_ids": final_ids,
            "emotion": emotion,
            "features": features,
            "filename": file_path.name
        }
    except:
        return None


def main():
    print("=" * 60)
    print("MIDI数据预处理")
    print("=" * 60)

    # 扫描文件
    print(f"\n[1/4] 扫描目录: {RAW_DATA_DIR}")
    files = list(RAW_DATA_DIR.rglob("*.mid")) + list(RAW_DATA_DIR.rglob("*.midi"))
    print(f"找到 {len(files)} 个MIDI文件")

    if not files:
        print("错误：没有找到MIDI文件")
        return

    # 初始化tokenizer
    print("\n[2/4] 初始化Tokenizer")
    init_tokenizer()
    print(f"词汇表大小: {len(tokenizer)}")

    # 并行处理
    print("\n[3/4] 处理文件")
    num_workers = max(1, cpu_count() - 2)
    start = time.time()

    with Pool(num_workers, initializer=init_tokenizer) as pool:
        results = list(tqdm(
            pool.imap(process_file, files, chunksize=50),
            total=len(files),
            desc="进度"
        ))

    # 过滤无效结果
    valid = [r for r in results if r is not None]
    elapsed = time.time() - start

    print(f"\n处理完成: {len(valid)}/{len(files)} ({len(valid)/len(files)*100:.1f}%)")
    print(f"耗时: {elapsed:.1f}秒")

    # 统计情感分布
    emotion_counts = Counter(r["emotion"] for r in valid)
    print("\n情感分布:")
    for emotion, count in sorted(emotion_counts.items(), key=lambda x: -x[1]):
        pct = count / len(valid) * 100
        print(f"  {emotion}: {count} ({pct:.1f}%)")

    # 保存数据
    print("\n[4/4] 保存数据")
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    # 保存tokenizer
    tokenizer.save(PROCESSED_DIR / "tokenizer.json")

    # 构建并保存数据集
    dataset = Dataset.from_dict({
        "input_ids": [r["input_ids"] for r in valid],
        "emotion": [r["emotion"] for r in valid],
        "tempo": [r["features"]["tempo"] for r in valid],
        "avg_pitch": [r["features"]["avg_pitch"] for r in valid],
        "avg_velocity": [r["features"]["avg_velocity"] for r in valid],
        "note_density": [r["features"]["note_density"] for r in valid],
        "duration": [r["features"]["duration"] for r in valid],
    })
    dataset.save_to_disk(str(PROCESSED_DIR / "emotion_dataset"))

    # 保存特征文件（用于分析）
    with open(PROCESSED_DIR / "features.jsonl", 'w', encoding='utf-8') as f:
        for r in valid:
            f.write(json.dumps({
                "filename": r["filename"],
                "emotion": r["emotion"],
                **r["features"]
            }, ensure_ascii=False) + '\n')

    print(f"\n保存完成:")
    print(f"  - tokenizer.json")
    print(f"  - emotion_dataset/")
    print(f"  - features.jsonl")

    # 简单统计
    lengths = [len(r["input_ids"]) for r in valid]
    print(f"\n数据统计:")
    print(f"  样本数: {len(valid)}")
    print(f"  平均序列长度: {np.mean(lengths):.1f}")
    print(f"  序列长度范围: {min(lengths)} - {max(lengths)}")


if __name__ == "__main__":
    main()


