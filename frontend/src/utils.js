import { EMOTIONS } from './constants'

export function getEmotionTag(filename) {
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

export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
