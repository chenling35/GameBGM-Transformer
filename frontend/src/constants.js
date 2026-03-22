export const API_BASE = ''

export const EMOTIONS = [
  { id: 'Q1', name: '开心', en: 'Happy', valence: 'Positive', color: '#f97316', desc: '正效价 · 高唤醒' },
  { id: 'Q2', name: '紧张', en: 'Tense', valence: 'Negative', color: '#ef4444', desc: '负效价 · 高唤醒' },
  { id: 'Q3', name: '悲伤', en: 'Sad', valence: 'Negative', color: '#6366f1', desc: '负效价 · 低唤醒' },
  { id: 'Q4', name: '平静', en: 'Calm', valence: 'Positive', color: '#22c55e', desc: '正效价 · 低唤醒' },
]

export const TABS = [
  { id: 'inference', label: '音乐生成' },
  { id: 'training', label: '模型训练' },
  { id: 'player', label: '文件播放' },
]

export const MODELS = [
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

export const MODEL_DESC = {
  continuous_concat: '原始预训练（通用音乐）',
  finetuned_vgmusic: '游戏音乐微调（3万首VGMusic）',
  finetuned_emopia: '情感精调（EMOPIA 1078首）',
}

export const MODEL_HIDDEN = new Set([])

export const DATASETS = [
  { id: 'vgmusic', label: 'VGMusic', sub: '129,650首 · 自动标注' },
  { id: 'emopia', label: 'EMOPIA', sub: '970首 · 人工情感标注' },
  { id: 'custom', label: '自定义', sub: '指定数据目录' },
]

export const QUICK_DIRS = [
  { label: 'EMO-Disentanger', path: 'EMO-Disentanger/generation/emopia_functional_two' },
  { label: 'midi-emotion', path: 'midi-emotion/output/finetuned_vgmusic/generations/inference' },
]
