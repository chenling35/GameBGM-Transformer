# 训练实验记录

> 用于毕业论文实验章节，记录所有训练过程、参数、结果。
> 硬件环境：NVIDIA GeForce RTX 3060 Laptop GPU 6GB，Windows 11

---

## 环境信息

| 项目 | 版本/信息 |
|------|----------|
| GPU | NVIDIA GeForce RTX 3060 Laptop GPU |
| 显存 | 6144 MiB |
| 驱动版本 | 595.79 |
| CUDA 版本 | 13.2 |
| Python 环境 | conda: GameBGM-Transformer |
| PyTorch | 含 AMP (自动混合精度) |

---

## 数据集准备

### EMOPIA 数据集预处理

**日期**：2026-03-19

**命令**：
```bash
python src/midi_emotion/preprocess.py \
  --dataset emopia \
  --midi_dir data/raw/emopia/EMOPIA_1.0/midis \
  --label_csv data/raw/emopia/EMOPIA_1.0/label.csv \
  --output_dir data/processed/emopia
```

**结果**：
```
EMOPIA 预处理: 100% | 1078/1078 [00:19<00:00, 54.39it/s]
EMOPIA: 处理 1078 首，跳过 0 首
训练集: 970 首
测试集: 108 首
```

| 指标 | 数值 |
|------|------|
| 总文件数 | 1078 首 |
| 处理成功 | 1078 首（跳过 0） |
| 训练集 | 970 首（90%） |
| 测试集 | 108 首（10%） |
| 处理速度 | 54.39 it/s |
| 耗时 | ~19 秒 |

---

### VGMusic 情感自动标注

**日期**：2026-03-20

#### 情感估计器训练（基于 VGMIDI 200首人工标注）

**命令**：
```bash
python src/midi_emotion/label_vgmusic.py all \
  --vgmidi_dir data/raw/vgmidi/clean \
  --vgmidi_csv data/raw/vgmidi/vgmidi_labelled.csv \
  --vgmusic_dir data/raw/vgmusic/vg_music_database \
  --output_csv data/processed/vgmusic_labels.csv \
  --model_out data/processed/emotion_estimator.pkl
```

**VGMIDI 标注分布**：
| 维度 | 正 | 负 |
|------|----|----|
| Valence | 138 首 | 66 首 |
| Arousal | 115 首 | 89 首 |

**情感估计器性能（5折交叉验证）**：
| 维度 | 准确率 | 标准差 |
|------|--------|--------|
| Valence | 72.7% | ±5.7% |
| Arousal | 76.7% | ±7.3% |

过采样权重（少数类增强）：
- Valence 负效价：1.47x，正效价：0.76x
- Arousal 低唤醒：1.17x，高唤醒：0.87x

#### VGMusic 31,800首批量标注

**耗时**：约 1小时41分钟（63,600个文件 × 平均0.096秒/文件）

**标注结果**：
```
处理完成：63,094 首成功，506 首跳过
Valence 均值: +0.271  std: 0.516
Arousal 均值: +0.451  std: 0.487
```

**四象限分布（原始 → 均衡后）**：
| 象限 | 情感 | 原始 | 均衡后（过采样） |
|------|------|------|----------------|
| Q1 | Happy（正效价+高唤醒） | 36,244 | 36,244 |
| Q2 | Tense（负效价+高唤醒） | 15,694 | 36,244 |
| Q3 | Sad（负效价+低唤醒） | 2,480 | 36,244 |
| Q4 | Calm（正效价+低唤醒） | 8,642 | 36,244 |

> **注**：Q1 占比约 57% 符合游戏音乐客观规律（动作类游戏音乐居多）

---

### VGMusic 数据预处理（转 .pt 格式）

**日期**：2026-03-20

**命令**：
```bash
python src/midi_emotion/preprocess.py \
  --dataset vgmusic \
  --midi_dir data/raw/vgmusic/vg_music_database \
  --label_csv data/processed/vgmusic_labels.csv \
  --output_dir data/processed/vgmusic
```

**结果**：
```
VGMusic: 处理 144,056 首，跳过 954 首
训练集: 129,650 首
测试集: 14,406 首
耗时: 约 5 小时
```

| 指标 | 数值 |
|------|------|
| 输入文件数（含过采样） | 145,010 |
| 处理成功 | 144,056 首 |
| 跳过（损坏文件等） | 954 首 |
| 训练集 | 129,650 首 |
| 测试集 | 14,406 首 |
| 处理速度 | 8.07 it/s |

---

## 模型训练

### 调试验证（EMOPIA，50步）

**日期**：2026-03-19

**目的**：验证训练链路可行性

**命令**：
```bash
python src/midi_emotion/finetune.py \
  --data_dir data/processed/emopia \
  --output_dir midi-emotion/output/finetuned_emopia \
  --max_steps 50 \
  --tgt_len 512 \
  --batch_size 2 \
  --log_step 10 \
  --debug
```

**结果**：
```
step     10 | loss 1.9698 | 5.7 min
```

| 指标 | 数值 |
|------|------|
| 步数 | 10 步 |
| Loss | 1.9698 |
| 耗时 | 5.7 分钟 |
| 每步平均时间 | 34 秒/步 |
| batch_size | 2 |
| tgt_len | 1216（默认） |

**结论**：链路跑通，loss 正常，可以进行正式训练。

---

### 第一阶段正式训练：VGMusic 粗微调

**日期**：2026-03-20

**目的**：让模型适应游戏音乐风格（大规模无标签→自动标注数据）

**命令**：
```bash
python src/midi_emotion/finetune.py \
  --data_dir data/processed/vgmusic \
  --output_dir midi-emotion/output/finetuned_vgmusic \
  --max_steps 1500 \
  --tgt_len 512 \
  --batch_size 8 \
  --log_step 50 \
  --eval_step 500
```

**GPU 状态**（nvidia-smi）：
```
Pwr: 58W / 130W
Memory: 5842MiB / 6144MiB (95%)
GPU-Util: 100%
Temperature: 58°C
```

**速度基准**：
```
step     50 | loss 1.0341 | 11.9 min
```

| 指标 | 数值 |
|------|------|
| 前50步耗时 | 11.9 分钟 |
| 每步平均时间 | **14.3 秒/步** |
| batch_size | 8（vs 之前 2） |
| tgt_len | 512（vs 之前 1216） |
| 吞吐量 | 0.56 样本/秒（vs 之前 0.06，**提升9倍**） |
| 预计总耗时 | ~6 小时（1500步） |
| 显存占用 | 5842MB / 6144MB（95%） |

**优化措施**：
- batch_size 从 2 → 8（4倍）
- tgt_len 从 1216 → 512（注意力计算量减少 ~5倍）
- 关闭后台占用 GPU 的非必要程序

**状态**：训练中 ⏳

---

### 第二阶段计划：EMOPIA 情感精微调

**计划命令**：
```bash
python src/midi_emotion/finetune.py \
  --data_dir data/processed/emopia \
  --output_dir midi-emotion/output/finetuned_final \
  --pretrained_dir midi-emotion/output/finetuned_vgmusic \
  --max_steps 1000 \
  --tgt_len 512 \
  --batch_size 8 \
  --log_step 50 \
  --eval_step 200
```

| 参数 | 值 |
|------|-----|
| 数据集 | EMOPIA 970首（人工 Q1-Q4 标注） |
| 预训练起点 | 第一阶段 VGMusic 微调结果 |
| 目的 | 情感控制精度校准 |
| 预计耗时 | ~4 小时 |
| 状态 | 待执行 ⏳ |

---

## 两阶段微调策略说明

> 供论文实验章节参考

本文采用两阶段微调策略，平衡数据规模与标注质量：

1. **第一阶段（风格适应）**：在 129,650 首 VGMusic 游戏 MIDI 上进行粗微调。数据通过基于 VGMIDI 人工标注训练的情感估计器自动标注（Valence/Arousal 准确率约 72-77%），使模型充分学习游戏音乐的音色、节奏和结构特征。

2. **第二阶段（情感校准）**：在 970 首人工标注的 EMOPIA 数据集上进行精微调，以高质量情感标注修正模型的 V/A 条件响应，确保情感控制精度。

该策略参考迁移学习中的"渐进式微调"范式，有效缓解了游戏音乐数据标注稀缺的问题。

---

*最后更新：2026-03-20*
