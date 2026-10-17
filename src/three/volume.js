export const VOLUME_DIMS = [128, 128, 168]
export const VOLUME_BOUNDS = {
  min: [-1.5, -1.2, -1.9],
  max: [1.5, 1.2, 1.9],
}
export const HU_MIN = -1024
export const HU_MAX = 1600

let cachedVolume = null

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hashNoise(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function segmentDistanceSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const apx = px - ax
  const apy = py - ay
  const apz = pz - az
  const denom = abx * abx + aby * aby + abz * abz
  const t = denom > 0 ? clamp((apx * abx + apy * aby + apz * abz) / denom, 0, 1) : 0
  const dx = px - (ax + abx * t)
  const dy = py - (ay + aby * t)
  const dz = pz - (az + abz * t)
  return dx * dx + dy * dy + dz * dz
}

function buildVolume() {
  const [nx, ny, nz] = VOLUME_DIMS
  const { min, max } = VOLUME_BOUNDS
  const data = new Uint8Array(nx * ny * nz)
  const xs = new Float32Array(nx)
  const ys = new Float32Array(ny)
  const zs = new Float32Array(nz)
  for (let x = 0; x < nx; x += 1) xs[x] = min[0] + ((x + 0.5) / nx) * (max[0] - min[0])
  for (let y = 0; y < ny; y += 1) ys[y] = min[1] + ((y + 0.5) / ny) * (max[1] - min[1])
  for (let z = 0; z < nz; z += 1) zs[z] = min[2] + ((z + 0.5) / nz) * (max[2] - min[2])

  const ribLevels = [-1.28, -1.0, -0.72, -0.44, -0.16, 0.12, 0.4, 0.68, 0.96, 1.24]
  const vessels = [
    // aorta: ascending, arch, descending
    [0.0, -0.08, 0.28, 0.0, -0.18, 1.02, 0.132],
    [0.0, -0.18, 1.02, -0.16, -0.27, 1.4, 0.13],
    [-0.16, -0.27, 1.4, 0.1, -0.4, 1.52, 0.115],
    [0.1, -0.4, 1.52, 0.2, -0.48, 1.25, 0.1],
    [0.2, -0.48, 1.25, 0.18, -0.5, -0.72, 0.098],
    // pulmonary trunk and branches
    [-0.18, 0.24, 0.52, -0.22, 0.05, 1.05, 0.115],
    [-0.22, 0.05, 1.05, -0.55, 0.0, 1.22, 0.078],
    [-0.22, 0.05, 1.05, 0.16, -0.02, 1.2, 0.075],
    // vena cavae
    [0.42, -0.42, 1.25, 0.38, -0.36, 0.52, 0.062],
    [0.32, -0.38, -0.7, 0.3, -0.32, 0.15, 0.07],
    // pulmonary veins
    [0.7, -0.2, 0.58, 0.35, -0.28, 0.57, 0.04],
    [0.68, -0.36, 0.34, 0.34, -0.34, 0.44, 0.035],
    [-0.7, -0.2, 0.58, -0.4, -0.14, 0.58, 0.04],
    [-0.68, -0.36, 0.34, -0.4, -0.2, 0.5, 0.035],
  ]
  const calcifications = [
    [0.08, 0.47, 0.4, 0.045, 520],
    [0.13, 0.5, 0.06, 0.05, 780],
    [0.19, 0.49, -0.42, 0.052, 940],
    [0.22, 0.42, -0.75, 0.038, 680],
    [-0.18, 0.46, 0.3, 0.04, 560],
    [-0.46, 0.36, -0.12, 0.045, 760],
    [-0.58, 0.24, -0.46, 0.04, 620],
  ]

  const heartChambers = [
    [0.18, -0.01, -0.33, 0.43, 0.43, 0.76],
    [-0.25, 0.2, -0.29, 0.39, 0.32, 0.62],
    [0.33, -0.18, 0.53, 0.28, 0.25, 0.32],
    [-0.36, 0.08, 0.5, 0.29, 0.24, 0.32],
  ]

  let index = 0
  for (let z = 0; z < nz; z += 1) {
    const wz = zs[z]
    for (let y = 0; y < ny; y += 1) {
      const wy = ys[y]
      for (let x = 0; x < nx; x += 1) {
        const wx = xs[x]
        let hu = -1024
        const bodyX = wx / 1.2
        const bodyY = (wy + 0.03) / 0.82
        const bodyR2 = bodyX * bodyX + bodyY * bodyY
        if (bodyR2 < 1 && wz > -1.84 && wz < 1.74) {
          hu = 42
          if (bodyR2 > 0.985) hu = 90
          else if (bodyR2 > 0.9) hu = -82
          else if (bodyR2 > 0.86) hu = -38

          // Lungs
          const lungL =
            ((wx - 0.52) / 0.39) ** 2 + ((wy - 0.02) / 0.48) ** 2 + ((wz - 0.06) / 1.2) ** 2
          const lungR =
            ((wx + 0.52) / 0.39) ** 2 + ((wy - 0.02) / 0.48) ** 2 + ((wz - 0.06) / 1.2) ** 2
          if (lungL < 1 || lungR < 1) hu = -845

          // Mediastinum soft tissue
          if (Math.abs(wx) < 0.58 && wy > -0.16 && wy < 0.56 && wz > -1.15 && wz < 1.12) {
            hu = Math.max(hu, 32)
          }

          // Sternum
          if (Math.abs(wx) < 0.048 && wy > 0.66 && wy < 0.76 && wz > -0.52 && wz < 1.08) {
            hu = 760
          }

          // Spine and vertebral bodies
          const spineX = wx
          const spineY = wy + 0.72
          const spineR2 = spineX * spineX + spineY * spineY
          if (spineR2 < 0.0072 && wz > -1.55 && wz < 1.55) {
            hu = 880
            const disc = Math.abs((((wz + 1.55) % 0.21) + 0.21) % 0.21 - 0.105)
            if (disc < 0.025) hu = 150
          }
          if (Math.abs(wx) < 0.03 && wy > -1.0 && wy < -0.76 && wz > -1.5 && wz < 1.5) {
            hu = Math.max(hu, 520)
          }

          // Ribs
          if (bodyR2 > 0.8) {
            const theta = Math.atan2((wy + 0.03) / 0.82, wx / 1.2)
            const isSpineSide = Math.abs(theta + Math.PI / 2) < 0.33
            const isSternumSide = Math.abs(theta - Math.PI / 2) < 0.26
            if (!isSpineSide && !isSternumSide) {
              for (let r = 0; r < ribLevels.length; r += 1) {
                const ribZ = ribLevels[r] - 0.07 * Math.sin(theta)
                if (Math.abs(wz - ribZ) < 0.026) {
                  hu = 790
                  break
                }
              }
            }
          }

          // Cardiac chambers: blood pool with myocardial shell
          let minD = 99
          for (let c = 0; c < heartChambers.length; c += 1) {
            const ch = heartChambers[c]
            const dx = (wx - ch[0]) / ch[3]
            const dy = (wy - ch[1]) / ch[4]
            const dz = (wz - ch[2]) / ch[5]
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
            if (d < minD) minD = d
          }
          if (minD < 1.06) {
            if (minD < 0.88) hu = 325
            else if (minD < 1.02) hu = 58
            else hu = 32
          }
          // Interventricular septum
          if (Math.abs(wx + 0.02) < 0.034 && wz > -0.92 && wz < 0.32 && wy > -0.3 && wy < 0.4) {
            hu = 64
          }

          // Great vessels with contrast
          for (let v = 0; v < vessels.length; v += 1) {
            const seg = vessels[v]
            const d2 = segmentDistanceSq(wx, wy, wz, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5])
            const radius = seg[6]
            if (d2 < radius * radius) {
              hu = v < 5 ? Math.max(hu, 348) : Math.max(hu, 185)
            } else if (d2 < (radius + 0.018) ** 2) {
              hu = Math.max(hu, 72)
            }
          }

          // Coronary calcification
          for (let c = 0; c < calcifications.length; c += 1) {
            const point = calcifications[c]
            const dx = wx - point[0]
            const dy = wy - point[1]
            const dz = wz - point[2]
            const d2 = dx * dx + dy * dy + dz * dz
            if (d2 < point[3] * point[3]) hu = Math.max(hu, point[4])
            else if (d2 < (point[3] * 1.6) ** 2) hu = Math.max(hu, 150)
          }
        }

        if (hu > -900) {
          hu += (hashNoise(x, y, z) - 0.5) * 22
        }
        const normalized = clamp((hu - HU_MIN) / (HU_MAX - HU_MIN), 0, 1)
        data[index] = Math.round(normalized * 255)
        index += 1
      }
    }
  }

  return {
    data,
    dims: VOLUME_DIMS,
    bounds: VOLUME_BOUNDS,
    huRange: [HU_MIN, HU_MAX],
    spacing: [
      (max[0] - min[0]) / nx,
      (max[1] - min[1]) / ny,
      (max[2] - min[2]) / nz,
    ],
  }
}

export function getCardiacVolume() {
  if (!cachedVolume) cachedVolume = buildVolume()
  return cachedVolume
}

export function sampleHU(volume, x, y, z) {
  const [nx, ny, nz] = volume.dims
  const [huMin, huMax] = volume.huRange || [HU_MIN, HU_MAX]
  if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return huMin
  const index = (z * ny + y) * nx + x
  return (volume.data[index] / 255) * (huMax - huMin) + huMin
}

export function renderMPR(canvas, volume, plane, slices, windowWidth, windowLevel, dimmed = false) {
  const [nx, ny, nz] = volume.dims
  const [huMin, huMax] = volume.huRange || [HU_MIN, HU_MAX]
  const huScale = (huMax - huMin) / 255
  let width
  let height
  let sample

  if (plane === 'axial') {
    width = nx
    height = ny
    sample = (u, v) => volume.data[(slices.z * ny + (ny - 1 - v)) * nx + u]
  } else if (plane === 'coronal') {
    width = nx
    height = nz
    sample = (u, v) => volume.data[((nz - 1 - v) * ny + slices.y) * nx + u]
  } else {
    width = ny
    height = nz
    sample = (u, v) => volume.data[((nz - 1 - v) * ny + u) * nx + slices.x]
  }

  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  const low = windowLevel - windowWidth / 2
  const range = Math.max(1, windowWidth)

  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const raw = sample(u, v)
      const hu = raw * huScale + huMin
      let value = clamp((hu - low) / range, 0, 1)
      value = Math.pow(value, 0.92)
      const offset = (v * width + u) * 4
      const gray = value * 255
      image.data[offset] = gray
      image.data[offset + 1] = gray * (dimmed ? 0.96 : 0.99)
      image.data[offset + 2] = gray * (dimmed ? 0.92 : 0.97)
      image.data[offset + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function getLesionMPRPosition(volume, slices) {
  return {
    axial: { x: 0.19, y: 0.49, z: -0.42 },
    slices,
  }
}
