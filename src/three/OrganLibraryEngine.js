import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import ORGAN_LIBRARY from '../../shared/organ_library.json'
import {
  applyOrganHighlight,
  applyOrganOpacity,
  createOrganObject,
  disposeObject,
} from './organGeometry.js'

const ORGAN_ASSETS = import.meta.glob('../assets/organs/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
})

const DETAIL_ASSETS = import.meta.glob('../assets/organs/*_detail.glb', {
  eager: true,
  query: '?url',
  import: 'default',
})

const RENDERABLE = ORGAN_LIBRARY.organs.filter((organ) => organ.renderable)
const APPROACH_VECTORS = {
  anterior: new THREE.Vector3(0, 1, 0),
  posterior: new THREE.Vector3(0, -1, 0),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
}

const KIND_COLORS = {
  capsule: '#8f4a43',
  segment: '#b06a5a',
  lobe: '#a65a50',
  ligament: '#8a7a60',
  surface: '#8a5a6a',
  chamber: '#c45258',
  valve: '#e0b07a',
  coronary: '#d46a5a',
  muscle: '#a85b50',
  cortex: '#b06a7a',
  medulla: '#d0a0a8',
  calyx: '#e0c8a0',
  pelvis: '#e8d8b8',
  hilum: '#c0a080',
  vertebra: '#b8b0a0',
  organ: '#a08a70',
  other: '#9aa8b0',
}

function assetUrl(organ) {
  if (organ.mesh?.type !== 'glb' || !organ.mesh.asset) return null
  return ORGAN_ASSETS[`../assets/${organ.mesh.asset}`] || null
}

function detailAssetUrl(organ) {
  if (!organ.detailAsset) return null
  return DETAIL_ASSETS[`../assets/${organ.detailAsset}`] || null
}

function partMaterial(organ, part, opacity) {
  const color = new THREE.Color(KIND_COLORS[part?.kind] || organ.color || '#a0a8b0')
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.04),
    roughness: 0.55,
    metalness: 0.02,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 0.98,
  })
}

function materialFor(organ, opacity) {
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

export default class OrganLibraryEngine {
  constructor(container, options = {}) {
    this.container = container
    this.onSelect = options.onSelect
    this.onReady = options.onReady
    this.onTargetUpdate = options.onTargetUpdate
    this.onInsertionEnd = options.onInsertionEnd
    this.autoRotate = options.autoRotate !== false
    this.opacity = options.opacity ?? 0.42
    this.selected = 'HEART'
    this.view = 'anterior'
    this.visibility = new Map()
    this.organObjects = new Map()
    this.materials = new Map()
    this.detailObjects = new Map()
    this.detailParts = new Map()
    this.detailPromises = new Map()
    this.partVisibility = new Map()
    this.detailOrgan = null
    this.detailEnabled = false
    this.allMaterials = new Set()
    this.target = null
    this.targetGroup = null
    this.instrument = null
    this.planGroup = null
    this.clipPlane = null
    this.clipVisual = null
    this.clipMode = 'off'
    this.clipFlip = false
    this.pathLength = 0
    this.pathCollisions = []
    this.insertion = null
    this.disposed = false
    this.lastRender = 0
    this.atlasBox = new THREE.Box3()
    this.atlasSize = new THREE.Vector3(400, 300, 600)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.localClippingEnabled = true
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.className = 'volume-canvas'
    this.container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 8000)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(0, 1300, 0)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.autoRotate = this.autoRotate
    this.controls.autoRotateSpeed = 0.35
    this.controls.minDistance = 300
    this.controls.maxDistance = 4000
    this.controls.rotateSpeed = 0.6

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const key = new THREE.DirectionalLight(0xffffff, 1.65)
    key.position.set(500, 900, 900)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x8ab4d8, 0.55)
    fill.position.set(-700, 500, 200)
    this.scene.add(fill)
    const rim = new THREE.DirectionalLight(0xd8a070, 0.42)
    rim.position.set(-300, -500, -700)
    this.scene.add(rim)

    this.grid = null
    this.axes = null
    this.atlasRoot = new THREE.Group()
    this.scene.add(this.atlasRoot)
    this.loadOrgans()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()

    this.animate = this.animate.bind(this)
    this.raf = requestAnimationFrame(this.animate)

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp)
    this.pointerStart = null
  }

  addFallback(organ) {
    const object = createOrganObject(organ, { opacity: this.opacity })
    object.traverse((node) => {
      if (!node.isMesh) return
      node.userData.organCode = organ.code
      if (node.material) this.allMaterials.add(node.material)
    })
    object.userData.organCode = organ.code
    this.atlasRoot.add(object)
    this.organObjects.set(organ.code, object)
    this.applyLoadedState(organ.code)
  }

  applyLoadedState(code) {
    const object = this.organObjects.get(code)
    if (!object) return
    object.visible = this.visibility.get(code) !== false
    applyOrganOpacity(object, this.opacity)
    applyOrganHighlight(object, this.selected === code)
  }

  async loadOrgans() {
    const loader = new GLTFLoader()
    const jobs = []
    for (const organ of RENDERABLE) {
      const url = assetUrl(organ)
      if (!url) {
        this.addFallback(organ)
        continue
      }
      jobs.push(
        loader
          .loadAsync(url)
          .then((gltf) => {
            if (this.disposed) return
            const group = new THREE.Group()
            group.userData.organCode = organ.code
            group.userData.standardReference = true
            const material = materialFor(organ, this.opacity)
            this.materials.set(organ.code, material)
            this.allMaterials.add(material)
            gltf.scene.traverse((node) => {
              if (!node.isMesh) return
              node.material = material
              node.userData.organCode = organ.code
            })
            group.add(gltf.scene)
            this.atlasRoot.add(group)
            this.organObjects.set(organ.code, group)
            this.applyLoadedState(organ.code)
          })
          .catch((error) => {
            console.error(`failed to load ${organ.code}`, error)
            this.addFallback(organ)
          }),
      )
    }
    await Promise.all(jobs)
    if (this.disposed) return
    this.fitAtlas()
    this.onReady?.()
  }

  async ensureDetail(organCode) {
    if (this.detailObjects.has(organCode)) return this.detailObjects.get(organCode)
    if (this.detailPromises.has(organCode)) return this.detailPromises.get(organCode)
    const organ = ORGAN_LIBRARY.organs.find((item) => item.code === organCode)
    const url = organ ? detailAssetUrl(organ) : null
    if (!url) return null
    const promise = new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => {
        if (this.disposed) return null
        const root = new THREE.Group()
        root.visible = false
        root.userData.organCode = organCode
        const partDefs = new Map((organ.parts || []).map((part) => [part.code, part]))
        const partMap = new Map()
        const meshes = []
        gltf.scene.traverse((node) => {
          if (node.isMesh) meshes.push(node)
        })
        for (const node of meshes) {
          let cursor = node
          let code = null
          while (cursor && !code) {
            if (partDefs.has(cursor.name)) code = cursor.name
            cursor = cursor.parent
          }
          if (!code) continue
          let partGroup = partMap.get(code)
          if (!partGroup) {
            const part = partDefs.get(code)
            const material = partMaterial(organ, part, this.opacity)
            this.allMaterials.add(material)
            partGroup = new THREE.Group()
            partGroup.userData.organCode = organCode
            partGroup.userData.partCode = code
            partGroup.userData.material = material
            partMap.set(code, partGroup)
            root.add(partGroup)
          }
          node.material = partGroup.userData.material
          node.userData.organCode = organCode
          node.userData.partCode = code
          partGroup.add(node)
        }
        this.detailObjects.set(organCode, root)
        this.detailParts.set(organCode, partMap)
        this.atlasRoot.add(root)
        this.applyClipping()
        this.applyDetailState(organCode)
        return root
      })
      .catch((error) => {
        console.error(`failed to load detail ${organCode}`, error)
        return null
      })
    this.detailPromises.set(organCode, promise)
    return promise
  }

  applyDetailState(organCode) {
    const root = this.detailObjects.get(organCode)
    if (!root) return
    const visible = this.visibility.get(organCode) !== false
    root.visible = visible && this.detailEnabled && this.detailOrgan === organCode
    const parts = this.detailParts.get(organCode)
    if (!parts) return
    for (const [code, group] of parts) {
      group.visible = this.partVisibility.get(`${organCode}:${code}`) !== false
      if (group.userData.material) {
        group.userData.material.opacity = this.opacity
        group.userData.material.transparent = this.opacity < 1
        group.userData.material.depthWrite = this.opacity >= 0.98
      }
    }
    const outer = this.organObjects.get(organCode)
    const hasDetail = this.detailObjects.has(organCode)
    if (outer) outer.visible = visible && !(hasDetail && this.detailEnabled && this.detailOrgan === organCode)
  }

  async setDetailMode(organCode, enabled) {
    this.detailEnabled = enabled
    this.detailOrgan = enabled ? organCode : null
    if (enabled) await this.ensureDetail(organCode)
    for (const code of this.organObjects.keys()) this.applyDetailState(code)
    for (const code of this.detailObjects.keys()) this.applyDetailState(code)
  }

  setPartVisibility(organCode, partCode, visible) {
    this.partVisibility.set(`${organCode}:${partCode}`, visible)
    const group = this.detailParts.get(organCode)?.get(partCode)
    if (group) group.visible = visible
  }

  setPartSelected(organCode, partCode) {
    this.selectedPart = partCode
    const parts = this.detailParts.get(organCode)
    if (!parts) return
    for (const [code, group] of parts) applyOrganHighlight(group, code === partCode)
  }

  focusPart(organCode, partCode) {
    const group = this.detailParts.get(organCode)?.get(partCode)
    if (!group) return
    const box = new THREE.Box3().setFromObject(group)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z, 8)
    this.controls.target.copy(center)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(center.x, center.y + radius * 2.4, center.z + radius * 0.15)
    this.controls.minDistance = radius * 0.5
    this.controls.maxDistance = radius * 20
    this.controls.update()
  }

  clearTarget() {
    for (const group of [this.targetGroup, this.instrument, this.planGroup, this.clipVisual]) {
      if (!group) continue
      group.parent?.remove(group)
      group.traverse((node) => {
        if (!node.isMesh) return
        node.geometry?.dispose?.()
        if (Array.isArray(node.material)) node.material.forEach((item) => item.dispose?.())
        else node.material?.dispose?.()
      })
    }
    this.targetGroup = null
    this.instrument = null
    this.planGroup = null
    this.clipVisual = null
    this.needle = null
    this.target = null
    this.pathLength = 0
    this.pathCollisions = []
    this.currentDepth = 0
    this.lastNeedleNotify = 0
    this.clipPlane = null
    for (const material of this.allMaterials) {
      material.clippingPlanes = []
      material.needsUpdate = true
    }
  }

  async setTarget(target) {
    this.clearTarget()
    if (!target) return
    this.target = target
    this.currentDepth = 0
    this.approachOverride = null
    await this.setDetailMode(target.organ, true)
    this.setVisibility(target.organ, true)
    this.applyDetailState(target.organ)

    const targetPos = new THREE.Vector3(...target.coordinateMm)
    const group = new THREE.Group()
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xffb36b, depthTest: false, transparent: true, opacity: 0.95 }),
    )
    sphere.renderOrder = 20
    group.add(sphere)
    const cross = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-18, 0, 0), new THREE.Vector3(18, 0, 0),
      new THREE.Vector3(0, -18, 0), new THREE.Vector3(0, 18, 0),
      new THREE.Vector3(0, 0, -18), new THREE.Vector3(0, 0, 18),
    ])
    const crossLines = new THREE.LineSegments(
      cross,
      new THREE.LineBasicMaterial({ color: 0xffb36b, depthTest: false, transparent: true, opacity: 0.7 }),
    )
    crossLines.renderOrder = 20
    group.add(crossLines)
    group.position.copy(targetPos)
    this.targetGroup = group
    this.scene.add(group)
    this.rebuildInstrument()
    this.focusTarget()
    if (this.clipMode !== 'off') this.setClip(this.clipMode, true, this.clipFlip)
  }

  focusTarget() {
    if (!this.target) return
    const targetPos = new THREE.Vector3(...this.target.coordinateMm)
    const approach = this.approachOverride || this.target.approach || 'anterior'
    const dir = APPROACH_VECTORS[approach] || APPROACH_VECTORS.anterior
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1))
    if (side.lengthSq() < 0.01) side.set(1, 0, 0)
    side.normalize()
    const distance = Math.max(320, this.pathLength * 1.8)
    this.controls.target.copy(targetPos)
    this.camera.up.set(0, 0, 1)
    this.camera.position.copy(targetPos)
      .add(dir.clone().multiplyScalar(distance))
      .add(side.multiplyScalar(distance * 0.35))
      .add(new THREE.Vector3(0, 0, distance * 0.28))
    this.controls.minDistance = 30
    this.controls.maxDistance = 900
    this.controls.update()
  }

  setApproach(approach) {
    this.approachOverride = approach
    if (!this.target) return
    this.rebuildInstrument()
    this.focusTarget()
    if (this.clipMode !== 'off') this.setClip(this.clipMode, true, this.clipFlip)
  }

  rebuildInstrument() {
    if (this.instrument) {
      this.instrument.parent?.remove(this.instrument)
      this.instrument.traverse((node) => {
        if (node.isMesh) {
          node.geometry?.dispose?.()
          node.material?.dispose?.()
        }
      })
      this.instrument = null
    }
    if (this.planGroup) {
      this.planGroup.parent?.remove(this.planGroup)
      this.planGroup.traverse((node) => {
        if (node.isMesh || node.isLine) {
          node.geometry?.dispose?.()
          node.material?.dispose?.()
        }
      })
      this.planGroup = null
    }
    if (!this.target) return

    const targetPos = new THREE.Vector3(...this.target.coordinateMm)
    const approach = this.approachOverride || this.target.approach || 'anterior'
    const dirOut = (APPROACH_VECTORS[approach] || APPROACH_VECTORS.anterior).clone()
    const box = this.atlasBox.clone().expandByScalar(20)
    const ray = new THREE.Ray(targetPos, dirOut)
    const hit = ray.intersectBox(box, new THREE.Vector3())
    const entry = hit
      ? hit.clone().add(dirOut.clone().multiplyScalar(18))
      : targetPos.clone().add(dirOut.clone().multiplyScalar(260))
    const direction = targetPos.clone().sub(entry).normalize()
    this.pathLength = entry.distanceTo(targetPos)
    this.currentDepth = 0
    this.needleGeometry = { entry, direction, targetPos }

    const plan = new THREE.Group()
    const pathGeometry = new THREE.BufferGeometry().setFromPoints([entry, targetPos])
    const pathLine = new THREE.Line(
      pathGeometry,
      new THREE.LineDashedMaterial({ color: 0x67d8cc, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.65, depthTest: false }),
    )
    pathLine.computeLineDistances()
    pathLine.renderOrder = 18
    plan.add(pathLine)
    const entryMarker = new THREE.Mesh(
      new THREE.SphereGeometry(3, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x67d8cc, depthTest: false, transparent: true, opacity: 0.85 }),
    )
    entryMarker.position.copy(entry)
    entryMarker.renderOrder = 18
    plan.add(entryMarker)
    this.scene.add(plan)
    this.planGroup = plan

    const instrument = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({
      color: 0xa8f0e8,
      emissive: 0x2a6b66,
      emissiveIntensity: 0.5,
      metalness: 0.35,
      roughness: 0.28,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
    })
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 12), material)
    shaft.renderOrder = 20
    const tip = new THREE.Mesh(new THREE.ConeGeometry(2.1, 6, 14), material)
    tip.renderOrder = 20
    instrument.add(shaft)
    instrument.add(tip)
    this.scene.add(instrument)
    this.instrument = instrument
    this.needle = { shaft, tip, material }
    this.lastNeedleNotify = 0
    this.setNeedleDepth(0)
    this.computePathCollisions(entry, direction)
  }

  setNeedleDepth(depth) {
    if (!this.needle || !this.needleGeometry) return
    const { entry, direction } = this.needleGeometry
    const value = Math.max(0, Math.min(depth, this.pathLength))
    this.currentDepth = value
    const { shaft, tip } = this.needle
    const up = new THREE.Vector3(0, 1, 0)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction)
    shaft.quaternion.copy(quaternion)
    shaft.scale.set(1, Math.max(value, 0.01), 1)
    shaft.position.copy(entry).add(direction.clone().multiplyScalar(value / 2))
    shaft.visible = value > 0.1
    tip.quaternion.copy(quaternion)
    tip.position.copy(entry).add(direction.clone().multiplyScalar(value))
    tip.visible = value > 0.1
    const now = performance.now()
    if (now - (this.lastNeedleNotify || 0) > 80) {
      this.lastNeedleNotify = now
      this.onTargetUpdate?.({
        target: this.target,
        approach: this.approachOverride || this.target?.approach,
        pathLength: this.pathLength,
        depth: value,
        collisions: this.pathCollisions,
      })
    }
  }

  computePathCollisions(entry, direction) {
    if (!this.target) return
    const raycaster = new THREE.Raycaster(entry, direction, 0, Math.max(1, this.pathLength - 2))
    const hits = raycaster.intersectObjects([...this.organObjects.values()], true)
    const codes = new Set()
    for (const hit of hits) {
      let node = hit.object
      while (node && !node.userData.organCode) node = node.parent
      if (node?.userData.organCode && node.userData.organCode !== this.target.organ) {
        codes.add(node.userData.organCode)
      }
    }
    this.pathCollisions = [...codes]
  }

  startInsertion(duration = 1800) {
    if (!this.needle || !this.pathLength) return
    this.insertion = { start: performance.now(), duration, active: true }
  }

  setClip(mode, enabled, flip = false) {
    this.clipMode = enabled ? mode : 'off'
    this.clipFlip = flip
    this.clipPlane = null
    if (!enabled || !this.target) {
      for (const material of this.allMaterials) {
        material.clippingPlanes = []
        material.needsUpdate = true
      }
      if (this.clipVisual) this.clipVisual.visible = false
      return
    }
    const targetPos = new THREE.Vector3(...this.target.coordinateMm)
    let normal = new THREE.Vector3(0, 0, 1)
    if (mode === 'coronal') normal.set(0, 1, 0)
    if (mode === 'sagittal') normal.set(1, 0, 0)
    if (flip) normal.negate()
    const plane = new THREE.Plane(normal, -normal.dot(targetPos))
    this.clipPlane = plane
    for (const material of this.allMaterials) {
      material.clippingPlanes = [plane]
      material.clipShadows = true
      material.needsUpdate = true
    }
    if (!this.clipVisual) {
      const visual = new THREE.Mesh(
        new THREE.PlaneGeometry(420, 420),
        new THREE.MeshBasicMaterial({
          color: 0x67d8cc,
          transparent: true,
          opacity: 0.055,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      )
      visual.renderOrder = 2
      this.scene.add(visual)
      this.clipVisual = visual
    }
    this.clipVisual.visible = true
    this.clipVisual.position.copy(targetPos)
    this.clipVisual.lookAt(targetPos.clone().add(normal))
  }

  applyClipping() {
    if (this.clipMode === 'off' || !this.clipPlane) return
    for (const material of this.allMaterials) {
      material.clippingPlanes = [this.clipPlane]
      material.clipShadows = true
      material.needsUpdate = true
    }
  }

  fitAtlas() {
    const box = new THREE.Box3()
    for (const object of this.organObjects.values()) box.expandByObject(object)
    if (box.isEmpty()) return
    this.atlasBox.copy(box)
    this.atlasSize.copy(box.getSize(new THREE.Vector3()))
    const center = box.getCenter(new THREE.Vector3())
    this.controls.target.copy(center)
    this.controls.minDistance = Math.max(180, Math.max(this.atlasSize.x, this.atlasSize.y, this.atlasSize.z) * 0.45)
    this.controls.maxDistance = Math.max(1200, Math.max(this.atlasSize.x, this.atlasSize.y, this.atlasSize.z) * 4)
    this.setView(this.view)
    this.placeContext(box)
  }

  placeContext(box) {
    if (this.grid) {
      this.scene.remove(this.grid)
      this.grid.geometry.dispose()
      this.grid.material.dispose()
    }
    if (this.axes) {
      this.scene.remove(this.axes)
      this.axes.geometry.dispose()
      this.axes.material.dispose()
    }
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const span = Math.max(size.x, size.y, 300) * 1.5
    this.grid = new THREE.GridHelper(span, 16, 0x1c2b36, 0x14212b)
    this.grid.rotation.x = Math.PI / 2
    this.grid.position.set(center.x, center.y, box.min.z - 15)
    this.scene.add(this.grid)
    this.axes = new THREE.AxesHelper(Math.max(60, Math.max(size.x, size.y, size.z) * 0.12))
    this.axes.position.set(box.min.x, box.min.y, box.min.z)
    this.scene.add(this.axes)
  }

  setView(view) {
    this.view = view
    const size = this.atlasSize
    const center = this.controls.target
    const vfov = THREE.MathUtils.degToRad(this.camera.fov)
    const aspect = this.camera.aspect || 1
    const distance = Math.max(
      size.z / (2 * Math.tan(vfov / 2)),
      size.x / aspect / (2 * Math.tan(vfov / 2)),
      size.y / (2 * Math.tan(vfov / 2)),
    ) * 1.28
    const directions = {
      anterior: [0, 1, 0],
      posterior: [0, -1, 0],
      left: [-1, 0, 0],
      right: [1, 0, 0],
    }
    const direction = directions[view] || directions.anterior
    this.camera.up.set(0, 0, 1)
    this.camera.position.copy(center).add(new THREE.Vector3(...direction).multiplyScalar(distance))
    this.controls.target.copy(center)
    this.controls.update()
  }

  handlePointerDown = (event) => {
    this.pointerStart = { x: event.clientX, y: event.clientY }
  }

  handlePointerUp = (event) => {
    if (!this.pointerStart) return
    const dx = event.clientX - this.pointerStart.x
    const dy = event.clientY - this.pointerStart.y
    this.pointerStart = null
    if (dx * dx + dy * dy > 16) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, this.camera)
    const hits = raycaster.intersectObjects([...this.organObjects.values()], true)
    if (!hits.length) return
    let node = hits[0].object
    while (node && !node.userData.organCode) node = node.parent
    if (node?.userData.organCode) this.onSelect?.(node.userData.organCode)
  }

  setVisibility(code, visible) {
    this.visibility.set(code, visible)
    const object = this.organObjects.get(code)
    if (object) object.visible = visible
    this.applyDetailState(code)
  }

  applyOpacity(code, opacity) {
    const object = this.organObjects.get(code)
    if (object) applyOrganOpacity(object, opacity)
  }

  setOpacity(opacity) {
    this.opacity = opacity
    for (const code of this.organObjects.keys()) this.applyOpacity(code, opacity)
    for (const parts of this.detailParts.values()) {
      for (const group of parts.values()) {
        if (!group.userData.material) continue
        group.userData.material.opacity = opacity
        group.userData.material.transparent = opacity < 1
        group.userData.material.depthWrite = opacity >= 0.98
        group.userData.material.needsUpdate = true
      }
    }
  }

  setMode(mode) {
    this.setOpacity(mode === 'ghost' ? 0.28 : 1)
  }

  setAutoRotate(value) {
    this.autoRotate = value
    this.controls.autoRotate = value
  }

  setSelected(code) {
    this.selected = code
    for (const [organCode, object] of this.organObjects) {
      applyOrganHighlight(object, organCode === code)
    }
  }

  focus(code) {
    const object = this.organObjects.get(code)
    if (!object) return
    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z, 40)
    this.controls.target.copy(center)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(center.x, center.y + radius * 2.4, center.z + radius * 0.15)
    this.controls.minDistance = radius * 0.7
    this.controls.maxDistance = radius * 12
    this.controls.update()
  }

  resetView() {
    this.fitAtlas()
  }

  resize() {
    if (!this.container.clientWidth || !this.container.clientHeight) return
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  capture() {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }

  animate(time) {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.animate)
    if (this.insertion?.active) {
      const progress = Math.min(1, (time - this.insertion.start) / this.insertion.duration)
      const eased = 1 - (1 - progress) ** 3
      this.setNeedleDepth(this.pathLength * eased)
      if (progress >= 1) {
        this.insertion.active = false
        this.setNeedleDepth(this.pathLength)
        this.onInsertionEnd?.(this.pathLength)
      }
    }
    if (time - this.lastRender < 30) return
    this.lastRender = time
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp)
    this.controls?.dispose()
    this.clearTarget()
    for (const object of this.organObjects.values()) disposeObject(object)
    for (const object of this.detailObjects.values()) disposeObject(object)
    this.organObjects.clear()
    this.materials.clear()
    this.grid?.geometry?.dispose?.()
    this.grid?.material?.dispose?.()
    this.axes?.geometry?.dispose?.()
    this.axes?.material?.dispose?.()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
