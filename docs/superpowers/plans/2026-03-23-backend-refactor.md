# Backend 拆分重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 1071 行的 `backend/main.py` 按职责拆分为 config / models / tasks / utils + 6 个 Router 文件，不改变任何接口路径和业务逻辑。

**Architecture:** 纯物理搬移，不改逻辑。以 `backend/` 为 sys.path 根（`cd backend && python main.py` 时已自动添加），router 文件直接 `from config import ...` 即可，无需调整启动命令。旧文件备份为 `main_backup.py`，新 `main.py` 只剩 ~40 行初始化代码。

**Tech Stack:** FastAPI · Pydantic v2 · Python stdlib · uvicorn

---

## 文件结构

| 文件 | 职责 | 预计行数 |
|------|------|---------|
| `backend/config.py` | 路径常量、FluidSynth 检测、默认权重/配置、情感映射 | ~80 |
| `backend/models.py` | 所有 Pydantic 请求模型 | ~50 |
| `backend/tasks.py` | TaskInfo 类、active_tasks、run_subprocess_task、_evict_old_tasks | ~80 |
| `backend/utils.py` | convert_midi_to_wav、_resolve_safe、_SAFE_PATTERN | ~40 |
| `backend/routers/__init__.py` | 空 | 1 |
| `backend/routers/system.py` | GET /、/api/status、/api/emotions、/api/devices、/api/models/midi_emotion | ~180 |
| `backend/routers/generation.py` | POST /api/tasks/generate + run_full_generation | ~200 |
| `backend/routers/midi_emotion.py` | POST /api/tasks/generate_v2 + run_midi_emotion_generate | ~160 |
| `backend/routers/training.py` | POST /api/tasks/train + /api/tasks/train_v2 | ~100 |
| `backend/routers/task_mgmt.py` | GET/POST/DELETE /api/tasks/... | ~55 |
| `backend/routers/files.py` | /api/files/browse、/api/files/play、/api/files/search、/api/download、/api/audio、/api/cache | ~110 |
| `backend/main.py` | app 初始化 + CORS + include_router + uvicorn 入口 | ~40 |

**Import 依赖关系（无循环）:**
```
config.py        ← 无内部依赖
models.py        ← pydantic only
tasks.py         ← config (MAX_LOGS_PER_TASK)
utils.py         ← config (SOUNDFONT_PATH, FLUIDSYNTH_CMD)
routers/system.py    ← config, tasks
routers/generation.py ← config, models, tasks, utils(间接)
routers/midi_emotion.py ← config, models, tasks
routers/training.py  ← config, models, tasks
routers/task_mgmt.py ← tasks
routers/files.py     ← config, models, tasks, utils
main.py          ← 所有 routers
```

---

### Task 1: 备份原文件

**Files:**
- Copy: `backend/main.py` → `backend/main_backup.py`

- [ ] 复制备份
- [ ] 确认 main_backup.py 存在

---

### Task 2: 创建 config.py

**Files:**
- Create: `backend/config.py`

内容来源：main.py 第 5-80 行（路径配置 + FluidSynth 检测 + 默认权重 + 情感映射）

- [ ] 创建文件，移入所有常量和 `_find_fluidsynth()`

---

### Task 3: 创建 models.py

**Files:**
- Create: `backend/models.py`

内容来源：main.py 第 190-236 行（所有 Pydantic 模型）

- [ ] 创建文件

---

### Task 4: 创建 tasks.py

**Files:**
- Create: `backend/tasks.py`

内容来源：main.py 第 82-164 行（TaskInfo、active_tasks、run_subprocess_task、_evict_old_tasks）

- [ ] 创建文件

---

### Task 5: 创建 utils.py

**Files:**
- Create: `backend/utils.py`

内容来源：main.py 第 238-256 行（convert_midi_to_wav） + 第 928-936 行（_resolve_safe、_SAFE_PATTERN）

- [ ] 创建文件

---

### Task 6: 创建 routers/

**Files:**
- Create: `backend/routers/__init__.py`
- Create: `backend/routers/system.py`
- Create: `backend/routers/generation.py`
- Create: `backend/routers/midi_emotion.py`
- Create: `backend/routers/training.py`
- Create: `backend/routers/task_mgmt.py`
- Create: `backend/routers/files.py`

- [ ] 创建所有 router 文件

---

### Task 7: 重写 main.py

**Files:**
- Modify: `backend/main.py`

新内容只剩：FastAPI app 初始化 + CORS + include_router × 6 + uvicorn 入口

- [ ] 重写 main.py
- [ ] 启动验证：`cd backend && python main.py`，访问 http://localhost:8000/docs 确认 16 个路由全部出现
