import { useRef, useEffect } from 'react'
import { useCamera } from '../hooks/useCamera.js'
import './Camera.css'

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
]

function drawHand(ctx, landmarks, width, height, color) {
  if (!landmarks || landmarks.length === 0) return

  ctx.strokeStyle = color
  ctx.lineWidth = 2

  for (const [a, b] of HAND_CONNECTIONS) {
    const p1 = landmarks[a]
    const p2 = landmarks[b]
    if (!p1 || !p2) continue
    ctx.beginPath()
    // x mirrored because video is drawn mirrored
    ctx.moveTo((1 - p1[0]) * width, p1[1] * height)
    ctx.lineTo((1 - p2[0]) * width, p2[1] * height)
    ctx.stroke()
  }

  for (const lm of landmarks) {
    ctx.beginPath()
    ctx.arc((1 - lm[0]) * width, lm[1] * height, 4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
}

export default function Camera({ onFrame, handData, isActive, fps = 20, subtitle = null, subtitleVisible = false }) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const intervalRef = useRef(null)
  const { ready, error, captureFrame } = useCamera(videoRef)

  // Draw landmark overlay (video is rendered directly by <video> for smooth preview)
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (handData) {
      drawHand(ctx, handData.right, canvas.width, canvas.height, '#7c6ef5') // purple = desna
      drawHand(ctx, handData.left,  canvas.width, canvas.height, '#4ade80') // green  = lijeva
    }
  }, [handData, ready])

  // Frame capture loop
  useEffect(() => {
    if (!isActive || !ready) {
      clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      const frame = captureFrame()
      if (frame) onFrame(frame)
    }, 1000 / fps)

    return () => clearInterval(intervalRef.current)
  }, [isActive, ready, fps, onFrame, captureFrame])

  const rightDetected = handData?.right?.length > 0
  const leftDetected  = handData?.left?.length > 0

  return (
    <div className="camera-wrap">
      <video ref={videoRef} autoPlay muted playsInline className="camera-video" />
      <canvas ref={overlayRef} width={640} height={480} className="camera-overlay-canvas" />

      {/* Hand detection indicators */}
      {(rightDetected || leftDetected) && (
        <div className="camera-hands">
          <span className={`hand-badge ${rightDetected ? 'hand-active' : 'hand-inactive'}`}>D</span>
          <span className={`hand-badge ${leftDetected  ? 'hand-active hand-left' : 'hand-inactive'}`}>L</span>
        </div>
      )}

      {/* Subtitle overlay */}
      {subtitle !== null && (
        <div className={`subtitle-bar ${subtitleVisible ? 'subtitle-visible' : 'subtitle-hidden'}`}>
          <span className="subtitle-text">{subtitle}</span>
        </div>
      )}

      {!ready && !error && (
        <div className="camera-overlay">
          <span className="camera-status">Pokretanje kamere…</span>
        </div>
      )}
      {error && (
        <div className="camera-overlay camera-error">
          <span>⚠ {error}</span>
        </div>
      )}
    </div>
  )
}
