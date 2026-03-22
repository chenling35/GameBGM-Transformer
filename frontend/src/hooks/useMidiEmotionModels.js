import { useState, useEffect } from 'react'
import { API_BASE, MODEL_HIDDEN } from '../constants'

export default function useMidiEmotionModels() {
  const [models, setModels] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    fetch(`${API_BASE}/api/models/midi_emotion`).then(r => r.json()).then(data => {
      setModels((data.models || []).filter(m => !MODEL_HIDDEN.has(m.id)))
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])
  return { models, loaded }
}
