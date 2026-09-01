import { useEffect, useRef, useCallback, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL
  ? `${import.meta.env.VITE_WS_URL}/api/ws/recognition`
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/recognition`

export function useWebSocket(onMessage, enabled) {
  const ws = useRef(null)
  const [connected, setConnected] = useState(false)
  const reconnectTimer = useRef(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return
    if (ws.current && ws.current.readyState === WebSocket.OPEN) return

    const socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      if (mountedRef.current) setConnected(true)
    }

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        onMessage(data)
      } catch {}
    }

    socket.onclose = () => {
      if (mountedRef.current) {
        setConnected(false)
        if (enabled) {
          reconnectTimer.current = setTimeout(connect, 2000)
        }
      }
    }

    socket.onerror = () => socket.close()

    ws.current = socket
  }, [enabled, onMessage])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [enabled, connect])

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  return { send, connected }
}
