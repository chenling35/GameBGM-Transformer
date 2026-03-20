import { useState, useRef, useEffect, useContext, createContext, useCallback } from 'react'

const AudioContext = createContext(null)

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
  const va = filename.match(/_V(-?\d+)_A(-?\d+)/)
  if (va) {
    const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(2)
    const v = parseInt(va[1]) / 10, a = parseInt(va[2]) / 10
    return { id: `[${fmt(v)},${fmt(a)}]`, name: '', color: '#6366f1' }
  }
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
    <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-mono"
      style={{ background: tag.color + '18', color: tag.color }}>
      {tag.id}{tag.name ? ` ${tag.name}` : ''}
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

  // 从日志中提取最新进度
  let latestProgress = null
  for (let i = logs.length - 1; i >= 0; i--) {
    const m = logs[i]?.match?.(/\[progress:(\d+)\]/)
    if (m) { latestProgress = parseInt(m[1]); break }
  }

  return (
    <div>
      <label className="field-label">输出日志</label>
      {latestProgress !== null && (
        <div className="mb-2">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <span>生成进度</span>
            <span className="font-mono">{latestProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${latestProgress}%` }} />
          </div>
        </div>
      )}
      <div ref={ref} className="log-area">
        {logs.length === 0
          ? <span className="text-gray-400">等待任务启动...</span>
          : logs.filter(l => !l?.match?.(/\[progress:\d+\]/)).map((line, i) => <div key={i}>{line}</div>)}
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
  },
  {
    id: 'midi-emotion',
    label: 'midi-emotion',
    desc: '连续 V/A | 多乐器 | Pianoroll Transformer',
    color: '#6366f1',
  },
]

function ModelSwitcher({ value, onChange, label = '选择模型' }) {
  return (
    <div className="mb-6">
      <label className="field-label">{label}</label>
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
            </div>
            <div className="text-xs text-gray-400 mt-1">{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════ 情感坐标平面 ═══════════════ */
function EmotionPlane({ valence, arousal, onChange }) {
  const svgRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const S = 260, P = 22, W = S - P * 2

  const vaToPx = (v, a) => [P + (v + 1) / 2 * W, P + (1 - (a + 1) / 2) * W]
  const pxToVa = (x, y) => [
    Math.max(-1, Math.min(1, ((x - P) / W) * 2 - 1)),
    Math.max(-1, Math.min(1, (1 - (y - P) / W) * 2 - 1)),
  ]

  const getVA = (e) => {
    const svg = svgRef.current; if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    return pxToVa(((cx - rect.left) / rect.width) * S, ((cy - rect.top) / rect.height) * S)
  }

  const onDown = (e) => { e.preventDefault(); setDragging(true); const [v, a] = getVA(e); onChange(v, a) }
  const onMove = (e) => { if (!dragging) return; e.preventDefault(); const [v, a] = getVA(e); onChange(v, a) }

  const [dotX, dotY] = vaToPx(valence, arousal)
  const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(2)

  return (
    <div className="flex flex-col items-center gap-3">
      <svg ref={svgRef} viewBox={`0 0 ${S} ${S}`}
        className="w-full max-w-xs cursor-crosshair select-none touch-none"
        onMouseDown={onDown} onMouseMove={onMove}
        onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={() => setDragging(false)}
      >
        <defs>
          {[['q1g','100%','0%','#f97316'],['q2g','0%','0%','#ef4444'],['q3g','0%','100%','#6366f1'],['q4g','100%','100%','#22c55e']].map(([id,cx,cy,c]) => (
            <radialGradient key={id} id={id} cx={cx} cy={cy} r="141%" gradientUnits="objectBoundingBox">
              <stop offset="0%" stopColor={c} stopOpacity="0.13"/>
              <stop offset="100%" stopColor={c} stopOpacity="0"/>
            </radialGradient>
          ))}
          <filter id="ds" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#f97316" floodOpacity="0.35"/>
          </filter>
        </defs>
        <rect x={P} y={P} width={W} height={W} rx="6" fill="#ffffff"/>
        {['q1g','q2g','q3g','q4g'].map(id => <rect key={id} x={P} y={P} width={W} height={W} rx="6" fill={`url(#${id})`}/>)}
        {[-0.5, 0.5].map(v => { const x = P + (v+1)/2*W; return <line key={v} x1={x} y1={P} x2={x} y2={P+W} stroke="#e5e7eb" strokeWidth="0.75" strokeDasharray="3,3"/> })}
        {[-0.5, 0.5].map(a => { const y = P + (1-(a+1)/2)*W; return <line key={a} x1={P} y1={y} x2={P+W} y2={y} stroke="#e5e7eb" strokeWidth="0.75" strokeDasharray="3,3"/> })}
        <line x1={S/2} y1={P} x2={S/2} y2={P+W} stroke="#c4c9d4" strokeWidth="1.2"/>
        <line x1={P} y1={S/2} x2={P+W} y2={S/2} stroke="#c4c9d4" strokeWidth="1.2"/>
        <rect x={P} y={P} width={W} height={W} rx="6" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
        <text x={S/2} y={P-6} textAnchor="middle" fontSize="9" fill="#c4c9d4">Arousal +</text>
        <text x={S/2} y={P+W+13} textAnchor="middle" fontSize="9" fill="#c4c9d4">Arousal −</text>
        <text x={P-4} y={S/2+3} textAnchor="end" fontSize="9" fill="#c4c9d4">V−</text>
        <text x={P+W+4} y={S/2+3} textAnchor="start" fontSize="9" fill="#c4c9d4">V+</text>
        <circle cx={dotX} cy={dotY} r="5" fill="#f97316" filter="url(#ds)"/>
        <circle cx={dotX} cy={dotY} r="2.5" fill="white"/>
      </svg>
      <div className="text-xs font-mono text-gray-500">
        Valence {fmt(valence)} &nbsp;|&nbsp; Arousal {fmt(arousal)}
      </div>
      <div className="flex items-center gap-4 text-sm font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">V</span>
          <input type="number" min="-1" max="1" step="0.01" value={valence.toFixed(2)}
            onChange={e => onChange(Math.max(-1, Math.min(1, parseFloat(e.target.value) || 0)), arousal)}
            className="w-24 text-center border border-gray-200 rounded px-1.5 py-0.5 text-sm font-mono focus:outline-none focus:border-orange-400"/>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">A</span>
          <input type="number" min="-1" max="1" step="0.01" value={arousal.toFixed(2)}
            onChange={e => onChange(valence, Math.max(-1, Math.min(1, parseFloat(e.target.value) || 0)))}
            className="w-24 text-center border border-gray-200 rounded px-1.5 py-0.5 text-sm font-mono focus:outline-none focus:border-orange-400"/>
        </div>
      </div>
    </div>
  )
}


/* ═══════════════ midi-emotion 模型选择器 Hook ═══════════════ */
const MODEL_DESC = {
  continuous_concat: '原始预训练（通用音乐）',
  finetuned_vgmusic: '游戏音乐微调（3万首VGMusic）',
  finetuned_emopia: '情感精调（EMOPIA 1078首）',
}
const MODEL_HIDDEN = new Set([])

function useMidiEmotionModels() {
  const [models, setModels] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    fetch(`${API_BASE}/api/models/midi_emotion`).then(r => r.json()).then(data => {
      setModels((data.models || []).filter(m => !MODEL_HIDDEN.has(m.id)))
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])
  return { models, loaded }
}

/* ═══════════════ midi-emotion 面板 ═══════════════ */
function MidiEmotionPanel() {
  const [valence, setValence] = useState(0.5)
  const [arousal, setArousal] = useState(0.5)
  const [genLen, setGenLen] = useState(1024)
  const [nSamples, setNSamples] = useState('1')
  const [filePrefix, setFilePrefix] = useState('')
  const [outputDir, setOutputDir] = useState('midi-emotion/output/finetuned_emopia/generations/inference')
  const [selectedModel, setSelectedModel] = useState('')
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef(null)
  const timerRef = useRef(null)
  const { models, loaded: modelsLoaded } = useMidiEmotionModels()

  // 默认选中推荐模型（finetuned_emopia），没有则选第一个
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      const preferred = models.find(m => m.id === 'finetuned_emopia')
      setSelectedModel(preferred ? preferred.id : models[0].id)
    }
  }, [models])

  // 切换模型时更新输出路径
  useEffect(() => {
    if (selectedModel) setOutputDir(`midi-emotion/output/${selectedModel}/generations/inference`)
  }, [selectedModel])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const handleGenerate = async () => {
    setLogs([]); setTaskStatus('running'); setElapsed(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000)
    try {
      const res = await fetch(`${API_BASE}/api/tasks/generate_v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valence: Math.round(valence * 100) / 100,
          arousal: Math.round(arousal * 100) / 100,
          gen_len: genLen,
          n_samples: parseInt(nSamples),
          checkpoint: selectedModel,
          file_prefix: filePrefix,
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
      {/* 模型选择 */}
      <div>
        <label className="field-label">推理模型</label>
        {!modelsLoaded ? (
          <select disabled className="field-input w-full mt-1"><option>检测中...</option></select>
        ) : models.length === 0 ? (
          <div className="text-sm text-amber-500 mt-1">暂无可用模型，请先在「模型训练」页面完成训练</div>
        ) : (
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
            className="field-input w-full mt-1">
            <option value="">请选择模型</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.id}（{m.size_mb} MB）{MODEL_DESC[m.id] ? ` — ${MODEL_DESC[m.id]}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <StepSection step="1" title="情感定位">
        <div className="flex gap-6 items-start">
          <EmotionPlane valence={valence} arousal={arousal} onChange={(v, a) => { setValence(v); setArousal(a) }} />
          <div className="flex-1 min-w-0">
            {/* 情感预设快捷按钮 */}
            <label className="field-label mb-2">快捷预设</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: 0.80, a: 0.80, label: '激昂战斗', icon: '⚔️', color: '#ef4444' },
                { v: 0.70, a: 0.30, label: '欢快冒险', icon: '🌟', color: '#f97316' },
                { v: -0.60, a: 0.80, label: '紧张悬疑', icon: '🌩️', color: '#8b5cf6' },
                { v: -0.70, a: -0.60, label: '忧伤回忆', icon: '🌧️', color: '#6366f1' },
                { v: 0.60, a: -0.50, label: '宁静村庄', icon: '🏡', color: '#22c55e' },
                { v: -0.20, a: 0.40, label: '神秘探索', icon: '🔮', color: '#a855f7' },
              ].map(p => {
                const isActive = Math.abs(valence - p.v) < 0.1 && Math.abs(arousal - p.a) < 0.1
                return (
                  <button key={p.label} onClick={() => { setValence(p.v); setArousal(p.a) }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                      isActive ? 'border-gray-400 bg-gray-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                    }`}>
                    <span className="text-base">{p.icon}</span>
                    <div>
                      <div className="text-xs font-medium text-gray-700">{p.label}</div>
                      <div className="text-xs font-mono text-gray-400">[{p.v >= 0 ? '+' : ''}{p.v.toFixed(1)}, {p.a >= 0 ? '+' : ''}{p.a.toFixed(1)}]</div>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs text-gray-400">
              <div><span className="text-gray-500 font-medium">V</span> 效价 — 正值愉悦，负值消极</div>
              <div><span className="text-gray-500 font-medium">A</span> 唤醒度 — 正值激昂，负值平缓</div>
              <div className="pt-0.5">Russell 情感环形模型 · 连续值 [−1, 1]</div>
            </div>
          </div>
        </div>
      </StepSection>

      <StepSection step="2" title="生成参数">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="field-label">生成长度 (tokens)</label>
            <input type="number" value={genLen} onChange={e => setGenLen(Number(e.target.value))}
              min={128} step={128} className="field-input" />
            <p className="text-xs text-gray-400 mt-1">约 1024 tokens ≈ 1 分钟</p>
          </div>
          <InputField label="生成数量" type="number" value={nSamples} onChange={setNSamples} min="1" max="10" />
          <InputField label="文件前缀" value={filePrefix} onChange={setFilePrefix} placeholder="可选" />
          <InputField label="输出目录" value={outputDir} onChange={setOutputDir} />
        </div>
        <p className="text-xs text-gray-400 mt-3">五轨同步生成 · 鼓 · 钢琴 · 吉他 · 贝斯 · 弦乐</p>
      </StepSection>

      <StepSection step="3" title="开始生成">
        <div className="flex items-center gap-3 mb-4">
          <ActionButton onClick={handleGenerate} disabled={taskStatus === 'running' || !selectedModel} primary>生成音乐</ActionButton>
          {taskStatus === 'running' && (
            <button onClick={async () => { if (taskId) { try { await fetch(`${API_BASE}/api/tasks/${taskId}/stop`, { method: 'POST' }) } catch (e) { console.error(e) } } }}
              className="stop-btn">终止任务</button>
          )}
          {taskStatus && <StatusBadge status={taskStatus} />}
          {elapsed > 0 && (
            <span className="text-sm text-gray-500 font-mono">
              {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
            </span>
          )}
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
  const [filePrefix, setFilePrefix] = useState('')
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const [resultFiles, setResultFiles] = useState([])
  const [playLoading, setPlayLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef(null)
  const timerRef = useRef(null)
  const { setAudio } = useContext(AudioContext)

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
      setAudio(data.audio_url, data.filename)
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
          model_type: 'gpt2',
          stage1_weights: '',
          stage2_weights: '',
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
          <InputField label="生成数量" type="number" value={nGroups} onChange={setNGroups} min="1" max="5" />
          <InputField label="文件前缀" value={filePrefix} onChange={setFilePrefix} placeholder="可选" />
          <InputField label="输出目录" value={outputDir} onChange={setOutputDir} />
          {/* 模型骨干固定为 GPT-2（实验表明优于 Performer） */}
        </div>
        <div className="mt-3 text-xs text-gray-400">
          仅钢琴单轨 · GPT-2 骨干 · 两阶段串行推理（Stage1 主旋律 → Stage2 伴奏）
          <br/>注：每次生成固定输出 2 个文件（目标情感 + 同效价的另一情感），生成数量控制 Stage1 的 lead sheet 变体数
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
      <ModelSwitcher value={activeModel} onChange={setActiveModel} label="选择生成模型" />
      <div style={{ display: activeModel === 'emo-disentanger' ? 'block' : 'none' }}>
        <EmoDisentangerPanel />
      </div>
      <div style={{ display: activeModel === 'midi-emotion' ? 'block' : 'none' }}>
        <MidiEmotionPanel />
      </div>
    </div>
  )
}

/* ═══════════════ 训练通用 Hook ═══════════════ */
function useTrainTask() {
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

  const startPolling = (tid) => {
    let offset = 0
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/tasks/${tid}?offset=${offset}`)
        const d = await r.json()
        if (d.logs?.length > 0) { setLogs(prev => [...prev, ...d.logs]); offset = d.log_offset }
        setTaskStatus(d.status)
        if (d.status !== 'running') {
          clearInterval(pollRef.current)
          clearInterval(timerRef.current)
        }
      } catch (e) { console.error(e) }
    }, 1000)
  }

  const launch = async (url, body) => {
    setLogs([]); setTaskStatus('running')
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '请求失败')
      setTaskId(data.task_id)
      setLogs([`[系统] 任务 ${data.task_id} 已启动: ${data.message}`])
      startPolling(data.task_id)
    } catch (e) {
      setLogs([`[错误] ${e.message}`])
      setTaskStatus('failed')
    }
  }

  const stop = async () => {
    if (!taskId) return
    try { await fetch(`${API_BASE}/api/tasks/${taskId}/stop`, { method: 'POST' }) } catch (e) { console.error(e) }
  }

  const fmtTime = () => {
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0')
    const s = String(elapsed % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  return { logs, taskStatus, elapsed, fmtTime, launch, stop }
}

/* ═══════════════ EMO-Disentanger 训练 ═══════════════ */
function EmoDisentangerTrainPanel() {
  const [currentStage, setCurrentStage] = useState(null) // null=未开始, 'stage1', 'stage2'
  const s1 = useTrainTask()
  const s2 = useTrainTask()

  const handleTrainStage1 = () => {
    setCurrentStage('stage1')
    s1.launch(`${API_BASE}/api/tasks/train`, {
      stage: 'stage1', model_type: 'gpt2', representation: 'functional', config: 'stage1_finetune',
    })
  }

  const handleTrainStage2 = () => {
    setCurrentStage('stage2')
    s2.launch(`${API_BASE}/api/tasks/train`, {
      stage: 'stage2', model_type: 'gpt2', representation: 'functional', config: 'stage2_finetune_gpt2',
    })
  }

  const s1Running = s1.taskStatus === 'running'
  const s2Running = s2.taskStatus === 'running'

  return (
    <div className="space-y-5">
      {/* 说明 */}
      <div className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500">
        两个阶段独立训练，顺序不限。需要 GPU（配置文件指定 CUDA 设备）。
      </div>

      {/* 阶段一 */}
      <StepSection step="1" title="主旋律生成 (Transformer-XL)">
        <p className="text-xs text-gray-400 mb-3">效价建模，生成带和弦标注的主旋律</p>
        <div className="flex items-center gap-3 mb-2">
          <ActionButton onClick={handleTrainStage1} disabled={s1Running || s2Running} primary>
            开始训练
          </ActionButton>
          {s1Running && (
            <button onClick={s1.stop}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              终止
            </button>
          )}
          {s1.taskStatus && <StatusBadge status={s1.taskStatus} />}
          {s1Running && <span className="text-sm font-mono text-gray-400">{s1.fmtTime()}</span>}
        </div>
        <div className="text-xs text-gray-400">
          配置文件 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">emopia_finetune.yaml</code>
        </div>
      </StepSection>

      {/* 阶段二 */}
      <StepSection step="2" title="伴奏生成 (GPT-2)">
        <p className="text-xs text-gray-400 mb-3">唤醒度建模，生成完整钢琴演奏</p>
        <div className="flex items-center gap-3 mb-2">
          <ActionButton onClick={handleTrainStage2} disabled={s1Running || s2Running} primary>
            开始训练
          </ActionButton>
          {s2Running && (
            <button onClick={s2.stop}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              终止
            </button>
          )}
          {s2.taskStatus && <StatusBadge status={s2.taskStatus} />}
          {s2Running && <span className="text-sm font-mono text-gray-400">{s2.fmtTime()}</span>}
        </div>
        <div className="text-xs text-gray-400">
          配置文件 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">emopia_finetune_gpt2.yaml</code>
        </div>
      </StepSection>

      {/* 日志 */}
      <LogOutput logs={[...s1.logs, ...s2.logs]} />
    </div>
  )
}

/* ═══════════════ midi-emotion 训练 ═══════════════ */
const DATASETS = [
  { id: 'vgmusic', label: 'VGMusic', sub: '129,650首 · 自动标注' },
  { id: 'emopia', label: 'EMOPIA', sub: '970首 · 人工情感标注' },
  { id: 'custom', label: '自定义', sub: '指定数据目录' },
]

function MidiEmotionTrainPanel() {
  const [dataset, setDataset] = useState('vgmusic')
  const [customDir, setCustomDir] = useState('')
  const [maxSteps, setMaxSteps] = useState(1500)
  const [batchSize, setBatchSize] = useState(8)
  const [lr, setLr] = useState('2e-5')
  const [evalStep, setEvalStep] = useState(500)
  const [outputDir, setOutputDir] = useState('midi-emotion/output/finetuned_vgmusic')
  const [pretrained, setPretrained] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { logs, taskStatus, fmtTime, launch, stop } = useTrainTask()

  // 切换数据集时自动调整推荐参数和检查点路径
  useEffect(() => {
    if (dataset === 'emopia') {
      setMaxSteps(1000); setEvalStep(200)
      setOutputDir('midi-emotion/output/finetuned_emopia')
      // EMOPIA 作为第二阶段，默认从 VGMusic 微调结果继续
      setPretrained('midi-emotion/output/finetuned_vgmusic')
    } else if (dataset === 'vgmusic') {
      setMaxSteps(1500); setEvalStep(500)
      setOutputDir('midi-emotion/output/finetuned_vgmusic')
      setPretrained('') // 从原始预训练权重开始
    } else {
      setPretrained('')
    }
  }, [dataset])

  const handleTrain = () => {
    launch(`${API_BASE}/api/tasks/train_v2`, {
      dataset, data_dir: customDir, output_dir: outputDir,
      pretrained, max_steps: maxSteps, batch_size: batchSize,
      lr: parseFloat(lr), eval_step: evalStep,
    })
  }

  return (
    <div className="space-y-5">
      {/* 推荐流程 */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500">
        <span>推荐流程：</span>
        <span>VGMusic 粗微调</span>
        <span className="text-gray-300">→</span>
        <span>EMOPIA 精微调</span>
        <span className="text-gray-300">→</span>
        <span>生成页面使用最终模型</span>
      </div>

      <StepSection step="1" title="选择数据集">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DATASETS.map(ds => (
            <button key={ds.id} onClick={() => setDataset(ds.id)}
              className={`text-left px-4 py-3 rounded-lg border-2 transition-all ${
                dataset === ds.id
                  ? 'border-indigo-400 bg-indigo-50/60'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-800">{ds.label}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{ds.sub}</div>
            </button>
          ))}
        </div>
        {dataset === 'custom' && (
          <input type="text" value={customDir} onChange={e => setCustomDir(e.target.value)}
            placeholder="data/processed/your_data" className="field-input w-full mt-3" />
        )}
        {dataset === 'emopia' && (
          <div className="mt-2 text-xs text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-md">
            将从 VGMusic 微调结果继续训练（两阶段微调第二步）
          </div>
        )}
      </StepSection>

      <StepSection step="2" title="训练参数">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="field-label">训练步数</label>
            <input type="number" value={maxSteps} onChange={e => setMaxSteps(Number(e.target.value))}
              min={100} step={100} className="field-input" />
          </div>
          <div>
            <label className="field-label">批大小</label>
            <input type="number" value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
              min={1} max={32} className="field-input" />
          </div>
          <div>
            <label className="field-label">评估间隔</label>
            <input type="number" value={evalStep} onChange={e => setEvalStep(Number(e.target.value))}
              min={50} step={50} className="field-input" />
          </div>
          <div>
            <label className="field-label">输出目录</label>
            <input type="text" value={outputDir} onChange={e => setOutputDir(e.target.value)}
              className="field-input" />
          </div>
        </div>

        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="mt-4 text-xs text-gray-500 hover:text-indigo-600 transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-indigo-50 border border-transparent hover:border-indigo-200">
          <span className={`inline-block transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▸</span>
          高级选项
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-100">
            <div>
              <label className="field-label">学习率</label>
              <input type="text" value={lr} onChange={e => setLr(e.target.value)} className="field-input" />
            </div>
            <div>
              <label className="field-label">从检查点继续</label>
              <input type="text" value={pretrained} onChange={e => setPretrained(e.target.value)}
                placeholder="留空 = 使用默认预训练权重" className="field-input" />
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-4 text-xs text-gray-400">
          <span>
            <span className="inline-block w-1 h-1 rounded-full bg-gray-300 mr-1.5" />
            序列长度固定 512
          </span>
          <span>
            <span className="inline-block w-1 h-1 rounded-full bg-gray-300 mr-1.5" />
            有 GPU 自动启用混合精度加速，无 GPU 使用 CPU
          </span>
        </div>
      </StepSection>

      <StepSection step="3" title="开始训练">
        <div className="flex items-center gap-3 mb-4">
          <ActionButton onClick={handleTrain} disabled={taskStatus === 'running'} primary>
            开始训练
          </ActionButton>
          {taskStatus === 'running' && (
            <button onClick={stop}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              终止
            </button>
          )}
          {taskStatus && <StatusBadge status={taskStatus} />}
          {taskStatus === 'running' && (
            <span className="text-sm font-mono text-gray-400">{fmtTime()}</span>
          )}
        </div>
        <LogOutput logs={logs} />
      </StepSection>
    </div>
  )
}

/* ═══════════════ 模型训练 ═══════════════ */
function TrainingTab() {
  const [model, setModel] = useState('emo-disentanger')

  return (
    <div className="space-y-5">
      <ModelSwitcher value={model} onChange={setModel} label="选择训练模型" />
      <div style={{ display: model === 'emo-disentanger' ? 'block' : 'none' }}>
        <EmoDisentangerTrainPanel />
      </div>
      <div style={{ display: model === 'midi-emotion' ? 'block' : 'none' }}>
        <MidiEmotionTrainPanel />
      </div>
    </div>
  )
}

/* ═══════════════ 文件播放 ═══════════════ */
const QUICK_DIRS = [
  { label: 'EMO-Disentanger', path: 'generation/emopia_functional_two' },
  { label: 'midi-emotion', path: 'midi-emotion/output/finetuned_emopia/generations/inference' },
]

function PlayerTab() {
  const [browsePath, setBrowsePath] = useState('generation/emopia_functional_two')
  const [searchQuery, setSearchQuery] = useState('')
  const [files, setFiles] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { setAudio, audioUrl, currentFile, audioRef } = useContext(AudioContext)
  const debounceRef = useRef(null)

  const doBrowse = async (path) => {
    if (!path.trim()) return
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/files/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: path.trim(), pattern: '*.mid' }),
      })
      const data = await res.json()
      setFiles(data.files || [])
      if (data.error) setError(data.error)
    } catch (e) { setError(e.message) }
  }

  const handlePathChange = (path) => {
    setBrowsePath(path)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doBrowse(path), 500)
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
      setAudio(data.audio_url, data.filename)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { doBrowse(browsePath) }, [])

  const filteredFiles = searchQuery.trim()
    ? files.filter(f => f.filename.toLowerCase().includes(searchQuery.toLowerCase()))
    : files

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input type="text" value={browsePath} onChange={e => handlePathChange(e.target.value)}
          className="field-input flex-1" placeholder="目录路径" />
        <ActionButton onClick={() => doBrowse(browsePath)}>刷新</ActionButton>
      </div>

      <div className="flex gap-2 flex-wrap">
        {QUICK_DIRS.map(d => (
          <button key={d.path} onClick={() => handlePathChange(d.path)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              browsePath === d.path
                ? 'bg-orange-500 text-white border-orange-500'
                : 'text-gray-500 border-gray-300 hover:border-orange-400'
            }`}>
            {d.label}
          </button>
        ))}
      </div>

      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
        placeholder="过滤文件名..." className="field-input w-full" />

      {audioUrl && (
        <div className="border border-gray-200 rounded-lg bg-white px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400">正在播放</span>
            <span className="text-sm font-medium text-gray-800 truncate">{currentFile}</span>
            {currentFile && <EmotionTag filename={currentFile} />}
          </div>
          <audio ref={audioRef} src={audioUrl} controls className="w-full h-8" />
        </div>
      )}

      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded-md border border-red-200">{error}</div>}

      <div className="file-list">
        {filteredFiles.length === 0 ? (
          <div className="text-gray-400 text-sm p-4 text-center">没有找到文件</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 px-3 font-medium">文件名</th>
                <th className="py-2 px-3 font-medium w-28">情感</th>
                <th className="py-2 px-3 font-medium w-20">大小</th>
                <th className="py-2 px-3 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((f, i) => (
                <tr key={i} className={`border-b border-gray-100 hover:bg-orange-50/50 ${currentFile === f.filename ? 'bg-orange-50' : ''}`}>
                  <td className="py-2 px-3">
                    <div className="font-medium text-gray-800">{f.filename}</div>
                    <div className="text-xs text-gray-400 truncate max-w-md">{f.path}</div>
                  </td>
                  <td className="py-2 px-3"><EmotionTag filename={f.filename} /></td>
                  <td className="py-2 px-3 text-gray-500">{formatSize(f.size)}</td>
                  <td className="py-2 px-3">
                    <button onClick={() => handlePlay(f.path)} disabled={loading}
                      className="text-orange-600 hover:text-orange-700 font-medium disabled:opacity-40">
                      {loading && currentFile === f.filename ? '转换中...' : '播放'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ═══════════════ 主应用 ═══════════════ */
function App() {
  const [activeTab, setActiveTab] = useState('inference')
  const [audioUrl, setAudioUrl] = useState(null)
  const [currentFile, setCurrentFile] = useState(null)
  const audioRef = useRef(null)

  const setAudio = useCallback((url, filename) => {
    setAudioUrl(url)
    setCurrentFile(filename)
    setTimeout(() => { audioRef.current?.load(); audioRef.current?.play().catch(() => {}) }, 100)
  }, [])

  return (
    <AudioContext.Provider value={{ setAudio, audioUrl, currentFile, audioRef }}>
    <div className="app-container">
      <div className="app-header">
        <h1 className="text-xl font-bold text-gray-800">游戏情感音乐生成系统</h1>
        <p className="text-sm text-gray-500 mt-1">EMO-Disentanger (离散 Q1-Q4) · midi-emotion (连续 V/A) · 毕业设计</p>
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
    </AudioContext.Provider>
  )
}

export default App
