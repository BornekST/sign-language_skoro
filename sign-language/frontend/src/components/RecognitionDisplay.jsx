import './RecognitionDisplay.css'

export default function RecognitionDisplay({ sign, confidence, handDetected, modelReady }) {
  const pct = Math.round(confidence * 100)
  const barColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)'

  return (
    <div className="rec-display card">
      <div className="rec-label">Prepoznati znak</div>

      {!modelReady && (
        <div className="rec-notice">Model nije treniran. Idite na stranicu Treniranje.</div>
      )}

      {modelReady && !handDetected && (
        <div className="rec-notice">Nema detektirane ruke…</div>
      )}

      {modelReady && handDetected && (
        <>
          <div className="rec-sign">{sign || '?'}</div>
          <div className="rec-bar-wrap">
            <div
              className="rec-bar"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
          <div className="rec-confidence" style={{ color: barColor }}>
            {pct}% sigurnost
          </div>
        </>
      )}
    </div>
  )
}
