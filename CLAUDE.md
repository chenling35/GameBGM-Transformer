# CLAUDE.md

## Project Overview

基于 EMO-Disentanger (ISMIR 2024) 的情感驱动钢琴音乐生成系统，毕业设计项目。
使用两阶段 Transformer 架构：Stage 1 (Transformer-XL) 生成 lead sheet，Stage 2 (GPT-2) 生成完整演奏。

## Important Rules

- **禁止修改 `EMO-Disentanger/` 目录下的任何代码** — 这是论文原作者的代码，保持原样
- 所有自定义逻辑只在 `backend/` 和 `frontend/` 中编写
- 前端参数必须真实传递给后端/推理脚本，不允许出现"假参数"（只在 UI 显示但不实际生效的参数）
- Tab 切换使用 CSS `display:none` 保持组件挂载，不能用条件渲染导致状态丢失

## Architecture

```
GameBGM-Transformer/
├── EMO-Disentanger/          # [只读] 论文原始模型代码
│   ├── stage1_compose/       # Stage 1: Transformer-XL (lead sheet, 效价建模)
│   ├── stage2_accompaniment/ # Stage 2: GPT-2/Performer (伴奏, 唤醒度建模)
│   ├── representations/      # MIDI ↔ event 转换
│   ├── generation/           # 生成输出目录
│   └── best_weight/          # 预训练权重 (不入 git)
├── backend/
│   └── main.py               # FastAPI 服务 (生成/训练任务管理, FluidSynth 转换)
├── frontend/
│   └── src/App.jsx            # React 单文件应用 (646 行)
├── scripts/                   # start.bat, stop.bat
├── docs/                      # WORKLOG.md, PROJECT_STRUCTURE.md
└── tests/
```

## Emotion System (Russell Circumplex)

| ID | Name | Valence | Arousal | Color |
|----|------|---------|---------|-------|
| Q1 | 开心 Happy | Positive (正效价) | High (高唤醒) | #f97316 |
| Q2 | 紧张 Tense | Negative (负效价) | High (高唤醒) | #ef4444 |
| Q3 | 悲伤 Sad | Negative (负效价) | Low (低唤醒) | #6366f1 |
| Q4 | 平静 Calm | Positive (正效价) | Low (低唤醒) | #22c55e |

## Generation Flow

1. 用户选择情感 (Q1-Q4) → 映射到 valence (Positive/Negative)
2. Stage 1 推理 → 强制生成 Positive + Negative 两种 lead sheet (无法只生成一种)
3. 后端删除不需要的 valence 文件
4. Stage 2 推理 → Positive → Q1+Q4, Negative → Q2+Q3
5. 前端按 `*_{emotion}_full.mid` 过滤显示结果

Stage 1 产物: `samp_XX_Positive.mid`, `samp_XX_Negative.mid` (中间文件)
Stage 2 产物: `samp_XX_Q1_full.mid` (最终文件)

## Real Parameters (actually sent to inference scripts)

**生成 (inference):**
- emotion (Q1-Q4) — 控制效价过滤
- n_groups — Stage 1 的 `-n` 参数
- model_type (gpt2/performer) — Stage 2 模型骨干
- output_dir — 输出目录
- stage1_weights / stage2_weights — 权重路径

**训练 (training):**
- stage (stage1/stage2) — 训练阶段
- model_type (gpt2/performer) — Stage 2 用
- 其他超参数 (batch_size, lr, epochs 等) 全在 YAML 配置文件中，CLI 不接受

## Commands

```bash
# 启动服务
scripts/start.bat                    # 或手动:
cd backend && python main.py         # 后端 :8000
cd frontend && npm run dev           # 前端 :5173

# EMO-Disentanger 推理 (在 EMO-Disentanger/ 目录下)
python stage1_compose/inference.py -c stage1_compose/config/emopia_finetune.yaml -r functional -m lead_sheet -n 1
python stage2_accompaniment/inference.py -m gpt2 -c stage2_accompaniment/config/emopia_finetune_gpt2.yaml -r functional
```

## Key Config Files

- `EMO-Disentanger/stage1_compose/config/emopia_finetune.yaml` — Stage 1 配置 (device: cuda)
- `EMO-Disentanger/stage2_accompaniment/config/emopia_finetune_gpt2.yaml` — Stage 2 GPT-2 配置 (gpuid: 0)

## Tech Stack

- Backend: FastAPI + FluidSynth (midi2audio)
- Frontend: React 19 + Vite 7 + Tailwind CSS (单文件 App.jsx)
- Model: PyTorch + Transformers (GPT-2)
- Environment: Conda (GameBGM-Transformer), Python, Node.js

## Data Pipeline (EMO-Disentanger)

核心文件: `EMO-Disentanger/representations/midi2events_emopia.py` (787行)

**处理流程**: MIDI → midi2corpus() → corpus2lead()/corpus2full() → events2words.py → data_splits.py

**硬性要求**:
- 仅接受钢琴 (`INSTR_NAME_MAP = {'piano': 0}`)
- 需要 3 轨: melody (instruments[0]), texture (instruments[1]), bass (instruments[2])
- 每 beat 需要 `root_quality_bass` 格式和弦标注 (从 midi_obj.markers 读取)
- 需要调性标签 (从 adjust_keyname.json 加载)
- 情感标签从文件名前缀提取 (Q1/Q2/Q3/Q4)
- 4/4 拍号, 480 TPB
- 使用 Functional Representation (相对音高 + 罗马数字和弦)，非标准 REMI

**表示方式**: Functional Representation
- 音高: 相对音阶度数 (scale degree)
- 和弦: 罗马数字标记 (I, ii, V7 等)
- 优势: 调性不变性，利于跨调学习

## VGMusic 游戏数据集

位置: `data/raw/vgmusic/vg_music_database/` (31,800 首游戏 MIDI)

**与 EMO-Disentanger 的兼容性**: 极低
- 平均 7.8 乐器轨 (需仅钢琴)
- 0% 和弦标注 (需 100%)
- 0% 情感标签
- 74% 含鼓轨

详见 `docs/FEASIBILITY_REPORT.md` 和 `docs/ALTERNATIVE_MODELS_REPORT.md`

## Alternative Models (研究中)

- **midi-emotion**: 连续 V/A 情感控制 + 多乐器 + Pianoroll — 最匹配论文主题
- **MIDI-GPT**: 128 种 GM 乐器 + GPT-2 架构 — 数据准备最简单
- **GETMusic**: 扩散模型 + 6种乐器 — 生成最快 (~6s/曲)
