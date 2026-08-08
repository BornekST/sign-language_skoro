import { useEffect, useRef, useCallback, useState } from 'react'

export function useCamera(videoRef) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const streamRef = useRef(null)
  const captureCanvasRef = useRef(null)
  const captureCtxRef = useRef(null)
  const captureSizeRef = useRef({ width: 320, height: 240 })

  useEffect(() => {
    let active = true

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user', frameRate: { ideal: 30, max: 60 } },
        })
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            if (active) setReady(true)
          }
        }
      } catch (err) {
        if (active) setError(err.message || 'Camera access denied')
      }
    }

    startCamera()

    return () => {
      active = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const captureFrame = useCallback((quality = 0.55) => {
    if (!videoRef.current || !ready) return null

    if (!captureCanvasRef.current) {
      const offscreen = document.createElement('canvas')
      offscreen.width = captureSizeRef.current.width
      offscreen.height = captureSizeRef.current.height
      captureCanvasRef.current = offscreen
      captureCtxRef.current = offscreen.getContext('2d', { alpha: false, desynchronized: true })
    }

    const ctx = captureCtxRef.current
    const offscreen = captureCanvasRef.current
    if (!ctx || !offscreen) return null

    // Send NON-mirrored frame to backend so MediaPipe sees real left/right orientation.
    ctx.drawImage(videoRef.current, 0, 0, offscreen.width, offscreen.height)
    return offscreen.toDataURL('image/jpeg', quality).split(',')[1]
  }, [ready])

  return { ready, error, captureFrame }
}
