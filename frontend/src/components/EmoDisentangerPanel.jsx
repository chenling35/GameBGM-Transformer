import { useState, useRef, useEffect, useContext } from 'react'
import { API_BASE, EMOTIONS } from '../constants'
import { formatSize } from '../utils'
import AudioContext from '../contexts/AudioContext'
import EmotionSelector from './EmotionSelector'
import { EmotionTag, InputField, LogOutput, StepSection, ActionButton, StatusBadge } from './CommonUI'

export default function EmoDisentangerPanel() {
  const [emotion, setEmotion] = useState('Q1')
  const [nGroups, setNGroups] = useState('1')
  const [outputDir, setOutputDir] = useState('EMO-Disentanger/generation/emopia_functional_two')
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
          <InputField label="输出目录" value={outputDir} onChange={setOutputDir} />
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
