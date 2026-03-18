# 游戏音乐数据集适配 EMO-Disentanger 模型训练可行性分析报告

> 报告日期: 2026-03-08
> 项目: 基于 Transformer 架构的游戏情感音乐生成系统

---

## 1. 研究目标

评估能否将 Kaggle 上下载的 VGMusic 游戏音乐 MIDI 数据集（约 31,800 个文件）通过 EMO-Disentanger 项目内置的数据处理流水线进行预处理，并用于模型训练，从而生成具有游戏风格的情感音乐。

---

## 2. EMO-Disentanger 数据处理流水线分析

### 2.1 数据处理代码清单

EMO-Disentanger 项目在 `representations/` 目录下提供了完整的数据处理流水线：

| 文件 | 功能 | 输入 | 输出 |
|------|------|------|------|
| `midi2events_emopia.py` | EMOPIA 数据集 MIDI→事件转换 | EMOPIA MIDI + key JSON + emotion 标签 | pkl 事件序列 |
| `midi2events_hooktheory.py` | HookTheory 数据集处理 | HookTheory JSON.gz | pkl 事件序列 |
| `midi2events_pop1k7.py` | Pop1K7 数据集处理 | 预处理过的 pkl 文件 | pkl 事件序列 |
| `events2words.py` | 事件→词典（vocabulary）构建 | pkl 事件序列 | dictionary.pkl |
| `data_splits.py` | 数据集划分（train/val） | 事件文件列表 | train.pkl / valid.pkl |
| `convert_key.py` | 调性相关的辅助函数 | — | — |

### 2.2 处理流程（以 EMOPIA 为例）

```
原始 MIDI → analyzer() → 标准化 MIDI 对象
         → midi2corpus() → 量化后的数据结构 (notes/chords/tempos/labels/metadata)
         → corpus2lead() 或 corpus2full() → 事件序列 [(position, events)]
         → events2dictionary → 词典映射
         → data_splits → 训练/验证集划分
```

### 2.3 EMO-Disentanger 对输入 MIDI 的严格要求

通过逐行分析 `midi2events_emopia.py` 的 `analyzer()` 函数和 `midi2corpus()` 函数，确认以下硬性要求：

#### (A) MIDI 轨道结构

**Stage 1（Lead Sheet 生成）：**
- `only_melody=True` → 仅使用 `midi_obj.instruments[0].notes`
- 即：**第一轨道必须是旋律轨道**
- 代码第 71-73 行：`notes = midi_obj.instruments[0].notes`

**Stage 2（Full Song 生成）：**
- `only_melody=False` → 使用 3 个轨道
- 代码第 75-78 行：
  ```python
  melody = midi_obj.instruments[0].notes    # 轨道0 = 旋律
  texture = midi_obj.instruments[1].notes   # 轨道1 = 织体
  bass = midi_obj.instruments[2].notes      # 轨道2 = 低音
  ```
- 即：**必须恰好有 3 个按照 melody/texture/bass 排列的钢琴轨道**

#### (B) 和弦标注

- `midi_obj.markers` 中必须包含和弦标记
- 代码第 111-131 行：读取 markers，格式为 `root_quality_bass`（如 `C_maj_C`）
- 每个 beat 位置都需要一个和弦标注（缺失的会用前一个和弦填充）
- 和弦质量必须在 11 种标准类型中：`M, m, o, +, 7, M7, m7, o7, /o7, sus2, sus4`

#### (C) 调性标签

- 每个文件需要对应的调性名称（如 `C`, `c#`, `F`）
- 来源于外部 JSON 文件 `midi_data/EMOPIA+/adjust_keyname.json`
- 代码第 735 行：`clip2keyname = json.load(f)`

#### (D) 情感标签

- 文件名前缀决定情感：`Q1`, `Q2`, `Q3`, `Q4`
- Stage 1 映射为 2 类：`Q1/Q4 → Positive`, `Q2/Q3 → Negative`
- Stage 2 保留 4 类
- 代码第 747-752 行：`emotion = filename[:2]`

#### (E) 节拍假设

- 硬编码 4/4 拍：`BAR_RESOL = BEAT_RESOL * 4`
- 固定 `BEAT_RESOL = 480`（ticks per beat）
- 16 个 tick 位置 per bar：`TICK_RESOL = BEAT_RESOL // 4 = 120`

#### (F) 乐器限制

- `INSTR_NAME_MAP = {'piano': 0}` — 只认名为 `piano` 的乐器
- 在 `midi2corpus()` 的第 200 行：`if instr.name not in INSTR_NAME_MAP.keys(): continue`

---

## 3. Kaggle VGMusic 数据集分析

### 3.1 数据集概况

| 指标 | 值 |
|------|-----|
| 总文件数 | 31,800 |
| 来源 | vgmusic.com（游戏音乐 MIDI 社区翻制版） |
| 平台分布 | Nintendo: 18,783 / Sega: 5,210 / Sony: 3,640 / 其他: 4,167 |
| 元数据 | 两个 CSV 文件（song_name, game, company, console） |

### 3.2 随机抽样分析结果（100 个样本）

| 特征 | 统计 | 占比 |
|------|------|------|
| 成功解析 | 98/100 | 98% |
| 多轨道（>1 乐器） | 96/98 | **98%** |
| 平均乐器数 | 7.8（中位数 7） | — |
| 包含鼓轨 | 73/98 | **74%** |
| 包含钢琴(program=0) | 19/98 | 19% |
| 纯钢琴 | 2/98 | **2%** |
| 包含和弦标记 | 0/98 | **0%** |
| 包含任何 Marker | 12/98 | 12% |
| 非 4/4 拍 | 12/98 | 12% |
| ticks_per_beat 种类 | 12 种（48-1024） | — |

### 3.3 典型文件结构示例

```
kittytheme.mid (Montana Jones, 3DO)
  - 5 个乐器轨道: Staff, Staff-4, Staff-5, Staff-7, Staff-8
  - Programs: 61(French Horn), 27(Electric Guitar), 39(Synth Bass), 50(Strings), 117(Melodic Tom)
  - 2360 个音符, 0 个和弦标记
  - TPB: 192, 4/4 拍

ken4.mid (Super Street Fighter II, 3DO)
  - 14 个乐器轨道
  - Programs: 各种合成器、吉他、鼓
  - 5261 个音符, 0 个和弦标记
  - TPB: 120, 4/4 拍
```

---

## 4. 差距分析：VGMusic vs EMO-Disentanger 要求

### 4.1 关键差距汇总

| 维度 | EMO-Disentanger 要求 | VGMusic 现状 | 差距严重程度 |
|------|---------------------|-------------|-------------|
| **轨道结构** | 单轨旋律 或 3轨(melody/texture/bass) | 平均 7.8 轨，各种乐器 | **致命** |
| **和弦标注** | 每 beat 一个 `root_quality_bass` 标注 | 无任何和弦标注 (0%) | **致命** |
| **调性标签** | 每个文件需要调性名称 | 无 | **严重** |
| **情感标签** | Q1-Q4 四象限标签 | 无 | **严重** |
| **乐器名称** | 必须为 `piano` | 各种名称（Staff, Inst, 乐器名等） | **中等**（可修改） |
| **拍号** | 硬编码 4/4 | 88% 为 4/4 | **轻微**（可过滤） |
| **TPB** | 480 | 12 种不同值 | **轻微**（miditoolkit 自动处理） |

### 4.2 详细差距说明

#### 差距 1：轨道结构不匹配（致命）

EMO-Disentanger 的 `analyzer()` 函数硬编码了轨道索引：
- `instruments[0]` = 旋律
- `instruments[1]` = 织体
- `instruments[2]` = 低音

游戏音乐 MIDI 通常有 5-15 个轨道，包含：弦乐、管乐、合成器、鼓、贝斯等。旋律可能分散在多个轨道中，没有统一的轨道角色标记。

**解决此差距需要**：旋律提取算法（skyline algorithm 或专用模型），以及轨道角色分类（将多轨道合并为 melody/texture/bass 三层结构）。

#### 差距 2：缺少和弦标注（致命）

EMO-Disentanger 的事件序列中，和弦是核心组成部分：
- Lead sheet = Emotion + Bar + Beat + **Chord** + Note_Pitch + Note_Duration
- Full song = Lead sheet (含 Chord) + Performance (含 Chord + Tempo + Velocity)

训练数据中每个 beat 位置都必须有和弦标注。VGMusic 的 MIDI 文件完全没有和弦标记。

**解决此差距需要**：自动和弦识别（ACR）工具，如 `music21.harmony`、`madmom` 或 `Chordino`。但自动和弦识别在游戏音乐上的准确率未经验证。

#### 差距 3：缺少调性标签（严重）

Functional representation 需要知道每首曲子的调性，以便将绝对音高转换为相对音级（scale degree）。

**解决方案**：可使用 `music21` 的 `key.analyze('key')` 自动检测，准确率在流行音乐上约 70-80%，游戏音乐可能更低（频繁转调、非传统调式）。

#### 差距 4：缺少情感标签（严重）

训练需要 Q1-Q4 的情感标签。EMOPIA 的标注是人工完成的。

**可能的解决方案**：
1. 无标签预训练（像 HookTheory 那样，emotion=None），然后在 EMOPIA 上微调
2. 基于音频特征的自动分类（但需要 MIDI→Audio 转换后提取特征）
3. 基于 MIDI 特征的启发式分类（tempo + key + velocity + pitch range）

---

## 5. 将 VGMusic 适配到 EMO-Disentanger 的可行方案

### 方案 A：完整适配（工程量极大）

```
VGMusic MIDI
    ↓ (1) 过滤: 去除非4/4拍、解析失败、音符过少的文件
    ↓ (2) 旋律提取: skyline algorithm 或 MIDI 轨道分析
    ↓ (3) 和弦识别: music21 或 madmom 自动标注
    ↓ (4) 调性检测: music21 key analysis
    ↓ (5) 情感分类: 基于特征的自动分类 或 无标签
    ↓ (6) 格式转换: 构建符合 EMOPIA 格式的 MIDI + JSON
    ↓ (7) 运行 midi2events_emopia.py
    ↓ (8) 运行 events2words.py
    ↓ (9) 运行 data_splits.py
    ↓ (10) 训练
```

**预计工程量**：3-6 周（编写 ~1000 行预处理代码）
**质量风险**：高（自动和弦识别 + 旋律提取 + 情感分类每步都可能引入大量噪声）
**训练时间**：Stage 1 预训练 ~2-3 天 + Stage 2 预训练 ~1-2 周（RTX 3060 Laptop GPU）

### 方案 B：预训练策略（推荐的折中方案）

参考 EMO-Disentanger 原论文的训练策略：
1. **Stage 1**：先在 HookTheory（无情感标签）上预训练，再在 EMOPIA 上微调
2. **Stage 2**：先在 Pop1K7（无情感标签）上预训练，再在 EMOPIA 上微调

同理，可以：
1. 将 VGMusic 作为第三个预训练数据源（emotion=None）
2. 只做 lead sheet 级别的预训练（Stage 1），跳过更复杂的 Stage 2
3. 在 EMOPIA 上微调，让模型同时具备游戏音乐风格和情感控制能力

**此方案的简化**：
- 仍需旋律提取和和弦识别
- 不需要情感标签（emotion=None）
- 不需要 3 轨道分离（只做 lead sheet，单旋律即可）
- 预计工程量：2-3 周

### 方案 C：小规模人工筛选（最务实）

1. 从 31,800 个文件中手动筛选 200-500 个「钢琴化」程度高的文件
2. 使用工具辅助标注和弦和情感
3. 手动验证质量

**预计工程量**：1-2 周
**优点**：数据质量可控
**缺点**：数据量太小，可能不足以产生显著的风格迁移效果

---

## 6. 每个关键步骤的技术细节

### 6.1 旋律提取（Melody Extraction）

**Skyline Algorithm**（最常用的简单方法）：
- 在每个时间步取最高音作为旋律音
- 优点：实现简单（~50 行代码）
- 缺点：游戏音乐中旋律不一定是最高音（如低音旋律、和弦琶音）

```python
def skyline_melody(midi_obj):
    """从多轨道 MIDI 中提取 skyline 旋律"""
    all_notes = []
    for inst in midi_obj.instruments:
        if not inst.is_drum:
            all_notes.extend(inst.notes)
    all_notes.sort(key=lambda x: (x.start, -x.pitch))

    melody = []
    last_end = 0
    for note in all_notes:
        if note.start >= last_end:
            melody.append(note)
            last_end = note.end
    return melody
```

### 6.2 自动和弦识别

**music21 方案**：
```python
from music21 import converter, harmony
score = converter.parse('game_music.mid')
chords = score.chordify()
for c in chords.recurse().getElementsByClass('Chord'):
    root = c.root().name
    quality = c.quality
    # 映射到 EMO-Disentanger 的 11 种和弦质量
```

**局限性**：
- music21 的和弦识别基于纵向叠加，对多声部游戏音乐可能产生不合理的和弦
- 不支持流行音乐/游戏音乐中常见的 power chord、extended chord 等

### 6.3 调性检测

```python
from music21 import converter, key
score = converter.parse('game_music.mid')
detected_key = score.analyze('key')
# 返回如 Key('C major'), Key('a minor')
```

### 6.4 情感分类启发式方法

基于 Russell 环形情感模型的特征映射：

| 特征 | Q1 (Happy) | Q2 (Tense) | Q3 (Sad) | Q4 (Calm) |
|------|-----------|-----------|---------|---------|
| Tempo | 快 (>120) | 快 (>120) | 慢 (<90) | 慢 (<90) |
| Key | 大调 | 小调 | 小调 | 大调 |
| Velocity | 高 | 高 | 低 | 低 |
| Pitch Range | 宽 | 宽 | 窄 | 窄 |
| Note Density | 密 | 密 | 疏 | 疏 |

---

## 7. 不修改 EMO-Disentanger 代码的约束

根据项目规则（CLAUDE.md）：「禁止修改 EMO-Disentanger/ 目录下的任何代码」。

这意味着：
- 所有预处理代码必须写在 `EMO-Disentanger/` 之外（如 `src/etl/` 或新建 `scripts/preprocess_vgmusic.py`）
- 输出文件必须完全符合 `midi2events_emopia.py` 的输入格式
- 不能修改 `analyzer()` 函数来适应游戏音乐的结构
- 必须在调用 `midi2events_emopia.py` 之前，将游戏音乐 MIDI 转换为 EMOPIA 兼容格式

---

## 8. 训练流程（如果数据准备完成）

假设数据已经预处理为 EMOPIA 兼容格式，以下是完整的训练流程：

### 8.1 Stage 1 训练（Lead Sheet 生成）

```bash
# 在 EMO-Disentanger/ 目录下

# Step 1: MIDI → Events
python representations/midi2events_emopia.py -r functional -e lead

# Step 2: Events → Dictionary
python representations/events2words.py -r functional

# Step 3: Data Splits
python representations/data_splits.py

# Step 4: 预训练 (使用 HookTheory 配置作模板)
python stage1_compose/train.py \
  -c stage1_compose/config/hooktheory_pretrain.yaml \
  -r functional

# Step 5: 微调 (在 EMOPIA 上)
python stage1_compose/train.py \
  -c stage1_compose/config/emopia_finetune.yaml \
  -r functional
```

### 8.2 Stage 2 训练（Full Song 生成）

```bash
# Step 1: MIDI → Events (lead2full)
python representations/midi2events_emopia.py -r functional -e lead2full

# Step 2-3: 同上

# Step 4: 预训练
python stage2_accompaniment/train.py \
  -m gpt2 \
  -c stage2_accompaniment/config/pop1k7_pretrain_gpt2.yaml \
  -r functional

# Step 5: 微调
python stage2_accompaniment/train.py \
  -m gpt2 \
  -c stage2_accompaniment/config/emopia_finetune_gpt2.yaml \
  -r functional
```

### 8.3 新增 YAML 配置文件（不修改原代码）

需要创建新的 YAML 配置文件指向 VGMusic 处理后的数据：

```yaml
# stage1_compose/config/vgmusic_pretrain.yaml (新建)
device: cuda
pretrained_param_path: null

model:
  d_word_embed: 512
  pre_lnorm: True
  decoder:
    n_layer: 12
    n_head: 8
    d_model: 512
    d_ff: 2048
    dropout: 0.1
    mem_len: 0
    tgt_len: 512

data:
  data_dir: events/stage1/vgmusic_events/lead_sheet_chord11_{}/events
  train_split: events/stage1/vgmusic_events/data_splits/train.pkl
  val_split: events/stage1/vgmusic_events/data_splits/valid.pkl
  vocab_path: events/stage1/vgmusic_events/lead_sheet_chord11_{}/dictionary.pkl
  batch_size: 8
  max_n_seg: 1

training:
  warmup_steps: 200
  lr_decay_steps: 500000
  max_lr: 1.0e-4
  min_lr: 1.0e-5
  max_epoch: 50
  val_interval: 1
  log_interval: 50

output:
  ckpt_dir: ckpt/stage1/vgmusic_lead_sheet_{}
  ckpt_interval: 5
```

**注意**：虽然配置文件放在 EMO-Disentanger 目录中，但它只是一个 YAML 配置文件，不算修改代码。不过，`stage1_compose/train.py` 的 `-c` 参数有一个 `choices` 白名单限制（第 196-199 行），不接受新的配置文件路径。这意味着**要么修改 train.py 的 choices 列表（违反不修改规则），要么通过修改 YAML 内容覆盖现有配置文件（不推荐）**。

---

## 9. 结论与建议

### 9.1 直接回答：能不能用 VGMusic 训练？

**理论上可以，但工程代价极大，且存在严重的质量风险。**

核心难点不在于数据处理代码本身，而在于：
1. 游戏音乐是**多乐器编排**，EMO-Disentanger 是**纯钢琴模型** — 风格迁移有根本性的信息损失
2. 自动和弦识别在游戏音乐上的准确率未知
3. 自动情感分类的可靠性存疑
4. 训练需要数天到数周的 GPU 时间
5. 训练代码的 CLI 参数白名单限制了使用新配置文件（需要变通）

### 9.2 推荐策略

**对于毕设论文而言，建议采用以下策略**：

1. **不做完整的游戏音乐训练**（投入产出比太低）
2. **在论文中讨论这个问题**：作为「未来工作」或「系统局限性」章节的重要内容
3. **如果一定要有游戏音乐相关的贡献**，可以：
   - 写一个数据分析脚本，统计 VGMusic 数据集的特征分布（已有 31,800 个文件的统计数据）
   - 讨论从游戏音乐到钢琴 lead sheet 的信息损失问题
   - 设计（但不实现）一个预处理流水线的架构图，放在论文中

### 9.3 如果决定要做

如果决定投入时间做游戏音乐训练，**最小可行方案**是：

1. 写一个 `scripts/preprocess_vgmusic.py`（~300-500 行）
2. 只做 Stage 1 的 lead sheet 预训练（跳过 Stage 2）
3. 使用 skyline algorithm 提取旋律
4. 使用 music21 自动和弦识别 + 调性检测
5. 设 emotion=None（无情感标签的预训练）
6. 覆盖 `hooktheory_pretrain.yaml` 的 data 路径（避免修改 train.py 代码）
7. 预训练后在 EMOPIA 上微调

预计需要 2-3 周，其中编码 1 周，调试数据质量 1 周，训练 3-5 天。

---

## 10. 关于 Chat 模块的问题

> 「咱俩在 code 这个区域的聊天内容，我换成 chat 模块之后再跟你聊天你还能记得住吗」

**不能。** Claude Code 和 Claude Chat 是独立的会话环境：
- Claude Code 的对话上下文不会传递到 Chat 模块
- 但是 Claude Code 会将重要信息保存到 Memory 文件中（`~/.claude/projects/` 目录下）
- 同一个 Claude Code 项目的新 session 可以通过读取 Memory 文件和 CLAUDE.md 来恢复上下文
- Chat 模块无法访问这些文件

如果你需要在 Chat 中讨论同样的内容，建议将本报告（或其摘要）作为附件/上下文提供给 Chat。

---

## 附录 A：VGMusic 数据集平台分布

| 平台 | 文件数 | 占比 |
|------|--------|------|
| Nintendo | 18,783 | 59.1% |
| Sega | 5,210 | 16.4% |
| Sony | 3,640 | 11.4% |
| Miscellaneous | 1,870 | 5.9% |
| Microsoft | 832 | 2.6% |
| Commodore | 470 | 1.5% |
| Atari | 417 | 1.3% |
| SNK | 244 | 0.8% |
| NEC | 176 | 0.6% |
| 其他 (9个平台) | 158 | 0.5% |

## 附录 B：EMO-Disentanger 事件序列格式

### Stage 1 Lead Sheet 事件格式
```
Emotion_Positive → Key_C → Bar_None → Beat_0 → Chord_I_M → Note_Octave_5 → Note_Degree_I → Note_Duration_480 → Beat_4 → Chord_IV_M → ... → EOS_None
```

### Stage 2 Full Song 事件格式
```
Emotion_Q1 → Key_C → Tempo_120 → Track_LeadSheet → Bar_None → Beat_0 → Chord_I_M → Note_Pitch_72 → Note_Duration_480 → Track_Full → Bar_None → Beat_0 → Tempo_120 → Chord_I_M → Note_Pitch_60 → Note_Duration_240 → Note_Velocity_100 → ...
```

## 附录 C：EMOPIA 原始数据集结构

```
midi_data/EMOPIA+/
├── midis/                    # 1,078 个 MIDI 文件
│   ├── Q1_0001.mid          # Q1(Happy) 情感
│   ├── Q2_0001.mid          # Q2(Tense) 情感
│   ├── Q3_0001.mid          # Q3(Sad) 情感
│   └── Q4_0001.mid          # Q4(Calm) 情感
├── adjust_keyname.json       # 每个文件的调性标注
├── key_mode_tempo.csv        # 调性、调式、速度
└── split/
    ├── train_clip.csv
    ├── val_clip.csv
    └── test_clip.csv
```

每个 MIDI 文件包含：
- `instruments[0]`: 旋律轨道（piano, program=0）
- `instruments[1]`: 织体轨道（piano）
- `instruments[2]`: 低音轨道（piano）
- `markers[]`: 每 beat 一个和弦标注（`C_maj_C` 格式）
- `tempo_changes[]`: 速度变化
- `time_signature_changes[]`: 4/4 拍
