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
  const [epochs, setEpochs] = useState(50)
  const [statusMsg, setStatusMsg] = useState('')
  const captureRef = useRef(false)
  const countRef = useRef(0)

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
            ? `Treniranje završeno! Točnost: ${Math.round(s.accuracy * 100)}%`
            : `Greška: ${s.error}`)
        }
      } catch {}
    }, 800)
    return () => clearInterval(t)
  }, [training.status])

  const handleMessage = useCallback(async (data) => {
    if (data.landmarks) setHandData(data.landmarks)

    if (!captureRef.current) return
    if (!data.hand_detected || !data.landmarks) return

    // Convert raw landmarks to normalized features (126-dim, supports 1 or 2 hands)
    const { normalize } = await import('../utils/normalize.js')
    const features = normalize(data.landmarks)
    if (!features) return

    try {
      await addTrainingSample(signName, features)
    } catch {
      captureRef.current = false
      setCapturing(false)
      setCaptureCount(0)
      countRef.current = 0
      setStatusMsg('Spremanje uzorka nije uspjelo. Provjerite backend i pokušajte ponovno.')
      return
    }
    countRef.current += 1
    setCaptureCount(countRef.current)

    if (countRef.current >= SAMPLES_PER_SESSION) {
      captureRef.current = false
      setCapturing(false)
      setCaptureCount(0)
      countRef.current = 0
      await refreshCounts()
      setStatusMsg(`Dodano ${SAMPLES_PER_SESSION} uzoraka za "${signName}"`)
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
  }

  const handleDeleteSamples = async (name) => {
    await deleteSamples(name)
    refreshCounts()
    setStatusMsg(`Obrisani uzorci za "${name}"`)
  }

  const handleTrain = async () => {
    try {
      setStatusMsg('')
      await startTraining(epochs)
      setTraining({ status: 'running', progress: 0, total: epochs, accuracy: null })
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
          <p className="tp-hint">Unesite naziv znaka, postavite ruku ispred kamere i kliknite Snimi.</p>
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
          <div className="tp-counts-meta">{uniqueSigns} znakova · {totalSamples} ukupno uzoraka</div>
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
          <p className="tp-hint">Potrebno: ≥ 2 znaka, ≥ 10 ukupno uzoraka.</p>
          <div className="tp-row">
            <label className="tp-label">Epohe:</label>
            <input
              type="number"
              className="tp-input tp-input-sm"
              value={epochs}
              min={10}
              max={200}
              onChange={(e) => setEpochs(Number(e.target.value))}
              disabled={training.status === 'running'}
            />
            <button
              className="btn-primary"
              onClick={handleTrain}
              disabled={training.status === 'running' || totalSamples < 10 || uniqueSigns < 2}
            >
              {training.status === 'running' ? 'Treniranje…' : '🧠 Treniraj'}
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
              Model spreman · Točnost: {Math.round((training.accuracy || 0) * 100)}%
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
