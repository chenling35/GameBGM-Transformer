import { useState, useRef, useEffect, useCallback } from 'react'

const API_BASE = ''

/* ═══════════════ 标签页定义 ═══════════════ */
const TABS = [
  { id: 'inference', label: '模型推理' },
  { id: 'training', label: '训练' },
  { id: 'player', label: '文件播放' },
]

/* ═══════════════ 单选组件 ═══════════════ */
function RadioGroup({ label, options, value, onChange, name }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div className="flex flex-wrap gap-3 mt-1">
        {options.map(opt => (
          <label key={opt.value} className="radio-item">
            <input
              type="radio" name={name} value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span className="radio-dot" />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════ 输入组件 ═══════════════ */
function InputField({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="field-input"
      />
    </div>
  )
}

/* ═══════════════ 输出日志组件 ═══════════════ */
function LogOutput({ logs, title = '输出信息' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs])

  return (
    <div>
      <label className="field-label">{title}</label>
      <div ref={ref} className="log-area">
        {logs.length === 0
          ? <span className="text-gray-400">等待任务启动...</span>
          : logs.map((line, i) => <div key={i}>{line}</div>)
        }
      </div>
    </div>
  )
}

/* ═══════════════ 模型推理标签页 ═══════════════ */
function InferenceTab() {
  const [modelType, setModelType] = useState('gpt2')
  const [representation, setRepresentation] = useState('functional')
  const [stage1Weights, setStage1Weights] = useState(
    'best_weight/Functional-two/emopia_lead_sheet_finetune/ep016_loss0.685_params.pt'
  )
  const [stage2Weights, setStage2Weights] = useState(
    'best_weight/Functional-two/emopia_acccompaniment_finetune_gpt2/ep300_loss0.120_params.pt'
  )
  const [nGroups, setNGroups] = useState('5')
  const [outputDir, setOutputDir] = useState('generation/emopia_functional_two')
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    if (modelType === 'gpt2') {
      setStage2Weights('best_weight/Functional-two/emopia_acccompaniment_finetune_gpt2/ep300_loss0.120_params.pt')
    } else {
      setStage2Weights('best_weight/Functional-two/emopia_acccompaniment_finetune/ep300_loss0.338_params.pt')
    }
  }, [modelType])

  const pollTask = useCallback((id) => {
    let offset = 0
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tasks/${id}?offset=${offset}`)
        const data = await res.json()
        if (data.logs && data.logs.length > 0) {
          setLogs(prev => [...prev, ...data.logs])
          offset = data.log_offset
        }
        setTaskStatus(data.status)
        if (data.status !== 'running') {
          clearInterval(pollRef.current)
        }
      } catch (e) {
        console.error(e)
      }
    }, 1000)
  }, [])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleGenerateLeadSheet = async () => {
    setLogs([]); setTaskStatus('running')
    try {
      const res = await fetch(`${API_BASE}/api/tasks/generate-leadsheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          representation,
          config: 'stage1_finetune',
          weights: stage1Weights,
          n_groups: parseInt(nGroups),
          output_dir: outputDir,
        }),
      })
      const data = await res.json()
      setTaskId(data.task_id)
      setLogs([`[系统] 任务 ${data.task_id} 已启动: ${data.message}`])
      pollTask(data.task_id)
    } catch (e) {
      setLogs([`[错误] ${e.message}`])
      setTaskStatus('failed')
    }
  }

  const handleGenerateMusic = async () => {
    setLogs([]); setTaskStatus('running')
    const configKey = modelType === 'gpt2'
      ? 'stage2_finetune_gpt2' : 'stage2_finetune_performer'
    try {
      const res = await fetch(`${API_BASE}/api/tasks/generate-music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_type: modelType,
          representation,
          config: configKey,
          weights: stage2Weights,
          output_dir: outputDir,
        }),
      })
      const data = await res.json()
      setTaskId(data.task_id)
      setLogs([`[系统] 任务 ${data.task_id} 已启动: ${data.message}`])
      pollTask(data.task_id)
    } catch (e) {
      setLogs([`[错误] ${e.message}`])
      setTaskStatus('failed')
    }
  }

  const handleOneClick = async () => {
    setLogs(['[系统] 一键生成: 先执行 Stage1 Lead Sheet，完成后执行 Stage2 完整音乐'])
    setTaskStatus('running')

    try {
      // Stage 1
      const res1 = await fetch(`${API_BASE}/api/tasks/generate-leadsheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          representation,
          config: 'stage1_finetune',
          weights: stage1Weights,
          n_groups: parseInt(nGroups),
          output_dir: outputDir,
        }),
      })
      const data1 = await res1.json()
      setTaskId(data1.task_id)
      setLogs(prev => [...prev, `[系统] Stage1 任务 ${data1.task_id} 已启动`])

      // 等待 Stage1 完成
      let offset = 0
      const waitForTask = (tid) => new Promise((resolve) => {
        const iv = setInterval(async () => {
          try {
            const r = await fetch(`${API_BASE}/api/tasks/${tid}?offset=${offset}`)
            const d = await r.json()
            if (d.logs?.length > 0) {
              setLogs(prev => [...prev, ...d.logs])
              offset = d.log_offset
            }
            setTaskStatus(d.status)
            if (d.status !== 'running') {
              clearInterval(iv)
              resolve(d.status)
            }
          } catch (e) { clearInterval(iv); resolve('failed') }
        }, 1000)
      })

      const stage1Status = await waitForTask(data1.task_id)
      if (stage1Status !== 'completed') {
        setLogs(prev => [...prev, '[系统] Stage1 未成功完成，跳过 Stage2'])
        return
      }

      // Stage 2
      setLogs(prev => [...prev, '', '[系统] Stage1 完成，开始 Stage2...'])
      offset = 0
      const configKey2 = modelType === 'gpt2'
        ? 'stage2_finetune_gpt2' : 'stage2_finetune_performer'
      const res2 = await fetch(`${API_BASE}/api/tasks/generate-music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_type: modelType,
          representation,
          config: configKey2,
          weights: stage2Weights,
          output_dir: outputDir,
        }),
      })
      const data2 = await res2.json()
      setTaskId(data2.task_id)
      setLogs(prev => [...prev, `[系统] Stage2 任务 ${data2.task_id} 已启动`])
      pollTask(data2.task_id)
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
      <StepSection step="1" title="选择模型和参数">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <RadioGroup
            label="模型骨架" name="model_type"
            options={[
              { value: 'gpt2', label: 'GPT-2' },
              { value: 'performer', label: 'Performer' },
            ]}
            value={modelType} onChange={setModelType}
          />
          <RadioGroup
            label="表示方式" name="representation"
            options={[
              { value: 'functional', label: 'Functional' },
              { value: 'remi', label: 'REMI' },
            ]}
            value={representation} onChange={setRepresentation}
          />
          <InputField
            label="生成组数 (n_groups)" type="number"
            value={nGroups} onChange={setNGroups}
          />
          <InputField
            label="输出目录"
            value={outputDir} onChange={setOutputDir}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <InputField
            label="Stage1 权重路径"
            value={stage1Weights} onChange={setStage1Weights}
          />
          <InputField
            label="Stage2 权重路径"
            value={stage2Weights} onChange={setStage2Weights}
          />
        </div>
      </StepSection>

      <StepSection step="2" title="开始生成">
        <div className="flex flex-wrap gap-3 mb-4">
          <ActionButton
            onClick={handleGenerateLeadSheet}
            disabled={taskStatus === 'running'}
          >
            生成 Lead Sheet
          </ActionButton>
          <ActionButton
            onClick={handleGenerateMusic}
            disabled={taskStatus === 'running'}
          >
            生成完整音乐
          </ActionButton>
          <ActionButton
            onClick={handleOneClick}
            disabled={taskStatus === 'running'}
            primary
          >
            一键生成
          </ActionButton>
          {taskStatus === 'running' && (
            <button onClick={handleStop} className="stop-btn">终止任务</button>
          )}
          {taskStatus && <StatusBadge status={taskStatus} />}
        </div>
        <LogOutput logs={logs} />
      </StepSection>
    </div>
  )
}

/* ═══════════════ 训练标签页 ═══════════════ */
function TrainingTab() {
  const [stage, setStage] = useState('stage2')
  const [modelType, setModelType] = useState('gpt2')
  const [representation, setRepresentation] = useState('functional')
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const getConfigKey = () => {
    if (stage === 'stage1') return 'stage1_finetune'
    return modelType === 'gpt2' ? 'stage2_finetune_gpt2' : 'stage2_finetune_performer'
  }

  const getConfigPath = () => {
    if (stage === 'stage1') return 'stage1_compose/config/emopia_finetune.yaml'
    return modelType === 'gpt2'
      ? 'stage2_accompaniment/config/emopia_finetune_gpt2.yaml'
      : 'stage2_accompaniment/config/emopia_finetune.yaml'
  }

  const getTrainInfo = () => {
    if (stage === 'stage1') return 'batch_size=4, max_epoch=100, lr=1e-5, warmup=200'
    return 'batch_size=4, num_epochs=1000, lr=1e-5, accum_steps=2'
  }

  const handleTrain = async () => {
    setLogs([]); setTaskStatus('running')
    try {
      const res = await fetch(`${API_BASE}/api/tasks/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          model_type: modelType,
          representation,
          config: getConfigKey(),
        }),
      })
      const data = await res.json()
      setTaskId(data.task_id)
      setLogs([`[系统] 任务 ${data.task_id} 已启动: ${data.message}`])

      let offset = 0
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/tasks/${data.task_id}?offset=${offset}`)
          const d = await r.json()
          if (d.logs?.length > 0) {
            setLogs(prev => [...prev, ...d.logs])
            offset = d.log_offset
          }
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
    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/stop`, { method: 'POST' })
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-5">
      <StepSection step="1" title="训练配置">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
          <RadioGroup
            label="训练阶段" name="train_stage"
            options={[
              { value: 'stage1', label: 'Stage1 Lead Sheet' },
              { value: 'stage2', label: 'Stage2 Accompaniment' },
            ]}
            value={stage} onChange={setStage}
          />
          {stage === 'stage2' && (
            <RadioGroup
              label="模型骨架" name="train_model"
              options={[
                { value: 'gpt2', label: 'GPT-2' },
                { value: 'performer', label: 'Performer' },
              ]}
              value={modelType} onChange={setModelType}
            />
          )}
          <RadioGroup
            label="表示方式" name="train_repr"
            options={[
              { value: 'functional', label: 'Functional' },
              { value: 'remi', label: 'REMI' },
            ]}
            value={representation} onChange={setRepresentation}
          />
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-md text-sm text-gray-600 border border-gray-200">
          <div>配置文件: <code className="bg-gray-100 px-1 rounded text-gray-800">{getConfigPath()}</code></div>
          <div className="mt-1">训练参数: {getTrainInfo()}</div>
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

/* ═══════════════ 文件播放标签页 ═══════════════ */
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
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '播放失败')
      }
      const data = await res.json()
      setAudioUrl(data.audio_url)
      setCurrentFile(data.filename)
      setFilePath(path)
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load()
          audioRef.current.play().catch(() => {})
        }
      }, 100)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handlePlayPath = () => {
    if (filePath.trim()) handlePlay(filePath.trim())
  }

  useEffect(() => { handleBrowse() }, [])

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="space-y-5">
      <StepSection step="1" title="输入文件路径播放">
        <div className="flex gap-2">
          <input
            type="text" value={filePath}
            placeholder="输入 MIDI/WAV 文件路径 (支持相对路径和绝对路径)"
            onChange={e => setFilePath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePlayPath()}
            className="field-input flex-1"
          />
          <ActionButton onClick={handlePlayPath} disabled={!filePath.trim() || loading}>
            {loading ? '转换中...' : '播放'}
          </ActionButton>
        </div>

        {audioUrl && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-sm text-gray-600 mb-2">
              正在播放: <span className="text-gray-800 font-medium">{currentFile}</span>
            </div>
            <audio
              ref={audioRef} src={audioUrl} controls className="w-full"
            />
          </div>
        )}

        {error && (
          <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded-md border border-red-200">
            {error}
          </div>
        )}
      </StepSection>

      <StepSection step="2" title="浏览和搜索文件">
        <div className="flex gap-2 mb-3">
          <input
            type="text" value={browsePath} placeholder="浏览目录路径"
            onChange={e => setBrowsePath(e.target.value)}
            className="field-input flex-1"
          />
          <ActionButton onClick={handleBrowse}>浏览</ActionButton>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            type="text" value={searchQuery}
            placeholder="搜索文件名 (如: Q1, samp_00...)"
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="field-input flex-1"
          />
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
                    <td className="py-2 px-3 text-gray-500">{formatSize(f.size)}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handlePlay(f.path)}
                        className="text-orange-600 hover:text-orange-700 font-medium"
                      >
                        播放
                      </button>
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

/* ═══════════════ 公共子组件 ═══════════════ */
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
    <button
      onClick={onClick} disabled={disabled}
      className={`action-btn ${primary ? 'action-btn-primary' : ''}`}
    >
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
      {status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 animate-pulse" />
      )}
      {label}
    </span>
  )
}

/* ═══════════════ 主应用 ═══════════════ */
function App() {
  const [activeTab, setActiveTab] = useState('inference')
  const [sysStatus, setSysStatus] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/status`)
      .then(r => r.json())
      .then(d => setSysStatus(d))
      .catch(() => setSysStatus({ status: 'error' }))
  }, [])

  return (
    <div className="app-container">
      {/* 标题 */}
      <div className="app-header">
        <h1 className="text-xl font-bold text-gray-800">EMO-Disentanger WebUI</h1>
        <p className="text-sm text-gray-500 mt-1">
          基于 Transformer 的情感驱动钢琴音乐生成系统 (ISMIR 2024)
        </p>
      </div>

      {/* 系统信息条 */}
      <div className="sys-bar">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${sysStatus?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
          {sysStatus?.status === 'ok' ? '系统就绪' : '系统异常'}
        </span>
        {sysStatus?.gpu && sysStatus.gpu !== '未检测到' && (
          <span>GPU: {sysStatus.gpu}</span>
        )}
        {sysStatus?.midi_library_stats && (
          <span>MIDI库: {Object.values(sysStatus.midi_library_stats).reduce((a, b) => a + b, 0)} 文件</span>
        )}
        <span>FluidSynth: {sysStatus?.fluidsynth ? '可用' : '不可用'}</span>
      </div>

      {/* 标签页导航 */}
      <div className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-item ${activeTab === tab.id ? 'tab-active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="tab-content">
        {activeTab === 'inference' && <InferenceTab />}
        {activeTab === 'training' && <TrainingTab />}
        {activeTab === 'player' && <PlayerTab />}
      </div>

      {/* 页脚 */}
      <div className="app-footer">
        <span>毕业设计 - 基于 Transformer 的游戏情感音乐生成系统</span>
        <span>Powered by EMO-Disentanger | Built with FastAPI + React</span>
      </div>
    </div>
  )
}

export default App
