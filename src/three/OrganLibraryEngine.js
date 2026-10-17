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

const RENDERABLE = ORGAN_LIBRARY.organs.filter((organ) => organ.renderable)

function assetUrl(organ) {
  if (organ.mesh?.type !== 'glb' || !organ.mesh.asset) return null
  return ORGAN_ASSETS[`../assets/${organ.mesh.asset}`] || null
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
    this.autoRotate = options.autoRotate !== false
    this.opacity = options.opacity ?? 0.42
    this.selected = 'HEART'
    this.view = 'anterior'
    this.visibility = new Map()
    this.organObjects = new Map()
    this.materials = new Map()
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
      if (node.isMesh) node.userData.organCode = organ.code
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
  }

  applyOpacity(code, opacity) {
    const object = this.organObjects.get(code)
    if (object) applyOrganOpacity(object, opacity)
  }

  setOpacity(opacity) {
    this.opacity = opacity
    for (const code of this.organObjects.keys()) this.applyOpacity(code, opacity)
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
    for (const object of this.organObjects.values()) disposeObject(object)
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
