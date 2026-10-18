import React from 'react'
import { useI18n } from '../i18n.js'

function systoleAt(phase) {
  return Math.exp(-Math.pow(((phase % 1) - 0.28) / 0.09, 2))
}

function makeNoiseCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(512, 512)
  let seed = 918273
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967295
  }
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 80 + rand() * 175
    image.data[i] = value
    image.data[i + 1] = value
    image.data[i + 2] = value * 0.97
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

const noiseCanvas = typeof document !== 'undefined' ? makeNoiseCanvas() : null

function chamberPath(ctx, points) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]
    if (point.length === 6) ctx.bezierCurveTo(point[0], point[1], point[2], point[3], point[4], point[5])
    else if (point.length === 4) ctx.quadraticCurveTo(point[0], point[1], point[2], point[3])
    else ctx.lineTo(point[0], point[1])
  }
  ctx.closePath()
}

function drawColorJet(ctx, path, x1, y1, x2, y2, phase, kind = 'diastolic') {
  ctx.save()
  ctx.clip(path)
  ctx.globalCompositeOperation = 'screen'
  const colors = kind === 'diastolic'
    ? ['#bd4b32', '#e17c3a', '#f0b94c', '#a83a2b', '#d85a33']
    : ['#2e68b2', '#4e9ac5', '#82c4d2', '#345da0', '#397dbb']
  let seed = 2319 + Math.floor(phase * 10)
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967295
  }
  for (let i = 0; i < 110; i += 1) {
    const t = rand()
    const spread = kind === 'diastolic' ? (1 - t) * 0.55 : t * 0.34
    const cx = x1 + (x2 - x1) * t + (rand() - 0.5) * spread * 80
    const cy = y1 + (y2 - y1) * t + (rand() - 0.5) * 18
    const width = 4 + rand() * 15
    const height = 2 + rand() * 6
    ctx.globalAlpha = 0.28 + rand() * 0.34
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]
    ctx.fillRect(cx, cy, width, height)
  }
  ctx.restore()
}

export default function EchoCanvas({ view, colorDoppler, calipers, playing, bpm, gain, depth }) {
  const { t } = useI18n()
  const canvasRef = React.useRef(null)
  const propsRef = React.useRef({ view, colorDoppler, calipers, playing, bpm, gain, depth })
  propsRef.current = { view, colorDoppler, calipers, playing, bpm, gain, depth }

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !noiseCanvas) return undefined
    const ctx = canvas.getContext('2d')
    let raf
    let phase = 0.12
    let last = performance.now()
    let lastDraw = 0
    const noisePattern = ctx.createPattern(noiseCanvas, 'repeat')

    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      const props = propsRef.current
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const width = Math.max(200, Math.round(rect.width * dpr))
      const height = Math.max(120, Math.round(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const dt = Math.min(0.06, (now - last) / 1000)
      last = now
      if (props.playing) phase = (phase + dt * (props.bpm / 60)) % 1
      if (now - lastDraw < 32) return
      lastDraw = now

      const w = width / dpr
      const h = height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#020303'
      ctx.fillRect(0, 0, w, h)

      const mModeH = h * 0.18
      const imageH = h - mModeH - 6
      const apex = { x: w * 0.5, y: imageH * 0.1 }
      const radius = imageH * 0.87
      const halfAngle = 0.63
      const startAngle = Math.PI / 2 - halfAngle
      const endAngle = Math.PI / 2 + halfAngle
      const zoom = (16 / props.depth) * 1.2
      const systole = systoleAt(phase)
      const contraction = 1 - systole * 0.085

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(apex.x, apex.y)
      ctx.arc(apex.x, apex.y, radius, startAngle, endAngle)
      ctx.closePath()
      ctx.clip()

      const bg = ctx.createRadialGradient(apex.x, apex.y + imageH * 0.12, 10, apex.x, apex.y + imageH * 0.4, radius)
      bg.addColorStop(0, '#12120e')
      bg.addColorStop(0.4, '#090a07')
      bg.addColorStop(0.78, '#030403')
      bg.addColorStop(1, '#010101')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, imageH)

      const tissueCx = w * 0.51
      const tissue = ctx.createRadialGradient(tissueCx, imageH * 0.5, imageH * 0.03, tissueCx, imageH * 0.5, w * 0.35)
      tissue.addColorStop(0, 'rgba(158, 158, 140, .34)')
      tissue.addColorStop(0.55, 'rgba(105, 107, 94, .16)')
      tissue.addColorStop(1, 'rgba(30, 32, 28, 0)')
      ctx.fillStyle = tissue
      ctx.beginPath()
      ctx.ellipse(tissueCx, imageH * 0.5, w * 0.34, imageH * 0.38, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.translate(apex.x, apex.y + imageH * 0.05)
      ctx.scale(zoom, zoom)
      ctx.translate(-apex.x, -(apex.y + imageH * 0.05))

      const cx = w * 0.51
      const top = imageH * 0.17
      const base = imageH * 0.65
      const atriaBottom = imageH * 0.89
      const pulseShift = systole * 5
      const view = props.view

      const drawA4C = () => {
        const lvOuter = [
          [cx + 0.045 * w, top + 8],
          [cx - 0.035 * w, imageH * 0.34, cx - 0.075 * w, imageH * 0.5, cx - 0.045 * w, base],
          [cx + 0.15 * w, base],
          [cx + 0.17 * w, imageH * 0.47, cx + 0.13 * w, imageH * 0.3, cx + 0.045 * w, top + 8],
        ]
        const rvOuter = [
          [cx + 0.005 * w, top + 14],
          [cx - 0.11 * w, imageH * 0.32, cx - 0.18 * w, imageH * 0.49, cx - 0.155 * w, base - 2],
          [cx - 0.03 * w, base + 4],
          [cx - 0.03 * w, imageH * 0.43, cx + 0.0 * w, imageH * 0.28, cx + 0.005 * w, top + 14],
        ]
        const la = [
          [cx - 0.045 * w, base + 5],
          [cx - 0.055 * w, atriaBottom - 16, cx + 0.04 * w, atriaBottom + 10, cx + 0.09 * w, atriaBottom - 6],
          [cx + 0.155 * w, atriaBottom - 20, cx + 0.15 * w, base + 6, cx + 0.15 * w, base + 5],
        ]
        const ra = [
          [cx - 0.17 * w, base + 2],
          [cx - 0.185 * w, atriaBottom - 22, cx - 0.08 * w, atriaBottom + 6, cx - 0.035 * w, atriaBottom - 10],
          [cx - 0.025 * w, base + 4],
        ]

        ctx.save()
        ctx.translate(cx, base)
        ctx.scale(contraction, 0.985)
        ctx.translate(-cx, -base + pulseShift)

        // Surrounding tissue haze
        ctx.globalAlpha = 0.5
        ctx.fillStyle = 'rgba(112, 112, 100, .22)'
        chamberPath(ctx, lvOuter.map((p, i) => (i === 0 ? [p[0] - 8, p[1] - 6] : p)))
        ctx.fill()

        // Ventricular myocardium
        chamberPath(ctx, lvOuter)
        ctx.fillStyle = 'rgba(11, 12, 10, .96)'
        ctx.fill()
        ctx.lineWidth = 19
        ctx.strokeStyle = 'rgba(150, 153, 136, .82)'
        ctx.stroke()
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(208, 212, 193, .72)'
        ctx.stroke()

        chamberPath(ctx, rvOuter)
        ctx.fillStyle = 'rgba(9, 10, 9, .96)'
        ctx.fill()
        ctx.lineWidth = 13
        ctx.strokeStyle = 'rgba(130, 134, 120, .66)'
        ctx.stroke()
        ctx.lineWidth = 1.3
        ctx.strokeStyle = 'rgba(192, 197, 179, .4)'
        ctx.stroke()

        // Atria
        chamberPath(ctx, la)
        ctx.fillStyle = 'rgba(7, 8, 7, .97)'
        ctx.fill()
        ctx.lineWidth = 10
        ctx.strokeStyle = 'rgba(153, 157, 141, .68)'
        ctx.stroke()

        chamberPath(ctx, ra)
        ctx.fillStyle = 'rgba(7, 8, 7, .97)'
        ctx.fill()
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(116, 122, 111, .5)'
        ctx.stroke()

        // Septum
        const septum = ctx.createLinearGradient(cx - 10, top, cx + 14, base)
        septum.addColorStop(0, 'rgba(191, 194, 177, .68)')
        septum.addColorStop(0.6, 'rgba(137, 140, 128, .52)')
        septum.addColorStop(1, 'rgba(95, 99, 91, .38)')
        ctx.beginPath()
        ctx.moveTo(cx + 0.035 * w, top + 18)
        ctx.bezierCurveTo(cx - 0.02 * w, imageH * 0.36, cx - 0.015 * w, imageH * 0.5, cx - 0.025 * w, base - 1)
        ctx.lineWidth = 12
        ctx.strokeStyle = septum
        ctx.stroke()
        ctx.lineWidth = 1.6
        ctx.strokeStyle = 'rgba(227, 230, 209, .38)'
        ctx.stroke()

        // Valve leaflets
        const open = (1 - systole) * 0.6 + 0.2
        ctx.lineWidth = 2.2
        ctx.strokeStyle = 'rgba(232, 235, 214, .8)'
        ctx.beginPath()
        ctx.moveTo(cx - 0.035 * w, base + 2)
        ctx.quadraticCurveTo(cx + 0.02 * w, base + 8 + open * 15, cx + 0.055 * w, base + 4)
        ctx.moveTo(cx + 0.145 * w, base + 3)
        ctx.quadraticCurveTo(cx + 0.09 * w, base + 9 + open * 12, cx + 0.06 * w, base + 5)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(cx - 0.16 * w, base + 2)
        ctx.quadraticCurveTo(cx - 0.11 * w, base + 5 + open * 12, cx - 0.075 * w, base + 4)
        ctx.moveTo(cx - 0.03 * w, base + 3)
        ctx.quadraticCurveTo(cx - 0.065 * w, base + 6 + open * 10, cx - 0.09 * w, base + 4)
        ctx.stroke()

        // Color Doppler: diastolic inflow into the LV + systolic outflow / mild MR
        if (props.colorDoppler) {
          ctx.save()
          ctx.globalCompositeOperation = 'screen'

          const lvClip = new Path2D()
          lvClip.moveTo(lvOuter[0][0], lvOuter[0][1])
          lvClip.bezierCurveTo(lvOuter[1][0], lvOuter[1][1], lvOuter[1][2], lvOuter[1][3], lvOuter[1][4], lvOuter[1][5])
          lvClip.lineTo(lvOuter[2][0], lvOuter[2][1])
          lvClip.bezierCurveTo(lvOuter[3][0], lvOuter[3][1], lvOuter[3][2], lvOuter[3][3], lvOuter[3][4], lvOuter[3][5])
          lvClip.closePath()
          ctx.clip(lvClip)

          const inflow = 1 - systole
          const fanTop = top + (base - top) * 0.34
          const jetGradient = ctx.createLinearGradient(cx - 0.02 * w, base, cx + 0.04 * w, fanTop)
          jetGradient.addColorStop(0, `rgba(230, 94, 43, ${0.24 + inflow * 0.14})`)
          jetGradient.addColorStop(0.45, `rgba(242, 174, 65, ${0.18 + inflow * 0.13})`)
          jetGradient.addColorStop(1, 'rgba(198, 74, 42, .04)')
          ctx.beginPath()
          ctx.moveTo(cx - 0.06 * w, base - 3)
          ctx.quadraticCurveTo(cx - 0.045 * w, imageH * 0.52, cx + 0.005 * w, fanTop)
          ctx.lineTo(cx + 0.075 * w, fanTop + 20)
          ctx.quadraticCurveTo(cx + 0.105 * w, imageH * 0.52, cx + 0.12 * w, base - 3)
          ctx.closePath()
          ctx.fillStyle = jetGradient
          ctx.fill()

          // Fine mosaic aliasing blocks
          let seed = 517 + Math.floor(phase * 20)
          const rand = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
            return seed / 4294967295
          }
          for (let i = 0; i < 460; i += 1) {
            const t = rand()
            const yy = base - 6 - t * (base - fanTop)
            const center = cx + 0.02 * w - t * 0.012 * w
            const spread = (0.045 + t * 0.07) * w
            const xx = center + (rand() - 0.5) * spread * 1.7
            ctx.globalAlpha = 0.18 + rand() * 0.28
            ctx.fillStyle = ['#d25c37', '#eea544', '#f5c55a', '#a83c2c', '#3e7bc0'][Math.floor(rand() * 5)]
            ctx.fillRect(xx, yy, 2 + rand() * 4.5, 1.5 + rand() * 2.5)
          }
          ctx.restore()

          // Mild mitral regurgitation jet into LA
          ctx.save()
          ctx.globalCompositeOperation = 'screen'
          ctx.globalAlpha = 0.22 + systole * 0.32
          const mrGradient = ctx.createLinearGradient(cx + 0.04 * w, base, cx + 0.04 * w, base + 60)
          mrGradient.addColorStop(0, '#4e9ed7')
          mrGradient.addColorStop(1, 'rgba(47, 83, 164, 0)')
          ctx.fillStyle = mrGradient
          ctx.beginPath()
          ctx.ellipse(cx + 0.05 * w, base + 26, 14 + systole * 6, 25 + systole * 7, 0.1, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()

          // Keep the endocardial border and leaflets readable over colour flow.
          chamberPath(ctx, lvOuter)
          ctx.strokeStyle = 'rgba(214, 219, 199, .38)'
          ctx.lineWidth = 1.4
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(cx - 0.035 * w, base + 2)
          ctx.quadraticCurveTo(cx + 0.02 * w, base + 8 + (1 - systole) * 15, cx + 0.055 * w, base + 4)
          ctx.moveTo(cx + 0.145 * w, base + 3)
          ctx.quadraticCurveTo(cx + 0.09 * w, base + 9 + (1 - systole) * 12, cx + 0.06 * w, base + 5)
          ctx.strokeStyle = 'rgba(236, 239, 218, .72)'
          ctx.lineWidth = 1.8
          ctx.stroke()
        }

        if (props.calipers) {
          const lvY = imageH * 0.44
          ctx.save()
          ctx.setLineDash([5, 6])
          ctx.strokeStyle = 'rgba(174, 219, 206, .78)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(cx - 0.06 * w, lvY)
          ctx.lineTo(cx + 0.16 * w, lvY)
          ctx.stroke()
          ctx.setLineDash([])
          for (const x of [cx - 0.06 * w, cx + 0.16 * w]) {
            ctx.beginPath()
            ctx.moveTo(x, lvY - 5)
            ctx.lineTo(x, lvY + 5)
            ctx.stroke()
          }
          ctx.fillStyle = 'rgba(164, 226, 211, .9)'
          ctx.font = '500 9px "SFMono-Regular", Menlo, monospace'
          ctx.fillText('LVEDD 48 mm', cx - 0.025 * w, lvY - 8)
          ctx.fillText('LVEF 54%', cx + 0.01 * w, base + 25)
          ctx.restore()
        }
        ctx.restore()
      }

      const drawA2C = () => {
        ctx.save()
        ctx.translate(cx, base)
        ctx.scale(contraction, 0.98)
        ctx.translate(-cx, -base + pulseShift)
        ctx.beginPath()
        ctx.moveTo(cx + 0.03 * w, top + 4)
        ctx.bezierCurveTo(cx - 0.13 * w, imageH * 0.34, cx - 0.15 * w, imageH * 0.53, cx - 0.11 * w, base)
        ctx.bezierCurveTo(cx + 0.02 * w, base + 12, cx + 0.18 * w, base - 2, cx + 0.17 * w, base - 2)
        ctx.bezierCurveTo(cx + 0.18 * w, imageH * 0.45, cx + 0.13 * w, imageH * 0.28, cx + 0.03 * w, top + 4)
        ctx.closePath()
        ctx.fillStyle = 'rgba(45, 46, 41, .85)'
        ctx.fill()
        ctx.lineWidth = 7
        ctx.strokeStyle = 'rgba(181, 184, 168, .7)'
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(cx - 0.11 * w, base + 4)
        ctx.bezierCurveTo(cx - 0.13 * w, atriaBottom - 24, cx + 0.05 * w, atriaBottom + 12, cx + 0.1 * w, atriaBottom - 8)
        ctx.bezierCurveTo(cx + 0.17 * w, atriaBottom - 26, cx + 0.15 * w, base + 8, cx + 0.15 * w, base + 4)
        ctx.closePath()
        ctx.fillStyle = 'rgba(28, 29, 26, .92)'
        ctx.fill()
        ctx.lineWidth = 4.2
        ctx.strokeStyle = 'rgba(156, 160, 148, .55)'
        ctx.stroke()
        ctx.restore()
      }

      const drawPSAX = () => {
        const centerX = w * 0.5
        const centerY = imageH * 0.48
        const r = Math.min(w, imageH) * 0.22 * contraction
        ctx.save()
        // RV crescent
        ctx.beginPath()
        ctx.ellipse(centerX + 4, centerY - 4, r * 1.42, r * 1.28, -0.2, Math.PI * 0.8, Math.PI * 2.1)
        ctx.ellipse(centerX - 4, centerY - 4, r * 0.98, r * 0.92, -0.2, 0, Math.PI * 2, true)
        ctx.fillStyle = 'rgba(49, 50, 45, .8)'
        ctx.fill()
        ctx.lineWidth = 5
        ctx.strokeStyle = 'rgba(167, 171, 157, .6)'
        ctx.stroke()

        const grad = ctx.createRadialGradient(centerX - 4, centerY, r * 0.3, centerX, centerY, r)
        grad.addColorStop(0, '#0a0b09')
        grad.addColorStop(0.65, '#11120e')
        grad.addColorStop(1, '#3e3e36')
        ctx.beginPath()
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
        ctx.lineWidth = 14
        ctx.strokeStyle = 'rgba(134, 138, 122, .68)'
        ctx.stroke()
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(213, 216, 197, .32)'
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(centerX, centerY, r * 0.58, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(91, 94, 84, .35)'
        ctx.lineWidth = 1.2
        ctx.stroke()

        if (props.colorDoppler) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(centerX, centerY, r * 0.92, 0, Math.PI * 2)
          ctx.clip()
          ctx.globalCompositeOperation = 'screen'
          for (let i = 0; i < 70; i += 1) {
            const angle = (i / 70) * Math.PI * 2
            const rr = r * (0.3 + (i % 7) * 0.08)
            ctx.fillStyle = i % 3 === 0 ? 'rgba(67, 124, 209, .35)' : i % 3 === 1 ? 'rgba(191, 72, 46, .28)' : 'rgba(220, 164, 62, .25)'
            ctx.fillRect(centerX + Math.cos(angle) * rr, centerY + Math.sin(angle) * rr, 8, 4)
          }
          ctx.restore()
        }
        ctx.restore()
      }

      const drawPLAX = () => {
        ctx.save()
        ctx.translate(cx, imageH * 0.43)
        ctx.rotate(-0.08)
        // RV
        ctx.beginPath()
        ctx.ellipse(0, -imageH * 0.12, w * 0.19, imageH * 0.09, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(52, 53, 48, .78)'
        ctx.fill()
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(156, 160, 148, .55)'
        ctx.stroke()
        // LV
        ctx.save()
        ctx.scale(contraction, 1)
        ctx.beginPath()
        ctx.ellipse(-w * 0.02, imageH * 0.08, w * 0.22, imageH * 0.115, 0.02, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(35, 36, 32, .9)'
        ctx.fill()
        ctx.lineWidth = 9
        ctx.strokeStyle = 'rgba(168, 171, 156, .66)'
        ctx.stroke()
        ctx.restore()
        // LA
        ctx.beginPath()
        ctx.ellipse(-w * 0.25, imageH * 0.08, w * 0.095, imageH * 0.085, -0.2, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(28, 29, 26, .9)'
        ctx.fill()
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(148, 153, 141, .5)'
        ctx.stroke()
        // Aorta
        ctx.beginPath()
        ctx.ellipse(w * 0.215, imageH * 0.04, w * 0.065, imageH * 0.078, -0.2, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(25, 26, 23, .92)'
        ctx.fill()
        ctx.stroke()
        // mitral leaflets
        ctx.beginPath()
        ctx.moveTo(-w * 0.16, imageH * 0.08)
        ctx.quadraticCurveTo(-w * 0.08, imageH * 0.08 + systole * 16, -w * 0.05, imageH * 0.06)
        ctx.strokeStyle = 'rgba(223, 226, 205, .75)'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }

      if (view === 'psax') drawPSAX()
      else if (view === 'plax') drawPLAX()
      else if (view === 'a2c') drawA2C()
      else drawA4C()

      ctx.restore()

      // Speckle and vignette inside the sector
      if (noisePattern) {
        ctx.save()
        ctx.globalAlpha = 0.145 + (50 - Math.abs(props.gain - 50)) * 0.0012
        ctx.fillStyle = noisePattern
        ctx.translate(-((now * 0.018) % 128), -((now * 0.012) % 128))
        ctx.fillRect(0, 0, w + 220, imageH + 220)
        ctx.restore()
      }
      const vignette = ctx.createRadialGradient(apex.x, apex.y, imageH * 0.18, apex.x, apex.y + imageH * 0.3, radius)
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(0.8, 'rgba(0,0,0,.18)')
      vignette.addColorStop(1, 'rgba(0,0,0,.64)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, w, imageH)

      // Gain overlay
      if (props.gain < 50) {
        ctx.fillStyle = `rgba(0, 0, 0, ${((50 - props.gain) / 50) * 0.2})`
        ctx.fillRect(0, 0, w, imageH)
      } else if (props.gain > 50) {
        ctx.fillStyle = `rgba(255, 255, 250, ${((props.gain - 50) / 50) * 0.08})`
        ctx.fillRect(0, 0, w, imageH)
      }

      // Scan line texture
      ctx.globalAlpha = 0.05
      ctx.strokeStyle = '#cfd4c4'
      ctx.lineWidth = 0.5
      for (let i = 0; i < 22; i += 1) {
        const angle = startAngle + ((i + 0.5) / 22) * (endAngle - startAngle)
        ctx.beginPath()
        ctx.moveTo(apex.x, apex.y)
        ctx.lineTo(apex.x + Math.cos(angle) * radius, apex.y + Math.sin(angle) * radius)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.restore()

      // Sector outline and depth ticks
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(apex.x, apex.y)
      ctx.arc(apex.x, apex.y, radius, startAngle, endAngle)
      ctx.closePath()
      ctx.strokeStyle = 'rgba(157, 176, 164, .2)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.font = '500 7.5px "SFMono-Regular", Menlo, monospace'
      ctx.fillStyle = 'rgba(180, 200, 184, .45)'
      ctx.strokeStyle = 'rgba(180, 200, 184, .28)'
      for (let tick = 1; tick <= 4; tick += 1) {
        const angle = endAngle - 0.02
        const distance = (radius * tick) / 4
        const x = apex.x + Math.cos(angle) * distance
        const y = apex.y + Math.sin(angle) * distance
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + 7, y)
        ctx.stroke()
        ctx.fillText(`${Math.round((props.depth * tick) / 4)}`, x + 11, y + 2)
      }
      ctx.restore()

      // M-mode strip
      const stripTop = imageH + 4
      const stripGradient = ctx.createLinearGradient(0, stripTop, 0, stripTop + mModeH)
      stripGradient.addColorStop(0, '#10110e')
      stripGradient.addColorStop(0.5, '#070806')
      stripGradient.addColorStop(1, '#040504')
      ctx.fillStyle = stripGradient
      ctx.fillRect(0, stripTop, w, mModeH)
      ctx.strokeStyle = 'rgba(127, 150, 137, .3)'
      ctx.beginPath()
      ctx.moveTo(0, stripTop)
      ctx.lineTo(w, stripTop)
      ctx.stroke()
      const stripHeight = mModeH - 13
      const baseline = stripTop + 9
      const columns = Math.floor(w / 2)
      for (let i = 0; i < columns; i += 1) {
        const x = i * 2
        const t = phase - (1 - i / columns) * 2.1
        const s = systoleAt(t)
        const septal = baseline + stripHeight * 0.34 - s * stripHeight * 0.13
        const posterior = baseline + stripHeight * 0.7 + s * stripHeight * 0.14
        const cavityTop = septal + 6
        const cavityBottom = posterior - 6
        ctx.fillStyle = 'rgba(91, 94, 83, .22)'
        ctx.fillRect(x, stripTop + 12, 1.8, mModeH - 15)
        ctx.fillStyle = 'rgba(3, 4, 3, .86)'
        ctx.fillRect(x, cavityTop, 1.8, Math.max(1, cavityBottom - cavityTop))
        ctx.fillStyle = `rgba(203, 209, 189, ${0.55 + s * 0.32})`
        ctx.fillRect(x, septal - 1.8, 1.8, 3.6)
        ctx.fillStyle = `rgba(164, 174, 155, ${0.42 + s * 0.28})`
        ctx.fillRect(x, posterior - 1.6, 1.8, 3.2)
        if (i % 22 === 0) {
          ctx.fillStyle = 'rgba(70, 94, 85, .22)'
          ctx.fillRect(x, stripTop + 3, 0.7, mModeH - 5)
        }
      }
      ctx.fillStyle = 'rgba(30, 32, 28, .35)'
      for (let i = 0; i < 220; i += 1) {
        const x = (i * 173) % w
        const y = stripTop + 8 + ((i * 47) % Math.max(1, mModeH - 12))
        ctx.fillRect(x, y, 1.5, 1)
      }
      ctx.strokeStyle = 'rgba(0, 230, 190, .46)'
      ctx.beginPath()
      ctx.moveTo(w - 2, stripTop + 3)
      ctx.lineTo(w - 2, stripTop + mModeH - 3)
      ctx.stroke()
      ctx.font = '500 6.5px "SFMono-Regular", Menlo, monospace'
      ctx.fillStyle = 'rgba(173, 197, 181, .64)'
      ctx.fillText('M-MODE · LV', 5, stripTop + 10)
      ctx.fillStyle = 'rgba(173, 197, 181, .36)'
      ctx.fillText('25 mm/s', w - 42, stripTop + 10)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} className="echo-canvas" aria-label={t('echo.canvasAria')} />
}
