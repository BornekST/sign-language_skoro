import { useState, useEffect, useRef } from 'react'
import { synthesizeSpeech } from '../services/api.js'
import './TextBuilder.css'

export function useTextBuilder(action) {
  const [text, setText] = useState('')
  const historyRef = useRef([])

  const appendSign = (previous, value) => {
    const isWord = value.length > 1
    const spaceBefore = isWord && previous.length > 0 && !previous.endsWith(' ') ? ' ' : ''
    const spaceAfter = isWord ? ' ' : ''
    return previous + spaceBefore + value + spaceAfter
  }

  useEffect(() => {
    if (!action) return

    if (action.type === 'delete') {
      setText(current => historyRef.current.pop() ?? current)
    } else if (action.type === 'replace' && action.value) {
      setText(() => {
        const beforePrevious = historyRef.current.pop() ?? ''
        historyRef.current.push(beforePrevious)
        return appendSign(beforePrevious, action.value)
      })
    } else if (action.type === 'add' && action.value) {
      setText(current => {
        historyRef.current.push(current)
        return appendSign(current, action.value)
      })
    }
  }, [action])

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
