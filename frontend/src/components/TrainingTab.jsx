import { useState, useEffect } from 'react'
import { API_BASE, DATASETS } from '../constants'
import useTrainTask from '../hooks/useTrainTask'
import { LogOutput, StepSection, ActionButton, StatusBadge, ModelSwitcher } from './CommonUI'

/* ═══════════════ EMO-Disentanger 训练 ═══════════════ */
function EmoDisentangerTrainPanel() {
  const [currentStage, setCurrentStage] = useState(null)
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
      <div className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500">
        两个阶段独立训练，顺序不限。需要 GPU（配置文件指定 CUDA 设备）。
      </div>

      <StepSection step="1" title="主旋律生成 (Transformer-XL)">
        <p className="text-xs text-gray-400 mb-3">效价建模，生成带和弦标注的主旋律</p>
        <div className="flex items-center gap-3 mb-2">
          <ActionButton onClick={handleTrainStage1} disabled={s1Running || s2Running} primary>开始训练</ActionButton>
          {s1Running && (
            <button onClick={s1.stop}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">终止</button>
          )}
          {s1.taskStatus && <StatusBadge status={s1.taskStatus} />}
          {s1Running && <span className="text-sm font-mono text-gray-400">{s1.fmtTime()}</span>}
        </div>
        <div className="text-xs text-gray-400">
          配置文件 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">emopia_finetune.yaml</code>
        </div>
      </StepSection>

      <StepSection step="2" title="伴奏生成 (GPT-2)">
        <p className="text-xs text-gray-400 mb-3">唤醒度建模，生成完整钢琴演奏</p>
        <div className="flex items-center gap-3 mb-2">
          <ActionButton onClick={handleTrainStage2} disabled={s1Running || s2Running} primary>开始训练</ActionButton>
          {s2Running && (
            <button onClick={s2.stop}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">终止</button>
          )}
          {s2.taskStatus && <StatusBadge status={s2.taskStatus} />}
          {s2Running && <span className="text-sm font-mono text-gray-400">{s2.fmtTime()}</span>}
        </div>
        <div className="text-xs text-gray-400">
          配置文件 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">emopia_finetune_gpt2.yaml</code>
        </div>
      </StepSection>

      <LogOutput logs={[...s1.logs, ...s2.logs]} />
    </div>
  )
}

/* ═══════════════ midi-emotion 训练 ═══════════════ */
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

  useEffect(() => {
    if (dataset === 'emopia') {
      setMaxSteps(1000); setEvalStep(200)
      setOutputDir('midi-emotion/output/finetuned_emopia')
      setPretrained('midi-emotion/output/finetuned_vgmusic')
    } else if (dataset === 'vgmusic') {
      setMaxSteps(1500); setEvalStep(500)
      setOutputDir('midi-emotion/output/finetuned_vgmusic')
      setPretrained('')
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
          <ActionButton onClick={handleTrain} disabled={taskStatus === 'running'} primary>开始训练</ActionButton>
          {taskStatus === 'running' && (
            <button onClick={stop}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">终止</button>
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

/* ═══════════════ 训练页面主组件 ═══════════════ */
export default function TrainingTab() {
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
