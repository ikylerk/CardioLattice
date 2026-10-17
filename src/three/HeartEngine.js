import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import HEART_DATA from '../data/heart-data.json'
import heartModelUrl from '../assets/heart.glb?url'

const STRUCTURE_LABELS = [
  { id: 'LV', anchor: 'point', position: [1.12, 0.24, -0.46], text: 'LV', cn: '左心室', group: 'chamber' },
  { id: 'RV', anchor: 'point', position: [-1.02, 0.22, -0.48], text: 'RV', cn: '右心室', group: 'chamber' },
  { id: 'LA', anchor: 'point', position: [0.7, 0.04, 0.82], text: 'LA', cn: '左心房', group: 'chamber' },
  { id: 'RA', anchor: 'point', position: [-0.86, 0.02, 0.74], text: 'RA', cn: '右心房', group: 'chamber' },
  { id: 'AO', anchor: 'point', position: [0.32, -0.02, 1.48], text: 'AO', cn: '主动脉', group: 'great' },
  { id: 'PT', anchor: 'point', position: [-0.5, 0.1, 1.32], text: 'PA', cn: '肺动脉', group: 'great' },
  { id: 'LCX', anchor: 'vessel', vessel: 'LCX', t: 0.5, position: [1.02, 0.22, 0.02], text: 'LCx', cn: '回旋支', group: 'coronary' },
  { id: 'RCA', anchor: 'vessel', vessel: 'RCA', t: 0.55, position: [-1.02, 0.12, -0.12], text: 'RCA', cn: '右冠状动脉', group: 'coronary' },
]

const LESIONS = [
  { vessel: 'LAD', t: 0.57, severity: 0.72, length: 18, label: 'LAD 中段', note: '70% 直径狭窄' },
  { vessel: 'RCA', t: 0.36, severity: 0.32, length: 10, label: 'RCA 近段', note: '30% 轻度狭窄' },
]

const GROUP_BASE_OPACITY = {
  all: { chamber: 1, great: 1, valve: 1, coronary: 1 },
  chamber: { chamber: 1, great: 0.2, valve: 1, coronary: 0.18 },
  coronary: { chamber: 0.1, great: 0.14, valve: 0.05, coronary: 1 },
  xray: { chamber: 0.17, great: 0.22, valve: 0.09, coronary: 1 },
}

const MATERIAL_PRESETS = {
  chamber: { color: 0xb5484d, roughness: 0.44, clearcoat: 0.36, sheen: 0.55 },
  great: { color: 0xa94c4e, roughness: 0.4, clearcoat: 0.25 },
  valve: { color: 0xe0bd94, roughness: 0.36, clearcoat: 0.16 },
  coronary: { color: 0xf4c37c, roughness: 0.3, metalness: 0.05 },
}

function makeCanvasGlow(color = 'rgba(86, 196, 197, 0.34)') {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(256, 256, 10, 256, 256, 250)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.35, 'rgba(67, 149, 156, 0.1)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export default class HeartEngine {
  constructor(container, options = {}) {
    this.container = container
    this.onSelect = options.onSelect || (() => {})
    this.onReady = options.onReady || (() => {})
    this.bpm = options.bpm || 72
    this.playing = options.playing !== false
    this.mode = 'all'
    this.layers = { chamber: true, great: true, valve: true, coronary: true }
    this.selectedId = 'LV'
    this.labelsVisible = true
    this.contextVisible = false
    this.autoRotate = false
    this.phase = 0.18
    this.disposables = []
    this.meshEntries = []
    this.vesselMeshes = []
    this.flowMaterials = []
    this.realHeartMaterials = []
    this.realHeartMeshes = []
    this.coronaryBaseMeshes = []
    this.coronaryCurves = {}
    this.lesionMarkers = []
    this.realHeart = null
    this.realHeartReady = false
    this.labelObjects = []
    this.pointerStart = null
    this.isDisposed = false

    this.initRenderer()
    this.initScene()
    this.buildEnvironment()
    this.buildBackground()
    this.buildHeart()
    this.buildContext()
    this.buildLabels()
    this.buildPostProcessing()
    this.bindEvents()
    this.applyAppearance()
    this.setSelected(this.selectedId, false)
    this.resize()
    this.clock = new THREE.Clock()
    this.animate = this.animate.bind(this)
    this.raf = requestAnimationFrame(this.animate)
    this.prepareCoronaries()
    this.onReady()
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.setClearColor(0x04080d, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'three-canvas'
    this.container.appendChild(this.renderer.domElement)

    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.domElement.className = 'label-layer'
    this.container.appendChild(this.labelRenderer.domElement)
  }

  initScene() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x04080d)
    this.scene.fog = new THREE.FogExp2(0x04080d, 0.028)
    this.camera = new THREE.PerspectiveCamera(33, 1, 0.1, 60)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(4.1, 5.9, 2.05)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, 0.12)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.055
    this.controls.rotateSpeed = 0.62
    this.controls.zoomSpeed = 0.82
    this.controls.panSpeed = 0.6
    this.controls.minDistance = 2.8
    this.controls.maxDistance = 10.5
    this.controls.autoRotateSpeed = 0.55
    this.controls.addEventListener('change', () => {
      this.labelRenderer.render(this.scene, this.camera)
    })

    this.ambient = new THREE.HemisphereLight(0x9fc4d5, 0x190407, 0.48)
    this.scene.add(this.ambient)

    const key = new THREE.DirectionalLight(0xffd6bd, 2.9)
    key.position.set(4.5, 5.2, 6.4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 18
    key.shadow.camera.left = -4
    key.shadow.camera.right = 4
    key.shadow.camera.top = 4
    key.shadow.camera.bottom = -4
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0x7bc4cb, 1.45)
    fill.position.set(-5.4, 2.4, 2.1)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0x8eaee8, 2.15)
    rim.position.set(-1.8, -5.6, 3.8)
    this.scene.add(rim)

    const sweep = new THREE.PointLight(0xffa878, 8, 8, 2)
    sweep.position.set(1.5, 2.6, -2.4)
    this.scene.add(sweep)

    this.heartRoot = new THREE.Group()
    this.scene.add(this.heartRoot)
    this.labelGroup = new THREE.Group()
    this.scene.add(this.labelGroup)
  }

  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new RoomEnvironment()
    this.envMap = pmrem.fromScene(envScene, 0.04).texture
    this.scene.environment = this.envMap
    this.scene.environmentIntensity = 0.34
    this.disposables.push(this.envMap)
    pmrem.dispose()
  }

  buildBackground() {
    const sphereGeometry = new THREE.SphereGeometry(22, 40, 32)
    const sphereMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x09131d) },
        uBottom: { value: new THREE.Color(0x020509) },
        uGlow: { value: new THREE.Color(0x123a42) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform vec3 uGlow;
        void main() {
          vec3 dir = normalize(vPos);
          float vertical = smoothstep(-0.55, 0.85, dir.z);
          vec3 color = mix(uBottom, uTop, vertical);
          float glow = pow(max(0.0, dot(dir, normalize(vec3(0.1, 0.25, 0.4)))), 5.0);
          color += uGlow * glow * 0.75;
          float horizon = exp(-pow((dir.z + 0.16) * 5.4, 2.0));
          color += uGlow * horizon * 0.24;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
    this.scene.add(new THREE.Mesh(sphereGeometry, sphereMaterial))
    this.disposables.push(sphereGeometry, sphereMaterial)

    const glowTexture = makeCanvasGlow()
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    glow.scale.set(7.5, 7.5, 1)
    glow.position.set(0.2, 0.1, -0.4)
    this.scene.add(glow)
    this.disposables.push(glowTexture)

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x58a3aa,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    for (const [inner, outer, opacity] of [
      [1.21, 1.225, 0.2],
      [1.42, 1.428, 0.1],
      [1.68, 1.685, 0.06],
    ]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), ringMaterial.clone())
      ring.material.opacity = opacity
      ring.position.z = -1.78
      this.scene.add(ring)
      this.disposables.push(ring.geometry, ring.material)
    }

    const tickMaterial = new THREE.LineBasicMaterial({ color: 0x5ea9b0, transparent: true, opacity: 0.16 })
    const points = []
    for (let i = 0; i < 64; i += 1) {
      const angle = (i / 64) * Math.PI * 2
      const inner = i % 4 === 0 ? 1.16 : 1.195
      points.push(new THREE.Vector3(Math.cos(angle) * inner, Math.sin(angle) * inner, -1.78))
      points.push(new THREE.Vector3(Math.cos(angle) * 1.225, Math.sin(angle) * 1.225, -1.78))
    }
    const tickGeometry = new THREE.BufferGeometry().setFromPoints(points)
    this.scene.add(new THREE.LineSegments(tickGeometry, tickMaterial))
    this.disposables.push(tickGeometry, tickMaterial)

    const angle = Math.random() * Math.PI * 2
    const dustCount = 420
    const dustPositions = new Float32Array(dustCount * 3)
    for (let i = 0; i < dustCount; i += 1) {
      const radius = 1.6 + Math.random() * 4.2
      const theta = Math.random() * Math.PI * 2
      const z = -1.6 + Math.random() * 4.2
      dustPositions[i * 3] = Math.cos(theta) * radius * 0.7
      dustPositions[i * 3 + 1] = Math.sin(theta) * radius * 0.55
      dustPositions[i * 3 + 2] = z
    }
    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
    const dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: 0x74b9be,
        size: 0.012,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.dust = dust
    this.scene.add(dust)
    this.disposables.push(dustGeometry, dust.material)
  }

  buildHeart() {
    const meshes = HEART_DATA.meshes
    const box = new THREE.Box3()
    for (const mesh of meshes) {
      for (let i = 0; i < mesh.x.length; i += 1) {
        box.expandByPoint(new THREE.Vector3(mesh.x[i], mesh.y[i], mesh.z[i]))
      }
    }
    const center = box.getCenter(new THREE.Vector3())
    this.modelCenter = center
    this.heartRoot.position.set(-center.x, -center.y, -center.z)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    this.anatomyRadius = sphere.radius

    for (const mesh of meshes) {
      if (mesh.group === 'coronary') continue
      const positions = new Float32Array(mesh.x.length * 3)
      for (let i = 0; i < mesh.x.length; i += 1) {
        positions[i * 3] = mesh.x[i]
        positions[i * 3 + 1] = mesh.y[i]
        positions[i * 3 + 2] = mesh.z[i]
      }
      const indices = []
      for (let i = 0; i < mesh.i.length; i += 1) indices.push(mesh.i[i], mesh.j[i], mesh.k[i])
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()

      const isValve = mesh.group === 'valve'
      const preset = MATERIAL_PRESETS[mesh.group] || MATERIAL_PRESETS.chamber
      const color = new THREE.Color(
        mesh.group === 'chamber'
          ? mesh.id === 'LA'
            ? 0xa8464b
            : mesh.id === 'RA'
              ? 0x9b4048
              : mesh.id === 'RV'
                ? 0x8e363e
                : 0x9d3c43
          : mesh.group === 'great'
            ? mesh.id.startsWith('PV')
              ? 0x76525f
              : mesh.id === 'PT' || mesh.id === 'LPA' || mesh.id === 'RPA'
                ? 0x4c6f8e
                : 0x8f4141
            : preset.color,
      )
      const material = new THREE.MeshPhysicalMaterial({
        color,
        roughness: preset.roughness,
        metalness: mesh.group === 'coronary' ? 0.16 : 0.02,
        clearcoat: preset.clearcoat,
        clearcoatRoughness: 0.32,
        sheen: mesh.group === 'chamber' ? 0.5 : 0.15,
        sheenColor: new THREE.Color(0xe7a09a),
        sheenRoughness: 0.65,
        emissive: mesh.group === 'coronary' ? new THREE.Color(0x6e3a10) : new THREE.Color(0x0e0204),
        emissiveIntensity: mesh.group === 'coronary' ? 0.16 : 0.035,
        envMapIntensity: 0.9,
        transparent: true,
        opacity: 1,
        depthWrite: true,
        side: THREE.DoubleSide,
      })

      if (mesh.group === 'chamber') {
        material.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vMusclePos;')
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n vMusclePos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
            )
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vMusclePos;')
            .replace(
              '#include <color_fragment>',
              `#include <color_fragment>
               float weave = sin(vMusclePos.z * 86.0 + sin(vMusclePos.x * 19.0 + vMusclePos.y * 11.0) * 1.8);
               float fibers = sin(vMusclePos.x * 52.0 + vMusclePos.y * 17.0 + vMusclePos.z * 12.0);
               diffuseColor.rgb *= 0.955 + weave * 0.03 + fibers * 0.018;`,
            )
        }
        material.customProgramCacheKey = () => 'cardiac-muscle-v2'
      }

      const threeMesh = new THREE.Mesh(geometry, material)
      threeMesh.userData.structureId = mesh.id
      threeMesh.userData.group = mesh.group
      threeMesh.castShadow = true
      threeMesh.receiveShadow = false
      threeMesh.renderOrder = mesh.group === 'valve' ? 2 : 1
      this.heartRoot.add(threeMesh)
      this.meshEntries.push({ mesh: threeMesh, structure: mesh, group: mesh.group })
      this.disposables.push(geometry, material)
    }

    this.heartCenterWorld = new THREE.Vector3(0, 0, 0)
  }

  async loadRealHeart() {
    try {
      const loader = new GLTFLoader()
      const gltf = await loader.loadAsync(heartModelUrl)
      if (this.isDisposed) return false
      const model = gltf.scene
      this.realHeartMeshes = []
      model.traverse((object) => {
        if (!object.isMesh) return
        const source = object.material
        const material = new THREE.MeshPhysicalMaterial({
          map: source.map,
          normalMap: source.normalMap,
          roughnessMap: source.roughnessMap,
          metalnessMap: source.metalnessMap,
          aoMap: source.aoMap,
          aoMapIntensity: 0.9,
          color: 0xffe3d9,
          roughness: 0.48,
          metalness: 0.06,
          clearcoat: 0.3,
          clearcoatRoughness: 0.44,
          sheen: 0.22,
          sheenColor: new THREE.Color(0xd97774),
          sheenRoughness: 0.7,
          normalScale: new THREE.Vector2(0.46, 0.46),
          envMapIntensity: 1.1,
          emissive: new THREE.Color(0x130203),
          emissiveIntensity: 0.12,
          transparent: true,
          opacity: 1,
          depthWrite: true,
          side: THREE.FrontSide,
        })
        object.material = material
        object.userData.realHeart = true
        object.castShadow = true
        object.receiveShadow = true
        this.realHeartMaterials.push(material)
        this.realHeartMeshes.push(object)
      })

      const align = new THREE.Group()
      align.add(model)
      const initialBox = new THREE.Box3().setFromObject(align)
      const center = initialBox.getCenter(new THREE.Vector3())
      const size = initialBox.getSize(new THREE.Vector3())
      align.position.set(-center.x, -center.y, -center.z)

      const orient = new THREE.Group()
      orient.add(align)
      orient.rotation.x = Math.PI / 2
      orient.rotation.z = -0.16

      const fit = new THREE.Group()
      fit.add(orient)
      const maxDimension = Math.max(size.x, size.y, size.z)
      fit.scale.setScalar(2.98 / maxDimension)
      fit.position.set(0, 0.02, 0.03)
      fit.rotation.x = 0.08

      this.realHeartFit = fit
      this.realHeartAlign = align
      this.realHeart = fit
      this.heartRoot.add(fit)
      this.realHeartReady = true
      this.heartRoot.updateMatrixWorld(true)
      return true
    } catch (error) {
      console.warn('[HeartEngine] realistic heart unavailable, using procedural model', error)
      return false
    }
  }

  async prepareCoronaries() {
    let ready = false
    try {
      ready = await this.loadRealHeart()
    } catch (error) {
      console.warn('[HeartEngine] realistic heart preparation failed', error)
    }
    if (this.isDisposed) return
    this.heartRoot.updateMatrixWorld(true)
    this.coronaryCurves = this.buildCoronaryCurves(ready)
    this.buildCoronaryTree()
    this.buildVesselLabels()
    this.applyAppearance()
    this.setSelected(this.selectedId, false)
  }

  buildCoronaryCurves(snapToSurface) {
    const curves = {}
    const raycaster = new THREE.Raycaster()
    raycaster.far = 9
    for (const vessel of HEART_DATA.vessels) {
      let points = vessel.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      if (snapToSurface && this.realHeartMeshes.length) {
        const snapped = points.map((point) => {
          const direction = new THREE.Vector3(point.x, point.y, 0)
          if (direction.lengthSq() < 0.0001) direction.set(0, 1, 0)
          direction.normalize()
          const origin = direction.clone().multiplyScalar(3.6)
          origin.z = point.z
          raycaster.set(origin, new THREE.Vector3(-direction.x, -direction.y, 0))
          const hits = raycaster.intersectObjects(this.realHeartMeshes, true)
          if (!hits.length) return point.clone()
          const hit = hits[0]
          if (!hit.face) return point.clone()
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
          const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()
          const worldPoint = hit.point.clone().addScaledVector(normal, 0.016)
          return this.heartRoot.worldToLocal(worldPoint)
        })
        for (let pass = 0; pass < 2; pass += 1) {
          const smoothed = snapped.map((point, index) => {
            if (index === 0 || index === snapped.length - 1) return point.clone()
            return snapped[index - 1]
              .clone()
              .addScaledVector(point, 2)
              .add(snapped[index + 1])
              .multiplyScalar(0.25)
          })
          snapped.splice(0, snapped.length, ...smoothed)
        }
        points = snapped
      }
      curves[vessel.id] = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35)
    }
    return curves
  }

  buildCoronaryTree() {
    this.lesionMarkers = []
    for (const vessel of HEART_DATA.vessels) {
      const curve = this.coronaryCurves[vessel.id]
      if (!curve) continue

      const isMain = ['LM', 'LAD', 'LCX', 'RCA', 'PDA'].includes(vessel.id)
      const baseGeometry = this.buildVariableTube(curve, vessel, 160, 12, 0.8)
      const baseMaterial = new THREE.MeshPhysicalMaterial({
        color: isMain ? 0xe2ae6a : 0xa9764a,
        roughness: 0.4,
        metalness: 0.14,
        clearcoat: 0.22,
        clearcoatRoughness: 0.55,
        emissive: new THREE.Color(isMain ? 0x5b2d08 : 0x2f1805),
        emissiveIntensity: isMain ? 0.2 : 0.1,
        envMapIntensity: 0.9,
        transparent: true,
        opacity: 1,
        depthWrite: true,
      })
      const base = new THREE.Mesh(baseGeometry, baseMaterial)
      base.userData.structureId = vessel.id
      base.userData.group = 'coronary'
      base.userData.coronaryId = vessel.id
      base.renderOrder = 3
      this.heartRoot.add(base)
      this.coronaryBaseMeshes.push(base)
      this.meshEntries.push({
        mesh: base,
        structure: { id: vessel.id, group: 'coronary', name: vessel.name, en: vessel.name },
        group: 'coronary',
      })
      this.disposables.push(baseGeometry, baseMaterial)

      const flowGeometry = this.buildVariableTube(curve, vessel, 160, 10, 0.95)
      const flowMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: vessel.points.length * 0.17 },
          uOffset: { value: vessel.points.length / 50 },
          uColor: { value: new THREE.Color(0xffd9a2) },
          uOpacity: { value: 1 },
        },
        vertexShader: `
          attribute float aT;
          varying float vT;
          varying vec3 vNormalView;
          void main() {
            vT = aT;
            vNormalView = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uOffset;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vT;
          varying vec3 vNormalView;
          void main() {
            float head = fract(uTime * 0.14 + uOffset);
            float dist = abs(vT - head);
            dist = min(dist, 1.0 - dist);
            float pulse = smoothstep(0.13, 0.0, dist);
            float rim = pow(1.0 - abs(vNormalView.z), 1.6);
            float alpha = pulse * (0.36 + rim * 0.64) * uOpacity;
            gl_FragColor = vec4(uColor * (0.8 + pulse * 0.7), alpha);
          }
        `,
      })
      const flow = new THREE.Mesh(flowGeometry, flowMaterial)
      flow.userData.structureId = vessel.id
      flow.userData.group = 'coronary-flow'
      flow.userData.coronaryId = vessel.id
      flow.renderOrder = 4
      this.heartRoot.add(flow)
      this.flowMaterials.push(flowMaterial)
      this.meshEntries.push({
        mesh: flow,
        structure: { id: vessel.id, group: 'coronary-flow', name: vessel.name },
        group: 'coronary-flow',
      })
      this.disposables.push(flowGeometry, flowMaterial)

      for (const lesion of LESIONS.filter((item) => item.vessel === vessel.id)) {
        const anchor = curve.getPointAt(lesion.t)
        const tangent = curve.getTangentAt(lesion.t).normalize()
        const marker = new THREE.Group()
        const torusMaterial = new THREE.MeshBasicMaterial({
          color: 0xffd79a,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
        for (const offset of [-0.012, 0, 0.012]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(vessel.width * 0.7, 0.0022, 6, 28), torusMaterial)
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent)
          ring.position.copy(anchor).addScaledVector(tangent, offset)
          marker.add(ring)
        }
        marker.userData.structureId = vessel.id
        this.heartRoot.add(marker)
        this.lesionMarkers.push({ group: marker, vessel, lesion, anchor, tangent })
        this.disposables.push(torusMaterial)
      }
    }
  }

  buildVesselLabels() {
    for (const item of STRUCTURE_LABELS.filter((label) => label.anchor === 'vessel')) {
      const curve = this.coronaryCurves[item.vessel]
      if (!curve) continue
      const position = item.position
        ? new THREE.Vector3(...item.position)
        : curve.getPointAt(item.t).clone().add(curve.getPointAt(item.t).clone().normalize().multiplyScalar(0.035))
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `scene-label scene-label-${item.group}${position.x > 0.08 ? ' flip' : ''}`
      element.innerHTML = `<span class="label-line"></span><span class="label-card"><b>${item.text}</b><small>${item.cn}</small></span>`
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        this.setSelected(item.id)
        this.onSelect(item.id)
      })
      const object = new CSS2DObject(element)
      object.position.copy(position).sub(this.modelCenter)
      this.labelGroup.add(object)
      this.labelObjects.push({ object, item, element })
    }

    for (const marker of this.lesionMarkers) {
      if (marker.lesion.severity < 0.5) continue
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `scene-label scene-label-lesion${marker.anchor.x > 0 ? ' flip' : ''}`
      element.innerHTML = `<span class="label-line"></span><span class="label-card"><b>${Math.round(marker.lesion.severity * 100)}%</b><small>${marker.lesion.label}</small></span>`
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        this.setSelected(marker.vessel.id)
        this.onSelect(marker.vessel.id)
      })
      const object = new CSS2DObject(element)
      const anchor = marker.anchor.clone().add(marker.anchor.clone().normalize().multiplyScalar(0.04))
      object.position.copy(anchor).sub(this.modelCenter)
      this.labelGroup.add(object)
      this.labelObjects.push({ object, item: { group: 'lesion', id: marker.vessel.id }, element })
    }
  }

  buildCoronaryFlow() {
    this.lesionMarkers = []
    for (const vessel of HEART_DATA.vessels) {
      const points = vessel.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35)

      for (const lesion of LESIONS.filter((item) => item.vessel === vessel.id)) {
        const anchor = curve.getPointAt(lesion.t)
        const tangent = curve.getTangentAt(lesion.t).normalize()
        const marker = new THREE.Group()
        const torusMaterial = new THREE.MeshBasicMaterial({
          color: 0xffd79a,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
        for (const offset of [-0.012, 0, 0.012]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(vessel.width * 0.72, 0.0022, 6, 28), torusMaterial)
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent)
          ring.position.copy(anchor).addScaledVector(tangent, offset)
          marker.add(ring)
        }
        marker.userData.structureId = vessel.id
        this.heartRoot.add(marker)
        this.lesionMarkers.push({ group: marker, vessel, lesion, anchor, tangent })
      }

      const flowGeometry = this.buildVariableTube(curve, vessel, 150, 10)
      const flowMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: Math.random() * 6 },
          uOffset: { value: Math.random() },
          uColor: { value: new THREE.Color(0xffd39a) },
          uOpacity: { value: 1 },
        },
        vertexShader: `
          attribute float aT;
          varying float vT;
          varying vec3 vNormalView;
          void main() {
            vT = aT;
            vNormalView = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uOffset;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vT;
          varying vec3 vNormalView;
          void main() {
            float head = fract(uTime * 0.14 + uOffset);
            float dist = abs(vT - head);
            dist = min(dist, 1.0 - dist);
            float pulse = smoothstep(0.12, 0.0, dist);
            float rim = pow(1.0 - abs(vNormalView.z), 1.6);
            float alpha = pulse * (0.32 + rim * 0.68) * uOpacity;
            gl_FragColor = vec4(uColor * (0.8 + pulse * 0.6), alpha);
          }
        `,
      })
      const flow = new THREE.Mesh(flowGeometry, flowMaterial)
      flow.userData.structureId = vessel.id
      flow.renderOrder = 4
      this.heartRoot.add(flow)
      this.flowMaterials.push(flowMaterial)
      this.meshEntries.push({ mesh: flow, structure: { id: vessel.id, group: 'coronary', name: vessel.name }, group: 'coronary-flow' })
      this.disposables.push(flowGeometry, flowMaterial)
    }

    // Track vessel materials for visibility and highlight.
    for (const entry of this.meshEntries) {
      if (entry.structure.group === 'coronary') entry.mesh.userData.group = 'coronary'
    }
  }

  buildVariableTube(curve, vessel, segments = 110, radialSegments = 10, radiusScale = 1) {
    const frames = curve.computeFrenetFrames(segments, false)
    const positions = []
    const normals = []
    const uv = []
    const ts = []
    const indices = []
    const lesions = LESIONS.filter((item) => item.vessel === vessel.id)

    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments
      const point = curve.getPointAt(t)
      let radius = vessel.width * (1.0 - 0.14 * t)
      for (const lesion of lesions) {
        const distance = Math.abs(t - lesion.t)
        if (distance < 0.08) {
          const falloff = Math.exp(-Math.pow(distance / 0.026, 2) * 2.3)
          radius *= 1 - lesion.severity * falloff
        }
      }
      radius = Math.max(radius, vessel.width * 0.16) * radiusScale
      for (let j = 0; j <= radialSegments; j += 1) {
        const v = j / radialSegments
        const angle = v * Math.PI * 2
        const sin = Math.sin(angle)
        const cos = -Math.cos(angle)
        const normal = new THREE.Vector3()
        normal.x = cos * frames.normals[i].x + sin * frames.binormals[i].x
        normal.y = cos * frames.normals[i].y + sin * frames.binormals[i].y
        normal.z = cos * frames.normals[i].z + sin * frames.binormals[i].z
        normal.normalize()
        positions.push(point.x + radius * normal.x, point.y + radius * normal.y, point.z + radius * normal.z)
        normals.push(normal.x, normal.y, normal.z)
        uv.push(v, t)
        ts.push(t)
      }
    }
    for (let i = 0; i < segments; i += 1) {
      for (let j = 0; j < radialSegments; j += 1) {
        const a = i * (radialSegments + 1) + j
        const b = a + radialSegments + 1
        indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geometry.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1))
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()
    return geometry
  }

  buildContext() {
    this.contextGroup = new THREE.Group()
    this.contextGroup.position.copy(this.heartRoot.position)
    this.contextGroup.visible = this.contextVisible
    this.scene.add(this.contextGroup)

    const ribMaterial = new THREE.MeshStandardMaterial({
      color: 0x93a3ad,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    for (let level = 0; level < 8; level += 1) {
      const z = -1.05 + level * 0.27
      for (const side of [-1, 1]) {
        const pts = [
          new THREE.Vector3(side * 0.08, -0.68, z - 0.05),
          new THREE.Vector3(side * 0.55, -0.52, z + 0.01),
          new THREE.Vector3(side * 0.94, -0.08, z + 0.09),
          new THREE.Vector3(side * 0.83, 0.35, z + 0.1),
          new THREE.Vector3(side * 0.38, 0.58, z + 0.02),
          new THREE.Vector3(side * 0.06, 0.64, z - 0.04),
        ]
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
        const geometry = new THREE.TubeGeometry(curve, 48, 0.019, 5, false)
        const rib = new THREE.Mesh(geometry, ribMaterial)
        this.contextGroup.add(rib)
        this.disposables.push(geometry)
      }
    }

    const sternumGeometry = new THREE.BoxGeometry(0.09, 0.05, 1.95)
    const sternum = new THREE.Mesh(sternumGeometry, ribMaterial)
    sternum.position.set(0, 0.66, -0.04)
    sternum.rotation.x = 0.04
    this.contextGroup.add(sternum)
    this.disposables.push(sternumGeometry)

    const spineGeometry = new THREE.CylinderGeometry(0.075, 0.075, 2.2, 12)
    for (let i = 0; i < 11; i += 1) {
      const vertebra = new THREE.Mesh(spineGeometry, ribMaterial)
      vertebra.position.set(0, -0.68, -1.08 + i * 0.2)
      vertebra.rotation.x = Math.PI / 2
      this.contextGroup.add(vertebra)
    }
    this.disposables.push(spineGeometry)

    const lungMaterial = new THREE.MeshBasicMaterial({
      color: 0x5d8e9c,
      transparent: true,
      opacity: 0.028,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    for (const side of [-1, 1]) {
      const lungGeometry = new THREE.SphereGeometry(1, 32, 24)
      const lung = new THREE.Mesh(lungGeometry, lungMaterial)
      lung.scale.set(0.48, 0.39, 1.02)
      lung.position.set(side * 0.55, -0.02, 0.1)
      this.contextGroup.add(lung)
      this.disposables.push(lungGeometry)
    }
    this.disposables.push(ribMaterial, lungMaterial)
  }

  buildLabels() {
    for (const item of STRUCTURE_LABELS) {
      if (item.anchor === 'vessel') continue
      let position
      if (item.anchor === 'mesh') {
        const mesh = HEART_DATA.meshes.find((entry) => entry.id === item.id)
        if (!mesh) continue
        let bestY = -Infinity
        let index = 0
        for (let i = 0; i < mesh.x.length; i += 1) {
          if (mesh.y[i] > bestY) {
            bestY = mesh.y[i]
            index = i
          }
        }
        position = new THREE.Vector3(mesh.x[index], mesh.y[index] + 0.03, mesh.z[index])
      } else if (item.anchor === 'point') {
        position = new THREE.Vector3(...item.position)
      }
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `scene-label scene-label-${item.group}${position.x > 0.08 ? ' flip' : ''}`
      element.innerHTML = `<span class="label-line"></span><span class="label-card"><b>${item.text}</b><small>${item.cn}</small></span>`
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        this.setSelected(item.id)
        this.onSelect(item.id)
      })
      const object = new CSS2DObject(element)
      object.position.copy(position).sub(this.modelCenter)
      this.labelGroup.add(object)
      this.labelObjects.push({ object, item, element })
    }
  }

  buildPostProcessing() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)

    this.outlinePass = new OutlinePass(new THREE.Vector2(1, 1), this.scene, this.camera)
    this.outlinePass.edgeStrength = 5.2
    this.outlinePass.edgeGlow = 0.55
    this.outlinePass.edgeThickness = 1.8
    this.outlinePass.visibleEdgeColor.set('#7be5da')
    this.outlinePass.hiddenEdgeColor.set('#1b5054')
    this.composer.addPass(this.outlinePass)

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.55, 0.9)
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(new OutputPass())
  }

  bindEvents() {
    this.onPointerDown = (event) => {
      this.pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() }
    }
    this.onPointerUp = (event) => {
      if (!this.pointerStart) return
      const dx = event.clientX - this.pointerStart.x
      const dy = event.clientY - this.pointerStart.y
      const duration = performance.now() - this.pointerStart.time
      this.pointerStart = null
      if (dx * dx + dy * dy > 36 || duration > 700) return
      this.pick(event)
    }
    this.onPointerMove = (event) => {
      if (event.buttons) return
      const now = performance.now()
      if (this.lastHover && now - this.lastHover < 90) return
      this.lastHover = now
      const hit = this.raycast(event)
      this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab'
    }
    this.onResize = () => this.resize()
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(this.container)
  }

  getStructureAnchor(id) {
    if (['LV', 'RV', 'LA', 'RA', 'AO', 'PT'].includes(id)) {
      const mesh = HEART_DATA.meshes.find((entry) => entry.id === id)
      if (mesh) {
        const center = new THREE.Vector3()
        const count = Math.min(mesh.x.length, 600)
        for (let i = 0; i < count; i += 1) {
          center.x += mesh.x[i]
          center.y += mesh.y[i]
          center.z += mesh.z[i]
        }
        return center.multiplyScalar(1 / count)
      }
    }
    const item = STRUCTURE_LABELS.find((label) => label.id === id)
    if (!item) return new THREE.Vector3()
    if (item.anchor === 'vessel' && this.coronaryCurves[item.vessel]) {
      return this.coronaryCurves[item.vessel].getPointAt(item.t).clone()
    }
    return new THREE.Vector3(...(item.position || [0, 0, 0]))
  }

  getNearestStructure(worldPoint) {
    const local = this.heartRoot.worldToLocal(worldPoint.clone())
    let nearest = 'LV'
    let best = Infinity
    for (const id of ['LV', 'RV', 'LA', 'RA', 'AO', 'PT']) {
      const distance = this.getStructureAnchor(id).distanceToSquared(local)
      if (distance < best) {
        best = distance
        nearest = id
      }
    }
    return nearest
  }

  raycast(event) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster = this.raycaster || new THREE.Raycaster()
    this.raycaster.setFromCamera(this.pointer, this.camera)

    if (this.mode === 'all' && this.realHeartReady) {
      const targets = [...this.coronaryBaseMeshes, ...this.realHeartMeshes]
      const hits = this.raycaster.intersectObjects(targets, true)
      for (const hit of hits) {
        if (hit.object.userData.coronaryId) {
          return { object: hit.object, structureId: hit.object.userData.coronaryId, point: hit.point }
        }
        if (hit.object.userData.realHeart) {
          return { object: hit.object, structureId: this.getNearestStructure(hit.point), point: hit.point }
        }
      }
      return null
    }

    const targets = this.meshEntries
      .filter(
        (entry) =>
          entry.mesh.visible &&
          entry.structure.group !== 'coronary-flow' &&
          (entry.mesh.material?.opacity ?? 1) > 0.08 &&
          this.layers[entry.structure.group] !== false,
      )
      .map((entry) => entry.mesh)
    const hits = this.raycaster.intersectObjects(targets, false)
    const hit = hits[0]
    if (!hit) return null
    const entry = this.meshEntries.find((item) => item.mesh === hit.object)
    return entry ? { object: hit.object, structureId: entry.structure.id, point: hit.point } : null
  }

  pick(event) {
    const hit = this.raycast(event)
    if (!hit) return
    this.setSelected(hit.structureId)
    this.onSelect(hit.structureId)
  }

  setSelected(id, notify = true) {
    this.selectedId = id
    const target =
      this.meshEntries.find((entry) => entry.structure.id === id && entry.mesh.userData.group !== 'coronary-flow')?.mesh ||
      this.meshEntries.find((entry) => entry.structure.id === id)?.mesh ||
      null
    this.outlinePass.selectedObjects = target ? [target] : []
    for (const label of this.labelObjects) {
      label.element.classList.toggle('active', label.item.id === id)
    }
    if (notify) this.onSelect(id)
  }

  setMode(mode) {
    this.mode = mode
    this.applyAppearance()
  }

  setLayer(group, visible) {
    this.layers[group] = visible
    this.applyAppearance()
  }

  setLabelsVisible(visible) {
    this.labelsVisible = visible
    this.labelRenderer.domElement.style.display = visible ? '' : 'none'
    this.applyAppearance()
  }

  setContextVisible(visible) {
    this.contextVisible = visible
    this.contextGroup.visible = visible
  }

  setAutoRotate(value) {
    this.autoRotate = value
    this.controls.autoRotate = value
  }

  setCardiac(bpm, playing) {
    this.bpm = bpm
    this.playing = playing
  }

  applyAppearance() {
    const realOpacity = { all: 1, chamber: 0, coronary: 0.1, xray: 0.24 }[this.mode] ?? 1
    for (const entry of this.meshEntries) {
      const group = entry.structure.group === 'coronary-flow' ? 'coronary' : entry.structure.group
      let opacity = 1
      if (this.realHeartReady) {
        if (this.mode === 'all') {
          opacity = group === 'coronary' ? 1 : 0
        } else if (this.mode === 'chamber') {
          opacity = { chamber: 0.97, great: 0.16, valve: 0.84, coronary: 0.07 }[group] ?? 0
        } else if (this.mode === 'coronary') {
          opacity = { chamber: 0, great: 0, valve: 0.02, coronary: 1 }[group] ?? 0
        } else if (this.mode === 'xray') {
          opacity = { chamber: 0, great: 0.02, valve: 0.08, coronary: 1 }[group] ?? 0
        }
      }
      if (this.layers[group] === false) opacity = 0
      entry.mesh.visible = opacity > 0.001
      if (entry.structure.group === 'coronary-flow') {
        entry.mesh.material.uniforms.uOpacity.value = Math.min(1, opacity)
        continue
      }
      const material = entry.mesh.material
      material.opacity = opacity
      const transparent = opacity < 0.995
      if (material.transparent !== transparent) {
        material.transparent = transparent
        material.needsUpdate = true
      }
      material.depthWrite = opacity > 0.55
      if (entry.structure.group === 'coronary') {
        material.emissiveIntensity = this.mode === 'coronary' ? 0.3 : this.mode === 'chamber' ? 0.08 : 0.16
      }
    }
    if (this.realHeartMaterials.length) {
      const realVisible = this.layers.chamber !== false && this.mode !== 'chamber'
      this.realHeart.visible = realVisible
      for (const material of this.realHeartMaterials) {
        material.opacity = realOpacity
        material.transparent = realOpacity < 0.995
        material.depthWrite = realOpacity > 0.6
        material.needsUpdate = true
      }
    }
    for (const label of this.labelObjects) {
      let visible = this.labelsVisible
      if (this.mode === 'chamber' && label.item.group === 'great') visible = false
      if ((this.mode === 'coronary' || this.mode === 'xray') && !['coronary', 'lesion'].includes(label.item.group)) visible = false
      label.element.style.display = visible ? '' : 'none'
    }
    for (const marker of this.lesionMarkers) {
      marker.group.visible = this.layers.coronary !== false && this.mode !== 'chamber'
    }
  }

  resetCamera() {
    this.camera.position.set(3.95, 5.65, 1.95)
    this.controls.target.set(0, 0, -0.08)
    this.controls.update()
  }

  resize() {
    if (!this.renderer || this.isDisposed) return
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(2, Math.round(rect.width))
    const height = Math.max(2, Math.round(rect.height))
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.composer.setSize(width, height)
    this.labelRenderer.setSize(width, height)
    this.outlinePass.resolution.set(width, height)
  }

  exportImage() {
    this.composer.render()
    return this.renderer.domElement.toDataURL('image/png')
  }

  animate() {
    if (this.isDisposed) return
    this.raf = requestAnimationFrame(this.animate)
    const delta = Math.min(0.05, this.clock.getDelta())
    if (this.playing) this.phase = (this.phase + delta * (this.bpm / 60)) % 1

    const systole = Math.exp(-Math.pow((this.phase - 0.26) / 0.085, 2))
    const atrial = Math.exp(-Math.pow((this.phase - 0.92) / 0.06, 2))
    const scale = 1 - systole * 0.012 - atrial * 0.0025
    this.heartRoot.scale.setScalar(scale)
    this.heartRoot.position.z = -this.modelCenter.z + systole * 0.006

    for (const material of this.flowMaterials) {
      material.uniforms.uTime.value += delta
    }
    if (this.dust) {
      this.dust.rotation.z += delta * 0.012
      this.dust.material.opacity = 0.26 + Math.sin(this.clock.elapsedTime * 0.5) * 0.06
    }
    for (const marker of this.lesionMarkers) {
      marker.group.children.forEach((ring, index) => {
        ring.material.opacity = 0.5 + Math.sin(this.clock.elapsedTime * 2 + index) * 0.18
      })
    }

    this.controls.autoRotate = this.autoRotate
    this.controls.update()
    this.composer.render(delta)
    this.labelRenderer.render(this.scene, this.camera)
  }

  dispose() {
    this.isDisposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.controls.dispose()
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
    this.composer.dispose()
    this.renderer.dispose()
    this.envMap?.dispose()
    this.renderer.domElement.remove()
    this.labelRenderer.domElement.remove()
  }
}
