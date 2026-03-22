import { useState, useRef } from 'react'

export default function EmotionPlane({ valence, arousal, onChange }) {
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
