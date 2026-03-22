import { useState, useRef, useEffect } from 'react'
import { API_BASE, MODEL_DESC } from '../constants'
import useMidiEmotionModels from '../hooks/useMidiEmotionModels'
import EmotionPlane from './EmotionPlane'
import { InputField, LogOutput, StepSection, ActionButton, StatusBadge } from './CommonUI'

export default function MidiEmotionPanel() {
  const [valence, setValence] = useState(0.5)
  const [arousal, setArousal] = useState(0.5)
  const [genLen, setGenLen] = useState(1024)
  const [nSamples, setNSamples] = useState('1')
  const [filePrefix, setFilePrefix] = useState('')
  const [outputDir, setOutputDir] = useState('midi-emotion/output/finetuned_vgmusic/generations/inference')
  const [selectedModel, setSelectedModel] = useState('')
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef(null)
  const timerRef = useRef(null)
  const { models, loaded: modelsLoaded } = useMidiEmotionModels()

  // 默认选中推荐模型（finetuned_vgmusic），没有则选第一个
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      const preferred = models.find(m => m.id === 'finetuned_vgmusic')
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
        <p className="text-xs text-gray-400 mt-3">最多5轨（鼓·钢琴·吉他·贝斯·弦乐），实际轨数由模型决定</p>
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
