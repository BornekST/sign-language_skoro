import { useState, useCallback, useEffect, useRef } from 'react'
import Camera from '../components/Camera.jsx'
import RecognitionDisplay from '../components/RecognitionDisplay.jsx'
import TextBuilder, { useTextBuilder } from '../components/TextBuilder.jsx'
import { useWebSocket } from '../hooks/useWebSocket.js'
import { getRecognitionStatus } from '../services/api.js'
import './Home.css'

const SUBTITLE_CHARS   = 60   // max chars u titlu
const WORD_GAP_MS      = 1200 // pauza između slova → automatski razmak (nova riječ)
const SUBTITLE_TIMEOUT = 3500 // ms tišine → titl nestaje
const CAMERA_FPS = 14

export default function Home() {
  const [isActive, setIsActive] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [subtitleMode, setSubtitleMode] = useState(false)
  const [result, setResult] = useState({ hand_detected: false, sign: null, confidence: 0, landmarks: { right: null, left: null } })
  const [modelReady, setModelReady] = useState(false)
  const sendRef = useRef(null)
  const pendingRef = useRef(false)

  // Real-time subtitle state
  const [subtitlePhrase, setSubtitlePhrase] = useState('')
  const [subtitleVisible, setSubtitleVisible] = useState(false)
  const subtitleTimerRef = useRef(null)
  const wordGapTimerRef  = useRef(null)
  const prevTextRef      = useRef('')

  const { text, setText } = useTextBuilder(result.sign, result.confidence)

  useEffect(() => {
    // Reset subtitle when text is cleared/deleted
    if (text.length < prevTextRef.current.length) {
      setSubtitlePhrase('')
      setSubtitleVisible(false)
      clearTimeout(subtitleTimerRef.current)
      clearTimeout(wordGapTimerRef.current)
      prevTextRef.current = text
      return
    }

    if (text.length === prevTextRef.current.length) return

    const newChars = text.slice(prevTextRef.current.length)
    prevTextRef.current = text

    // Cancel pending word-gap (new sign arrived)
    clearTimeout(wordGapTimerRef.current)

    setSubtitlePhrase(prev => {
      const updated = prev + newChars
      return updated.length > SUBTITLE_CHARS ? '…' + updated.slice(-SUBTITLE_CHARS) : updated
    })
    setSubtitleVisible(true)

    // After short pause → add space (korisnik završio jednu riječ/slovo-streak)
    wordGapTimerRef.current = setTimeout(() => {
      setSubtitlePhrase(prev => (prev && !prev.endsWith(' ') ? prev + ' ' : prev))
    }, WORD_GAP_MS)

    // After long pause → sakrij titl i očisti frazu
    clearTimeout(subtitleTimerRef.current)
    subtitleTimerRef.current = setTimeout(() => {
      setSubtitleVisible(false)
      setTimeout(() => setSubtitlePhrase(''), 500)
    }, SUBTITLE_TIMEOUT)
  }, [text])

  useEffect(() => {
    const poll = async () => {
      try {
        const s = await getRecognitionStatus()
        setModelReady(s.model_loaded)
      } catch {}
    }
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [])

  const handleMessage = useCallback((data) => {
    setResult(data)
    pendingRef.current = false
  }, [])

  const { send, connected } = useWebSocket(handleMessage, isActive)

  useEffect(() => {
    setWsConnected(connected)
    sendRef.current = send
  }, [connected, send])

  useEffect(() => {
    if (!connected) pendingRef.current = false
  }, [connected])

  const handleFrame = useCallback((frame) => {
    if (!connected) return
    if (pendingRef.current) return
    pendingRef.current = true
    sendRef.current?.({ frame })
  }, [connected])

  const toggleActive = () => {
    setIsActive((v) => {
      if (v) setResult({ hand_detected: false, sign: null, confidence: 0, landmarks: { right: null, left: null } })
      return !v
    })
  }

  return (
    <div className={`home ${subtitleMode ? 'home-subtitle-mode' : ''}`}>
      <div className="home-left">
        <Camera
          onFrame={handleFrame}
          handData={result.landmarks}
          isActive={isActive}
          fps={CAMERA_FPS}
          subtitle={subtitleMode ? subtitlePhrase : null}
          subtitleVisible={subtitleMode && subtitleVisible}
        />
        <div className="home-controls">
          <button
            className={isActive ? 'btn-danger' : 'btn-primary'}
            onClick={toggleActive}
          >
            {isActive ? '⏹ Zaustavi' : '▶ Pokreni prepoznavanje'}
          </button>
          <button
            className={`btn-ghost ${subtitleMode ? 'subtitle-active' : ''}`}
            onClick={() => setSubtitleMode(v => !v)}
            title="Titl mod"
          >
            ⬛ Titlovi
          </button>
          <span className={`ws-badge ${wsConnected ? 'ws-ok' : 'ws-off'}`}>
            {wsConnected ? '● Spojeno' : '○ Odspojeno'}
          </span>
        </div>
      </div>

      {!subtitleMode && (
        <div className="home-right">
          <RecognitionDisplay
            sign={result.sign}
            confidence={result.confidence}
            handDetected={result.hand_detected}
            modelReady={modelReady}
          />
          <TextBuilder
            text={text}
            onClear={() => setText('')}
            onDelete={() => setText((t) => t.slice(0, -1))}
          />
        </div>
      )}

      {subtitleMode && (
        <div className="subtitle-controls card">
          <TextBuilder
            text={text}
            onClear={() => setText('')}
            onDelete={() => setText((t) => t.slice(0, -1))}
          />
        </div>
      )}
    </div>
  )
}
