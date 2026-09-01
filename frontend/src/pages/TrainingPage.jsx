import { useState, useEffect, useCallback, useRef } from 'react'
import Camera from '../components/Camera.jsx'
import { useWebSocket } from '../hooks/useWebSocket.js'
import { addTrainingSample, getSampleCounts, deleteSamples, startTraining, getTrainingStatus } from '../services/api.js'
import './TrainingPage.css'

const CAPTURE_FPS = 10
const SAMPLES_PER_SESSION = 30

export default function TrainingPage() {
  const [signName, setSignName] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [captureCount, setCaptureCount] = useState(0)
  const [sampleCounts, setSampleCounts] = useState({})
  const [handData, setHandData] = useState({ right: null, left: null })
  const [training, setTraining] = useState({ status: 'idle', progress: 0, total: 0, accuracy: null })
  const [statusMsg, setStatusMsg] = useState('')
  const captureRef = useRef(false)
  const countRef = useRef(0)
  const sequenceRef = useRef([])

  const refreshCounts = async () => {
    try {
      const c = await getSampleCounts()
      setSampleCounts(c)
    } catch {}
  }

  useEffect(() => {
    refreshCounts()
  }, [])

  // Poll training status when running
  useEffect(() => {
    if (training.status !== 'running') return
    const t = setInterval(async () => {
      try {
        const s = await getTrainingStatus()
        setTraining(s)
        if (s.status === 'done' || s.status === 'error') {
          clearInterval(t)
          refreshCounts()
          setStatusMsg(s.status === 'done'
            ? 'DTW baza uspješno je izgrađena.'
            : `Greška: ${s.error}`)
        }
      } catch {}
    }, 800)
    return () => clearInterval(t)
  }, [training.status])

  const handleMessage = useCallback(async (data) => {
    if (data.error) {
      captureRef.current = false
      setCapturing(false)
      setStatusMsg(`Greška prepoznavanja: ${data.error}`)
      return
    }
    if (data.landmarks) setHandData(data.landmarks)

    if (!captureRef.current) return
    if (!data.hand_detected || !data.landmarks) {
      setStatusMsg('Snimanje je pokrenuto — postavite barem jednu cijelu ruku u kadar.')
      return
    }

    // Convert raw landmarks to normalized features (126-dim, supports 1 or 2 hands)
    const { normalize } = await import('../utils/normalize.js')
    const features = normalize(data.landmarks)
    if (!features) return

    sequenceRef.current.push(features)
    countRef.current += 1
    setCaptureCount(countRef.current)
    setStatusMsg(`Snimanje pokreta: ${countRef.current} / ${SAMPLES_PER_SESSION} kadrova`)

    if (countRef.current >= SAMPLES_PER_SESSION) {
      captureRef.current = false
      setCapturing(false)
      const completedSequence = sequenceRef.current
      sequenceRef.current = []
      try {
        await addTrainingSample(signName, completedSequence)
        await refreshCounts()
        setStatusMsg(`Spremljena cijela izvedba znaka "${signName}" (${completedSequence.length} kadrova)`)
      } catch {
        setStatusMsg('Spremanje sekvence nije uspjelo. Provjerite backend i pokušajte ponovno.')
      } finally {
        setCaptureCount(0)
        countRef.current = 0
      }
    }
  }, [signName])

  const { send, connected } = useWebSocket(handleMessage, true)

  const handleFrame = useCallback((frame) => {
    send({ frame })
  }, [send])

  const startCapture = () => {
    if (!signName.trim()) {
      setStatusMsg('Unesite naziv znaka.')
      return
    }
    if (!connected) {
      setStatusMsg('Kamera/WebSocket nije spojen. Pričekajte par sekundi i pokušajte ponovno.')
      return
    }
    countRef.current = 0
    sequenceRef.current = []
    setCaptureCount(0)
    captureRef.current = true
    setCapturing(true)
    setStatusMsg(`Snimanje u tijeku za "${signName}"...`)
  }

  const stopCapture = () => {
    captureRef.current = false
    setCapturing(false)
    setCaptureCount(0)
    countRef.current = 0
    sequenceRef.current = []
  }

  const handleDeleteSamples = async (name) => {
    try {
      await deleteSamples(name)
      await refreshCounts()
      setStatusMsg(`Obrisan znak "${name}" i sve njegove izvedbe.`)
    } catch (error) {
      setStatusMsg(`Brisanje znaka "${name}" nije uspjelo: ${error.message}`)
    }
  }

  const handleTrain = async () => {
    try {
      setStatusMsg('')
      await startTraining()
      setTraining({ status: 'running', progress: 0, total: 1, accuracy: null })
    } catch (e) {
      setStatusMsg(`Greška: ${e.message}`)
    }
  }

  const totalSamples = Object.values(sampleCounts).reduce((a, b) => a + b, 0)
  const uniqueSigns = Object.keys(sampleCounts).length

  return (
    <div className="training-page">
      <div className="training-left">
        <Camera
          onFrame={handleFrame}
          handData={handData}
          isActive={true}
          fps={CAPTURE_FPS}
        />
        {capturing && (
          <div className="capture-progress">
            <div className="capture-bar" style={{ width: `${(captureCount / SAMPLES_PER_SESSION) * 100}%` }} />
            <span>{captureCount} / {SAMPLES_PER_SESSION} uzoraka</span>
          </div>
        )}
      </div>

      <div className="training-right">
        {/* Capture section */}
        <div className="card">
          <h3>Dodaj uzorke</h3>
          <p className="tp-hint">Unesite riječ, kliknite Snimi i izvedite cijeli znak od početka do kraja. Ponovite više puta za bolju preciznost.</p>
          <div className="tp-row">
            <input
              className="tp-input"
              placeholder="Npr. A, Bok, Hvala"
              value={signName}
              onChange={(e) => setSignName(e.target.value.toUpperCase())}
              disabled={capturing}
            />
            {!capturing
              ? <button className="btn-primary" onClick={startCapture}>⏺ Snimi</button>
              : <button className="btn-danger" onClick={stopCapture}>⏹ Zaustavi</button>
            }
          </div>
          {statusMsg && <div className="tp-status">{statusMsg}</div>}
          <div className="tp-badge">
            <span className={connected ? 'ws-ok' : 'ws-off'}>{connected ? '● Kamera spojena' : '○ Odspojeno'}</span>
          </div>
        </div>

        {/* Sample counts */}
        <div className="card">
          <h3>Prikupljeni uzorci</h3>
          <div className="tp-counts-meta">{uniqueSigns} znakova · {totalSamples} snimljenih izvedbi</div>
          {Object.keys(sampleCounts).length === 0 && (
            <p className="tp-hint">Nema prikupljenih uzoraka.</p>
          )}
          <div className="tp-counts">
            {Object.entries(sampleCounts).sort().map(([name, count]) => (
              <div key={name} className="tp-count-row">
                <span className="tp-sign-name">{name}</span>
                <span className="tp-sign-count">{count}</span>
                <button className="btn-ghost tp-del" onClick={() => handleDeleteSamples(name)} title="Obriši uzorke">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Training section */}
        <div className="card">
          <h3>Treniraj model</h3>
          <p className="tp-hint">Potrebna su najmanje 2 znaka. Preporuka: 10–20 izvedbi svakog znaka.</p>
          <div className="tp-row">
            <button
              className="btn-primary"
              onClick={handleTrain}
              disabled={training.status === 'running' || uniqueSigns < 2}
            >
              {training.status === 'running' ? 'Izrada…' : '🧠 Izgradi DTW bazu'}
            </button>
          </div>

          {training.status === 'running' && (
            <div className="tp-train-progress">
              <div
                className="tp-train-bar"
                style={{ width: `${training.total > 0 ? (training.progress / training.total) * 100 : 0}%` }}
              />
              <span>Epoha {training.progress} / {training.total}</span>
            </div>
          )}

          {training.status === 'done' && (
            <div className="tp-train-done">
              DTW model je spreman za prepoznavanje riječi.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
