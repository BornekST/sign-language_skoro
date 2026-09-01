import { useState, useEffect, useRef } from 'react'
import { synthesizeSpeech } from '../services/api.js'
import './TextBuilder.css'

const HOLD_FRAMES     = 8   // uzastopnih frameova za prihvaćanje znaka (~0.6s)
const COOLDOWN_FRAMES = 30  // frameova pauze prije ponovnog prihvaćanja istog znaka
const MIN_CONFIDENCE  = 0.78
const DELETE_ACTION   = 'BRISANJE'

export function useTextBuilder(sign, confidence) {
  const [text, setText] = useState('')
  // count > 0 → broji prema HOLD_FRAMES
  // count < 0 → cooldown (negativan odbrojava prema 0)
  const holdRef = useRef({ sign: null, count: 0 })
  const historyRef = useRef([])

  useEffect(() => {
    if (!sign || confidence < MIN_CONFIDENCE) {
      holdRef.current = { sign: null, count: 0 }
      return
    }

    if (sign !== holdRef.current.sign) {
      // Novi znak → resetiraj brojač
      holdRef.current = { sign, count: 1 }
      return
    }

    const { count } = holdRef.current

    if (count < 0) {
      // Cooldown faza: inkrementira prema 0
      holdRef.current.count += 1
      return
    }

    holdRef.current.count += 1

    if (holdRef.current.count === HOLD_FRAMES) {
      if (sign === DELETE_ACTION) {
        setText(prev => historyRef.current.pop() ?? prev)
      } else {
        const isWord = sign.length > 1
        setText(prev => {
          historyRef.current.push(prev)
          const spaceBefore = isWord && prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
          const spaceAfter  = isWord ? ' ' : ''
          return prev + spaceBefore + sign + spaceAfter
        })
      }
      holdRef.current.count = -COOLDOWN_FRAMES
    }
  }, [sign, confidence])

  const clearText = () => {
    historyRef.current = []
    setText('')
  }

  const deleteCharacter = () => {
    historyRef.current = []
    setText(value => value.slice(0, -1))
  }

  return { text, clearText, deleteCharacter }
}

export default function TextBuilder({ text, onClear, onDelete }) {
  const [voice, setVoice] = useState('female')
  const [speaking, setSpeaking] = useState(false)
  const audioRef = useRef(null)

  const handleSpeak = async () => {
    if (!text || speaking) return

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause()
      URL.revokeObjectURL(audioRef.current.src)
    }

    setSpeaking(true)
    try {
      const blob = await synthesizeSpeech(text, voice)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setSpeaking(false)
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => setSpeaking(false)
      await audio.play()
    } catch {
      // Fallback to Web Speech API if backend unavailable
      setSpeaking(false)
      if (window.speechSynthesis) {
        const utt = new SpeechSynthesisUtterance(text)
        utt.lang = 'hr-HR'
        utt.pitch = voice === 'female' ? 1.3 : 0.7
        utt.rate = voice === 'female' ? 1.0 : 0.9
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utt)
      }
    }
  }

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setSpeaking(false)
    }
    window.speechSynthesis?.cancel()
  }

  return (
    <div className="text-builder card">
      <div className="tb-header">
        <span className="tb-label">Prepoznati tekst</span>
        <div className="tb-actions">
          <button className="btn-ghost" onClick={onDelete} title="Obriši zadnji znak">⌫</button>
          <button className="btn-ghost" onClick={onClear} title="Obriši sve">✕</button>
        </div>
      </div>

      <div className="tb-text">
        {text || <span className="tb-placeholder">Znakovi će se prikazati ovdje…</span>}
      </div>

      <div className="tb-speak-row">
        <div className="tb-voice-toggle">
          <button
            className={`voice-btn ${voice === 'female' ? 'active' : ''}`}
            onClick={() => setVoice('female')}
            title="Ženski glas"
          >
            ♀ Ženski
          </button>
          <button
            className={`voice-btn ${voice === 'male' ? 'active' : ''}`}
            onClick={() => setVoice('male')}
            title="Muški glas"
          >
            ♂ Muški
          </button>
        </div>

        {!speaking
          ? <button className="btn-primary" onClick={handleSpeak} disabled={!text}>🔊 Govori</button>
          : <button className="btn-danger" onClick={handleStop}>⏹ Zaustavi</button>
        }
      </div>
    </div>
  )
}
