import { EMOTIONS } from '../constants'

export default function EmotionSelector({ value, onChange }) {
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
