import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getMprGeometry,
  getMprLesionMarker,
  getMprSampleLayout,
  mprScreenToSlices,
  mprVoxelToScreen,
} from './mprGeometry.js'
import { renderMPR } from './volume.js'

const RAS = [-1, 0, 0, 0, -1, 0, 0, 0, 1]
const LPS = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const PLANES = ['axial', 'coronal', 'sagittal']
const KEYS = ['x', 'y', 'z']

function fixture(direction = RAS, dims = [3, 2, 2]) {
  return {
    dims,
    spacing: [0.7, 1.3, 2.1],
    origin: [123, -456, 789],
    direction,
    huRange: [0, 255],
    data: Uint8Array.from({ length: dims.reduce((a, b) => a * b) }, (_, index) => index),
  }
}

function raster(volume, plane, slices) {
  let pixels
  const ctx = {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image) => { pixels = image.data },
  }
  const canvas = { getContext: () => ctx }
  renderMPR(canvas, volume, plane, slices, 255, 127.5)
  return {
    width: canvas.width,
    height: canvas.height,
    red: Array.from(pixels.filter((_, index) => index % 4 === 0)),
  }
}

function assertRaster(volume, plane, slices, expectedRows) {
  const image = raster(volume, plane, slices)
  assert.equal(image.width, expectedRows[0].length)
  assert.equal(image.height, expectedRows.length)
  assert.deepEqual(image.red, expectedRows.flat().map((value) => Math.round((value / 255) ** 0.92 * 255)))
}

test('canonical RAS raster and labels: A/R axial, S/R coronal, S/A sagittal', () => {
  const volume = fixture()
  const slices = { x: 1, y: 0, z: 0 }
  // Unique voxel intensities make accidental axis swaps and flips observable.
  assertRaster(volume, 'axial', slices, [[5, 4, 3], [2, 1, 0]])
  assertRaster(volume, 'coronal', slices, [[8, 7, 6], [2, 1, 0]])
  assertRaster(volume, 'sagittal', slices, [[10, 7], [4, 1]])
  const expected = [
    { top: 'A', bottom: 'P', left: 'R', right: 'L' },
    { top: 'S', bottom: 'I', left: 'R', right: 'L' },
    { top: 'S', bottom: 'I', left: 'A', right: 'P' },
  ]
  PLANES.forEach((plane, i) => {
    const geometry = getMprGeometry(volume, plane)
    assert.deepEqual(geometry.labels, expected[i])
    assert.equal(geometry.oblique, false)
    assert.equal(geometry.orientation, 'patient')
  })
})

test('LPS data is not subjected to a hard-coded RAS flip', () => {
  const volume = fixture(LPS)
  const slices = { x: 1, y: 0, z: 0 }
  assertRaster(volume, 'axial', slices, [[0, 1, 2], [3, 4, 5]])
  assertRaster(volume, 'coronal', slices, [[6, 7, 8], [0, 1, 2]])
  assertRaster(volume, 'sagittal', slices, [[7, 10], [1, 4]])
})

test('all 48 signed axis permutations: physical direction, pixel clicks and overlays agree', () => {
  const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
  for (const permutation of permutations) {
    for (let signs = 0; signs < 8; signs += 1) {
      const direction = Array(9).fill(0)
      permutation.forEach((worldAxis, indexAxis) => {
        direction[worldAxis * 3 + indexAxis] = signs & (1 << indexAxis) ? -1 : 1
      })
      const volume = fixture(direction, [3, 4, 5])
      const physical = (voxel) => [0, 1, 2].map((row) => volume.origin[row] +
        KEYS.reduce((sum, key, col) => sum + direction[row * 3 + col] * voxel[key] * volume.spacing[col], 0))
      for (const plane of PLANES) {
        const geometry = getMprGeometry(volume, plane)
        const slices = { x: 1, y: 2, z: 3 }
        const layout = getMprSampleLayout(geometry, slices)
        assert.equal(geometry.oblique, false)
        const [worldU, worldV, downSign] = plane === 'axial' ? [0, 1, 1] : plane === 'coronal' ? [0, 2, -1] : [1, 2, -1]
        const at = (u, v) => mprScreenToSlices(geometry, (u + 0.5) / geometry.width, (v + 0.5) / geometry.height, slices)
        const start = physical(at(0, 0))
        for (const [point, axis, sign] of [[physical(at(1, 0)), worldU, 1], [physical(at(0, 1)), worldV, downSign]]) {
          point.forEach((value, i) => {
            if (i === axis) assert.ok((value - start[i]) * sign > 0, `${plane}: wrong physical screen direction`)
            else assert.ok(Math.abs(value - start[i]) < 1e-9)
          })
        }
        const image = raster(volume, plane, slices)
        for (let v = 0; v < geometry.height; v += 1) {
          for (let u = 0; u < geometry.width; u += 1) {
            const clicked = at(u, v)
            assert.equal(clicked[geometry.sliceKey], slices[geometry.sliceKey])
            const rawIndex = (clicked.z * volume.dims[1] + clicked.y) * volume.dims[0] + clicked.x
            assert.equal(layout.offset + u * layout.stepU + v * layout.stepV, rawIndex)
            assert.equal(image.red[v * image.width + u], Math.round((volume.data[rawIndex] / 255) ** 0.92 * 255))
            const crosshair = mprVoxelToScreen(geometry, clicked)
            assert.ok(Math.abs(crosshair.left / 100 * geometry.width - (u + 0.5)) < 1e-9)
            assert.ok(Math.abs(crosshair.top / 100 * geometry.height - (v + 0.5)) < 1e-9)
            assert.deepEqual(mprScreenToSlices(geometry, crosshair.left / 100, crosshair.top / 100, slices), clicked)
            assert.deepEqual(getMprLesionMarker(geometry, slices, clicked, 0), crosshair)
          }
        }
      }
    }
  }
})

test('permuted axes use matching slice counts, anisotropic spacing and lesion depth', () => {
  // index x -> superior, y -> right, z -> anterior.
  const volume = fixture([0, -1, 0, 0, 0, -1, 1, 0, 0], [10, 4, 6])
  const geometry = getMprGeometry(volume, 'axial')
  assert.equal(geometry.sliceKey, 'x')
  assert.equal(geometry.total, 10)
  assert.equal(geometry.width, 4)
  assert.equal(geometry.height, 6)
  assert.equal(geometry.aspect, (4 * 1.3) / (6 * 2.1))
  const slices = { x: 0, y: 1, z: 2 }
  assert.equal(getMprLesionMarker(geometry, slices, { x: 5, y: 1, z: 2 }), null)
  assert.ok(getMprLesionMarker(geometry, slices, { x: 4, y: 1, z: 2 }))
  assert.equal(getMprLesionMarker(geometry, slices, { x: 0, y: 4, z: 2 }), null)
  assert.equal(getMprLesionMarker(geometry, slices, { x: 0, y: NaN, z: 2 }), null)
})

test('oblique native slices use direction COLUMNS, compound labels and reversible interactions', () => {
  const a = Math.PI / 6
  const volume = fixture([Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1], [3, 4, 5])
  const geometry = getMprGeometry(volume, 'axial')
  assert.equal(geometry.oblique, true)
  assert.deepEqual(geometry.labels, { top: 'AL', bottom: 'PR', left: 'RA', right: 'LP' })
  const voxel = { x: 1, y: 2, z: 3 }
  const position = mprVoxelToScreen(geometry, voxel)
  assert.deepEqual(mprScreenToSlices(geometry, position.left / 100, position.top / 100, voxel), voxel)
  assert.deepEqual(getMprLesionMarker(geometry, voxel, voxel), position)
  assert.deepEqual(getMprGeometry({ ...volume, origin: [-999, 21, 0] }, 'axial'), geometry)
  // A tied 45-degree rotation must still assign three distinct index axes.
  const c = Math.SQRT1_2
  const tied = getMprGeometry(fixture([c, -c, 0, c, c, 0, 0, 0, 1]), 'axial')
  assert.equal(new Set([tied.uAxis, tied.vAxis, tied.normalAxis]).size, 3)
})

test('absent direction retains demo rasters, labels and original rounded clicks', () => {
  const volume = fixture(null)
  const slices = { x: 1, y: 0, z: 0 }
  assertRaster(volume, 'axial', slices, [[3, 4, 5], [0, 1, 2]])
  assertRaster(volume, 'coronal', slices, [[6, 7, 8], [0, 1, 2]])
  assertRaster(volume, 'sagittal', slices, [[7, 10], [1, 4]])
  assert.deepEqual(getMprGeometry(volume, 'sagittal').labels, { top: 'H', bottom: 'F', left: 'P', right: 'A' })
  assert.deepEqual(mprVoxelToScreen(getMprGeometry(volume, 'axial'), slices), { left: 50, top: 100 })
  for (const plane of PLANES) {
    const geometry = getMprGeometry(volume, plane)
    for (const fx of [0, 0.25, 0.5, 1]) {
      for (const fy of [0, 0.25, 0.5, 1]) {
        const expected = plane === 'axial'
          ? { ...slices, x: Math.round(fx * 2), y: Math.round(1 - fy) }
          : plane === 'coronal'
            ? { ...slices, x: Math.round(fx * 2), z: Math.round(1 - fy) }
            : { ...slices, y: Math.round(fx), z: Math.round(1 - fy) }
        assert.deepEqual(mprScreenToSlices(geometry, fx, fy, slices), expected)
      }
    }
  }
})

test('single-voxel dimensions and edge clicks stay finite and inside the volume', () => {
  for (const direction of [RAS, null]) {
    for (const plane of PLANES) {
      const geometry = getMprGeometry(fixture(direction, [1, 1, 1]), plane)
      const slices = { x: 0, y: 0, z: 0 }
      assert.deepEqual(mprVoxelToScreen(geometry, slices), { left: 50, top: 50 })
      assert.deepEqual(mprScreenToSlices(geometry, -1, 2, slices), slices)
    }
  }
  const geometry = getMprGeometry(fixture(), 'axial')
  assert.deepEqual(mprScreenToSlices(geometry, -0.1, -0.1, { x: 0, y: 0, z: 1 }), { x: 2, y: 1, z: 1 })
  assert.deepEqual(mprScreenToSlices(geometry, 1.1, 1.1, { x: 0, y: 0, z: 1 }), { x: 0, y: 0, z: 1 })
})

test('malformed, non-finite and non-orthonormal direction metadata never claim patient directions', () => {
  for (const direction of [[], [1, 2, 3], Array(9).fill(0), [...LPS.slice(0, 8), NaN], [1, 0.1, 0, 0, 1, 0, 0, 0, 1]]) {
    const geometry = getMprGeometry(fixture(direction), 'axial')
    assert.equal(geometry.orientation, 'unknown')
    assert.deepEqual(geometry.labels, { top: '?', bottom: '?', left: '?', right: '?' })
  }
  const missingApiDirection = getMprGeometry({ ...fixture(null), dataUrl: '/api/volumes/test/data' }, 'axial')
  assert.equal(missingApiDirection.orientation, 'unknown')
  assert.deepEqual(missingApiDirection.labels, { top: '?', bottom: '?', left: '?', right: '?' })
})
