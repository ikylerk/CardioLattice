import React from 'react'

function ecgAt(phase) {
  const p = ((phase % 1) + 1) % 1
  let v = 0
  if (p < 0.08) v += 0.06 * Math.sin((p / 0.08) * Math.PI)
  if (p > 0.16 && p < 0.2) v -= 0.08 * Math.sin(((p - 0.16) / 0.04) * Math.PI)
  if (p >= 0.2 && p < 0.235) v += 0.9 * Math.sin(((p - 0.2) / 0.035) * Math.PI)
  if (p >= 0.225 && p < 0.255) v -= 0.26 * Math.sin(((p - 0.225) / 0.03) * Math.PI)
  if (p >= 0.34 && p < 0.46) v += 0.17 * Math.sin(((p - 0.34) / 0.12) * Math.PI)
  return v
}

export default function EcgStrip({ bpm = 72, playing = true, compact = false }) {
  const canvasRef = React.useRef(null)
  const pointerRef = React.useRef(0)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    let raf
    let last = performance.now()
    let phase = 0.22

    const draw = (now) => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(60, Math.round(rect.width * dpr))
      const h = Math.max(16, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (playing) phase += dt * (bpm / 60)
      const target = 0.24 + phase * 0.001
      pointerRef.current += (target - pointerRef.current) * 0.08

      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = Math.max(1, dpr * 0.75)
      ctx.strokeStyle = 'rgba(102, 179, 174, .12)'
      ctx.beginPath()
      for (let x = 0; x < w; x += dpr * 18) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let y = h * 0.25; y < h; y += h * 0.5) {
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()

      const points = Math.max(50, Math.floor(w / (dpr * 1.4)))
      const speed = 1.6
      const nowPhase = phase * speed
      const grad = ctx.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, 'rgba(110, 218, 196, .08)')
      grad.addColorStop(0.55, 'rgba(110, 218, 196, .58)')
      grad.addColorStop(0.9, 'rgba(148, 245, 214, .95)')
      grad.addColorStop(1, 'rgba(185, 255, 228, 1)')
      ctx.strokeStyle = grad
      ctx.lineWidth = dpr * (compact ? 1.2 : 1.5)
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let i = 0; i <= points; i += 1) {
        const t = i / points
        const samplePhase = nowPhase - (1 - t) * 1.9
        const v = ecgAt(samplePhase)
        const x = t * w
        const y = h * 0.52 - v * h * 0.34
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.save()
      ctx.shadowBlur = dpr * 7
      ctx.shadowColor = 'rgba(108, 226, 198, .45)'
      ctx.stroke()
      ctx.restore()

      const hx = w - dpr * 2
      const hy = h * 0.52 - ecgAt(nowPhase) * h * 0.34
      ctx.fillStyle = '#c5ffe7'
      ctx.beginPath()
      ctx.arc(hx, hy, dpr * 1.8, 0, Math.PI * 2)
      ctx.fill()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [bpm, playing, compact])

  return <canvas className={`ecg-strip ${compact ? 'compact' : ''}`} ref={canvasRef} aria-hidden="true" />
}
