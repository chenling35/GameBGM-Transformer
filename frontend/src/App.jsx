import { useState, useRef, useCallback } from 'react'
import { TABS } from './constants'
import AudioContext from './contexts/AudioContext'
import InferenceTab from './components/InferenceTab'
import TrainingTab from './components/TrainingTab'
import PlayerTab from './components/PlayerTab'

function App() {
  const [activeTab, setActiveTab] = useState('inference')
  const [audioUrl, setAudioUrl] = useState(null)
  const [currentFile, setCurrentFile] = useState(null)
  const audioRef = useRef(null)

  const setAudio = useCallback((url, filename) => {
    setAudioUrl(url)
    setCurrentFile(filename)
    setTimeout(() => { audioRef.current?.load(); audioRef.current?.play().catch(() => {}) }, 100)
  }, [])

  return (
    <AudioContext.Provider value={{ setAudio, audioUrl, currentFile, audioRef }}>
    <div className="app-container">
      <div className="app-header">
        <h1 className="text-3xl font-bold text-gray-800">游戏情感音乐生成系统</h1>
        <p className="text-sm text-gray-500 mt-1">EMO-Disentanger (离散 Q1-Q4) · midi-emotion (连续 V/A) · 毕业设计</p>
      </div>

      <div className="tab-bar">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`tab-item ${activeTab === tab.id ? 'tab-active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div style={{ display: activeTab === 'inference' ? 'block' : 'none' }}><InferenceTab /></div>
        <div style={{ display: activeTab === 'training' ? 'block' : 'none' }}><TrainingTab /></div>
        <div style={{ display: activeTab === 'player' ? 'block' : 'none' }}><PlayerTab /></div>
      </div>

      <div className="app-footer">
        <span>毕业设计 - 基于 Transformer 的游戏情感音乐生成系统</span>
        <span>Powered by EMO-Disentanger | Built with FastAPI + React</span>
      </div>
    </div>
    </AudioContext.Provider>
  )
}

export default App
