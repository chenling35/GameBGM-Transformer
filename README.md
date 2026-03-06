# GameBGM-Transformer

基于 Transformer 的游戏情感背景音乐生成系统

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-red.svg)](https://pytorch.org)
[![React](https://img.shields.io/badge/React-19+-61dafb.svg)](https://reactjs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 简介

本项目实现了一个基于情感的钢琴音乐生成系统，能够根据用户选择的情感（开心、紧张、悲伤、平静）自动生成对应风格的 MIDI 音乐。

核心模型基于 [EMO-Disentanger](https://arxiv.org/abs/2312.11111)（ISMIR 2024），采用两阶段情感解耦方法：
- **Stage 1**: Valence 建模 - 生成 Lead Sheet（主旋律 + 和弦）
- **Stage 2**: Arousal 建模 - 生成完整演奏（伴奏 + 表现力）

## 功能特点

- 支持 4 种情感的音乐生成（基于 Russell 环形情感模型）
- 可选模型骨干：GPT-2 / Performer
- 可选表示方式：Functional（相对音高）/ REMI（绝对音高）
- 高质量钢琴音色合成（FluidSynth）
- 现代化 Gradio 风格 Web 界面
- 支持推理、训练、文件播放三大功能模块

## 技术栈

| 层级 | 技术 |
|------|------|
| 模型 | PyTorch, Transformer-XL, GPT-2, Performer |
| 后端 | FastAPI, FluidSynth, SoundFont |
| 前端 | React 19, Vite 7, TailwindCSS |

## 安装

### 环境要求

- Python 3.10+
- Node.js 18+
- CUDA 11.8+（GPU 训练）
- FluidSynth（音频合成）

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/chenling35/GameBGM-Transformer.git
cd GameBGM-Transformer

# 2. 创建 Python 环境
conda create -n GameBGM-Transformer python=3.10
conda activate GameBGM-Transformer

# 3. 安装 Python 依赖
pip install -r requirements.txt

# 4. 安装前端依赖
cd frontend
npm install
cd ..

# 5. 安装 FluidSynth
# Windows: 下载 https://github.com/FluidSynth/fluidsynth/releases 并添加到 PATH
# Linux: sudo apt install fluidsynth
# macOS: brew install fluidsynth
```

## 快速开始

### 一键启动（Windows）

```bash
scripts\start.bat
```

### 手动启动

**终端 1 - 后端**
```bash
cd backend
python main.py
```

**终端 2 - 前端**
```bash
cd frontend
npm run dev
```

访问 http://localhost:5173 即可使用。

### 使用流程

1. **推理标签页** - 配置模型参数，点击生成 Lead Sheet 和完整音乐
2. **训练标签页** - 选择阶段和参数，启动模型训练
3. **播放标签页** - 浏览和播放本地 MIDI/WAV 文件

## 项目结构

```
GameBGM-Transformer/
├── assets/                     # 静态资源
│   └── soundfont.sf2           #   钢琴音色库 (SoundFont)
│
├── backend/                    # FastAPI 后端服务
│   ├── __init__.py
│   └── main.py                 #   API 服务器 + 推理/训练任务管理
│
├── frontend/                   # React + Vite 前端
│   ├── src/
│   │   ├── App.jsx             #   主界面 (推理/训练/播放 三标签)
│   │   ├── main.jsx            #   React 入口
│   │   └── index.css           #   全局样式 (Gradio 风格)
│   ├── package.json
│   └── vite.config.js          #   含 API 代理配置
│
├── EMO-Disentanger/            # 核心模型 (gitignored)
│   ├── stage1_compose/         #   Stage 1: Lead Sheet 生成
│   ├── stage2_accompaniment/   #   Stage 2: 完整演奏生成
│   ├── representations/        #   MIDI 转事件序列
│   ├── best_weight/            #   预训练权重
│   ├── events/                 #   预处理后的事件数据
│   └── generation/             #   生成输出目录
│
├── data/                       # 原始 MIDI 数据集 (gitignored)
│   └── raw/
│
├── scripts/                    # 运维脚本
│   ├── start.bat               #   一键启动前后端
│   └── stop.bat                #   一键停止所有服务
│
├── docs/                       # 项目文档
│   ├── WORKLOG.md              #   开发日志
│   └── PROJECT_STRUCTURE.md    #   目录结构详细说明
│
├── tests/                      # 测试 (预留)
│
├── .gitignore
├── requirements.txt
└── README.md
```

> 详细的目录设计说明请参阅 [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)

## 情感模型

基于 Russell 环形情感模型，将情感分为四个象限：

| 象限 | 情感 | Valence | Arousal |
|------|------|---------|---------|
| Q1 | 开心 (Happy) | 正向 | 高 |
| Q2 | 紧张 (Tense) | 负向 | 高 |
| Q3 | 悲伤 (Sad) | 负向 | 低 |
| Q4 | 平静 (Calm) | 正向 | 低 |

## 示例结果

生成的音乐示例位于 `EMO-Disentanger/generation/` 目录下。

## 致谢

- [EMO-Disentanger](https://github.com/xxx/EMO-Disentanger) - 核心模型架构
- [EMOPIA](https://annahung31.github.io/EMOPIA/) - 情感钢琴数据集
- [FluidSynth](https://www.fluidsynth.org/) - MIDI 合成引擎

## License

MIT License

## 联系方式

如有问题，请提交 Issue 或联系作者。
