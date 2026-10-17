import * as THREE from 'three'

const UNIT_SPHERE = new THREE.SphereGeometry(1, 48, 32)

function materialFor(organ, opacity = 1) {
  const color = new THREE.Color(organ.color || '#a0a8b0')
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.05),
    roughness: 0.55,
    metalness: 0.02,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 0.98,
  })
}

function deformLung(geometry, side) {
  // The medial side faces the midline. In RAS, +x is right.
  const medial = side === 'right' ? -1 : 1
  const position = geometry.attributes.position
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const medialness = Math.max(0, x * medial)
    const indentation = 0.22 * medialness * medialness * Math.exp(-((y * 1.6) ** 2))
    position.setX(index, x - medial * indentation)
    // Slight inferior flattening and a notch for the heart.
    if (z < -0.55) position.setZ(index, z + (-0.55 - z) * 0.12)
    if (z < 0.1 && z > -0.7 && y > 0.1) {
      position.setY(index, y - 0.08 * Math.exp(-((z + 0.25) ** 2) * 8))
    }
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}

function deformLiver(geometry) {
  const position = geometry.attributes.position
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    // Flatten the inferior surface and taper the left lobe.
    if (z < -0.25) position.setZ(index, z + (-0.25 - z) * 0.24)
    if (x < -0.2) {
      position.setY(index, y * (0.82 + 0.18 * (x + 1) / 0.8))
    }
    // Shallow gallbladder fossa.
    if (x > 0.35 && z < 0 && z > -0.7) {
      position.setY(index, y - 0.05 * Math.exp(-((x - 0.55) ** 2) * 18))
    }
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}

function deformKidney(geometry, side) {
  // The medial side is the concave side (toward the midline).
  const medial = side === 'right' ? -1 : 1
  const position = geometry.attributes.position
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const medialness = Math.max(0, x * medial)
    const concavity = 0.3 * medialness ** 1.8 * Math.exp(-((z * 3.2) ** 2))
    position.setX(index, x - medial * concavity)
    position.setY(index, y * (0.92 + 0.08 * Math.cos(z * 2.4)))
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}

function ellipsoid(organ) {
  const geometry = UNIT_SPHERE.clone()
  // Deformations operate in normalised (-1..1) space, before scaling to mm.
  const deform = organ.mesh?.deform
  if (deform === 'lung') deformLung(geometry, organ.mesh.side)
  if (deform === 'liver') deformLiver(geometry)
  if (deform === 'kidney') deformKidney(geometry, organ.mesh.side)

  const [sx, sy, sz] = organ.sizeMm.map((value) => value / 2)
  const position = geometry.attributes.position
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(
      index,
      position.getX(index) * sx,
      position.getY(index) * sy,
      position.getZ(index) * sz,
    )
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, materialFor(organ))
  mesh.position.set(...organ.centerMm)
  mesh.userData.organCode = organ.code
  return mesh
}

function tube(organ) {
  const points = (organ.mesh.pointsMm || []).map((point) => new THREE.Vector3(...point))
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.4)
  const radius = organ.mesh.radiusMm || 10
  const geometry = new THREE.TubeGeometry(curve, 64, radius, 14, false)
  const mesh = new THREE.Mesh(geometry, materialFor(organ))
  mesh.userData.organCode = organ.code
  return mesh
}

function stack(organ) {
  const group = new THREE.Group()
  const material = materialFor(organ)
  const segments = organ.mesh.segments || 12
  const radius = organ.mesh.radiusMm || 20
  const total = organ.sizeMm[2]
  const gap = organ.mesh.gapMm || 4
  const step = total / segments
  const height = Math.max(4, step - gap)
  const [cx, cy, cz] = organ.centerMm
  for (let index = 0; index < segments; index += 1) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 18, 1)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(cx, cy, cz - total / 2 + step * (index + 0.5))
    mesh.userData.organCode = organ.code
    group.add(mesh)
    const discGeometry = new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, gap * 0.7, 18, 1)
    const disc = new THREE.Mesh(
      discGeometry,
      new THREE.MeshStandardMaterial({ color: 0x6d6a62, roughness: 0.8, metalness: 0.0 }),
    )
    disc.rotation.x = Math.PI / 2
    disc.position.set(cx, cy, cz - total / 2 + step * (index + 1))
    disc.userData.organCode = organ.code
    group.add(disc)
  }
  group.userData.organCode = organ.code
  return group
}

export function createOrganObject(organ, options = {}) {
  const opacity = options.opacity ?? 1
  let object
  if (organ.mesh?.type === 'tube') object = tube(organ)
  else if (organ.mesh?.type === 'stack') object = stack(organ)
  else object = ellipsoid(organ)

  object.traverse((node) => {
    if (node.isMesh) {
      node.material.opacity = opacity
      node.material.transparent = opacity < 1
      node.castShadow = false
      node.receiveShadow = false
    }
  })
  object.userData.organCode = organ.code
  object.userData.standardReference = true
  return object
}

export function applyOrganOpacity(object, opacity) {
  object.traverse((node) => {
    if (node.isMesh && node.material) {
      node.material.opacity = opacity
      node.material.transparent = opacity < 1
      node.material.depthWrite = opacity >= 0.98
      node.material.needsUpdate = true
    }
  })
}

export function applyOrganHighlight(object, active) {
  object.traverse((node) => {
    if (node.isMesh && node.material) {
      node.material.emissiveIntensity = active ? 0.6 : 0.05
      node.material.emissive.set(active ? 0x67d8cc : 0x000000)
    }
  })
}

export function disposeObject(object) {
  object.traverse((node) => {
    if (!node.isMesh) return
    node.geometry?.dispose?.()
    if (Array.isArray(node.material)) node.material.forEach((item) => item.dispose?.())
    else node.material?.dispose?.()
  })
}

export { UNIT_SPHERE }
