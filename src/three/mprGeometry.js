const AXES = ['x', 'y', 'z']
const TOLERANCE = 1e-4
const PERMUTATIONS = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2],
  [1, 2, 0], [2, 0, 1], [2, 1, 0],
]
const PLANES = {
  axial: { u: 0, v: 1, normal: 2, down: 1 },
  coronal: { u: 0, v: 2, normal: 1, down: -1 },
  sagittal: { u: 1, v: 2, normal: 0, down: -1 },
}
const LEGACY_LABELS = {
  axial: { top: 'A', bottom: 'P', left: 'R', right: 'L' },
  coronal: { top: 'H', bottom: 'F', left: 'R', right: 'L' },
  sagittal: { top: 'H', bottom: 'F', left: 'P', right: 'A' },
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0)

function directionColumns(direction) {
  if (!direction || direction.length !== 9 || !Array.from(direction).every(Number.isFinite)) return null
  // SimpleITK direction is row-major: each COLUMN gives an index axis in LPS.
  const columns = [0, 1, 2].map((axis) => [direction[axis], direction[3 + axis], direction[6 + axis]])
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(dot(columns[i], columns[i]) - 1) > TOLERANCE) return null
    for (let j = 0; j < i; j += 1) {
      if (Math.abs(dot(columns[i], columns[j])) > TOLERANCE) return null
    }
  }
  return columns
}

function directionLabel(vector) {
  return vector
    .map((value, axis) => ({ value, axis }))
    .filter(({ value }) => Math.abs(value) > TOLERANCE)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.axis - b.axis)
    .map(({ value, axis }) => (value > 0 ? ['L', 'P', 'S'] : ['R', 'A', 'I'])[axis])
    .join('')
}

/**
 * Describe a native voxel slice in radiological display order.
 * Right/down in LPS: axial L/P, coronal L/I, sagittal P/I (A at left).
 * Oblique images retain their native grid; they are NOT patient-orthogonal
 * reslices. Compound edge labels and `oblique` expose that distinction.
 * Origin translates the volume and does not change these index/display maps.
 */
export function getMprGeometry(volume, plane) {
  const spec = PLANES[plane]
  if (!spec) throw new Error(`Unknown MPR plane: ${plane}`)
  const columns = directionColumns(volume.direction)
  const orientation = columns ? 'patient' : volume.direction == null && !volume.dataUrl ? 'legacy' : 'unknown'
  let axes = [0, 1, 2]
  let uSign = 1
  let vSign = -1
  let oblique = false
  let labels = orientation === 'legacy'
    ? LEGACY_LABELS[plane]
    : { top: '?', bottom: '?', left: '?', right: '?' }
  if (columns) {
    // Match all three patient axes together so an oblique tie cannot select
    // one index axis twice. Also handles non-canonical signed permutations.
    const score = (candidate) => candidate.reduce((sum, indexAxis, worldAxis) =>
      sum + Math.abs(columns[indexAxis][worldAxis]), 0)
    axes = PERMUTATIONS.reduce((best, candidate) => score(candidate) > score(best) ? candidate : best)
    uSign = columns[axes[spec.u]][spec.u] >= 0 ? 1 : -1
    vSign = (columns[axes[spec.v]][spec.v] >= 0 ? 1 : -1) * spec.down
    oblique = axes.some((indexAxis, worldAxis) =>
      columns[indexAxis].some((value, row) => row !== worldAxis && Math.abs(value) > TOLERANCE))
    const right = columns[axes[spec.u]].map((value) => value * uSign)
    const down = columns[axes[spec.v]].map((value) => value * vSign)
    labels = {
      right: directionLabel(right),
      left: directionLabel(right.map((value) => -value)),
      bottom: directionLabel(down),
      top: directionLabel(down.map((value) => -value)),
    }
  }
  const uAxis = axes[spec.u]
  const vAxis = axes[spec.v]
  const normalAxis = axes[spec.normal]
  const width = volume.dims[uAxis]
  const height = volume.dims[vAxis]
  const spacing = (axis) => {
    const value = volume.spacing?.[axis]
    return Number.isFinite(value) && value > 0 ? value : 1
  }
  return {
    dims: volume.dims,
    uAxis, vAxis, normalAxis, uSign, vSign,
    sliceKey: AXES[normalAxis],
    total: volume.dims[normalAxis],
    width, height,
    aspect: (width * spacing(uAxis)) / (height * spacing(vAxis)),
    orientation, oblique, labels,
  }
}

export function getMprSliceIndex(geometry, slices) {
  const value = slices[geometry.sliceKey]
  return clamp(Number.isFinite(value) ? Math.round(value) : 0, 0, geometry.total - 1)
}

// The renderer uses these strides instead of allocating an xyz object per pixel.
export function getMprSampleLayout(geometry, slices) {
  const { dims, uAxis, vAxis, normalAxis, uSign, vSign, width, height } = geometry
  const strides = [1, dims[0], dims[0] * dims[1]]
  return {
    offset: getMprSliceIndex(geometry, slices) * strides[normalAxis]
      + (uSign < 0 ? width - 1 : 0) * strides[uAxis]
      + (vSign < 0 ? height - 1 : 0) * strides[vAxis],
    stepU: strides[uAxis] * uSign,
    stepV: strides[vAxis] * vSign,
  }
}

export function mprVoxelToScreen(geometry, voxel) {
  const fraction = (axis, sign, size) => {
    const index = voxel[AXES[axis]]
    const pixel = sign > 0 ? index : size - 1 - index
    // Preserve demo placement; patient overlays use the actual pixel centers.
    return geometry.orientation === 'legacy'
      ? size > 1 ? pixel / (size - 1) : 0.5
      : (pixel + 0.5) / size
  }
  return {
    left: 100 * fraction(geometry.uAxis, geometry.uSign, geometry.width),
    top: 100 * fraction(geometry.vAxis, geometry.vSign, geometry.height),
  }
}

export function mprScreenToSlices(geometry, fx, fy, slices) {
  const index = (fraction, size, sign) => {
    const bounded = clamp(Number.isFinite(fraction) ? fraction : 0, 0, 1)
    if (geometry.orientation === 'legacy') {
      return Math.round((sign > 0 ? bounded : 1 - bounded) * (size - 1))
    }
    const pixel = Math.min(size - 1, Math.floor(bounded * size))
    return sign > 0 ? pixel : size - 1 - pixel
  }
  return {
    ...slices,
    [AXES[geometry.uAxis]]: index(fx, geometry.width, geometry.uSign),
    [AXES[geometry.vAxis]]: index(fy, geometry.height, geometry.vSign),
  }
}

export function getMprLesionMarker(geometry, slices, lesionVoxel, tolerance = 4) {
  if (!lesionVoxel || AXES.some((axis, i) =>
    !Number.isFinite(lesionVoxel[axis]) || lesionVoxel[axis] < 0 || lesionVoxel[axis] > geometry.dims[i] - 1)) {
    return null
  }
  if (Math.abs(getMprSliceIndex(geometry, slices) - lesionVoxel[geometry.sliceKey]) > tolerance) return null
  return mprVoxelToScreen(geometry, lesionVoxel)
}
