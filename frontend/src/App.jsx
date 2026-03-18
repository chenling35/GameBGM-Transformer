import { useState, useRef, useEffect } from 'react'

const API_BASE = ''

const EMOTIONS = [
  { id: 'Q1', name: '开心', en: 'Happy', valence: 'Positive', color: '#f97316', desc: '正效价 · 高唤醒' },
  { id: 'Q2', name: '紧张', en: 'Tense', valence: 'Negative', color: '#ef4444', desc: '负效价 · 高唤醒' },
  { id: 'Q3', name: '悲伤', en: 'Sad', valence: 'Negative', color: '#6366f1', desc: '负效价 · 低唤醒' },
  { id: 'Q4', name: '平静', en: 'Calm', valence: 'Positive', color: '#22c55e', desc: '正效价 · 低唤醒' },
]

const TABS = [
  { id: 'inference', label: '音乐生成' },
  { id: 'training', label: '模型训练' },
  { id: 'player', label: '文件播放' },
]

/* ═══════════════ 工具函数 ═══════════════ */
function getEmotionTag(filename) {
  for (const emo of EMOTIONS) {
    if (filename.includes(`_${emo.id}_`) || filename.includes(`_${emo.id}.`)) return emo
  }
  if (filename.includes('Positive')) return { id: '正效价', name: 'Positive', color: '#f97316' }
  if (filename.includes('Negative')) return { id: '负效价', name: 'Negative', color: '#6366f1' }
  return null
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/* ═══════════════ 通用组件 ═══════════════ */
function EmotionTag({ filename }) {
  const tag = getEmotionTag(filename)
  if (!tag) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
      style={{ background: tag.color + '18', color: tag.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tag.color }} />
      {tag.id} {tag.name}
    </span>
  )
}

function EmotionSelector({ value, onChange }) {
  return (
    <div>
      <label className="field-label">选择目标情感 (Russell 情感环形模型)</label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1">
        {EMOTIONS.map(emo => (
          <button
            key={emo.id}
            onClick={() => onChange(emo.id)}
            className={`emotion-card ${value === emo.id ? 'emotion-card-active' : ''}`}
            style={value === emo.id ? { borderColor: emo.color, boxShadow: `0 0 0 1px ${emo.color}` } : {}}
          >
            <div className="flex items-center gap-2">
              <span className="emotion-dot" style={{ background: emo.color }} />
              <span className="font-semibold text-gray-800">{emo.id} {emo.name}</span>
              <span className="text-xs text-gray-400">{emo.en}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">{emo.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function RadioGroup({ label, options, value, onChange, name }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div className="flex flex-wrap gap-3 mt-1">
        {options.map(opt => (
          <label key={opt.value} className="radio-item">
            <input type="radio" name={name} value={opt.value}
              checked={value === opt.value} onChange={() => onChange(opt.value)} />
            <span className="radio-dot" />
            <span>{opt.label}</span>
            {opt.tag && <span className="ml-1 text-xs text-orange-500">({opt.tag})</span>}
          </label>
        ))}
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text', placeholder, min, max }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <input type={type} value={value} placeholder={placeholder}
        min={min} max={max} onChange={e => onChange(e.target.value)} className="field-input" />
    </div>
  )
}

function LogOutput({ logs }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs])
  return (
    <div>
      <label className="field-label">输出日志</label>
      <div ref={ref} className="log-area">
        {logs.length === 0
          ? <span className="text-gray-400">等待任务启动...</span>
          : logs.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </div>
  )
}

function StepSection({ step, title, children }) {
  return (
    <div className="step-section">
      <div className="step-header">step{step}: {title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function ActionButton({ children, onClick, disabled, primary }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`action-btn ${primary ? 'action-btn-primary' : ''}`}>
      {children}
    </button>
  )
}

function StatusBadge({ status }) {
  const map = {
    running: ['bg-blue-100 text-blue-700', '运行中'],
    completed: ['bg-green-100 text-green-700', '已完成'],
    failed: ['bg-red-100 text-red-700', '失败'],
    stopped: ['bg-gray-100 text-gray-700', '已终止'],
  }
  const [cls, label] = map[status] || ['bg-gray-100 text-gray-600', status]
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${cls}`}>
      {status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 animate-pulse" />}
      {label}
    </span>
  )
}

/* ═══════════════ 模型切换器 ═══════════════ */
const MODELS = [
  {
    id: 'emo-disentanger',
    label: 'EMO-Disentanger',
    desc: '离散 Q1-Q4 | 钢琴 | Two-stage Transformer',
    color: '#f97316',
    badge: '已可用',
    badgeCls: 'bg-green-100 text-green-700',
  },
  {
    id: 'midi-emotion',
    label: 'midi-emotion',
    desc: '连续 V/A | 多乐器 | Pianoroll Transformer',
    color: '#6366f1',
    badge: '开发中',
    badgeCls: 'bg-yellow-100 text-yellow-700',
  },
]

function ModelSwitcher({ value, onChange }) {
  return (
    <div className="mb-6">
      <label className="field-label">选择生成模型</label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
        {MODELS.map(m => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`emotion-card text-left ${value === m.id ? 'emotion-card-active' : ''}`}
            style={value === m.id ? { borderColor: m.color, boxShadow: `0 0 0 1px ${m.color}` } : {}}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
              <span className="font-semibold text-gray-800">{m.label}</span>
              <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${m.badgeCls}`}>{m.badge}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════ V/A 滑块 ═══════════════ */
const INSTRUMENT_OPTIONS = [
  { value: 'piano',   label: '钢琴 Piano' },
  { value: 'guitar',  label: '吉他 Guitar' },
  { value: 'bass',    label: '贝斯 Bass' },
  { value: 'strings', label: '弦乐 Strings' },
  { value: 'drums',   label: '鼓 Drums' },
]

function VASlider({ label, value, onChange, hint }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="field-label mb-0">{label}</label>
        <span className="text-sm font-mono text-gray-600">{value >= 0 ? '+' : ''}{Number(value).toFixed(2)}</span>
      </div>
      <input
        type="range" min="-1" max="1" step="0.01"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>{hint[0]}</span>
        <span>0</span>
        <span>{hint[1]}</span>
      </div>
    </div>
  )
}

function InstrumentSelect({ value, onChange }) {
  const toggle = (inst) => {
    if (value.includes(inst)) {
      if (value.length === 1) return  // 至少保留一个
      onChange(value.filter(i => i !== inst))
    } else {
      onChange([...value, inst])
    }
  }
  return (
    <div>
      <label className="field-label">乐器选择 (多选)</label>
      <div className="flex flex-wrap gap-2 mt-1">
        {INSTRUMENT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              value.includes(opt.value)
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════ midi-emotion 面板 ═══════════════ */
function MidiEmotionPanel() {
  const [valence, setValence] = useState(0.5)
  const [arousal, setArousal] = useState(0.5)
  const [instruments, setInstruments] = useState(['piano'])
  const [nSamples, setNSamples] = useState('1')
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  // Russell 环形模型象限推断（仅显示用）
  const inferQuadrant = () => {
    if (valence >= 0 && arousal >= 0) return 'Q1 开心 (Happy)'
    if (valence < 0 && arousal >= 0) return 'Q2 紧张 (Tense)'
    if (valence < 0 && arousal < 0) return 'Q3 悲伤 (Sad)'
    return 'Q4 平静 (Calm)'
  }

  const handleGenerate = async () => {
    setLogs([]); setTaskStatus('running'); setElapsed(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000)
    try {
      const res = await fetch(`${API_BASE}/api/tasks/generate_v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valence,
          arousal,
          instruments,
          n_samples: parseInt(nSamples),
          output_dir: 'generation/midi_emotion',
        }),
      })
      const data = await res.json()
      setTaskId(data.task_id)
      setLogs([`[系统] 任务 ${data.task_id} 已启动`])

      let offset = 0
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/tasks/${data.task_id}?offset=${offset}`)
          const d = await r.json()
          if (d.logs?.length > 0) { setLogs(prev => [...prev, ...d.logs]); offset = d.log_offset }
          setTaskStatus(d.status)
          if (d.status !== 'running') {
            clearInterval(pollRef.current)
            if (timerRef.current) clearInterval(timerRef.current)
          }
        } catch (e) { console.error(e) }
      }, 1000)
    } catch (e) {
      setLogs([`[错误] ${e.message}`])
      setTaskStatus('failed')
    }
  }

  return (
    <div className="space-y-5">
      <StepSection step="1" title="情感参数 (Russell 环形模型 — 连续值)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <VASlider
            label="效价 Valence"
            value={valence}
            onChange={setValence}
            hint={['负效价 (悲伤/紧张)', '正效价 (开心/平静)']}
          />
          <VASlider
            label="唤醒度 Arousal"
            value={arousal}
            onChange={setArousal}
            hint={['低唤醒 (平静/悲伤)', '高唤醒 (开心/紧张)']}
          />
        </div>
        <div className="mt-3 text-sm text-gray-500">
          当前情感区域:&nbsp;
          <span className="text-indigo-600 font-medium">{inferQuadrant()}</span>
          <span className="ml-3 text-gray-400">V={valence >= 0 ? '+' : ''}{valence.toFixed(2)} &nbsp; A={arousal >= 0 ? '+' : ''}{arousal.toFixed(2)}</span>
        </div>
      </StepSection>

      <StepSection step="2" title="生成参数">
        <div className="space-y-4">
          <InstrumentSelect value={instruments} onChange={setInstruments} />
          <InputField label="生成数量" type="number" value={nSamples} onChange={setNSamples} min="1" max="10" />
        </div>
      </StepSection>

      <StepSection step="3" title="开始生成">
        <div className="flex items-center gap-3 mb-4">
          <ActionButton onClick={handleGenerate} disabled={taskStatus === 'running'} primary>
            生成音乐
          </ActionButton>
          {taskStatus && <StatusBadge status={taskStatus} />}
          {elapsed > 0 && (
            <span className="text-sm text-gray-500 font-mono">
              {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
            </span>
          )}
          <span className="ml-auto text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded">
            Mock 模式 — 真实推理待实现
          </span>
        </div>
        <LogOutput logs={logs} />
      </StepSection>
    </div>
  )
}

/* ═══════════════ 音乐生成 (EMO-Disentanger) ═══════════════ */
function EmoDisentangerPanel() {
  const [emotion, setEmotion] = useState('Q1')
  const [nGroups, setNGroups] = useState('1')
  const [outputDir, setOutputDir] = useState('generation/emopia_functional_two')
  const [modelType, setModelType] = useState('gpt2')
  const [stage1Weights, setStage1Weights] = useState('default')
  const [stage2Weights, setStage2Weights] = useState('default')
  const [customS1, setCustomS1] = useState('')
  const [customS2, setCustomS2] = useState('')
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const [resultFiles, setResultFiles] = useState([])
  const [audioUrl, setAudioUrl] = useState(null)
  const [currentFile, setCurrentFile] = useState(null)
  const [playLoading, setPlayLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef(null)
  const timerRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const selected = EMOTIONS.find(e => e.id === emotion)

  const handlePlay = async (path) => {
    setPlayLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/files/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail) }
      const data = await res.json()
      setAudioUrl(data.audio_url)
      setCurrentFile(data.filename)
      setTimeout(() => { audioRef.current?.load(); audioRef.current?.play().catch(() => {}) }, 100)
    } catch (e) {
      setLogs(prev => [...prev, `[错误] 播放失败: ${e.message}`])
    } finally { setPlayLoading(false) }
  }

  const fetchResults = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/files/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: outputDir, pattern: `*_${emotion}_full.mid` }),
      })
      const data = await res.json()
      setResultFiles(data.files || [])
    } catch (e) { console.error(e) }
  }

  const handleGenerate = async () => {
    setLogs([]); setTaskStatus('running'); setResultFiles([]); setElapsed(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000)
    try {
      const res = await fetch(`${API_BASE}/api/tasks/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emotion,
          n_groups: parseInt(nGroups),
          output_dir: outputDir,
          model_type: modelType,
          stage1_weights: stage1Weights === 'custom' ? customS1 : '',
          stage2_weights: stage2Weights === 'custom' ? customS2 : '',
        }),
      })
      const data = await res.json()
      setTaskId(data.task_id)
      setLogs([`[系统] 开始生成 ${selected.name}(${selected.en}) 风格音乐, 共 ${nGroups} 首`])

      let offset = 0
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/tasks/${data.task_id}?offset=${offset}`)
          const d = await r.json()
          if (d.logs?.length > 0) { setLogs(prev => [...prev, ...d.logs]); offset = d.log_offset }
          setTaskStatus(d.status)
          if (d.status !== 'running') {
            clearInterval(pollRef.current)
            if (timerRef.current) clearInterval(timerRef.current)
            if (d.status === 'completed') fetchResults()
          }
        } catch (e) { console.error(e) }
      }, 1000)
    } catch (e) {
      setLogs(prev => [...prev, `[错误] ${e.message}`])
      setTaskStatus('failed')
    }
  }

  const handleStop = async () => {
    if (!taskId) return
    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/stop`, { method: 'POST' })
      setLogs(prev => [...prev, '[系统] 正在终止任务...'])
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-5">
      <StepSection step="1" title="选择目标情感">
        <EmotionSelector value={emotion} onChange={setEmotion} />
      </StepSection>

      <StepSection step="2" title="生成参数">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InputField label="生成数量" type="number" value={nGroups} onChange={setNGroups} min="1" max="50" />
          <InputField label="输出目录" value={outputDir} onChange={setOutputDir} />
          <RadioGroup label="模型骨干" name="model_type_inf"
            options={[
              { value: 'gpt2', label: 'GPT-2', tag: '推荐' },
              { value: 'performer', label: 'Performer' },
            ]}
            value={modelType} onChange={setModelType}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Stage1 权重</label>
            <select value={stage1Weights} onChange={e => setStage1Weights(e.target.value)} className="field-input">
              <option value="default">预训练权重 (ep016, loss=0.685)</option>
              <option value="custom">自定义路径</option>
            </select>
            {stage1Weights === 'custom' && (
              <input type="text" value={customS1} onChange={e => setCustomS1(e.target.value)}
                placeholder=".pt 权重文件路径" className="field-input mt-1" />
            )}
          </div>
          <div>
            <label className="field-label">Stage2 权重</label>
            <select value={stage2Weights} onChange={e => setStage2Weights(e.target.value)} className="field-input">
              <option value="default">
                预训练权重 ({modelType === 'gpt2' ? 'GPT-2, loss=0.120' : 'Performer, loss=0.338'})
              </option>
              <option value="custom">自定义路径</option>
            </select>
            {stage2Weights === 'custom' && (
              <input type="text" value={customS2} onChange={e => setCustomS2(e.target.value)}
                placeholder=".pt 权重文件路径" className="field-input mt-1" />
            )}
          </div>
        </div>

      </StepSection>

      <StepSection step="3" title="开始生成">
        <div className="flex items-center gap-3 mb-4">
          <ActionButton onClick={handleGenerate} disabled={taskStatus === 'running'} primary>
            生成 {selected.name} 风格音乐
          </ActionButton>
          {taskStatus === 'running' && (
            <button onClick={handleStop} className="stop-btn">终止任务</button>
          )}
          {taskStatus && <StatusBadge status={taskStatus} />}
          {elapsed > 0 && (
            <span className="text-sm text-gray-500 font-mono">
              {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
            </span>
          )}
        </div>

        <LogOutput logs={logs} />

        {audioUrl && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-sm text-gray-600 mb-2">
              正在播放: <span className="text-gray-800 font-medium">{currentFile}</span>
            </div>
            <audio ref={audioRef} src={audioUrl} controls className="w-full" />
          </div>
        )}

        {resultFiles.length > 0 && (
          <div className="mt-4">
            <label className="field-label">生成结果 ({resultFiles.length} 个文件)</label>
            <div className="file-list">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 px-3 font-medium">文件名</th>
                    <th className="py-2 px-3 font-medium w-20">情感</th>
                    <th className="py-2 px-3 font-medium w-20">大小</th>
                    <th className="py-2 px-3 font-medium w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {resultFiles.map((f, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-orange-50/50">
                      <td className="py-2 px-3 font-medium text-gray-800">{f.filename}</td>
                      <td className="py-2 px-3"><EmotionTag filename={f.filename} /></td>
                      <td className="py-2 px-3 text-gray-500">{formatSize(f.size)}</td>
                      <td className="py-2 px-3">
                        <button onClick={() => handlePlay(f.path)} disabled={playLoading}
                          className="text-orange-600 hover:text-orange-700 font-medium disabled:opacity-50">播放</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </StepSection>
    </div>
  )
}

/* ═══════════════ 音乐生成（顶层，含模型切换） ═══════════════ */
function InferenceTab() {
  const [activeModel, setActiveModel] = useState('emo-disentanger')
  return (
    <div>
      <ModelSwitcher value={activeModel} onChange={setActiveModel} />
      <div style={{ display: activeModel === 'emo-disentanger' ? 'block' : 'none' }}>
        <EmoDisentangerPanel />
      </div>
      <div style={{ display: activeModel === 'midi-emotion' ? 'block' : 'none' }}>
        <MidiEmotionPanel />
      </div>
    </div>
  )
}

/* ═══════════════ 模型训练 ═══════════════ */
function TrainingTab() {
  const [stage, setStage] = useState('stage1')
  const [modelType, setModelType] = useState('gpt2')
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const configPath = stage === 'stage1'
    ? 'stage1_compose/config/emopia_finetune.yaml'
    : modelType === 'gpt2'
      ? 'stage2_accompaniment/config/emopia_finetune_gpt2.yaml'
      : 'stage2_accompaniment/config/emopia_finetune.yaml'

  const handleTrain = async () => {
    setLogs([]); setTaskStatus('running')
    try {
      const configKey = stage === 'stage1' ? 'stage1_finetune'
        : modelType === 'gpt2' ? 'stage2_finetune_gpt2' : 'stage2_finetune_performer'
      const res = await fetch(`${API_BASE}/api/tasks/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, model_type: modelType, representation: 'functional', config: configKey }),
      })
      const data = await res.json()
      setTaskId(data.task_id)
      setLogs([`[系统] 任务 ${data.task_id} 已启动: ${data.message}`])

      let offset = 0
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/tasks/${data.task_id}?offset=${offset}`)
          const d = await r.json()
          if (d.logs?.length > 0) { setLogs(prev => [...prev, ...d.logs]); offset = d.log_offset }
          setTaskStatus(d.status)
          if (d.status !== 'running') clearInterval(pollRef.current)
        } catch (e) { console.error(e) }
      }, 1000)
    } catch (e) {
      setLogs([`[错误] ${e.message}`])
      setTaskStatus('failed')
    }
  }

  const handleStop = async () => {
    if (!taskId) return
    try { await fetch(`${API_BASE}/api/tasks/${taskId}/stop`, { method: 'POST' }) } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-5">
      <StepSection step="1" title="训练配置">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <label className="field-label">训练阶段</label>
            <div className="flex flex-wrap gap-3 mt-1">
              <label className="radio-item">
                <input type="radio" name="train_stage" value="stage1"
                  checked={stage === 'stage1'} onChange={() => setStage('stage1')} />
                <span className="radio-dot" />
                <span>Stage 1: Lead Sheet</span>
                <span className="ml-1 text-xs text-orange-500">(先训练)</span>
              </label>
              <label className="radio-item">
                <input type="radio" name="train_stage" value="stage2"
                  checked={stage === 'stage2'} onChange={() => setStage('stage2')} />
                <span className="radio-dot" />
                <span>Stage 2: Accompaniment</span>
              </label>
            </div>
          </div>
          {stage === 'stage2' && (
            <RadioGroup label="模型骨干" name="train_model"
              options={[
                { value: 'gpt2', label: 'GPT-2', tag: '推荐' },
                { value: 'performer', label: 'Performer' },
              ]}
              value={modelType} onChange={setModelType}
            />
          )}
        </div>
        <div className="mt-3 text-sm text-gray-500">
          配置: <code className="bg-gray-100 px-1 rounded text-gray-800">{configPath}</code>
        </div>
      </StepSection>

      <StepSection step="2" title="开始训练">
        <div className="flex items-center gap-3 mb-4">
          <ActionButton onClick={handleTrain} disabled={taskStatus === 'running'} primary>
            开始训练
          </ActionButton>
          {taskStatus === 'running' && (
            <button onClick={handleStop} className="stop-btn">终止训练</button>
          )}
          {taskStatus && <StatusBadge status={taskStatus} />}
        </div>
        <LogOutput logs={logs} />
      </StepSection>
    </div>
  )
}

/* ═══════════════ 文件播放 ═══════════════ */
function PlayerTab() {
  const [filePath, setFilePath] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [files, setFiles] = useState([])
  const [browsePath, setBrowsePath] = useState('generation/emopia_functional_two')
  const [audioUrl, setAudioUrl] = useState(null)
  const [currentFile, setCurrentFile] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const audioRef = useRef(null)

  const handleBrowse = async () => {
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/files/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: browsePath, pattern: '*.mid' }),
      })
      const data = await res.json()
      setFiles(data.files || [])
      if (data.error) setError(data.error)
    } catch (e) { setError(e.message) }
  }

  const handleSearch = async () => {
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/files/search?query=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setFiles(data.files || [])
    } catch (e) { setError(e.message) }
  }

  const handlePlay = async (path) => {
    setError(null); setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/files/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || '播放失败') }
      const data = await res.json()
      setAudioUrl(data.audio_url)
      setCurrentFile(data.filename)
      setFilePath(path)
      setTimeout(() => { audioRef.current?.load(); audioRef.current?.play().catch(() => {}) }, 100)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { handleBrowse() }, [])

  return (
    <div className="space-y-5">
      <StepSection step="1" title="输入文件路径播放">
        <div className="flex gap-2">
          <input type="text" value={filePath}
            placeholder="输入 MIDI/WAV 文件路径"
            onChange={e => setFilePath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && filePath.trim() && handlePlay(filePath.trim())}
            className="field-input flex-1" />
          <ActionButton onClick={() => handlePlay(filePath.trim())} disabled={!filePath.trim() || loading}>
            {loading ? '转换中...' : '播放'}
          </ActionButton>
        </div>
        {audioUrl && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-sm text-gray-600 mb-2">
              正在播放: <span className="text-gray-800 font-medium">{currentFile}</span>
              {currentFile && <span className="ml-2"><EmotionTag filename={currentFile} /></span>}
            </div>
            <audio ref={audioRef} src={audioUrl} controls className="w-full" />
          </div>
        )}
        {error && (
          <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded-md border border-red-200">{error}</div>
        )}
      </StepSection>

      <StepSection step="2" title="浏览和搜索文件">
        <div className="flex gap-2 mb-3">
          <input type="text" value={browsePath}
            onChange={e => setBrowsePath(e.target.value)} className="field-input flex-1" />
          <ActionButton onClick={handleBrowse}>浏览</ActionButton>
        </div>
        <div className="flex gap-2 mb-3">
          <input type="text" value={searchQuery}
            placeholder="搜索文件名 (如: Q1, Q2, samp_00...)"
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="field-input flex-1" />
          <ActionButton onClick={handleSearch}>搜索</ActionButton>
        </div>

        <div className="file-list">
          {files.length === 0 ? (
            <div className="text-gray-400 text-sm p-4 text-center">没有找到文件</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-3 font-medium">文件名</th>
                  <th className="py-2 px-3 font-medium w-24">情感</th>
                  <th className="py-2 px-3 font-medium w-20">大小</th>
                  <th className="py-2 px-3 font-medium w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-orange-50/50">
                    <td className="py-2 px-3">
                      <div className="font-medium text-gray-800">{f.filename}</div>
                      <div className="text-xs text-gray-400 truncate max-w-md">{f.path}</div>
                    </td>
                    <td className="py-2 px-3"><EmotionTag filename={f.filename} /></td>
                    <td className="py-2 px-3 text-gray-500">{formatSize(f.size)}</td>
                    <td className="py-2 px-3">
                      <button onClick={() => handlePlay(f.path)}
                        className="text-orange-600 hover:text-orange-700 font-medium">播放</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </StepSection>
    </div>
  )
}

/* ═══════════════ 主应用 ═══════════════ */
function App() {
  const [activeTab, setActiveTab] = useState('inference')
  const [sysStatus, setSysStatus] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/status`).then(r => r.json()).then(setSysStatus)
      .catch(() => setSysStatus({ status: 'error' }))
  }, [])

  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="text-xl font-bold text-gray-800">游戏情感音乐生成系统</h1>
        <p className="text-sm text-gray-500 mt-1">EMO-Disentanger (离散 Q1-Q4) · midi-emotion (连续 V/A) · 毕业设计</p>
      </div>

      <div className="sys-bar">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${sysStatus?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
          {sysStatus?.status === 'ok' ? '系统就绪' : '系统异常'}
        </span>
        {sysStatus?.gpu && sysStatus.gpu !== '未检测到' && <span>GPU: {sysStatus.gpu}</span>}
        {sysStatus?.midi_library_stats && (
          <span>MIDI库: {Object.values(sysStatus.midi_library_stats).reduce((a, b) => a + b, 0)} 文件</span>
        )}
        <span>FluidSynth: {sysStatus?.fluidsynth ? '可用' : '不可用'}</span>
      </div>

      <div className="tab-bar">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`tab-item ${activeTab === tab.id ? 'tab-active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div style={{ display: activeTab === 'inference' ? 'block' : 'none' }}><InferenceTab /></div>
        <div style={{ display: activeTab === 'training' ? 'block' : 'none' }}><TrainingTab /></div>
        <div style={{ display: activeTab === 'player' ? 'block' : 'none' }}><PlayerTab /></div>
      </div>

      <div className="app-footer">
        <span>毕业设计 - 基于 Transformer 的游戏情感音乐生成系统</span>
        <span>Powered by EMO-Disentanger | Built with FastAPI + React</span>
      </div>
    </div>
  )
}

export default App
