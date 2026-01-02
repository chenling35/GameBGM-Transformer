import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Download, Sparkles, Music, Loader2, AlertCircle, Volume2 } from 'lucide-react'

// 后端 API 地址
const API_BASE = 'http://localhost:8000'

// 情感数据
const emotions = [
  {
    id: 'Q1',
    name: '开心',
    english: 'Happy',
    symbol: '✦',
    color: '#f59e0b',
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    glow: 'rgba(251, 191, 36, 0.4)',
    description: '明快活泼的旋律',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-400'
  },
  {
    id: 'Q2',
    name: '紧张',
    english: 'Tense',
    symbol: '◆',
    color: '#ef4444',
    gradient: 'from-red-500 via-rose-600 to-purple-600',
    glow: 'rgba(239, 68, 68, 0.4)',
    description: '激烈紧迫的节奏',
    bgClass: 'bg-red-500/20',
    textClass: 'text-red-400'
  },
  {
    id: 'Q3',
    name: '悲伤',
    english: 'Sad',
    symbol: '○',
    color: '#6366f1',
    gradient: 'from-blue-400 via-indigo-500 to-violet-600',
    glow: 'rgba(99, 102, 241, 0.4)',
    description: '忧郁深沉的曲调',
    bgClass: 'bg-indigo-500/20',
    textClass: 'text-indigo-400'
  },
  {
    id: 'Q4',
    name: '平静',
    english: 'Calm',
    symbol: '◇',
    color: '#14b8a6',
    gradient: 'from-emerald-400 via-teal-500 to-cyan-500',
    glow: 'rgba(20, 184, 166, 0.4)',
    description: '舒缓安宁的氛围',
    bgClass: 'bg-teal-500/20',
    textClass: 'text-teal-400'
  }
]

// 音频可视化组件
function AudioVisualizer({ isPlaying, color, analyserNode }) {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const dataArrayRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const bars = 48
    const barWidth = width / bars - 2

    // 如果有分析器节点，使用真实音频数据
    if (analyserNode) {
      dataArrayRef.current = new Uint8Array(analyserNode.frequencyBinCount)
    }

    const animate = () => {
      ctx.fillStyle = 'rgba(10, 10, 20, 0.3)'
      ctx.fillRect(0, 0, width, height)

      let barHeights = []

      if (analyserNode && isPlaying && dataArrayRef.current) {
        // 使用真实音频数据
        analyserNode.getByteFrequencyData(dataArrayRef.current)
        const step = Math.floor(dataArrayRef.current.length / bars)
        for (let i = 0; i < bars; i++) {
          const value = dataArrayRef.current[i * step]
          barHeights.push((value / 255) * 70 + 5)
        }
      } else {
        // 模拟动画
        for (let i = 0; i < bars; i++) {
          const barHeight = isPlaying
            ? Math.random() * 50 + 15 + Math.sin(Date.now() / 200 + i * 0.3) * 15
            : 6 + Math.sin(Date.now() / 1000 + i * 0.2) * 3
          barHeights.push(barHeight)
        }
      }

      for (let i = 0; i < bars; i++) {
        const barHeight = barHeights[i]
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, color + '40')
        gradient.addColorStop(1, color)

        ctx.fillStyle = gradient
        ctx.fillRect(
          i * (barWidth + 2),
          height - barHeight,
          barWidth,
          barHeight
        )
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, color, analyserNode])

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={100}
      className="rounded-xl w-full max-w-[400px]"
    />
  )
}

// 情感卡片组件
function EmotionCard({ emotion, isSelected, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`
        relative p-6 rounded-2xl border text-left transition-all duration-300
        ${isSelected
          ? 'border-white/30 bg-white/10'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
        }
      `}
    >
      {/* 光晕效果 */}
      <div
        className={`absolute inset-0 rounded-2xl transition-opacity duration-500 ${isSelected ? 'opacity-100' : 'opacity-0'}`}
        style={{
          background: `radial-gradient(circle at 50% 50%, ${emotion.glow} 0%, transparent 70%)`
        }}
      />

      <div className="relative z-10">
        {/* 符号 */}
        <motion.div
          className="text-4xl mb-4"
          style={{ color: emotion.color }}
          animate={{ scale: isSelected ? 1.1 : 1 }}
        >
          {emotion.symbol}
        </motion.div>

        {/* 名称 */}
        <div className="text-xl font-medium mb-1">{emotion.name}</div>
        <div className="text-xs tracking-wider text-white/40 uppercase mb-3">
          {emotion.english} · {emotion.id}
        </div>

        {/* 描述 */}
        <div className="text-xs text-white/30">{emotion.description}</div>
      </div>

      {/* 选中指示器 */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 right-3 w-2 h-2 rounded-full bg-white"
        />
      )}
    </motion.button>
  )
}

// 主应用组件
function App() {
  const [selectedEmotion, setSelectedEmotion] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [generatedTrack, setGeneratedTrack] = useState(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [backendStatus, setBackendStatus] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // 音频相关
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)

  const selectedEmotionData = emotions.find(e => e.id === selectedEmotion)

  // 检查后端状态
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status`)
        const data = await res.json()
        setBackendStatus(data)
      } catch (err) {
        setBackendStatus({ status: 'error', message: '无法连接后端服务' })
      }
    }
    checkBackend()
  }, [])

  // 初始化音频上下文
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256

      if (audioRef.current) {
        const source = audioContextRef.current.createMediaElementSource(audioRef.current)
        source.connect(analyserRef.current)
        analyserRef.current.connect(audioContextRef.current.destination)
      }
    }
  }

  // 生成音乐 - 调用真实 API
  const handleGenerate = async () => {
    if (!selectedEmotion) return

    setIsGenerating(true)
    setProgress(0)
    setGeneratedTrack(null)
    setIsPlaying(false)
    setError(null)

    // 模拟进度条
    const interval = setInterval(() => {
      setProgress(prev => Math.min(prev + Math.random() * 20, 90))
    }, 100)

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emotion: selectedEmotion }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || '生成失败')
      }

      clearInterval(interval)
      setProgress(100)

      setGeneratedTrack({
        emotion: data.emotion,
        emotionName: data.emotion_name,
        duration: data.duration,
        bars: data.bars,
        notes: data.notes,
        filename: data.filename,
        audioUrl: data.audio_url ? `${API_BASE}${data.audio_url}` : null,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      clearInterval(interval)
      setIsGenerating(false)
    }
  }

// 播放/暂停
const handlePlayPause = () => {
  if (!generatedTrack?.audioUrl || !audioRef.current) return

  if (isPlaying) {
    audioRef.current.pause()
  } else {
    audioRef.current.play().catch(err => {
      console.error('播放失败:', err)
    })
  }
  setIsPlaying(!isPlaying)
}

  // 下载 MIDI 文件
  const handleDownload = () => {
    if (!generatedTrack) return
    window.open(`${API_BASE}/api/download/${generatedTrack.filename}`, '_blank')
  }

  // 格式化时间
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white overflow-hidden relative">
      {/* 隐藏的音频元素 */}
      <audio
        ref={audioRef}
        src={generatedTrack?.audioUrl}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.target.duration)}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* 动态背景渐变 */}
      <motion.div
        className="absolute inset-0 opacity-30 pointer-events-none"
        animate={{
          background: selectedEmotionData
            ? `radial-gradient(ellipse at 50% 0%, ${selectedEmotionData.glow} 0%, transparent 50%)`
            : 'radial-gradient(ellipse at 50% 0%, rgba(99, 102, 241, 0.2) 0%, transparent 50%)'
        }}
        transition={{ duration: 1 }}
      />

      {/* 网格背景 */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* 头部 */}
        <header className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6"
          >
            <span className={`w-2 h-2 rounded-full ${backendStatus?.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
            <span className="text-xs tracking-widest text-white/60 uppercase">
              {backendStatus?.status === 'ok' ? 'AI-Powered Music Generation' : '正在连接服务...'}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-light tracking-tight mb-4"
          >
            <span className="bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent">
              情感音乐生成器
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 font-light tracking-wide"
          >
            Emotion-Driven Piano Music Generation
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-white/30 mt-2"
          >
            基于 EMO-Disentanger 模型 · ISMIR 2024
          </motion.p>
        </header>

        {/* 情感选择 */}
        <section className="mb-12">
          <h2 className="text-center text-sm tracking-[0.3em] text-white/40 uppercase mb-8">
            选择情感 · Select Emotion
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {emotions.map((emotion, index) => (
              <motion.div
                key={emotion.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <EmotionCard
                  emotion={emotion}
                  isSelected={selectedEmotion === emotion.id}
                  onClick={() => setSelectedEmotion(emotion.id)}
                />
              </motion.div>
            ))}
          </div>
        </section>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-md mx-auto mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400 text-sm">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 生成按钮 */}
        <section className="flex justify-center mb-12">
          <motion.button
            onClick={handleGenerate}
            disabled={!selectedEmotion || isGenerating}
            whileHover={selectedEmotion && !isGenerating ? { scale: 1.05 } : {}}
            whileTap={selectedEmotion && !isGenerating ? { scale: 0.95 } : {}}
            className={`
              relative px-12 py-4 rounded-full font-medium tracking-wide
              transition-all duration-300 overflow-hidden flex items-center gap-3
              ${selectedEmotion && !isGenerating
                ? 'bg-white text-black hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
              }
            `}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>生成中... {Math.min(100, Math.round(progress))}%</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>生成音乐</span>
              </>
            )}

            {/* 进度条 */}
            {isGenerating && (
              <motion.div
                className="absolute bottom-0 left-0 h-1 bg-black/20"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, progress)}%` }}
              />
            )}
          </motion.button>
        </section>

        {/* 播放器 */}
        <section className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-3xl bg-white/5 border border-white/10 p-8 backdrop-blur-sm"
          >
            {/* 可视化 */}
            <div className="mb-6 flex justify-center">
              <AudioVisualizer
                isPlaying={isPlaying}
                color={selectedEmotionData?.color || '#6366f1'}
                analyserNode={analyserRef.current}
              />
            </div>

            {/* 曲目信息 */}
            <AnimatePresence mode="wait">
              {generatedTrack ? (
                <motion.div
                  key="track"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center mb-6"
                >
                  <div className="text-2xl font-light mb-2">
                    {generatedTrack.emotionName} · {generatedTrack.emotion}
                  </div>
                  <div className="text-sm text-white/40">
                    {generatedTrack.bars} 小节 · {generatedTrack.notes} 音符
                  </div>
                  {generatedTrack.audioUrl && (
                    <div className="text-xs text-emerald-400 mt-2 flex items-center justify-center gap-1">
                      <Volume2 className="w-3 h-3" />
                      音频已就绪
                    </div>
                  )}
                  {/* 进度条 */}
                  {duration > 0 && (
                    <div className="mt-4">
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white/50 transition-all"
                          style={{ width: `${(currentTime / duration) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-white/30 mt-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center mb-6 text-white/30"
                >
                  <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  选择情感后点击生成
                </motion.div>
              )}
            </AnimatePresence>

            {/* 控制按钮 */}
            <div className="flex items-center justify-center gap-4">
              <motion.button
                onClick={handlePlayPause}
                disabled={!generatedTrack?.audioUrl}
                whileHover={generatedTrack?.audioUrl ? { scale: 1.1 } : {}}
                whileTap={generatedTrack?.audioUrl ? { scale: 0.9 } : {}}
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center transition-all
                  ${generatedTrack?.audioUrl
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                  }
                `}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
              </motion.button>

              <motion.button
                onClick={handleDownload}
                disabled={!generatedTrack}
                whileHover={generatedTrack ? { scale: 1.05 } : {}}
                className={`
                  px-6 py-3 rounded-full text-sm tracking-wide transition-all
                  flex items-center gap-2
                  ${generatedTrack
                    ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                    : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'
                  }
                `}
              >
                <Download className="w-4 h-4" />
                下载 MIDI
              </motion.button>
            </div>
          </motion.div>
        </section>

        {/* Russell 情感模型 */}
        <section className="mt-16 text-center">
          <h3 className="text-xs tracking-[0.3em] text-white/30 uppercase mb-6">
            Russell Circumplex Model
          </h3>

          <div className="inline-grid grid-cols-3 gap-2 text-xs text-white/40">
            <div></div>
            <div className="text-white/60">高唤醒 ↑</div>
            <div></div>

            <div className="text-right pr-2 flex items-center justify-end">消极 ←</div>
            <div className="grid grid-cols-2 gap-1 p-2 rounded-lg bg-white/5 border border-white/10">
              <div className="p-2 rounded bg-red-500/20 text-red-400 font-medium">Q2</div>
              <div className="p-2 rounded bg-amber-500/20 text-amber-400 font-medium">Q1</div>
              <div className="p-2 rounded bg-indigo-500/20 text-indigo-400 font-medium">Q3</div>
              <div className="p-2 rounded bg-teal-500/20 text-teal-400 font-medium">Q4</div>
            </div>
            <div className="text-left pl-2 flex items-center">→ 积极</div>

            <div></div>
            <div className="text-white/60">↓ 低唤醒</div>
            <div></div>
          </div>
        </section>

        {/* 页脚 */}
        <footer className="mt-20 text-center text-xs text-white/20">
          <p>基于 EMO-Disentanger · Two-stage Emotion Disentanglement</p>
          <p className="mt-1">毕业设计 · 基于Transformer的游戏情感音乐生成系统</p>
        </footer>
      </div>
    </div>
  )
}

export default App