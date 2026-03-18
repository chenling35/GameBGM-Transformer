# 替代模型方案实施报告：多轨游戏音乐情感生成

> 报告日期: 2026-03-11
> 目标: 评估并规划使用替代模型处理 31,800 个 VGMusic 游戏 MIDI 数据集

---

## 1. 现有方案局限性

EMO-Disentanger (ISMIR 2024) 的核心限制：
- **仅支持钢琴** — INSTR_NAME_MAP 硬编码 piano，游戏音乐平均 7.8 个乐器轨道
- **依赖和弦标注** — 每 beat 需要 root_quality_bass 格式的和弦标记，游戏 MIDI 0% 有标注
- **离散情感** — 只支持 Q1-Q4 四类，无法表示情感的连续渐变
- **生成极慢** — Stage 2 无 KV Cache，单曲 ~100 分钟 (RTX 3060)
- **训练数据绑定** — EMOPIA 仅 1,078 个钢琴片段

---

## 2. 候选模型详细分析

### 2.1 midi-emotion（最推荐 — 情感条件生成）

| 维度 | 详情 |
|------|------|
| 论文 | Sulun et al., "Symbolic Music Generation Conditioned on Continuous-Valued Emotions", IEEE Access 2022 |
| 代码 | https://github.com/serkansulun/midi-emotion |
| 架构 | Transformer + 连续 Valence-Arousal 条件注入 |
| 表示 | Pianoroll（连续时间×音高矩阵） |
| 乐器 | 多乐器（不限于钢琴） |
| 情感 | **连续值** valence ∈ [-1,1], arousal ∈ [-1,1] |
| 数据集 | Lakh MIDI (~170K 多轨 MIDI) + Spotify 情感标签 |

**与论文主题的匹配度：最高**
- Russell 环形模型的连续表示 > EMO-Disentanger 的离散 Q1-Q4
- 多乐器 > 纯钢琴
- Pianoroll 不需要和弦标注

**数据准备流程：**
```
VGMusic MIDI (31,800)
    ↓ 过滤: 去除损坏文件、非4/4拍 (~28,000 可用)
    ↓ Pianoroll 转换: miditoolkit/pretty_midi → 时间×音高矩阵
    ↓ 情感标签: 方案 A — 无标签预训练 / 方案 B — 特征启发式分类
    ↓ 训练
```

**情感标签获取方案：**
- **方案 A（推荐）**：无标签预训练 → EMOPIA 微调。midi-emotion 支持 conditioning=None
- **方案 B**：基于 MIDI 特征自动分类（tempo/key/velocity/pitch_range → valence/arousal 回归）
- **方案 C**：尝试通过游戏名/曲名匹配 Spotify 获取标签（匹配率可能 <5%）

### 2.2 MIDI-GPT（最易上手 — 多轨生成）

| 维度 | 详情 |
|------|------|
| 论文 | Metacreation Lab, AAAI 2025 |
| 代码 | https://github.com/Metacreation-Lab/MIDI-GPT |
| 架构 | GPT-2 (8 heads, 6 layers, 512 dim, ~20M params) |
| 表示 | 离散 token（Multi-Track / Bar-Fill） |
| 乐器 | **全部 128 种 GM 乐器** |
| 情感 | 无（但有密度/复音/时值等控制属性） |
| 数据集 | GigaMIDI (~500K MIDI) |

**数据准备流程（最简单）：**
```
VGMusic MIDI (31,800)
    ↓ 分成 train/ test/ valid/ 文件夹 (80/10/10)
    ↓ python create_dataset.py
    ↓ python train.py
```

**无需任何标注、无需和弦识别、无需旋律提取。直接放进去就能训练。**

### 2.3 GETMusic（最快生成 — 扩散模型）

| 维度 | 详情 |
|------|------|
| 论文 | Microsoft Research, 2023 |
| 代码 | https://github.com/microsoft/muzic/tree/main/getmusic |
| 架构 | Roformer + VQ-Diffusion（非自回归） |
| 表示 | 2D GETScore（时间×轨道） |
| 乐器 | 6 种: piano, guitar, bass, string, melody, drum |
| 情感 | 无 |
| 生成速度 | ~6 秒/曲（100 步扩散） |

**数据准备流程：**
```
VGMusic MIDI (31,800)
    ↓ 乐器映射: 128种GM → 6类 (piano/guitar/bass/string/melody/drum)
    ↓ python preprocess/to_oct.py (自动推断和弦)
    ↓ python preprocess/make_dict.py
    ↓ python preprocess/binarize.py
    ↓ 训练
```

---

## 3. 推荐实施方案

### 3.1 双线并行策略

**时间线（假设答辩前还有 4-6 周）：**

| 周次 | 任务 | 产出 |
|------|------|------|
| 第 1 周 | MIDI-GPT 训练（数据准备最简单） | 多轨游戏风格生成模型 |
| 第 2-3 周 | midi-emotion 预训练 + EMOPIA 微调 | 情感条件多乐器生成模型 |
| 第 4 周 | 对比实验 + 论文写作 | 三模型对比表 |

### 3.2 MIDI-GPT 实施细节

#### 环境搭建
```bash
# 克隆代码
git clone https://github.com/Metacreation-Lab/MIDI-GPT.git
cd MIDI-GPT

# 安装依赖 (需要 Python 3.9+)
pip install -r requirements.txt

# 或创建新的 conda 环境
conda create -n midi-gpt python=3.10
conda activate midi-gpt
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install transformers miditoolkit tqdm pyyaml
```

#### 数据准备
```python
# scripts/prepare_midi_gpt_data.py
import os, shutil, random
from pathlib import Path

# 收集所有 MIDI 文件
base = Path("data/raw/vgmusic/vg_music_database")
all_midis = list(base.rglob("*.mid"))
random.shuffle(all_midis)

# 80/10/10 划分
n = len(all_midis)
train = all_midis[:int(n*0.8)]
test = all_midis[int(n*0.8):int(n*0.9)]
valid = all_midis[int(n*0.9):]

# 复制到 MIDI-GPT 期望的目录结构
for split, files in [("train", train), ("test", test), ("valid", valid)]:
    dest = Path(f"MIDI-GPT/data/vgmusic/{split}")
    dest.mkdir(parents=True, exist_ok=True)
    for f in files:
        shutil.copy2(f, dest / f.name)

print(f"Train: {len(train)}, Test: {len(test)}, Valid: {len(valid)}")
```

#### 训练（RTX 3060 适配）
```bash
# 原始配置: 4×V100, batch_size=16
# RTX 3060 6GB 适配: batch_size=2, gradient_accumulation=8
python train.py \
    --data_dir data/vgmusic \
    --batch_size 2 \
    --gradient_accumulation_steps 8 \
    --max_epochs 50 \
    --learning_rate 1e-4 \
    --save_every 5
```

**预计训练时间**：3-7 天（RTX 3060, 31K MIDI files）

#### 生成
```bash
python generate.py \
    --checkpoint ckpt/best_model.pt \
    --num_samples 10 \
    --temperature 0.9
```

### 3.3 midi-emotion 实施细节

#### 环境搭建
```bash
git clone https://github.com/serkansulun/midi-emotion.git
cd midi-emotion
pip install -r requirements.txt
```

#### 数据准备（无标签预训练模式）
```python
# scripts/prepare_midi_emotion_data.py
import os
import pretty_midi
import numpy as np
from pathlib import Path

base = Path("data/raw/vgmusic/vg_music_database")
output = Path("midi-emotion/data/vgmusic")
output.mkdir(parents=True, exist_ok=True)

success, fail = 0, 0
for midi_path in base.rglob("*.mid"):
    try:
        pm = pretty_midi.PrettyMIDI(str(midi_path))
        # 转为 pianoroll (分辨率: 每 beat 24 步)
        pianoroll = pm.get_piano_roll(fs=24)  # shape: (128, T)
        if pianoroll.shape[1] < 96:  # 太短，跳过
            continue
        # 保存为 numpy
        np.save(output / f"{midi_path.stem}.npy", pianoroll)
        success += 1
    except:
        fail += 1

print(f"Success: {success}, Fail: {fail}")
```

#### 训练
```bash
# 无标签预训练
python train.py \
    --data_dir data/vgmusic \
    --no_emotion  \
    --epochs 50 \
    --batch_size 4

# EMOPIA 微调（加入情感条件）
python train.py \
    --data_dir data/emopia \
    --pretrained ckpt/vgmusic_pretrain.pt \
    --epochs 100 \
    --batch_size 4
```

---

## 4. 论文对比实验设计

### 4.1 对比表

| 维度 | EMO-Disentanger | midi-emotion | MIDI-GPT |
|------|----------------|-------------|----------|
| 架构 | Two-stage Transformer | Transformer + 连续条件 | GPT-2 |
| 表示 | Functional (离散 token) | Pianoroll (连续) | Multi-Track token |
| 乐器 | 仅钢琴 | 多乐器 | 128 种 GM |
| 情感控制 | 离散 Q1-Q4 | 连续 V/A | 无 |
| 训练数据 | EMOPIA (1,078) | Lakh (170K) | GigaMIDI (500K) |
| 游戏数据适配 | 需和弦/旋律提取 | 直接 pianoroll | 直接放入 |
| 生成速度 | ~100 min/曲 | 待测 | 待测 |
| 可控性 | 情感 | 情感+强度 | 密度+复音 |

### 4.2 评估指标

**客观指标：**
- Pitch Class Entropy (PCE) — 音高多样性
- Groove Consistency (GC) — 节奏一致性
- Note Density — 每小节音符数
- Polyphony Rate — 复音比例

**主观评估（人工听评）：**
- 情感一致性：生成的音乐是否与指定情感匹配？(1-5 分)
- 音乐质量：旋律是否连贯？节奏是否稳定？(1-5 分)
- 游戏适配度：是否适合作为游戏 BGM？(1-5 分)

---

## 5. 与现有系统的整合

### 5.1 后端扩展

在 `backend/main.py` 中新增 endpoint：

```python
# 新增: 多模型选择
class GenerateRequest(BaseModel):
    model: str = "emo-disentanger"  # "emo-disentanger" | "midi-emotion" | "midi-gpt"
    emotion: str = "Q1"
    valence: float = 0.5    # midi-emotion 用
    arousal: float = 0.5    # midi-emotion 用
    n_groups: int = 1
```

### 5.2 前端扩展

在 App.jsx 的 InferenceTab 中添加模型选择下拉框：

```jsx
<select value={model} onChange={e => setModel(e.target.value)}>
    <option value="emo-disentanger">EMO-Disentanger (钢琴, 离散情感)</option>
    <option value="midi-emotion">midi-emotion (多乐器, 连续情感)</option>
    <option value="midi-gpt">MIDI-GPT (多轨, 游戏风格)</option>
</select>
```

---

## 6. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| RTX 3060 显存不足 | 中 | 无法训练 | 减小 batch_size, 用 gradient checkpoint |
| MIDI-GPT 训练不收敛 | 低 | 浪费时间 | 使用官方预训练权重微调 |
| midi-emotion 代码过时 | 中 | 环境冲突 | 锁定依赖版本，用 Docker |
| 生成质量差 | 中 | 论文缺乏亮点 | 聚焦对比分析，质量差也是有价值的实验结论 |

---

## 7. 总结

**如果时间充裕（>4 周）**：执行双线并行策略，MIDI-GPT 训练游戏风格 + midi-emotion 训练情感控制，在论文中做三模型对比。

**如果时间紧张（<4 周）**：优先 MIDI-GPT（数据准备最简单，1 天就能开始训练），作为论文的对比实验。

**最低限度**：只做数据分析和可行性评估（已有 FEASIBILITY_REPORT.md），在论文「未来工作」章节讨论。
