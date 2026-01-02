# 🎮 GameBGM-Transformer

基于 Transformer 的游戏情感背景音乐生成系统

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-red.svg)](https://pytorch.org)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 📖 简介

本项目实现了一个基于情感的钢琴音乐生成系统，能够根据用户选择的情感（开心、紧张、悲伤、平静）自动生成对应风格的 MIDI 音乐。

核心模型基于 [EMO-Disentanger](https://arxiv.org/abs/2312.11111)（ISMIR 2024），采用两阶段情感解耦方法：
- **Stage 1**: 情感解耦训练，学习分离情感特征
- **Stage 2**: 情感条件生成，根据指定情感生成音乐

## ✨ 功能特点

- 🎵 支持 4 种情感的音乐生成（基于 Russell 情感模型）
- 🎹 高质量钢琴音色合成
- 🌐 现代化 Web 界面，支持在线播放和下载
- ⚡ 快速推理，实时音频预览

## 🛠️ 技术栈

**模型层**
- PyTorch + Transformers
- EMO-Disentanger 架构

**后端**
- FastAPI
- FluidSynth + SoundFont

**前端**
- React 18 + Vite
- TailwindCSS
- Framer Motion

## 📦 安装

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

# 5. 安装 FluidSynth（音频合成）
# Windows: 下载 https://github.com/FluidSynth/fluidsynth/releases 并添加到 PATH
# Linux: sudo apt install fluidsynth
# macOS: brew install fluidsynth
```

## 🚀 快速开始

### 启动服务

需要开启两个终端：

**终端 1 - 启动后端**
```bash
cd backend
uvicorn main:app --reload --port 8000
```

**终端 2 - 启动前端**
```bash
cd frontend
npm run dev
```

访问 http://localhost:5173 即可使用。

### 使用流程

1. 选择目标情感（开心/紧张/悲伤/平静）
2. 点击「生成音乐」按钮
3. 等待生成完成后点击播放或下载

## 📁 项目结构

```
GameBGM-Transformer/
├── assets/                 # 资源文件
│   └── soundfont.sf2       # 钢琴音色库
├── backend/                # FastAPI 后端
│   └── main.py
├── frontend/               # React 前端
│   ├── src/
│   │   ├── App.jsx
│   │   └── index.css
│   └── package.json
├── EMO-Disentanger/        # 核心模型
│   ├── stage1_train.py     # Stage 1 训练
│   ├── stage2_train.py     # Stage 2 训练
│   └── generation/         # 生成结果
├── checkpoints/            # 模型权重
│   ├── best_model/
│   └── final_model/
├── requirements.txt
└── README.md
```

## 🎼 情感模型

基于 Russell 环形情感模型，将情感分为四个象限：

| 象限 | 情感 | Valence | Arousal |
|------|------|---------|---------|
| Q1 | 开心 (Happy) | 正向 | 高 |
| Q2 | 紧张 (Tense) | 负向 | 高 |
| Q3 | 悲伤 (Sad) | 负向 | 低 |
| Q4 | 平静 (Calm) | 正向 | 低 |

## 📊 示例结果

生成的音乐示例位于 `EMO-Disentanger/generation/demo/` 目录下。

## 🙏 致谢

- [EMO-Disentanger](https://github.com/xxx/EMO-Disentanger) - 核心模型架构
- [EMOPIA](https://annahung31.github.io/EMOPIA/) - 情感钢琴数据集
- [FluidSynth](https://www.fluidsynth.org/) - MIDI 合成引擎

## 📄 License

MIT License

## 📧 联系方式

如有问题，请提交 Issue 或联系作者。