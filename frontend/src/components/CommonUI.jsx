import { useRef, useEffect } from 'react'
import { getEmotionTag } from '../utils'
import { MODELS } from '../constants'

export function EmotionTag({ filename }) {
  const tag = getEmotionTag(filename)
  if (!tag) return null
  return (
    <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-mono"
      style={{ background: tag.color + '18', color: tag.color }}>
      {tag.id}{tag.name ? ` ${tag.name}` : ''}
    </span>
  )
}

export function InputField({ label, value, onChange, type = 'text', placeholder, min, max }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <input type={type} value={value} placeholder={placeholder}
        min={min} max={max} onChange={e => onChange(e.target.value)} className="field-input" />
    </div>
  )
}

export function LogOutput({ logs }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs])

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

export function StepSection({ step, title, children }) {
  return (
    <div className="step-section">
      <div className="step-header">step{step}: {title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export function ActionButton({ children, onClick, disabled, primary }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`action-btn ${primary ? 'action-btn-primary' : ''}`}>
      {children}
    </button>
  )
}

export function StatusBadge({ status }) {
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

export function ModelSwitcher({ value, onChange, label = '选择模型' }) {
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
