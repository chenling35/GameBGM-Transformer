# 代码审查报告

审查日期：2026-03-22
审查范围：backend/main.py（1033行）、前端 6 个文件
审查员：Claude Sonnet 4.6（Senior Code Reviewer 角色）

---

## 严重问题（需要修复）

### S1 - 路径穿越攻击（Path Traversal）

**文件：** `backend/main.py:911-933`（`/api/files/browse`）、`main.py:936-972`（`/api/files/play`）

`/api/files/browse` 接受客户端传入的 `directory` 字段，仅做了"若非绝对路径则拼接 BASE_DIR"的处理，没有验证最终路径是否仍在项目目录内。攻击者可以传入 `../../Windows/System32` 这样的路径，结合 `req.pattern`（同样未过滤），枚举服务器上的任意目录内容。

`/api/files/play` 同理：`req.file_path` 未经白名单校验，可被用于读取服务器上任意可访问的 `.wav`/`.mid` 文件。

**根本原因：** 缺少路径归一化后的边界检查（`path.resolve().startswith(BASE_DIR)`）。

**建议修复方式（思路，非代码）：** 在解析出 `dir_path` / `file_path` 之后，调用 `.resolve()` 得到绝对真实路径，然后断言该路径以 `BASE_DIR.resolve()` 为前缀，不满足则返回 403。

---

### S2 - glob pattern 未过滤，可能导致 ReDoS / 枚举敏感文件

**文件：** `backend/main.py:924`

```
for f in sorted(dir_path.glob(req.pattern)):
```

`req.pattern` 直接来自客户端，客户端可以传入 `**/*` 递归枚举整个磁盘（受限于前缀路径，但前缀本身已有 S1 问题）。即使 S1 修复后，允许客户端自由定义 glob pattern 仍然是不必要的暴露面。

**建议：** 仅允许白名单 pattern（如 `*.mid`, `*.midi`, `*.wav`），在后端做枚举验证，拒绝含 `**` 或 `..` 的 pattern。

---

### S3 - active_tasks 字典无上限，存在内存耗尽风险

**文件：** `backend/main.py:82`、`609-625`、`757-774`

每次调用 `/api/tasks/generate` 或 `/api/tasks/generate_v2` 都往 `active_tasks` 字典追加一条记录，且该字典永不自动清理。每个 `TaskInfo` 对象中的 `logs` 列表（`main.py:103`）虽然在 `to_dict()` 里截断为 200 条，但内存中的原始 `logs` 列表可以无限增长（Stage2 的进度监控每 60 秒追加一条，训练任务可能运行数小时）。

服务运行足够长时间后，会导致内存耗尽，进程崩溃。

**建议：** 对 `active_tasks` 设置容量上限（如最多保留最近 50 条），对每个任务的 `logs` 列表设置硬上限（如 10000 条），超出时丢弃最旧的日志。

---

### S4 - 输入参数缺乏数值边界校验（V/A、gen_len、n_samples）

**文件：** `backend/main.py:205-212`（`GenerateV2Request`）

```python
valence: float = 0.5        # 效价 [-1, 1]
arousal: float = 0.5        # 唤醒度 [-1, 1]
gen_len: int = 2048
n_samples: int = 1
```

Pydantic 模型上没有 `Field(ge=-1, le=1)` 等约束。客户端若传入 `valence=9999`、`n_samples=100`、`gen_len=999999`，后端会原样传给推理脚本，可能触发 GPU OOM 或让服务器长时间不响应。

同理 `GenerateRequest` 中的 `n_groups` 无上限（`main.py:179`），`TrainV2Request` 中的 `max_steps`（`main.py:199`）、`batch_size` 亦无上限。

**建议：** 使用 `pydantic.Field` 加 `ge`/`le`/`gt` 约束，例如：
- `valence: float = Field(0.5, ge=-1.0, le=1.0)`
- `n_samples: int = Field(1, ge=1, le=10)`
- `gen_len: int = Field(2048, ge=128, le=8192)`
- `n_groups: int = Field(1, ge=1, le=10)`

---

## 潜在风险（建议修复）

### W1 - MIDI-to-WAV 缓存无过期机制，文件名碰撞

**文件：** `backend/main.py:958-964`

```python
wav_name = file_path.stem + ".wav"
wav_path = AUDIO_CACHE_DIR / wav_name
if not wav_path.exists():
    success = convert_midi_to_wav(file_path, wav_path)
```

缓存 key 只用了文件名（不含路径），两个不同目录下同名的 MIDI 文件（如 `samp_01_Q1_full.mid`）会共用同一个 WAV 缓存，导致播放内容错误。

**建议：** 缓存 key 改为对完整路径取 MD5/SHA256 前缀，如 `{hash8}_{stem}.wav`。

---

### W2 - run_full_generation 内两个 task.process 引用存在竞态

**文件：** `backend/main.py:468-527`

```python
process = subprocess.Popen(...)
task.process = process          # 第一次赋值 (Stage1)
...
process2 = subprocess.Popen(...)
task.process = process2         # 第二次赋值 (Stage2)
```

如果用户在 Stage1 运行时调用 `/api/tasks/{id}/stop`（`main.py:885-896`），此时 `task.process` 指向 Stage1 进程，正确。但如果 Stage1 结束、Stage2 尚未启动，`task.process` 被赋值为 `None`（`finally` 块 `main.py:606`），stop 接口会静默返回"任务未在运行"，实际上 Stage2 随后仍会启动并无法被终止。

**建议：** 将 stop 逻辑改为检查并设置一个 `task.cancelled` 标志位，生成函数在每个阶段开始前检查该标志。

---

### W3 - 文件重命名与并发生成存在竞争条件

**文件：** `backend/main.py:724-736`

```python
midi_files = sorted(gen_dir.glob("*.mid"), key=lambda f: f.stat().st_mtime, reverse=True)
recent = midi_files[:req.n_samples]
if req.file_prefix:
    for f in recent:
        new_name = f"{req.file_prefix}_{f.name}"
        f.rename(new_path)
```

通过修改时间取"最新 N 个文件"的方式不可靠：若两个生成任务并发运行，或文件系统时间精度较低，可能取到错误的文件并重命名。

**建议：** 让 `generate.py` 支持 `--output_dir` 参数并指定唯一子目录（以 `task_id` 命名），避免多任务输出混在同一目录。

---

### W4 - convert_midi_to_wav 无超时保护

**文件：** `backend/main.py:238`

```python
result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
```

FluidSynth 转换有 60 秒超时，这是好的。但若 MIDI 文件异常大或损坏，FluidSynth 可能在 60 秒内挂起输出而不退出，此时 `subprocess.run` 会等满 60 秒，在此期间 FastAPI 的 async 接口线程处于同步阻塞状态（因为 `play_local_file` 是 `async` 函数但调用了同步 `convert_midi_to_wav`），会阻塞整个事件循环。

**建议：** 将 `convert_midi_to_wav` 改为 `async` 函数，使用 `asyncio.create_subprocess_exec` + `asyncio.wait_for`，或在线程池中执行（`await asyncio.get_event_loop().run_in_executor(None, convert_midi_to_wav, ...)`）。

---

### W5 - /api/status 端点的 GPU 检测启动子进程，无并发保护

**文件：** `backend/main.py:384-426`

`/api/status` 每次被调用都会 spawn 两个子进程（torch 检测 + wmic），外加 fluidsynth。如果前端频繁轮询状态（如每 5 秒一次），并发请求会积累大量短命子进程。

**建议：** 将系统信息（GPU 名称、FluidSynth 可用性）在启动时缓存一次，`/api/status` 直接返回缓存值，只有在收到明确刷新请求时重新检测。

---

### W6 - useMidiEmotionModels Hook 缺少错误重试逻辑

**文件：** `frontend/src/hooks/useMidiEmotionModels.js:7-11`

```javascript
fetch(`${API_BASE}/api/models/midi_emotion`)
  .then(r => r.json())
  .then(data => { setModels(...); setLoaded(true) })
  .catch(() => setLoaded(true))
```

`catch` 只设置 `loaded=true`，吞掉了错误，用户看不到任何网络错误提示。若后端未启动，用户看到的只是空的模型列表和"暂无可用模型"提示，可能误以为是真的没有模型。

**建议：** `catch` 中保存错误状态并在 UI 展示"无法连接后端"的提示。

---

### W7 - EmoDisentangerPanel 中 filePrefix 状态未被使用

**文件：** `frontend/src/components/EmoDisentangerPanel.jsx:14`、`67-73`

```javascript
const [filePrefix, setFilePrefix] = useState('')
// ... handleGenerate 中提交的 body:
body: JSON.stringify({
  emotion, n_groups, output_dir, model_type,
  stage1_weights: '', stage2_weights: '',
  // filePrefix 未包含在请求体中
})
```

`filePrefix` 状态被声明、被输入框绑定，但始终没有传递给后端。这是一个"假参数"，违反了项目 CLAUDE.md 中"前端参数必须真实传递给后端"的铁律。

**建议：** 要么将 `file_prefix` 加入请求体并在后端 `GenerateRequest` 和 `run_full_generation` 中实现文件重命名逻辑，要么移除该输入框。

---

### W8 - MidiEmotionPanel 终止任务按钮的 fetch 没有 abort 保护

**文件：** `frontend/src/components/MidiEmotionPanel.jsx:159`

```javascript
<button onClick={async () => {
  if (taskId) {
    try { await fetch(`${API_BASE}/api/tasks/${taskId}/stop`, { method: 'POST' }) }
    catch (e) { console.error(e) }
  }
}}>终止任务</button>
```

该 fetch 调用写在 JSX 内的匿名箭头函数中，没有超时控制，也没有加载状态反馈。用户点击后按钮没有视觉响应，不知道请求是否发出。`EmoDisentangerPanel` 的 `handleStop`（`EmoDisentangerPanel.jsx:99-105`）实现更规范，两者应该统一。

**建议：** 将该逻辑提取为具名函数（参考 `EmoDisentangerPanel` 中的 `handleStop`），并加入加载状态。

---

### W9 - PlayerTab 的 debounceRef 定时器未在 unmount 时清理

**文件：** `frontend/src/components/PlayerTab.jsx:14`、`31-35`

```javascript
const debounceRef = useRef(null)
const handlePathChange = (path) => {
  clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => doBrowse(path), 500)
}
```

组件没有 `useEffect` 清理 `debounceRef`。若组件在 debounce 延迟期间被 unmount（Tab 切换），500ms 后定时器仍会触发 `doBrowse`，调用 `setFiles`、`setError` 等 state setter，引发 React 的"无法对已卸载组件更新 state"警告（React 18 虽然取消了此警告，但悬空的 fetch 请求仍然存在，造成资源浪费）。

**建议：** 添加清理 effect：
```javascript
useEffect(() => () => clearTimeout(debounceRef.current), [])
```

---

### W10 - AudioContext 内容设计过于耦合

**文件：** `frontend/src/contexts/AudioContext.jsx`、`frontend/src/App.jsx:14-18`

`AudioContext` 把 `audioRef`（DOM 引用）通过 Context 向下传递。`setAudio` 里直接操作 `audioRef.current`：

```javascript
setTimeout(() => { audioRef.current?.load(); audioRef.current?.play().catch(() => {}) }, 100)
```

这里用 `setTimeout(..., 100)` 作为等待 state 更新后 DOM 刷新的手段，属于不可靠的 hack。若设备慢或渲染延迟，100ms 可能不够。`play()` 错误被 `.catch(() => {})` 静默吞掉，用户不会知道播放失败。

**建议：** 将 `load()`/`play()` 调用移到 `audio` 元素的 `onCanPlay` / `onLoadedData` 事件回调中，去掉 `setTimeout`。

---

## 后端拆分方案（A2）

当前 `backend/main.py` 1033 行承担了过多职责。以下是建议的模块拆分方案，**仅供参考，无需立即执行**：

```
backend/
├── main.py                  # 入口：只做 FastAPI app 初始化 + 路由注册（< 80 行）
├── config.py                # 路径常量、权重路径、情感映射表（当前 main.py 第 1-80 行）
├── models/
│   ├── schemas.py           # 所有 Pydantic 请求/响应模型（当前第 177-222 行）
│   └── task.py              # TaskInfo 类 + active_tasks 字典（当前第 82-150 行）
├── services/
│   ├── generation.py        # run_full_generation、run_midi_emotion_generate（当前第 430-754 行）
│   ├── training.py          # run_subprocess_task（用于训练，当前第 111-150 行）
│   └── audio.py             # convert_midi_to_wav、FluidSynth 检测（当前第 36-57、225-242 行）
└── routers/
    ├── tasks.py             # /api/tasks/* 路由（当前第 867-907 行）
    ├── files.py             # /api/files/* 路由（当前第 910-1001 行）
    ├── media.py             # /api/audio/*、/api/download/* 路由（当前第 1004-1028 行）
    └── system.py            # /api/status、/api/devices、/api/emotions 路由（当前第 245-382 行）
```

拆分收益：
- `generation.py` 是最复杂的业务逻辑（~325 行），独立后便于单独测试
- `schemas.py` 独立后可以直接在 FastAPI 的 OpenAPI 文档生成中复用
- 路由模块独立后，新增 API（如未来的 v3 模型）只需新增一个路由文件，不影响其他模块

---

## 前端问题（A3）

### A3-1 - EmoDisentangerPanel 和 MidiEmotionPanel 有大量重复的轮询逻辑

两个面板各自实现了几乎相同的任务轮询（`pollRef`、`timerRef`、`offset` 变量、状态更新逻辑）。`useTrainTask.js` 已经将该模式提取为 hook，但推理面板没有复用它。

受影响文件：
- `frontend/src/components/EmoDisentangerPanel.jsx:79-96`
- `frontend/src/components/MidiEmotionPanel.jsx:61-77`

与 `frontend/src/hooks/useTrainTask.js:17-33` 对比，三者逻辑几乎一致。

**建议：** 将 `useTrainTask` 重命名为 `useTaskPoller`（或类似通用名称），在推理面板中也使用它，消除三处重复代码。

---

### A3-2 - 轮询使用固定 1 秒间隔，没有退避策略

**文件：** `EmoDisentangerPanel.jsx:80`、`MidiEmotionPanel.jsx:62`、`useTrainTask.js:21`

所有轮询均使用 `setInterval(..., 1000)`，对于训练任务（可能运行数小时）来说，每秒发一次请求会产生大量无意义的网络请求，浪费服务器资源。

**建议：** 实现指数退避：任务开始时每秒轮询，30秒后切换到每5秒，5分钟后切换到每30秒。

---

### A3-3 - logs 数组无限增长，可能导致浏览器内存问题

**文件：** `EmoDisentangerPanel.jsx:84`、`MidiEmotionPanel.jsx:66`

```javascript
setLogs(prev => [...prev, ...d.logs])
```

每次轮询都往 `logs` 数组追加，训练任务运行时间长，日志条目可能达到数千条。`LogOutput` 组件会把所有条目渲染为 DOM 节点（`CommonUI.jsx:53`），长时间运行后 UI 会明显卡顿。

**建议：** 对 `logs` 状态限制上限（如最多 500 条），超出时从头部截断；或者使用虚拟列表（如 `react-window`）渲染。

---

### A3-4 - InferenceTab 同时挂载两个面板，初始化副作用同时触发

**文件：** `frontend/src/components/InferenceTab.jsx:11-15`

使用 `display:none` 保持两个面板同时挂载（这是项目 CLAUDE.md 的设计要求，防止状态丢失）。这意味着 `MidiEmotionPanel` 在页面加载时就会触发 `useMidiEmotionModels` 里的 fetch 请求，即使用户并不打算使用 midi-emotion 模型。

这不是 Bug，而是设计取舍。可以考虑：
- 将 `useMidiEmotionModels` 的 fetch 改为懒加载（首次切换到 midi-emotion 面板时才触发）
- 或接受当前行为（对后端负担极小，仅一个 GET 请求）

---

### A3-5 - MidiEmotionPanel 缺少 selectedModel 为空时的提交拦截

**文件：** `frontend/src/components/MidiEmotionPanel.jsx:157`

```javascript
<ActionButton onClick={handleGenerate} disabled={taskStatus === 'running' || !selectedModel} primary>
```

按钮的 `disabled` 正确处理了 `!selectedModel` 的情况，但 `handleGenerate` 本身（第 41-78 行）没有再次检查 `selectedModel`，如果通过其他方式触发（如键盘事件），会向后端发送 `checkpoint: ""` 的请求。后端 `run_midi_emotion_generate` 会用 `"continuous_concat"` 作为默认值（`main.py:632`），行为可能与用户预期不符。

**建议：** 在 `handleGenerate` 开头加一行 `if (!selectedModel) return`。

---

## 错误处理专项（C2）

### C2-1 - 缺少超时控制的 HTTP 请求

以下所有 `fetch` 调用均未设置 `AbortController` + 超时，若后端无响应，Promise 会永久 pending，UI 会卡在"加载中"状态：

| 文件 | 行号 | 接口 | 风险 |
|------|------|------|------|
| `EmoDisentangerPanel.jsx` | 63-74 | `POST /api/tasks/generate` | 生成启动卡住 |
| `EmoDisentangerPanel.jsx` | 48-55 | `POST /api/files/browse` | 结果列表刷新卡住 |
| `EmoDisentangerPanel.jsx` | 33-43 | `POST /api/files/play` | 播放按钮卡住，playLoading 永远 true |
| `MidiEmotionPanel.jsx` | 46-57 | `POST /api/tasks/generate_v2` | 同上 |
| `MidiEmotionPanel.jsx` | 159 | `POST /api/tasks/{id}/stop` | 终止按钮无响应 |
| `useMidiEmotionModels.js` | 8 | `GET /api/models/midi_emotion` | 模型列表永远"检测中" |
| `useTrainTask.js` | 38-43 | `POST` 任意训练接口 | 训练启动卡住 |
| `PlayerTab.jsx` | 20-28 | `POST /api/files/browse` | 文件列表刷新卡住 |
| `PlayerTab.jsx` | 40-47 | `POST /api/files/play` | loading 状态永远 true |

**建议：** 统一封装一个 `fetchWithTimeout(url, options, ms=10000)` 工具函数，内部使用 `AbortController`。

---

### C2-2 - 可能 hang 住的后端位置

| 文件 | 行号 | 描述 |
|------|------|------|
| `main.py:473-475` | Stage1 推理 | `for line in iter(process.stdout.readline, "")` 阻塞读取，若子进程 stdout 关闭但进程未退出则永久阻塞 |
| `main.py:558-560` | Stage2 推理 | 同上 |
| `main.py:690` | midi-emotion 推理 | 逐字符读取 `process.stdout.read(1)`，若子进程产生大量输出或卡住，主线程阻塞 |
| `main.py:225-242` | FluidSynth 转换 | 已有 `timeout=60`，相对安全，但见 W4 分析 |
| `main.py:265-274` | wmic 调用 | 已有 `timeout=5`，相对安全 |

Stage1/Stage2 的 `process.stdout.readline` 循环（`main.py:473-475`、`558-560`）没有超时机制。若模型推理进程因 GPU OOM 或 CUDA 错误进入无响应状态（进程未退出但停止输出），后台线程会永久阻塞，任务永远显示 `running`，用户只能手动重启服务。

**建议：** 在 `run_subprocess_task` 和 `run_full_generation` 中添加最长等待时间（如 30 分钟），用 `process.communicate(timeout=...)` 替代手动 readline 循环，或使用 `select`/`poll` 配合超时。

---

### C2-3 - 后端接口缺少输入验证的参数

| 接口 | 参数 | 问题 |
|------|------|------|
| `POST /api/tasks/generate` | `emotion` | 只接受 Q1-Q4，但无 Pydantic 枚举约束，传入任意字符串会导致 `EMOTION_TO_VALENCE.get(emotion, "Positive")` 默认返回 Positive，静默产生错误行为 |
| `POST /api/tasks/generate` | `model_type` | 只接受 `gpt2`/`performer`，无枚举约束，传入非法值时 `DEFAULT_WEIGHTS[stage2_weights_key]` 会抛 `KeyError`（`main.py:504`），但被外层 `except Exception` 捕获，任务标记为 failed 但没有清晰的错误信息 |
| `POST /api/tasks/train` | `stage`, `representation`, `config` | 同上，`config` 直接参与 `DEFAULT_CONFIGS.get(req.config, req.config)` 路径拼接，若传入非法字符串会被当成文件路径传给推理脚本 |
| `POST /api/tasks/train_v2` | `dataset` | `dataset_dirs.get(req.dataset, req.data_dir)` 中，若 `dataset="custom"` 且 `data_dir` 为空，`Path("").exists()` 返回 `False`，会触发 400 错误，但提示语不明确 |
| `GET /api/files/search` | `query` | 虽然无严重安全问题，但 `query` 长度无限制，可传入极长字符串参与字符串比较 |

**建议：** 将 `emotion`、`model_type`、`stage`、`dataset` 改为 Python `Literal` 类型或 `Enum`：
```python
from typing import Literal
class GenerateRequest(BaseModel):
    emotion: Literal["Q1", "Q2", "Q3", "Q4"] = "Q1"
    model_type: Literal["gpt2", "performer"] = "gpt2"
```

---

### C2-4 - stop_task 接口存在竞态条件下的 task.process 为 None 问题

**文件：** `backend/main.py:885-896`

```python
if task.process:
    task.process.terminate()
    task.status = "stopped"
```

`task.process` 的读写发生在多线程环境中（主线程的 API handler 读，后台线程写），没有任何锁保护。`if task.process:` 通过后，后台线程可能在 `task.process.terminate()` 执行前将其置为 `None`（`finally` 块中），引发 `AttributeError`。虽然概率较低，但在高并发或快速完成的任务中可能触发。

**建议：** 使用 `threading.Lock` 保护 `task.process` 的读写，或在 `stop_task` 中使用 `try/except AttributeError` 做防御性处理。

---

## 总结

### 做得好的地方

1. CORS 配置仅允许 `localhost:5173`，没有使用通配符 `*`，安全意识良好（`main.py:160-165`）。
2. FluidSynth 调用有 60 秒超时（`main.py:238`），系统工具调用均有合理的超时设置。
3. `useTrainTask.js` 已将轮询逻辑抽象为 Hook，是正确方向。
4. `InferenceTab.jsx` 用 `display:none` 保持双面板挂载（而非条件渲染），避免了切换时的状态丢失，符合项目规范。
5. `run_full_generation` 中的进度监控线程（`main.py:530-555`）设计合理，每 60 秒汇报一次，不会产生过多日志。
6. `TaskInfo.to_dict()` 限制日志返回最多 200 条（`main.py:103`），保护了 API 响应体大小。
7. `GenerateV2Request.file_prefix` 已在后端实现了重命名逻辑（`main.py:728-736`），该参数是真实生效的。

### 优先修复顺序

| 优先级 | 问题编号 | 简述 |
|--------|----------|------|
| P0（立即修复）| S1 | 路径穿越攻击 |
| P0（立即修复）| S2 | glob pattern 枚举风险 |
| P0（立即修复）| S4 | 数值参数无边界校验（影响 GPU 稳定性） |
| P1（本周修复）| W7 | filePrefix 假参数（违反铁律） |
| P1（本周修复）| C2-3 | emotion/model_type 枚举验证缺失 |
| P1（本周修复）| S3 | active_tasks 内存无上限 |
| P2（迭代修复）| W1 | 音频缓存文件名碰撞 |
| P2（迭代修复）| W4 | FluidSynth 同步阻塞事件循环 |
| P2（迭代修复）| C2-1 | 所有 fetch 无超时 |
| P3（优化）| A3-1 | 轮询逻辑重复，建议统一 Hook |
| P3（优化）| W9 | PlayerTab debounce 未清理 |
