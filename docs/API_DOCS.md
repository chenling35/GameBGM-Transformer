# API 文档

情感音乐生成系统 FastAPI 后端接口文档（v2.0.0）

**Base URL**: `http://localhost:8000`

---

## 目录

1. [系统信息](#系统信息)
2. [情感与模型](#情感与模型)
3. [任务管理 — EMO-Disentanger](#任务管理--emo-disentanger)
4. [任务管理 — midi-emotion](#任务管理--midi-emotion)
5. [通用任务操作](#通用任务操作)
6. [文件操作](#文件操作)
7. [音频下载与播放](#音频下载与播放)
8. [数据模型速查](#数据模型速查)

---

## 系统信息

### GET `/`

**功能**: 健康检查，确认服务正常运行。

**响应示例**:
```json
{
  "message": "情感音乐生成系统 API v2.0",
  "status": "running"
}
```

---

### GET `/api/status`

**功能**: 返回系统完整状态，包括硬件、依赖、模型权重、MIDI 库统计。

**无请求参数**

**响应示例**:
```json
{
  "status": "ok",
  "emo_disentanger": true,
  "midi_library": true,
  "midi_library_stats": {
    "Q1": 5,
    "Q2": 3,
    "Q3": 4,
    "Q4": 6
  },
  "demo_files": true,
  "soundfont": true,
  "fluidsynth": true,
  "gpu": "NVIDIA GeForce RTX 3060",
  "weights": {
    "stage1": true,
    "stage2_gpt2": true,
    "stage2_performer": false
  },
  "configs": {
    "stage1_finetune": true,
    "stage2_finetune_gpt2": true,
    "stage2_finetune_performer": true
  },
  "active_tasks": 0
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | `"ok"` 或 `"error"`（EMO-Disentanger 目录不存在时为 error）|
| `emo_disentanger` | bool | EMO-Disentanger 目录是否存在 |
| `midi_library_stats` | object | 各情感已生成 MIDI 文件数量（Q1~Q4）|
| `soundfont` | bool | `assets/soundfont.sf2` 是否存在 |
| `fluidsynth` | bool | FluidSynth 可执行文件是否可用 |
| `gpu` | string | GPU 名称，无 GPU 时返回 `"无GPU"` |
| `weights` | object | 各模型权重文件是否存在 |
| `active_tasks` | int | 当前正在运行的任务数量 |

---

### GET `/api/devices`

**功能**: 检测系统所有可用计算设备（CPU + GPU），用于前端设备选择。使用三层检测策略：torch.cuda → nvidia-smi → 仅 CPU。

**无请求参数**

**响应示例**:
```json
{
  "devices": [
    {
      "id": "cpu",
      "name": "AMD Ryzen 5 5600X 6-Core Processor",
      "type": "CPU",
      "memory": null
    },
    {
      "id": "cuda:0",
      "name": "NVIDIA GeForce RTX 3060",
      "type": "GPU",
      "memory": 6442450944
    }
  ]
}
```

---

## 情感与模型

### GET `/api/emotions`

**功能**: 返回 EMO-Disentanger 支持的全部情感类别（Russell 四象限）。

**无请求参数**

**响应示例**:
```json
{
  "emotions": [
    {"id": "Q1", "name": "开心", "english": "Happy", "description": "正效价, 高唤醒"},
    {"id": "Q2", "name": "紧张", "english": "Tense", "description": "负效价, 高唤醒"},
    {"id": "Q3", "name": "悲伤", "english": "Sad",   "description": "负效价, 低唤醒"},
    {"id": "Q4", "name": "平静", "english": "Calm",  "description": "正效价, 低唤醒"}
  ]
}
```

---

### GET `/api/models/midi_emotion`

**功能**: 扫描 `midi-emotion/output/` 目录，返回可用于推理的 midi-emotion 模型列表（只返回含 `model.pt` 的目录）。

**无请求参数**

**响应示例**:
```json
{
  "models": [
    {
      "id": "continuous_concat",
      "path": "/absolute/path/to/midi-emotion/output/continuous_concat",
      "size_mb": 342.7
    },
    {
      "id": "finetuned_emopia",
      "path": "/absolute/path/to/midi-emotion/output/finetuned_emopia",
      "size_mb": 342.7
    }
  ]
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 模型目录名，作为 `/api/tasks/generate_v2` 的 `checkpoint` 参数值 |
| `size_mb` | float | `model.pt` 文件大小（MB）|

---

## 任务管理 — EMO-Disentanger

### POST `/api/tasks/generate`

**功能**: 启动 EMO-Disentanger 两阶段音乐生成任务（Stage 1 Lead Sheet → Stage 2 Full Score）。任务在后台子进程中异步执行，立即返回 `task_id`，通过轮询 `/api/tasks/{task_id}` 获取进度。

**请求体** (`application/json`):

```json
{
  "emotion": "Q1",
  "n_groups": 1,
  "output_dir": "generation/emopia_functional_two",
  "model_type": "gpt2",
  "stage1_weights": "",
  "stage2_weights": ""
}
```

**参数说明**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `emotion` | string | `"Q1"` | 目标情感：`Q1`（开心）/ `Q2`（紧张）/ `Q3`（悲伤）/ `Q4`（平静）|
| `n_groups` | int | `1` | Stage 1 生成组数（对应 `-n` 参数，越大生成越多样本，耗时增加）|
| `output_dir` | string | `"generation/emopia_functional_two"` | 输出目录（相对于 EMO-Disentanger/）|
| `model_type` | string | `"gpt2"` | Stage 2 模型骨干：`gpt2` 或 `performer` |
| `stage1_weights` | string | `""` | Stage 1 权重路径，留空使用默认权重 |
| `stage2_weights` | string | `""` | Stage 2 权重路径，留空使用默认权重 |

**响应示例**:
```json
{
  "task_id": "a3f2b1c4",
  "message": "开始生成 Q1 开心 风格音乐"
}
```

**生成产物**: `EMO-Disentanger/generation/emopia_functional_two/samp_XX_Q1_full.mid`

---

### POST `/api/tasks/train`

**功能**: 启动 EMO-Disentanger 模型训练任务（Stage 1 或 Stage 2 fine-tuning）。

**请求体** (`application/json`):

```json
{
  "stage": "stage1",
  "model_type": "gpt2",
  "representation": "functional",
  "config": "stage1_finetune"
}
```

**参数说明**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `stage` | string | `"stage1"` | 训练阶段：`stage1` 或 `stage2` |
| `model_type` | string | `"gpt2"` | Stage 2 骨干（仅 stage=stage2 时生效）：`gpt2` 或 `performer` |
| `representation` | string | `"functional"` | 音乐表示方式（当前仅支持 `functional`）|
| `config` | string | `"stage1_finetune"` | 配置文件键名或自定义路径，可选值：`stage1_finetune` / `stage2_finetune_gpt2` / `stage2_finetune_performer` |

**响应示例**:
```json
{
  "task_id": "b5e8d2f1",
  "message": "训练任务已启动: Stage1 训练 (functional)"
}
```

---

## 任务管理 — midi-emotion

### POST `/api/tasks/generate_v2`

**功能**: 启动 midi-emotion 连续情感音乐生成任务。使用连续 Valence/Arousal 值作为条件，调用 `midi-emotion/src/generate.py` 生成多轨 MIDI。

**请求体** (`application/json`):

```json
{
  "valence": 0.5,
  "arousal": 0.5,
  "gen_len": 2048,
  "n_samples": 1,
  "checkpoint": "",
  "file_prefix": ""
}
```

**参数说明**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `valence` | float | `0.5` | 情感效价，范围 `[-1.0, 1.0]`，正值=正面，负值=负面 |
| `arousal` | float | `0.5` | 情感唤醒度，范围 `[-1.0, 1.0]`，正值=高能，负值=平静 |
| `gen_len` | int | `2048` | 生成 token 数量，影响曲目时长（建议范围 512~4096）|
| `n_samples` | int | `1` | 生成样本数量，多个样本顺序生成 |
| `checkpoint` | string | `""` | 模型目录名（`/api/models/midi_emotion` 返回的 `id`），留空使用 `continuous_concat` |
| `file_prefix` | string | `""` | 输出文件名前缀（留空则由脚本自动命名）|

**响应示例**:
```json
{
  "task_id": "c7a1e4b2",
  "message": "[midi-emotion] V=+0.50 A=+0.50 × 1 samples"
}
```

---

### POST `/api/tasks/train_v2`

**功能**: 启动 midi-emotion 微调训练任务，调用 `src/midi_emotion/finetune.py`。

**请求体** (`application/json`):

```json
{
  "dataset": "emopia",
  "data_dir": "",
  "output_dir": "midi-emotion/output/finetuned",
  "pretrained": "",
  "max_steps": 1500,
  "batch_size": 8,
  "lr": 2e-5,
  "eval_step": 500
}
```

**参数说明**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `dataset` | string | `"emopia"` | 预设数据集：`emopia`（970首情感钢琴）/ `vgmusic`（129,650首游戏MIDI）/ `custom` |
| `data_dir` | string | `""` | 自定义数据目录路径（`dataset=custom` 时必填）|
| `output_dir` | string | `"midi-emotion/output/finetuned"` | 模型输出目录（相对于项目根目录）|
| `pretrained` | string | `""` | 预训练权重路径，留空使用 midi-emotion 默认预训练权重 |
| `max_steps` | int | `1500` | 最大训练步数 |
| `batch_size` | int | `8` | 批大小（RTX 3060 6GB 建议不超过 8）|
| `lr` | float | `2e-5` | 学习率 |
| `eval_step` | int | `500` | 每隔多少步进行评估 |

**响应示例**:
```json
{
  "task_id": "d9f3c6a0",
  "message": "训练任务已启动: [midi-emotion] EMOPIA 970首 | 1500步 bs=8 lr=2e-05"
}
```

**错误响应**（数据目录不存在）:
```json
{
  "detail": "数据目录不存在: /path/to/data"
}
```
HTTP 状态码: `400 Bad Request`

---

## 通用任务操作

所有异步任务（generate / generate_v2 / train / train_v2）均通过以下接口统一管理。

### GET `/api/tasks`

**功能**: 列出所有任务（含已完成、失败、运行中）。

**无请求参数**

**响应示例**:
```json
{
  "tasks": [
    {
      "task_id": "a3f2b1c4",
      "task_type": "generate",
      "description": "生成 Q1 开心 风格音乐",
      "status": "completed",
      "logs": ["[系统] 任务完成!"],
      "log_count": 42,
      "start_time": "2026-03-22T14:30:00.123456",
      "end_time": "2026-03-22T14:32:15.654321",
      "result_files": ["samp_01_Q1_full.mid"]
    }
  ]
}
```

**任务状态说明**:

| 状态值 | 说明 |
|--------|------|
| `running` | 正在执行 |
| `completed` | 成功完成 |
| `failed` | 执行失败（查看 logs 获取错误信息）|
| `stopped` | 被手动终止 |

> 注：`logs` 字段最多返回最新 200 条，完整日志用 `offset` 参数分页。

---

### GET `/api/tasks/{task_id}`

**功能**: 查询指定任务的状态与日志，支持日志分页（增量拉取）。

**路径参数**:
- `task_id` (string): 任务 ID

**Query 参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `offset` | int | `0` | 日志起始行，用于增量拉取（首次传 0，下次传上次响应的 `log_offset`）|

**响应示例**:
```json
{
  "task_id": "a3f2b1c4",
  "task_type": "generate",
  "description": "生成 Q1 开心 风格音乐",
  "status": "running",
  "logs": ["[系统] Stage1 推理中..."],
  "log_count": 15,
  "log_offset": 15,
  "start_time": "2026-03-22T14:30:00.123456",
  "end_time": null,
  "result_files": []
}
```

**错误响应** (task_id 不存在): HTTP `404`

---

### POST `/api/tasks/{task_id}/stop`

**功能**: 强制终止正在运行的任务（向子进程发送 terminate 信号）。

**路径参数**:
- `task_id` (string): 任务 ID

**响应示例**:
```json
{"message": "任务已终止"}
```

若任务未在运行:
```json
{"message": "任务未在运行"}
```

---

### DELETE `/api/tasks/{task_id}`

**功能**: 从内存中删除任务记录（仅允许删除非运行中的任务）。

**路径参数**:
- `task_id` (string): 任务 ID

**响应示例**:
```json
{"message": "任务已删除"}
```

**错误响应** (任务正在运行): HTTP `400`
```json
{"detail": "无法删除正在运行的任务"}
```

---

## 文件操作

### POST `/api/files/browse`

**功能**: 列出指定目录下的 MIDI/音频文件，支持 glob 模式过滤。默认浏览 MIDI 库目录。

**请求体** (`application/json`):

```json
{
  "directory": "",
  "pattern": "*.mid"
}
```

**参数说明**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `directory` | string | `""` | 目录路径（留空 = EMO-Disentanger 生成库目录；相对路径以项目根目录为基准）|
| `pattern` | string | `"*.mid"` | 文件匹配 glob 模式，如 `*_Q1_full.mid` |

**响应示例**:
```json
{
  "files": [
    {
      "filename": "samp_01_Q1_full.mid",
      "path": "/absolute/path/to/samp_01_Q1_full.mid",
      "size": 12345,
      "modified": "2026-03-22T14:32:15"
    }
  ],
  "directory": "/absolute/path/to/library",
  "count": 1
}
```

**错误响应**（目录不存在）:
```json
{
  "files": [],
  "directory": "/path",
  "error": "目录不存在"
}
```

---

### POST `/api/files/play`

**功能**: 播放本地 MIDI 或 WAV 文件。MIDI 文件自动通过 FluidSynth 转换为 WAV 并缓存，返回可播放的音频 URL。

**请求体** (`application/json`):

```json
{
  "file_path": "generation/emopia_functional_two/samp_01_Q1_full.mid"
}
```

**参数说明**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_path` | string | 文件路径（绝对路径或相对于 EMO-Disentanger/ 的相对路径）|

**响应示例**:
```json
{
  "success": true,
  "audio_url": "/api/audio/samp_01_Q1_full.wav",
  "filename": "samp_01_Q1_full.mid",
  "file_path": "/absolute/path/to/samp_01_Q1_full.mid"
}
```

**错误响应**:
- HTTP `404`: 文件不存在
- HTTP `500`: FluidSynth 转换失败（检查 soundfont.sf2 是否存在）
- HTTP `400`: 不支持的文件格式（仅支持 `.mid` / `.midi` / `.wav`）

---

### GET `/api/files/search`

**功能**: 在生成目录中搜索 MIDI/WAV 文件，支持文件名关键字过滤。最多返回 100 条结果。

**Query 参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | string | `""` | 文件名关键字（大小写不敏感，留空返回全部）|
| `directory` | string | `""` | 搜索目录（留空则搜索 MIDI 库、demo、generation 全部目录）|

**示例请求**: `GET /api/files/search?query=Q1&directory=`

**响应示例**:
```json
{
  "files": [
    {
      "filename": "samp_01_Q1_full.mid",
      "path": "/absolute/path/samp_01_Q1_full.mid",
      "size": 12345
    }
  ],
  "count": 1
}
```

---

## 音频下载与播放

### GET `/api/download/{filename}`

**功能**: 按文件名下载 MIDI 文件（从生成库、demo、generation 目录中查找）。

**路径参数**:
- `filename` (string): MIDI 文件名，如 `samp_01_Q1_full.mid`

**响应**: 文件流（`Content-Type: audio/midi`），浏览器触发下载。

**错误响应**: HTTP `404`

---

### GET `/api/audio/{filename}`

**功能**: 流式返回音频缓存中的 WAV 文件（由 `/api/files/play` 转换生成后缓存）。前端 `<audio>` 标签直接引用此 URL 播放。

**路径参数**:
- `filename` (string): WAV 文件名，如 `samp_01_Q1_full.wav`

**响应**: 文件流（`Content-Type: audio/wav`）。

**错误响应**: HTTP `404`

---

### DELETE `/api/cache`

**功能**: 清空 `backend/audio_cache/` 目录下所有 WAV 缓存文件（节约磁盘空间）。

**无请求参数**

**响应示例**:
```json
{"message": "已清除 12 个缓存文件"}
```

---

## 数据模型速查

### TaskInfo 响应结构

```
{
  task_id:      string    — 8位随机任务ID
  task_type:    string    — "generate" / "generate_v2" / "training"
  description:  string    — 任务描述
  status:       string    — "running" / "completed" / "failed" / "stopped"
  logs:         string[]  — 最新最多200条日志（含 [系统] [参数] 等前缀）
  log_count:    int       — 总日志条数
  log_offset:   int       — 当前返回到的偏移量（用于增量拉取）
  start_time:   string    — ISO 8601 时间戳
  end_time:     string|null — 结束时间（运行中为 null）
  result_files: string[]  — 生成的文件名列表
}
```

### 前端典型轮询模式

```javascript
// 启动任务
const { task_id } = await fetch('/api/tasks/generate', {
  method: 'POST',
  body: JSON.stringify({ emotion: 'Q1', n_groups: 1, model_type: 'gpt2' })
}).then(r => r.json());

// 增量拉取日志（每 2 秒轮询一次）
let offset = 0;
const poll = setInterval(async () => {
  const data = await fetch(`/api/tasks/${task_id}?offset=${offset}`).then(r => r.json());
  offset = data.log_offset;
  console.log(data.logs);
  if (data.status !== 'running') clearInterval(poll);
}, 2000);
```
