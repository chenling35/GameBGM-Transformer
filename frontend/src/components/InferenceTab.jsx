import { useState } from 'react'
import { ModelSwitcher } from './CommonUI'
import EmoDisentangerPanel from './EmoDisentangerPanel'
import MidiEmotionPanel from './MidiEmotionPanel'

export default function InferenceTab() {
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
