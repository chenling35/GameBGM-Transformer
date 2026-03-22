import { useState, useRef, useEffect, useContext } from 'react'
import { API_BASE, QUICK_DIRS } from '../constants'
import { formatSize } from '../utils'
import AudioContext from '../contexts/AudioContext'
import { EmotionTag, ActionButton } from './CommonUI'

export default function PlayerTab() {
  const [browsePath, setBrowsePath] = useState('EMO-Disentanger/generation/emopia_functional_two')
  const [searchQuery, setSearchQuery] = useState('')
  const [files, setFiles] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { setAudio, audioUrl, currentFile, audioRef } = useContext(AudioContext)
  const debounceRef = useRef(null)

  const doBrowse = async (path) => {
    if (!path.trim()) return
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/files/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: path.trim(), pattern: '*.mid' }),
      })
      const data = await res.json()
      setFiles(data.files || [])
      if (data.error) setError(data.error)
    } catch (e) { setError(e.message) }
  }

  const handlePathChange = (path) => {
    setBrowsePath(path)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doBrowse(path), 500)
  }

  const handlePlay = async (path) => {
    setError(null); setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/files/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || '播放失败') }
      const data = await res.json()
      setAudio(data.audio_url, data.filename)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { doBrowse(browsePath) }, [])

  const filteredFiles = searchQuery.trim()
    ? files.filter(f => f.filename.toLowerCase().includes(searchQuery.toLowerCase()))
    : files

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input type="text" value={browsePath} onChange={e => handlePathChange(e.target.value)}
          className="field-input flex-1" placeholder="目录路径" />
        <ActionButton onClick={() => doBrowse(browsePath)}>刷新</ActionButton>
      </div>

      <div className="flex gap-2 flex-wrap">
        {QUICK_DIRS.map(d => (
          <button key={d.path} onClick={() => handlePathChange(d.path)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              browsePath === d.path
                ? 'bg-orange-500 text-white border-orange-500'
                : 'text-gray-500 border-gray-300 hover:border-orange-400'
            }`}>
            {d.label}
          </button>
        ))}
      </div>

      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
        placeholder="过滤文件名..." className="field-input w-full" />

      {audioUrl && (
        <div className="border border-gray-200 rounded-lg bg-white px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400">正在播放</span>
            <span className="text-sm font-medium text-gray-800 truncate">{currentFile}</span>
            {currentFile && <EmotionTag filename={currentFile} />}
          </div>
          <audio ref={audioRef} src={audioUrl} controls className="w-full h-8" />
        </div>
      )}

      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded-md border border-red-200">{error}</div>}

      <div className="file-list">
        {filteredFiles.length === 0 ? (
          <div className="text-gray-400 text-sm p-4 text-center">没有找到文件</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 px-3 font-medium">文件名</th>
                <th className="py-2 px-3 font-medium w-28">情感</th>
                <th className="py-2 px-3 font-medium w-20">大小</th>
                <th className="py-2 px-3 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((f, i) => (
                <tr key={i} className={`border-b border-gray-100 hover:bg-orange-50/50 ${currentFile === f.filename ? 'bg-orange-50' : ''}`}>
                  <td className="py-2 px-3">
                    <div className="font-medium text-gray-800">{f.filename}</div>
                    <div className="text-xs text-gray-400 truncate max-w-md">{f.path}</div>
                  </td>
                  <td className="py-2 px-3"><EmotionTag filename={f.filename} /></td>
                  <td className="py-2 px-3 text-gray-500">{formatSize(f.size)}</td>
                  <td className="py-2 px-3">
                    <button onClick={() => handlePlay(f.path)} disabled={loading}
                      className="text-orange-600 hover:text-orange-700 font-medium disabled:opacity-40">
                      {loading && currentFile === f.filename ? '转换中...' : '播放'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
