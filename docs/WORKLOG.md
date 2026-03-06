# 项目工作日志 (Project Work Log)

本文件记录项目的重要变更和开发历史，方便新对话快速了解项目状态。

---

## 2026-01-14 - 项目重构与启动脚本优化

### 背景
- 自训练的GPT-2模型效果很差
- RTX 3060 6GB生成速度太慢，无法实现实时生成
- 决定改用EMO-Disentanger原模型 + 预生成文件库模式

### 主要变更

#### 1. 删除了自定义训练代码
**原因**：自训练模型效果差，改用原模型

删除的文件：
- `src/model/train.py` - GPT-2自训练代码
- `src/model/generate.py` - 自训练模型推理代码
- `src/etl/preprocess.py` - MIDI预处理和情绪分类
- `src/web/__init__.py` - 空文件
- `main.py` - PyCharm模板文件
- `checkpoints/` - 自训练模型权重
- `data/processed/` - 预处理数据集
- `tmpclaude-*-cwd` (20个) - Claude临时文件

保留的文件：
- `data/raw/` - Kaggle游戏MIDI数据（以后可能用来微调）

#### 2. 修改后端API为文件库模式
**文件**：`backend/main.py`

**核心改动**：
```python
# 新增函数
get_random_midi_for_emotion(emotion: str) -> str | None
    - 从预生成文件库中随机选择指定情绪的MIDI
    - 优先从 EMO-Disentanger/generation/emopia_functional_two/ 查找
    - 后备方案：使用 demo 文件

# 修改端点
/api/generate
    - 改为从文件库随机选择，而非实时生成
    - 返回随机选中的MIDI文件名

/api/status
    - 新增 midi_library 和 midi_library_stats 字段
    - 显示每个情绪有多少个MIDI文件

/api/files
    - 新增 source 字段（library/demo）
    - 新增 emotion_stats 统计
```

**工作流程**：
```
用户点击情绪按钮
  ↓
前端 POST /api/generate (emotion=Q1/Q2/Q3/Q4)
  ↓
后端从文件库随机选择对应情绪的MIDI
  ↓
自动转换为WAV（首次请求，之后使用缓存）
  ↓
返回文件URL给前端播放
```

#### 3. 更新 .gitignore
**新增忽略**：
- `tmpclaude-*-cwd` - Claude临时文件
- `*.claude-task-*` - Claude任务文件
- `archive/` - 归档文件夹
- `EMO-Disentanger/best_weight/` - 模型权重（太大）
- `EMO-Disentanger/**/*.pt` - 所有PyTorch权重

**允许跟踪**：
- `!data/raw/` - 原始MIDI数据
- `!EMO-Disentanger/generation/**/*.mid` - 生成的MIDI文件库

#### 4. 更新 CLAUDE.md
**主要修改**：
- 删除自定义训练Pipeline章节
- 添加EMO-Disentanger详细使用说明
- 更新数据流程图（离线生成 + 运行时选择）
- 添加项目结构说明
- 标注已删除的文件/文件夹

### 当前状态

#### MIDI文件库
- **Stage1 Lead Sheets**: ✅ 已完成（40个文件）
  - `samp_00` 到 `samp_19` 的 Positive/Negative
  - 位置：`EMO-Disentanger/generation/emopia_functional_two/`

- **Stage2 Full MIDI**: ⏳ 待生成
  - 需要运行：`cd EMO-Disentanger && python stage2_accompaniment/inference.py -m gpt2 -c stage2_accompaniment/config/emopia_finetune_gpt2.yaml -r functional`
  - 预计生成：~160个文件（40 × 4情绪）
  - 命名格式：`samp_XX_Q1_full.mid`, `samp_XX_Q2_full.mid`, etc.

#### 后端API
- ✅ 已修改为文件库模式
- ✅ 支持随机选择MIDI
- ✅ 自动MIDI转WAV
- ✅ 音频缓存机制
- ⚠️ 当前使用demo文件（每个情绪1个），等Stage2生成后会有160个

#### 前端
- ✅ 功能完整
- ⏳ 后续需要修改（用户计划单独说明需求）

### 5. 创建启动脚本（支持Conda环境）
**文件**：`start.bat`, `stop.bat`, `start-single.bat`, `start-debug.bat`

**问题**：用户每次需要开两个窗口分别启动后端和前端，且使用conda虚拟环境

**解决方案**：
```batch
# start.bat - 自动激活conda环境并启动服务
set CONDA_PATH=C:\Users\11060\miniconda3

# 启动后端（激活GameBGM-Transformer环境）
start "GameBGM-Backend" cmd /k "call "%CONDA_PATH%\Scripts\activate.bat" && call conda activate GameBGM-Transformer && cd /d "%BACKEND_DIR%" && python main.py"

# 启动前端
start "GameBGM-Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev"
```

**脚本功能**：
- `start.bat` - 双窗口启动（推荐）
- `stop.bat` - 一键停止所有服务
- `start-single.bat` - 单窗口模式（后端后台运行）
- `start-debug.bat` - 调试模式（显示详细信息）

**使用方法**：
```bash
# 启动服务
双击 start.bat

# 停止服务
双击 stop.bat
```

---

## 当前项目状态

### ✅ 已完成功能
1. **后端API** - 文件库随机选择模式
   - 支持从预生成MIDI库随机选择
   - 自动fallback到demo文件
   - MIDI转WAV自动缓存
   - 完整的错误处理

2. **前端界面** - React + Vite
   - 4个情绪按钮（Q1-Q4）
   - 音频播放和可视化
   - 响应式设计

3. **一键启动** - 支持conda环境
   - 自动激活虚拟环境
   - 双窗口/单窗口模式
   - 一键停止所有服务

4. **文档完善**
   - CLAUDE.md - 项目说明
   - WORKLOG.md - 工作日志
   - .gitignore - 完整的忽略规则

### ⏳ 待完成功能

#### 高优先级（用户计划）
1. **前端优化**（用户有详细需求，待说明）
   - UI调整
   - 功能增强
   - 用户体验改进

2. **测试现有功能**
   - 后端API测试
   - 前端交互测试
   - 音频播放测试

#### 低优先级（功能稳定后）
1. **批量生成MIDI**（几小时，建议晚上运行）
   ```bash
   cd EMO-Disentanger
   python stage2_accompaniment/inference.py -m gpt2 -c stage2_accompaniment/config/emopia_finetune_gpt2.yaml -r functional
   ```
   - 预计生成160个MIDI文件
   - 实现真正的随机播放

2. **长期优化**
   - 添加测试套件
   - Docker部署
   - API文档（Swagger）
   - 数据集微调

### 6. Stage2模型选择分析

**可选模型**：
| 模型 | 训练Loss | 模型大小 | 依赖 | 优缺点 |
|------|----------|----------|------|--------|
| **GPT-2** | 0.120 | 362MB | transformers | ✅ Loss低64%，效果好，生态成熟 |
| **Performer** | 0.338 | 170MB | fast-transformers | ⚠️ Loss高，内存效率好，兼容性差 |

**最终选择：GPT-2**
- Loss更低（0.120 vs 0.338），生成质量更好
- transformers库成熟稳定
- 权重更新时间晚（2024-08），可能是改进版
- 虚拟环境已安装transformers

**命令**：
```bash
python stage2_accompaniment/inference.py -m gpt2 -c stage2_accompaniment/config/emopia_finetune_gpt2.yaml -r functional
```

---

## 开发决策记录

### 决策1：暂不批量生成MIDI文件
**时间**：2026-01-14
**原因**：
- Stage2生成需要几小时
- 4个demo文件足够开发和测试功能
- 应该先完善功能，功能稳定后再批量生成

**结论**：优先完善前端功能，等功能稳定后晚上运行Stage2批量生成

### 决策2：使用EMO-Disentanger原模型，放弃自训练
**时间**：2026-01-14
**原因**：
- 自训练GPT-2效果很差
- RTX 3060生成太慢，无法实时生成
- EMO-Disentanger是ISMIR 2024论文模型，质量有保证

**结论**：改用预生成文件库模式，后端API随机选择返回

### 决策3：选择GPT-2而非Performer
**时间**：2026-01-14
**原因**：
- GPT-2 loss更低（0.120 vs 0.338），效果好64%
- transformers库更成熟稳定
- 不需要额外安装fast-transformers

**结论**：所有Stage2生成使用GPT-2 backbone

---

## 环境配置

### Python环境
- **虚拟环境**：Conda (`GameBGM-Transformer`)
- **Conda路径**：`C:\Users\11060\miniconda3`
- **激活方式**：启动脚本自动激活
- **Python版本**：（待记录）

### 依赖库
- **后端**：FastAPI, uvicorn, FluidSynth, mido, miditoolkit
- **前端**：React 19, Vite 7, Framer Motion, Tailwind CSS
- **模型**：transformers (GPT-2), PyTorch

### IDE配置
- **IDE**：PyCharm 2025.2.1
- **工作目录**：`D:\PyCharm 2025.2.1\workplace\GameBGM-Transformer`
- **注意**：路径包含空格，批处理脚本需要用引号

---

## 已知问题与限制

### 1. PyCharm CLI版本不支持粘贴截图
**问题**：Claude Code在PyCharm中运行的是CLI版本，不支持直接粘贴截图
**解决方案**：
- 保存截图到本地文件
- 提供文件路径，Claude可以用Read工具读取图片
- 支持PNG, JPG, GIF, BMP等格式

### 2. 当前只有demo文件，每个情绪只有1首
**问题**：未运行Stage2，文件库为空，每次播放同一首歌
**状态**：暂时可接受，等功能完善后批量生成
**计划**：功能稳定后晚上运行Stage2生成160个MIDI

### 3. Windows批处理编码问题
**问题**：批处理文件需要GBK编码，UTF-8会导致中文乱码
**解决方案**：使用纯英文注释和输出，避免编码问题

---

## 技术细节

### EMO-Disentanger生成流程
**Stage1**：生成lead sheet（主旋律骨架）
- 输出：Positive/Negative两类
- 速度：慢（小时级别）
- 已完成：40个文件

**Stage2**：添加伴奏生成完整MIDI
- 输入：Stage1的lead sheets
- 输出：Q1-Q4四个情绪的完整MIDI
- 速度：更慢（可能几小时到一天）
- 待完成

#### 模型权重位置
- **Stage1**：`best_weight/Functional-two/emopia_lead_sheet_finetune/ep016_loss0.685_params.pt`
- **Stage2 GPT2**：`best_weight/Functional-two/emopia_acccompaniment_finetune_gpt2/ep300_loss0.120_params.pt`

#### 情绪映射
- Q1: Happy (开心) - Positive valence, High arousal
- Q2: Tense (紧张) - Negative valence, High arousal
- Q3: Sad (悲伤) - Negative valence, Low arousal
- Q4: Calm (平静) - Positive valence, Low arousal

---

## 快速参考

### 日常启动命令
```bash
# 方式1：双击启动脚本（推荐）
双击 start.bat

# 方式2：手动启动
# 后端（需要激活conda环境）
conda activate GameBGM-Transformer
cd backend && python main.py

# 前端
cd frontend && npm run dev

# 停止所有服务
双击 stop.bat
```

### Stage2批量生成（慢，建议晚上运行）
```bash
cd EMO-Disentanger
python stage2_accompaniment/inference.py -m gpt2 -c stage2_accompaniment/config/emopia_finetune_gpt2.yaml -r functional

# 预计生成：~160个MIDI文件（40个lead sheet × 4个情绪）
# 预计时间：几小时（具体取决于GPU性能）
```

### 重要路径
```
项目根目录/
├── EMO-Disentanger/generation/
│   ├── emopia_functional_two/    # MIDI文件库（Stage1+2输出）
│   └── demo/demo/                 # Demo文件（4个，后备方案）
├── backend/
│   ├── main.py                    # FastAPI服务器
│   └── audio_cache/               # WAV音频缓存
├── frontend/src/
│   └── App.jsx                    # React主界面
├── assets/
│   └── soundfont.sf2              # FluidSynth音色库
├── start.bat                      # 启动脚本
├── stop.bat                       # 停止脚本
├── CLAUDE.md                      # 项目说明
└── WORKLOG.md                     # 工作日志（本文件）
```

### 关键URL
```
后端API:  http://localhost:8000
前端界面: http://localhost:5173
API文档:  http://localhost:8000/docs  (FastAPI自动生成)
状态检查: http://localhost:8000/api/status
```

### 核心文件功能
```
后端逻辑:      backend/main.py (API端点、MIDI选择、音频转换)
前端UI:        frontend/src/App.jsx (情绪按钮、音频播放)
项目说明:      CLAUDE.md (给Claude Code看的项目文档)
工作日志:      WORKLOG.md (本文件，记录变更历史)
启动脚本:      start.bat (一键启动，支持conda)
```

---

## 下次对话要做的事

### 立即任务
1. **讨论前端需求**（用户有详细规划）
   - UI调整
   - 功能增强
   - 可以提供截图（保存到本地，提供路径）

2. **测试现有功能**
   - 验证后端API工作正常
   - 测试前端播放流程
   - 检查音频转换

### 后续任务（功能完善后）
1. 批量生成MIDI文件（晚上运行）
2. 体验随机播放效果
3. 根据需要继续优化

---

## 历史记录

### 初始开发（2026-01之前）
- 实现了EMO-Disentanger的基本集成
- 创建了自定义训练Pipeline（后来废弃）
- 搭建了FastAPI后端和React前端
- 生成了4个demo MIDI文件

### 2026-01-14（本次对话）
- 删除自定义训练代码，改用原模型
- 修改后端为文件库随机选择模式
- 创建conda环境支持的启动脚本
- 完善文档（CLAUDE.md, WORKLOG.md, .gitignore）
- 分析Stage2模型选择，确定使用GPT-2
- 决定暂不批量生成，优先完善功能

### 待续...
下次对话的工作将记录在此处
