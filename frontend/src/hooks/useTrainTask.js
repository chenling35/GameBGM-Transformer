import { useState, useRef, useEffect } from 'react'
import { API_BASE } from '../constants'

export default function useTrainTask() {
  const [taskId, setTaskId] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskStatus, setTaskStatus] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const startPolling = (tid) => {
    let offset = 0
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/tasks/${tid}?offset=${offset}`)
        const d = await r.json()
        if (d.logs?.length > 0) { setLogs(prev => [...prev, ...d.logs]); offset = d.log_offset }
        setTaskStatus(d.status)
        if (d.status !== 'running') {
          clearInterval(pollRef.current)
          clearInterval(timerRef.current)
        }
      } catch (e) { console.error(e) }
    }, 1000)
  }

  const launch = async (url, body) => {
    setLogs([]); setTaskStatus('running')
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '请求失败')
      setTaskId(data.task_id)
      setLogs([`[系统] 任务 ${data.task_id} 已启动: ${data.message}`])
      startPolling(data.task_id)
    } catch (e) {
      setLogs([`[错误] ${e.message}`])
      setTaskStatus('failed')
    }
  }

  const stop = async () => {
    if (!taskId) return
    try { await fetch(`${API_BASE}/api/tasks/${taskId}/stop`, { method: 'POST' }) } catch (e) { console.error(e) }
  }

  const fmtTime = () => {
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0')
    const s = String(elapsed % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  return { logs, taskStatus, elapsed, fmtTime, launch, stop }
}
