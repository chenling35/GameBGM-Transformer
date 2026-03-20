"""
游戏音乐情感估计器 — Level 2 方案
=====================================
策略：
  1. 在 VGMIDI 200首（有真实 V/A 人工标注）上训练情感估计模型
  2. 用该模型预测 VGMusic 31,800首的 V/A 值
  3. 输出带标签的 CSV，供 preprocess.py 使用

用法：
  # 第一步：训练估计器并评估
  python src/midi_emotion/label_vgmusic.py train \
    --vgmidi_dir  data/raw/vgmidi/clean/labelled \
    --vgmidi_csv  data/raw/vgmidi/vgmidi_labelled.csv \
    --model_out   data/processed/emotion_estimator.pkl

  # 第二步：对 VGMusic 31800 首打标签
  python src/midi_emotion/label_vgmusic.py label \
    --vgmusic_dir data/raw/vgmusic/vg_music_database \
    --model_in    data/processed/emotion_estimator.pkl \
    --output_csv  data/processed/vgmusic_labels.csv

  # 一键全流程
  python src/midi_emotion/label_vgmusic.py all \
    --vgmidi_dir  data/raw/vgmidi/clean/labelled \
    --vgmidi_csv  data/raw/vgmidi/vgmidi_labelled.csv \
    --vgmusic_dir data/raw/vgmusic/vg_music_database \
    --output_csv  data/processed/vgmusic_labels.csv \
    --model_out   data/processed/emotion_estimator.pkl
"""

import argparse
import pickle
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import pretty_midi
from tqdm import tqdm

warnings.filterwarnings("ignore")


# ─────────────────────────────────────────────────────────────
# 特征提取
# ─────────────────────────────────────────────────────────────

# Krumhansl-Schmuckler 调性轮廓（大调 / 小调）
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38,
                            4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60,
                            3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def _chroma_from_midi(pm: pretty_midi.PrettyMIDI) -> np.ndarray:
    """从 pretty_midi 对象计算12维色度向量（音符计数，归一化）"""
    chroma = np.zeros(12)
    for inst in pm.instruments:
        if inst.is_drum:
            continue
        for note in inst.notes:
            chroma[note.pitch % 12] += 1
    total = chroma.sum()
    if total > 0:
        chroma /= total
    return chroma


def _mode_score(chroma: np.ndarray) -> float:
    """
    返回调性倾向得分 ∈ [-1, 1]
    +1 = 强大调；-1 = 强小调；0 = 不确定
    使用所有12个移调后取最佳匹配
    """
    best_major = -np.inf
    best_minor = -np.inf
    for shift in range(12):
        rolled = np.roll(chroma, -shift)
        m_score = np.corrcoef(rolled, _MAJOR_PROFILE)[0, 1]
        n_score = np.corrcoef(rolled, _MINOR_PROFILE)[0, 1]
        if m_score > best_major:
            best_major = m_score
        if n_score > best_minor:
            best_minor = n_score
    # 归一化到 [-1, 1]
    diff = best_major - best_minor          # >0 大调，<0 小调
    return float(np.clip(diff / 0.5, -1, 1))


def extract_features(midi_path: str | Path) -> dict | None:
    """
    从 MIDI 文件提取8维音乐特征，返回 dict 或 None（解析失败）

    特征说明：
      mode_score    调性倾向（+1大调 / -1小调）—— 效价最强预测因子
      tempo         曲速 BPM（归一化到0-1，范围20-240）—— 唤醒最强预测因子
      avg_velocity  平均音符力度（0-1）                —— 唤醒辅助
      vel_std       力度标准差（0-1）                  —— 情感强度
      note_density  音符密度（音符/秒，归一化0-1）      —— 唤醒辅助
      pitch_mean    平均音高（0-1，MIDI 0-127）        —— 效价辅助
      pitch_range   音域宽度（0-1，MIDI 0-127）        —— 情感张力
      duration_mean 平均音符时长（秒，clip 0-4，归一化）—— 风格
    """
    try:
        pm = pretty_midi.PrettyMIDI(str(midi_path))
    except Exception:
        return None

    # 收集所有非鼓音符
    notes = []
    for inst in pm.instruments:
        if not inst.is_drum:
            notes.extend(inst.notes)

    if len(notes) < 10:
        return None

    total_time = pm.get_end_time()
    if total_time < 1.0:
        return None

    velocities  = np.array([n.velocity for n in notes], dtype=float)
    pitches     = np.array([n.pitch    for n in notes], dtype=float)
    durations   = np.array([n.end - n.start for n in notes], dtype=float)

    # 曲速：取所有速度段的加权平均
    try:
        change_times, tempos_arr = pm.get_tempo_changes()
        if len(tempos_arr) > 0:
            tempo_values = float(np.mean(tempos_arr))
        else:
            tempo_values = 120.0
    except Exception:
        tempo_values = 120.0
    tempo_norm = float(np.clip((tempo_values - 20) / (240 - 20), 0, 1))

    chroma     = _chroma_from_midi(pm)
    mode_score = _mode_score(chroma)

    return {
        "mode_score":    mode_score,
        "tempo":         tempo_norm,
        "avg_velocity":  float(velocities.mean() / 127),
        "vel_std":       float(velocities.std()  / 127),
        "note_density":  float(np.clip(len(notes) / total_time / 30, 0, 1)),
        "pitch_mean":    float(pitches.mean() / 127),
        "pitch_range":   float(np.clip((pitches.max() - pitches.min()) / 127, 0, 1)),
        "duration_mean": float(np.clip(durations.mean() / 4, 0, 1)),
    }


FEATURE_COLS = [
    "mode_score", "tempo", "avg_velocity", "vel_std",
    "note_density", "pitch_mean", "pitch_range", "duration_mean",
]


# ─────────────────────────────────────────────────────────────
# 训练：在 VGMIDI 200首上拟合情感估计器
# ─────────────────────────────────────────────────────────────

def train_estimator(vgmidi_dir: Path, vgmidi_csv: Path, model_out: Path):
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import cross_val_score
    from sklearn.metrics import classification_report
    from sklearn.utils.class_weight import compute_sample_weight

    df = pd.read_csv(vgmidi_csv)
    print(f"VGMIDI 标注：{len(df)} 首")
    print(f"  valence 分布: {df['valence'].value_counts().to_dict()}")
    print(f"  arousal 分布: {df['arousal'].value_counts().to_dict()}")

    # 预建索引：把 labelled/ 下所有 .mid 文件按文件名（不含扩展名）建立查找表
    all_midi = {}
    for p in vgmidi_dir.rglob("*.mid"):
        # 文件名格式：e1_real_{series}_{console}_{game}_{piece}.mid
        # 去掉前缀 e1_real_ 后作为 key
        stem = p.stem
        for prefix in ("e1_real_", "e1_fake_top_k_", "e1_fake_top_p_"):
            if stem.startswith(prefix):
                stem = stem[len(prefix):]
                break
        all_midi[stem.lower()] = p

    rows = []
    skipped = 0
    for _, row in tqdm(df.iterrows(), total=len(df), desc="提取 VGMIDI 特征"):
        # 从 series/console/game/piece 列构建文件名 key
        key = f"{row['series']}_{row['console']}_{row['game']}_{row['piece']}".lower()
        midi_path = all_midi.get(key)
        if midi_path is None:
            # 模糊匹配：用 piece 名包含匹配
            piece_lower = str(row["piece"]).lower()
            matches = [p for k, p in all_midi.items() if piece_lower in k]
            midi_path = matches[0] if matches else None
        if midi_path is None:
            skipped += 1
            continue
        feats = extract_features(midi_path)
        if feats is None:
            skipped += 1
            continue
        feats["valence"] = int(row["valence"])
        feats["arousal"] = int(row["arousal"])
        rows.append(feats)

    print(f"有效样本: {len(rows)}，跳过: {skipped}")
    if len(rows) < 20:
        raise RuntimeError("有效样本太少，请检查 vgmidi_dir 路径")

    feat_df = pd.DataFrame(rows)
    X = feat_df[FEATURE_COLS].values
    yv = feat_df["valence"].values   # {-1, +1}
    ya = feat_df["arousal"].values   # {-1, +1}

    # Gradient Boosting 分类器（小数据集表现好）
    def make_pipeline():
        return Pipeline([
            ("scaler", StandardScaler()),
            ("clf", GradientBoostingClassifier(
                n_estimators=200, max_depth=3,
                learning_rate=0.05, random_state=42
            )),
        ])

    pipe_v = make_pipeline()
    pipe_a = make_pipeline()

    # 交叉验证评估
    cv_v = cross_val_score(make_pipeline(), X, yv, cv=5, scoring="accuracy")
    cv_a = cross_val_score(make_pipeline(), X, ya, cv=5, scoring="accuracy")
    print(f"\n5折交叉验证准确率:")
    print(f"  Valence: {cv_v.mean():.3f} ± {cv_v.std():.3f}")
    print(f"  Arousal: {cv_a.mean():.3f} ± {cv_a.std():.3f}")

    # 全量训练（过采样少数类：给少数类样本更高权重）
    sw_v = compute_sample_weight("balanced", yv)
    sw_a = compute_sample_weight("balanced", ya)
    print(f"\n过采样权重（Valence）: 负效价={sw_v[yv==-1][0]:.2f}x  正效价={sw_v[yv==1][0]:.2f}x")
    print(f"过采样权重（Arousal）: 低唤醒={sw_a[ya==-1][0]:.2f}x  高唤醒={sw_a[ya==1][0]:.2f}x")
    pipe_v.fit(X, yv, clf__sample_weight=sw_v)
    pipe_a.fit(X, ya, clf__sample_weight=sw_a)

    # 全量训练集报告
    print("\n训练集表现（Valence）:")
    print(classification_report(yv, pipe_v.predict(X), target_names=["负效价", "正效价"]))
    print("训练集表现（Arousal）:")
    print(classification_report(ya, pipe_a.predict(X), target_names=["低唤醒", "高唤醒"]))

    # 保存模型
    model_out.parent.mkdir(parents=True, exist_ok=True)
    with open(model_out, "wb") as f:
        pickle.dump({"valence": pipe_v, "arousal": pipe_a}, f)
    print(f"\n模型保存至: {model_out}")
    return pipe_v, pipe_a


# ─────────────────────────────────────────────────────────────
# 标注：预测 VGMusic 全量文件的 V/A
# ─────────────────────────────────────────────────────────────

def label_vgmusic(
    vgmusic_dir: Path,
    model_in: Path,
    output_csv: Path,
    max_files: int = 0,
):
    with open(model_in, "rb") as f:
        models = pickle.load(f)
    pipe_v: object = models["valence"]
    pipe_a: object = models["arousal"]

    # 递归找所有 .mid / .MID 文件
    midi_files = list(vgmusic_dir.rglob("*.mid")) + list(vgmusic_dir.rglob("*.MID"))
    print(f"找到 {len(midi_files)} 个 MIDI 文件")

    if max_files > 0:
        midi_files = midi_files[:max_files]
        print(f"限制处理前 {max_files} 个（调试模式）")

    results = []
    skipped = 0

    for midi_path in tqdm(midi_files, desc="预测 V/A"):
        feats = extract_features(midi_path)
        if feats is None:
            skipped += 1
            continue

        X = np.array([[feats[c] for c in FEATURE_COLS]])

        # 获取概率 → 连续值映射到 [-1, 1]
        # predict_proba 返回 [P(neg), P(pos)]，取 P(pos) 映射到 [-1,1]
        try:
            p_v = pipe_v.predict_proba(X)[0][1]   # P(valence=+1)
            p_a = pipe_a.predict_proba(X)[0][1]   # P(arousal=+1)
            # 映射：0.5 → 0, 1.0 → +0.8, 0.0 → -0.8
            valence = float((p_v - 0.5) * 1.6)
            arousal = float((p_a - 0.5) * 1.6)
        except AttributeError:
            # fallback: 直接用预测标签
            valence = float(pipe_v.predict(X)[0]) * 0.8
            arousal = float(pipe_a.predict(X)[0]) * 0.8

        # 裁剪到 [-1, 1]
        valence = float(np.clip(valence, -1, 1))
        arousal = float(np.clip(arousal, -1, 1))

        results.append({
            "midi":    str(midi_path),
            "valence": round(valence, 3),
            "arousal": round(arousal, 3),
        })

    print(f"\n处理完成：{len(results)} 首成功，{skipped} 首跳过")

    # 统计 V/A 分布
    out_df = pd.DataFrame(results)
    print(f"\nValence 均值: {out_df['valence'].mean():.3f}  std: {out_df['valence'].std():.3f}")
    print(f"Arousal 均值: {out_df['arousal'].mean():.3f}  std: {out_df['arousal'].std():.3f}")

    def _quadrant_stats(df):
        q1 = ((df.valence > 0) & (df.arousal > 0)).sum()
        q2 = ((df.valence < 0) & (df.arousal > 0)).sum()
        q3 = ((df.valence < 0) & (df.arousal < 0)).sum()
        q4 = ((df.valence > 0) & (df.arousal < 0)).sum()
        return q1, q2, q3, q4

    q1, q2, q3, q4 = _quadrant_stats(out_df)
    print(f"四象限分布（原始）: Q1={q1} Q2={q2} Q3={q3} Q4={q4}")

    # 过采样少数类：从少数象限中随机重复采样，补齐到最大象限的数量
    max_q = max(q1, q2, q3, q4)
    masks = {
        "Q1": (out_df.valence > 0) & (out_df.arousal > 0),
        "Q2": (out_df.valence < 0) & (out_df.arousal > 0),
        "Q3": (out_df.valence < 0) & (out_df.arousal < 0),
        "Q4": (out_df.valence > 0) & (out_df.arousal < 0),
    }
    extras = []
    for qname, mask in masks.items():
        qdf = out_df[mask]
        cnt = len(qdf)
        if cnt == 0:
            continue
        need = max_q - cnt
        if need > 0:
            sampled = qdf.sample(n=need, replace=True, random_state=42)
            extras.append(sampled)
            print(f"  {qname}: {cnt} → 补充 {need} 首（重复采样）")
    if extras:
        out_df = pd.concat([out_df] + extras, ignore_index=True)
        out_df = out_df.sample(frac=1, random_state=42).reset_index(drop=True)  # 打乱顺序
        q1, q2, q3, q4 = _quadrant_stats(out_df)
        print(f"四象限分布（均衡后）: Q1={q1} Q2={q2} Q3={q3} Q4={q4}")

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(output_csv, index=False)
    print(f"标签保存至: {output_csv}")
    return out_df


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="游戏音乐情感估计器")
    parser.add_argument("mode", choices=["train", "label", "all"],
                        help="train=训练估计器  label=标注VGMusic  all=全流程")

    # 训练相关
    parser.add_argument("--vgmidi_dir",  type=Path,
                        default=Path("data/raw/vgmidi/clean"),
                        help="VGMIDI clean 目录（含 labelled/ 子目录）")
    parser.add_argument("--vgmidi_csv",  type=Path,
                        default=Path("data/raw/vgmidi/vgmidi_labelled.csv"))
    parser.add_argument("--model_out",   type=Path,
                        default=Path("data/processed/emotion_estimator.pkl"))

    # 标注相关
    parser.add_argument("--vgmusic_dir", type=Path,
                        default=Path("data/raw/vgmusic/vg_music_database"))
    parser.add_argument("--model_in",    type=Path,
                        default=Path("data/processed/emotion_estimator.pkl"))
    parser.add_argument("--output_csv",  type=Path,
                        default=Path("data/processed/vgmusic_labels.csv"))
    parser.add_argument("--max_files",   type=int, default=0,
                        help="调试用：只处理前 N 个文件（0=全部）")

    args = parser.parse_args()

    if args.mode in ("train", "all"):
        train_estimator(args.vgmidi_dir, args.vgmidi_csv, args.model_out)

    if args.mode in ("label", "all"):
        label_vgmusic(args.vgmusic_dir, args.model_in, args.output_csv, args.max_files)


if __name__ == "__main__":
    main()
