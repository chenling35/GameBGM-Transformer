# 项目目录结构说明

本文档详细说明 GameBGM-Transformer 的目录结构设计理念，参考 Google Python Style Guide、Hitchhiker's Guide to Python 以及业界主流 ML 项目的最佳实践。

---

## 整体结构

```
GameBGM-Transformer/
│
├── .gitignore                  # Git 忽略规则
├── README.md                   # 项目说明（入口文档）
├── requirements.txt            # Python 依赖声明
│
├── assets/                     # 静态资源文件
├── backend/                    # 后端服务代码
├── frontend/                   # 前端应用代码
├── EMO-Disentanger/            # 核心 ML 模型（外部依赖）
├── data/                       # 原始数据集
├── scripts/                    # 运维/工具脚本
├── docs/                       # 项目文档
└── tests/                      # 测试代码
```

---

## 根目录文件

| 文件 | 用途 | 规范说明 |
|------|------|----------|
| `.gitignore` | 定义 Git 不追踪的文件 | 按类别分组，含注释说明每组用途 |
| `README.md` | 项目首页文档 | GitHub/GitLab 自动渲染，是访客第一眼看到的内容 |
| `requirements.txt` | Python 依赖列表 | 放根目录是 Python 社区标准惯例，`pip install -r requirements.txt` 默认找根目录 |

### 为什么这三个文件放在根目录？

- **约定优于配置**：Python 生态中 `requirements.txt` 放根目录是硬性惯例
- **GitHub 规范**：`README.md` 和 `.gitignore` 放根目录才能被平台自动识别
- **根目录应保持精简**：只放配置/入口文件，不放业务代码

---

## `assets/` - 静态资源

```
assets/
└── soundfont.sf2           # 31MB 钢琴音色库
```

**设计原则**：
- 与代码分离的静态资源（字体、音色、图片等）统一放 `assets/`
- 不随代码逻辑变更，更新频率低
- 大型二进制文件（>10MB）应考虑 Git LFS 或 `.gitignore`

---

## `backend/` - 后端服务

```
backend/
├── __init__.py             # 空文件，标记为 Python 包
└── main.py                 # FastAPI 服务器主文件
```

**设计原则**：
- `__init__.py` 使目录成为合法的 Python 包，支持 `from backend import ...`
- 单文件后端适合中小型项目；如果后续扩展，建议按职责拆分：

```
backend/                    # 扩展后的理想结构
├── __init__.py
├── main.py                 # FastAPI app 入口
├── routers/                # API 路由模块
│   ├── inference.py        #   推理相关接口
│   ├── training.py         #   训练相关接口
│   └── files.py            #   文件管理接口
├── services/               # 业务逻辑
│   ├── task_manager.py     #   后台任务管理
│   └── audio_converter.py  #   MIDI 转 WAV
├── models/                 # Pydantic 数据模型
│   └── schemas.py
└── config.py               # 配置常量
```

---

## `frontend/` - 前端应用

```
frontend/
├── index.html              # HTML 入口
├── package.json            # Node.js 依赖和脚本
├── package-lock.json       # 锁定依赖版本
├── vite.config.js          # Vite 构建配置 + API 代理
├── tailwind.config.js      # TailwindCSS 配置
├── postcss.config.js       # PostCSS 配置
├── eslint.config.js        # ESLint 代码规范
├── .gitignore              # 前端专属忽略规则
├── public/                 # 纯静态资源（不经过构建）
│   └── vite.svg
└── src/                    # 源代码
    ├── main.jsx            # React 入口点
    ├── App.jsx             # 主组件（三标签布局）
    └── index.css           # 全局样式
```

**设计原则**：
- 这是标准的 **Vite + React** 项目结构，由 `npm create vite@latest` 生成
- `public/` 内的文件直接复制到构建输出，不经过 Vite 处理
- `src/` 内的文件经过 Vite 编译打包
- 前端有独立的 `.gitignore` 避免 `node_modules/` 和 `dist/` 入库

### 扩展建议

```
frontend/src/               # 扩展后的理想结构
├── components/             # 可复用 UI 组件
│   ├── RadioGroup.jsx
│   ├── LogOutput.jsx
│   └── AudioPlayer.jsx
├── pages/                  # 页面级组件
│   ├── InferenceTab.jsx
│   ├── TrainingTab.jsx
│   └── PlayerTab.jsx
├── hooks/                  # 自定义 React Hooks
│   └── useTaskPolling.js
├── services/               # API 调用封装
│   └── api.js
├── App.jsx
├── main.jsx
└── index.css
```

---

## `EMO-Disentanger/` - 核心模型

```
EMO-Disentanger/
├── stage1_compose/             # Stage 1: Valence 建模
│   ├── inference.py            #   推理脚本
│   ├── train.py                #   训练脚本
│   ├── dataloader.py           #   数据加载
│   ├── model/                  #   模型定义
│   │   ├── plain_transformer.py
│   │   └── transformer_helpers.py
│   └── config/                 #   训练配置
│       ├── emopia_finetune.yaml
│       └── ...
│
├── stage2_accompaniment/       # Stage 2: Arousal 建模
│   ├── inference.py
│   ├── train.py
│   ├── model/
│   │   ├── music_gpt2.py      #   GPT-2 骨干
│   │   └── music_performer.py  #   Performer 骨干
│   └── config/
│       ├── emopia_finetune_gpt2.yaml
│       └── ...
│
├── representations/            # 数据表示转换
│   ├── midi2events_emopia.py
│   └── events2words.py
│
├── best_weight/                # 预训练权重 (.pt 文件)
│   ├── Functional-two/         #   Functional 表示
│   └── REMI-two/               #   REMI 表示
│
├── events/                     # 预处理事件序列 (.pkl)
│   ├── stage1/
│   └── stage2/
│
└── generation/                 # 模型输出
    ├── demo/                   #   演示/测试输出
    └── emopia_functional_two/  #   正式生成输出
```

**设计原则**：
- 整个目录在 `.gitignore` 中被忽略（4.1GB，含大量二进制数据）
- 这是一个外部研究代码库，保持其原始结构不做改动
- 通过 `backend/main.py` 以子进程方式调用其推理/训练脚本

---

## `data/` - 数据集

```
data/
└── raw/                        # 原始未处理数据
    ├── vg_computer_song_credits.csv
    ├── vg_console_song_credits.csv
    └── vg_music_database/      # VGMusic MIDI 数据库
        ├── 3do/
        ├── amstrad/
        └── ...
```

**设计原则**：
- 在 `.gitignore` 中被忽略（891MB 原始数据）
- ML 项目数据目录的标准分层：

```
data/
├── raw/                    # 原始数据（只读，不修改）
├── processed/              # 预处理后的数据
├── interim/                # 中间处理结果
└── external/               # 第三方数据集
```

---

## `scripts/` - 运维脚本

```
scripts/
├── start.bat               # Windows 一键启动（后端 + 前端）
└── stop.bat                # Windows 一键停止所有服务
```

**设计原则**：
- 运维脚本与业务代码分离，放在专门的 `scripts/` 目录
- 这是 Google、Meta 等公司内部项目的标准做法
- 常见的脚本类型：启动/停止、数据库迁移、部署、数据导入导出

### 扩展建议

```
scripts/
├── start.bat               # 启动服务
├── stop.bat                # 停止服务
├── setup.bat               # 环境初始化（安装依赖等）
├── download_weights.py     # 下载预训练权重
└── export_model.py         # 导出模型供部署
```

---

## `docs/` - 项目文档

```
docs/
├── WORKLOG.md                  # 开发日志
├── PROJECT_STRUCTURE.md        # 本文件 - 目录结构说明
├── FEASIBILITY_REPORT.md       # VGMusic 数据集与 EMO-Disentanger 兼容性分析
└── ALTERNATIVE_MODELS_REPORT.md # 替代模型方案实施报告
```

**设计原则**：
- `docs/` 是 GitHub Pages 和各大文档工具（Sphinx, MkDocs）的默认文档目录
- `README.md` 放根目录作为入口，详细文档放 `docs/`
- 文档和代码分离，避免根目录堆积 Markdown 文件

### 扩展建议

```
docs/
├── WORKLOG.md                  # 开发日志
├── PROJECT_STRUCTURE.md        # 目录结构说明
├── FEASIBILITY_REPORT.md       # 数据可行性分析报告
├── ALTERNATIVE_MODELS_REPORT.md # 替代模型实施报告
├── API.md                      # API 接口文档
├── DEPLOYMENT.md               # 部署指南
└── images/                     # 文档配图
```

---

## `tests/` - 测试代码

```
tests/
└── .gitkeep                # 占位文件，确保空目录被 Git 追踪
```

**设计原则**：
- `.gitkeep` 是社区惯例，Git 不追踪空目录，用此文件强制保留
- 即使当前没有测试，预留目录表明项目的工程化意图
- 测试目录与源代码平级是 Python 项目的推荐结构

### 扩展建议

```
tests/
├── conftest.py             # pytest 全局配置和 fixture
├── test_backend/           # 后端测试
│   ├── test_api.py         #   API 接口测试
│   └── test_converter.py   #   音频转换测试
├── test_model/             # 模型测试
│   └── test_inference.py   #   推理输出验证
└── test_frontend/          # 前端测试（可选）
    └── App.test.jsx
```

---

## `.gitignore` 设计说明

`.gitignore` 按以下类别组织，每组以注释标题分隔：

| 类别 | 忽略内容 | 原因 |
|------|----------|------|
| Python | `__pycache__/`, `*.py[cod]` | 编译缓存，每台机器不同 |
| Virtual Environments | `venv/`, `.env` | 虚拟环境不应入库 |
| IDE | `.idea/`, `.vscode/` | 个人 IDE 配置 |
| OS | `.DS_Store`, `Thumbs.db` | 操作系统临时文件 |
| PyTorch / ML | `*.pt`, `*.pth`, `*.ckpt` | 模型权重文件太大 |
| Training | `checkpoints/`, `runs/`, `wandb/` | 训练产物 |
| Data | `data/` | 原始数据集太大 |
| EMO-Disentanger | `EMO-Disentanger/` | 外部模型代码 + 数据 |
| Frontend | `node_modules/`, `dist/` | 依赖和构建输出 |
| Backend | `audio_cache/` | 运行时缓存 |
| MIDI/Audio | `*.mid`, `*.wav` | 生成的二进制文件 |
| Claude Code | `tmpclaude-*`, `.claude/` | 工具临时文件 |
| Misc | `*.log`, `*.tmp` | 日志和临时文件 |

---

## 与业界规范的对照

### Google Python Style Guide

- 根目录只放配置文件和入口文档
- 测试代码与源代码平级（`tests/` 与 `backend/` 同级）
- 每个 Python 包都有 `__init__.py`

### Cookiecutter Data Science（ML 项目模板）

```
├── data/               ← 我们有 ✓
├── docs/               ← 我们有 ✓
├── models/             ← 我们的 EMO-Disentanger/best_weight/
├── notebooks/          ← 我们暂无（可选）
├── src/                ← 我们的 backend/ + frontend/
├── tests/              ← 我们有 ✓
├── scripts/            ← 我们有 ✓ (Makefile 的替代)
├── requirements.txt    ← 我们有 ✓
└── README.md           ← 我们有 ✓
```

### 阿里 / 字节跳动内部规范

- 强调 **关注点分离**：业务代码、配置、脚本、文档各自独立目录
- 强调 **约定优于配置**：目录名和文件名遵循社区通用命名
- 强调 **.gitignore 要全面**：防止敏感信息和大文件误提交

---

## 总结

一个好的项目目录结构应该做到：

1. **一目了然** - 新人看到目录就能理解项目的整体架构
2. **关注点分离** - 不同职责的代码放在不同目录
3. **约定优于配置** - 遵循社区通用命名，减少学习成本
4. **可扩展** - 预留空间给未来的功能和测试
5. **根目录精简** - 只放必要的配置和入口文件
