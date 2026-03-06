# 工作日志

---

## 2026-03-06 - WebUI 全面重构 + 代码精简

### 变更概述

将前端从暗色赛博朋克风格重构为 Gradio 风格的简洁 WebUI，后端从文件库随机选择模式改为真实模型推理模式，全面清理假参数和死代码。

### 前端 (frontend/src/App.jsx)

**重构:**
- 暗色赛博朋克 → Gradio 风格简洁 UI (橙白配色)
- 三个 Tab: 音乐生成 / 模型训练 / 文件播放
- Tab 切换使用 CSS `display:none`，组件始终挂载不丢失状态
- Russell 情感环形模型四象限选择器 (Q1-Q4)

**清理假参数:**
- 删除 temperature / top_p (从未传给推理脚本)
- 删除训练 Tab 的 batchSize / epochs / learningRate / warmupSteps / dropout (由 YAML 配置控制，CLI 不接受)

**情感标签:**
- Stage 2 文件 (`_Q1_`, `_Q2_` 等) → 显示具体情感 (Q1 开心, Q2 紧张...)
- Stage 1 中间文件 (Positive/Negative) → 显示效价标签 (正效价/负效价)

### 后端 (backend/main.py)

**重构:**
- 文件库随机选择 → 真实两阶段推理 (Stage 1 + Stage 2)
- 后台任务管理 (subprocess + 日志轮询)
- 效价过滤: Stage 1 后删除不需要的效价文件，减半 Stage 2 时间
- FluidSynth 路径自动检测 (Conda 环境 / 系统 PATH / 常见安装路径)
- 文件浏览/搜索/播放 API

**清理死代码:**
- 删除 `GenerateLeadSheetRequest`, `GenerateMusicRequest` (废弃模型)
- 删除 `/api/tasks/generate-leadsheet`, `/api/tasks/generate-music`, `/api/defaults` (废弃端点)
- 删除 5 个无用预训练配置

### 目录结构

- 删除 `src/` (自训练代码，已废弃) 和 `main.py` (PyCharm 模板)
- 新增 `scripts/` (start.bat, stop.bat)
- 新增 `docs/` (WORKLOG.md, PROJECT_STRUCTURE.md)
- 新增 `tests/`
- 创建项目级 `CLAUDE.md`

### 关键决策

1. **不修改 EMO-Disentanger 原始代码** — 论文作者的 GitHub 代码，保持学术诚信
2. **删除所有假参数** — 前端只展示真正传递给推理脚本的参数
3. **GPT-2 优于 Performer** — Loss 0.120 vs 0.338，默认使用 GPT-2
4. **Stage 1 无法只生成单一效价** — 代码写死循环 Positive+Negative，通过后端过滤解决

---

## 2026-01-14 - 架构调整: 放弃自训练，改用原模型

### 背景
- 自训练 GPT-2 效果差，RTX 3060 6GB 生成速度慢
- 决定改用 EMO-Disentanger 原模型

### 变更
- 删除 `src/` 自训练代码 (preprocess.py, train.py, generate.py)
- 后端改为文件库随机选择模式 (后续在 3 月重构为真实推理)
- 创建 Conda 环境启动脚本 (start.bat, stop.bat)
- 分析 Stage 2 模型: GPT-2 (loss=0.120) vs Performer (loss=0.338)，选择 GPT-2
- 完善 .gitignore

---

## 2026-01 初始开发

- 搭建 FastAPI 后端 + React 前端
- 集成 EMO-Disentanger 模型
- 生成 Stage 1 lead sheets (40 个文件)
- 创建 4 个 demo MIDI 文件

---

## 当前状态

### 已完成
- WebUI 前后端 (真实推理模式)
- 情感选择 → 两阶段生成 → 结果播放 完整流程
- 模型训练 Tab (Stage 1 / Stage 2, 配置由 YAML 控制)
- 文件浏览/搜索/播放
- FluidSynth MIDI → WAV 转换
- 一键启动脚本

### 环境
- Conda: GameBGM-Transformer
- Conda 路径: C:\Users\11060\miniconda3
- IDE: PyCharm 2025.2.1
- GPU: RTX 3060 6GB (CUDA, 配置文件已设置 device=cuda / gpuid=0)
- 工作目录: D:\PyCharm 2025.2.1\workplace\GameBGM-Transformer
