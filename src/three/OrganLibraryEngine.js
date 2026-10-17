import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import ORGAN_LIBRARY from '../../shared/organ_library.json'
import heartModelUrl from '../assets/heart.glb?url'
import {
  applyOrganHighlight,
  applyOrganOpacity,
  createOrganObject,
  disposeObject,
} from './organGeometry.js'

const HEART = ORGAN_LIBRARY.organs.find((organ) => organ.code === 'HEART')

export default class OrganLibraryEngine {
  constructor(container, options = {}) {
    this.container = container
    this.onSelect = options.onSelect
    this.onReady = options.onReady
    this.autoRotate = options.autoRotate !== false
    this.opacity = options.opacity ?? 1
    this.selected = null
    this.disposed = false
    this.organObjects = new Map()
    this.lastRender = 0

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
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 5000)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(300, 1150, 480)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, -30)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.autoRotate = this.autoRotate
    this.controls.autoRotateSpeed = 0.35
    this.controls.minDistance = 360
    this.controls.maxDistance = 3000
    this.controls.rotateSpeed = 0.6

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const key = new THREE.DirectionalLight(0xffffff, 1.65)
    key.position.set(500, -700, 900)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x8ab4d8, 0.55)
    fill.position.set(-700, 400, 200)
    this.scene.add(fill)
    const rim = new THREE.DirectionalLight(0xd8a070, 0.42)
    rim.position.set(-300, 500, -700)
    this.scene.add(rim)

    this.grid = new THREE.GridHelper(700, 14, 0x1c2b36, 0x14212b)
    this.grid.rotation.x = Math.PI / 2
    this.grid.position.z = -260
    this.scene.add(this.grid)

    this.axes = new THREE.AxesHelper(110)
    this.axes.position.set(-260, -110, -250)
    this.scene.add(this.axes)

    this.atlasRoot = new THREE.Group()
    this.scene.add(this.atlasRoot)
    this.buildOrgans()
    this.loadHeart()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()

    this.animate = this.animate.bind(this)
    this.raf = requestAnimationFrame(this.animate)

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp)
    this.pointerStart = null
  }

  buildOrgans() {
    for (const organ of ORGAN_LIBRARY.organs) {
      if (!organ.renderable || organ.mesh?.type === 'glb') continue
      const object = createOrganObject(organ, { opacity: this.opacity })
      this.atlasRoot.add(object)
      this.organObjects.set(organ.code, object)
    }
  }

  loadHeart() {
    if (!HEART) return
    const loader = new GLTFLoader()
    loader
      .loadAsync(heartModelUrl)
      .then((gltf) => {
        if (this.disposed) return
        const root = gltf.scene
        root.rotation.x = Math.PI / 2
        root.updateMatrixWorld(true)
        const color = new THREE.Color(HEART.color)
        root.traverse((node) => {
          if (!node.isMesh) return
          node.material = new THREE.MeshStandardMaterial({
            color,
            emissive: color.clone().multiplyScalar(0.05),
            roughness: 0.58,
            metalness: 0.02,
            transparent: true,
            opacity: this.opacity,
            side: THREE.DoubleSide,
          })
        })
        const box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const scale = Math.min(
          HEART.sizeMm[0] / Math.max(size.x, 0.001),
          HEART.sizeMm[1] / Math.max(size.y, 0.001),
          HEART.sizeMm[2] / Math.max(size.z, 0.001),
        )
        root.position.sub(center)
        const group = new THREE.Group()
        group.add(root)
        group.scale.setScalar(scale)
        group.position.set(...HEART.centerMm)
        group.userData.organCode = 'HEART'
        group.userData.standardReference = true
        this.atlasRoot.add(group)
        this.organObjects.set('HEART', group)
        this.applyOpacity('HEART', this.opacity)
        this.onReady?.()
      })
      .catch((error) => {
        console.error(error)
        this.onReady?.()
      })
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
    const roots = [...this.organObjects.values()]
    const hits = raycaster.intersectObjects(roots, true)
    if (!hits.length) return
    let node = hits[0].object
    while (node && !node.userData.organCode) node = node.parent
    if (node?.userData.organCode) this.onSelect?.(node.userData.organCode)
  }

  setVisibility(code, visible) {
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
    for (const [organCode, object] of this.organObjects) {
      applyOrganHighlight(object, organCode === code)
    }
    this.selected = code
  }

  focus(code) {
    const object = this.organObjects.get(code)
    if (!object) return
    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z, 40)
    this.controls.target.copy(center)
    this.camera.position.set(center.x + radius * 1.1, center.y + radius * 2.2, center.z + radius * 1.2)
    this.controls.minDistance = radius * 0.7
    this.controls.maxDistance = radius * 12
  }

  resetView() {
    this.controls.target.set(0, 0, -30)
    this.camera.position.set(300, 1150, 480)
    this.controls.minDistance = 360
    this.controls.maxDistance = 3000
    this.controls.update()
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
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
