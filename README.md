# GameBGM-Transformer

基于 Transformer 的游戏情感背景音乐生成系统（毕业设计）

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-red.svg)](https://pytorch.org)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com)

## 简介

本系统集成了两种情感音乐生成模型，用户可通过 Web 界面选择情感、配置参数并一键生成 MIDI 音乐：

| 模型 | 情感控制 | 乐器 | 架构 | 来源 |
|------|---------|------|------|------|
| **EMO-Disentanger** | 离散 Q1-Q4（Russell 四象限） | 钢琴 | 两阶段 Transformer (Transformer-XL + GPT-2) | [ISMIR 2024](https://arxiv.org/abs/2407.20955) |
| **midi-emotion** | 连续 V/A（效价-唤醒度） | 多乐器 | Transformer + Pianoroll | [IEEE Access 2022](https://github.com/serkansulun/midi-emotion) |

系统支持推理生成、模型训练、文件浏览播放三大功能，并提供 FluidSynth 实时 MIDI 转音频试听。

## 功能截图

<!-- 可替换为实际截图 -->
Web 界面包含三个标签页：

- **音乐生成** — 选择模型和情感参数，一键生成音乐
- **模型训练** — 配置数据集和超参数，启动 GPU 训练
- **文件播放** — 浏览本地 MIDI 文件，在线转换试听

## 环境要求

- Python 3.10+
- Node.js 18+
- CUDA 11.8+（GPU 训练/推理）
- [FluidSynth](https://www.fluidsynth.org/)（MIDI 转音频）
- SoundFont 音色库文件（`.sf2`）

## 安装

### 1. 克隆项目

```bash
git clone --recurse-submodules https://github.com/chenling35/GameBGM-Transformer.git
cd GameBGM-Transformer
```

> 如果已 clone 但忘了 `--recurse-submodules`，补执行：
> ```bash
> git submodule update --init --recursive
> ```

### 2. Python 环境

```bash
conda create -n GameBGM-Transformer python=3.10
conda activate GameBGM-Transformer
pip install -r requirements.txt
```

### 3. 前端依赖

```bash
cd frontend
npm install
cd ..
```

### 4. FluidSynth + SoundFont

**FluidSynth 安装：**
- Windows：[下载 Release](https://github.com/FluidSynth/fluidsynth/releases)，解压后将 `bin/` 添加到系统 PATH
- Linux：`sudo apt install fluidsynth`
- macOS：`brew install fluidsynth`

**SoundFont 音色库：**

下载任意 `.sf2` 文件并放到 `assets/soundfont.sf2`：
- [SalamanderGrandPiano](https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/) — 钢琴专用，推荐
- 或搜索 "General MIDI SoundFont sf2" 获取通用音色库

### 5. 模型权重

**EMO-Disentanger 权重（必需）：**

从 [Google Drive](https://drive.google.com/file/d/15Gc8PWbkoOeXCTrpDMKsgptoL17u49QG/view?usp=sharing) 下载，解压到 `EMO-Disentanger/best_weight/`：

```
EMO-Disentanger/best_weight/
├── Functional-two/
│   ├── emopia_lead_sheet_finetune/
│   └── emopia_acccompaniment_finetune_gpt2/
└── ...
```

**midi-emotion 模型（可选，也可自行训练）：**

使用系统内置的训练功能，在 Web 界面的"模型训练"标签页中完成微调。推荐训练流程：VGMusic 粗微调 → EMOPIA 精微调。

## 快速开始

### 一键启动（Windows）

```bash
scripts\start.bat
```

### 手动启动

**终端 1 — 后端（端口 8000）**
```bash
cd backend
python main.py
```

**终端 2 — 前端（端口 5173）**
```bash
cd frontend
npm run dev
```

打开浏览器访问 http://localhost:5173

## 项目结构

```
GameBGM-Transformer/
├── EMO-Disentanger/          # [submodule] 离散情感钢琴生成 (ISMIR 2024)
├── midi-emotion/              # [submodule] 连续 V/A 多乐器生成 (IEEE Access 2022)
├── backend/
│   └── main.py                # FastAPI 服务 (推理/训练任务管理, FluidSynth 转换)
├── frontend/
│   └── src/
│       ├── App.jsx            # 应用入口
│       ├── components/        # UI 组件 (推理面板, 训练面板, 播放器等)
│       ├── hooks/             # 自定义 Hooks
│       ├── contexts/          # React Context
│       ├── constants.js       # 常量配置
│       └── utils.js           # 工具函数
├── src/
│   └── midi_emotion/          # midi-emotion 数据预处理与训练脚本
├── data/                      # 数据集 (gitignored, 需自行准备)
├── assets/                    # 音色库 (需自行下载 soundfont.sf2)
├── docs/                      # 技术文档与实验记录
├── scripts/                   # 启动/停止脚本
└── requirements.txt
```

## 情感模型

基于 Russell 环形情感模型，将情感映射到效价 (Valence) × 唤醒度 (Arousal) 二维空间：

```
        高唤醒 (High Arousal)
             │
   Q2 紧张   │   Q1 开心
   Tense     │   Happy
             │
─────────────┼─────────────
  负效价      │      正效价
             │
   Q3 悲伤   │   Q4 平静
   Sad       │   Calm
             │
        低唤醒 (Low Arousal)
```

- **EMO-Disentanger**：离散四象限 (Q1/Q2/Q3/Q4)
- **midi-emotion**：连续数值 (Valence: -1~1, Arousal: -1~1)

## 技术栈

| 层级 | 技术 |
|------|------|
| 生成模型 | PyTorch, Transformer-XL, GPT-2 |
| 后端 | FastAPI, FluidSynth, midi2audio |
| 前端 | React 19, Vite 7, Tailwind CSS |
| 音频 | FluidSynth + SoundFont (.sf2) |

## 致谢

- [EMO-Disentanger](https://github.com/Yuer867/EMO-Disentanger) — Jingyue Huang et al., ISMIR 2024 (MIT License)
- [midi-emotion](https://github.com/serkansulun/midi-emotion) — Serkan Sulun et al., IEEE Access 2022 (GPLv3)
- [EMOPIA](https://annahung31.github.io/EMOPIA/) — 情感标注钢琴数据集
- [FluidSynth](https://www.fluidsynth.org/) — MIDI 合成引擎

## 许可证

本项目自有代码采用 MIT License。

项目引用的第三方模型各有其许可证：
- EMO-Disentanger: [MIT License](https://github.com/Yuer867/EMO-Disentanger/blob/main/LICENSE)
- midi-emotion: [GPLv3](https://github.com/serkansulun/midi-emotion/blob/main/LICENSE.md)
