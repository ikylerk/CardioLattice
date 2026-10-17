import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import HEART_DATA from '../data/heart-data.json'

const LEFT = ['LM', 'LAD', 'LCX', 'D1', 'D2', 'OM1', 'OM2']
const RIGHT = ['RCA', 'AM', 'PDA', 'PL']
const PHASES = {
  LM: 0,
  LAD: 0.04,
  LCX: 0.05,
  RCA: 0,
  D1: 0.22,
  D2: 0.32,
  OM1: 0.24,
  OM2: 0.34,
  AM: 0.24,
  PDA: 0.34,
  PL: 0.4,
  LPDA: 0.4,
}
const FRAMES = {
  left: { center: new THREE.Vector3(0.42, 0.32, -0.27), view: 2.18 },
  right: { center: new THREE.Vector3(-0.43, 0.2, -0.29), view: 2.3 },
  both: { center: new THREE.Vector3(0.04, 0.28, -0.2), view: 2.85 },
}
const LESION = { vessel: 'LAD', t: 0.57, severity: 0.72 }

export default class AngioEngine {
  constructor(container, options = {}) {
    this.container = container
    this.onReady = options.onReady || (() => {})
    this.rot = options.rot ?? 30
    this.tilt = options.tilt ?? 30
    this.currentRot = this.rot
    this.currentTilt = this.tilt
    this.side = options.side || 'left'
    this.mode = options.mode || 'fluoro'
    this.playing = options.playing !== false
    this.labelsVisible = true
    this.qcaVisible = false
    this.fill = 0.4
    this.cycle = 1.1
    this.bpm = 72
    this.groups = {}
    this.derivedIds = { left: [], right: [] }
    this.vesselMaterials = []
    this.boneMaterials = []
    this.disposed = false
    this.clock = new THREE.Clock()
    this.phase = 0.2

    this.initRenderer()
    this.initScene()
    this.buildVesselTree()
    this.buildBones()
    this.buildCatheter()
    this.buildLabels()
    this.buildQcaOverlay()
    this.buildPostProcessing()
    this.resize()
    this.applySide()
    this.applyMode()
    this.animate = this.animate.bind(this)
    this.raf = requestAnimationFrame(this.animate)
    this.onReady()
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.domElement.className = 'three-canvas angio-canvas'
    this.container.appendChild(this.renderer.domElement)

    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.domElement.className = 'angio-label-layer'
    this.container.appendChild(this.labelRenderer.domElement)
  }

  initScene() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000000)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30)
    this.camera.up.set(0, 0, 1)
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    })
  }

  buildVesselTree() {
    this.treeRoot = new THREE.Group()
    this.scene.add(this.treeRoot)
    for (const vessel of HEART_DATA.vessels) {
      const points = vessel.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      const smoothPoints = points.map((point) => point.clone())
      for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 1; i < smoothPoints.length - 1; i += 1) {
          smoothPoints[i].copy(
            points[i].clone().multiplyScalar(0.5)
              .add(points[i - 1].clone().multiplyScalar(0.25))
              .add(points[i + 1].clone().multiplyScalar(0.25)),
          )
        }
      }
      const curve = new THREE.CatmullRomCurve3(smoothPoints, false, 'centripetal', 0.35)
      const geometry = this.buildTube(curve, vessel, 150, 8)
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uFill: { value: 0.4 },
          uPhase: { value: PHASES[vessel.id] ?? 0.1 },
          uOpacity: { value: 1 },
          uColor: { value: new THREE.Color(0xffffff) },
        },
        vertexShader: `
          attribute float aT;
          varying float vT;
          varying vec3 vN;
          void main() {
            vT = aT;
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uFill;
          uniform float uPhase;
          uniform float uOpacity;
          uniform vec3 uColor;
          varying float vT;
          varying vec3 vN;
          void main() {
            float local = clamp((uFill - uPhase) / max(0.0001, 1.0 - uPhase), 0.0, 1.0);
            float reveal = smoothstep(0.0, 0.012, local - vT);
            float head = smoothstep(0.085, 0.0, abs(vT - local)) * (1.0 - step(0.998, local));
            float facing = pow(clamp(abs(vN.z), 0.0, 1.0), 0.5);
            float alpha = reveal * (0.24 + facing * 0.36 + head * 0.7) * uOpacity;
            vec3 color = uColor * (0.68 + facing * 0.25 + head * 0.9);
            gl_FragColor = vec4(color, alpha);
          }
        `,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData.vesselId = vessel.id
      mesh.renderOrder = 2
      this.treeRoot.add(mesh)
      this.vesselMaterials.push(material)
      const group = new THREE.Group()
      // Groups are logical only; visibility is controlled on meshes.
      this.groups[vessel.id] = { mesh, group, material }
      this.meshByVessel = this.meshByVessel || {}
      this.meshByVessel[vessel.id] = mesh
      const branch = !['LM', 'LAD', 'LCX', 'RCA'].includes(vessel.id)
      material.uniforms.uOpacity.value = branch ? 0.9 : 1.15
    }

    const branchSpecs = [
      { parent: 'LAD', side: 'left', ts: [0.28, 0.44, 0.61, 0.76], length: 0.36, width: 0.009, dz: -0.18 },
      { parent: 'LAD', side: 'left', ts: [0.35, 0.53, 0.7], length: 0.19, width: 0.006, dz: -0.08 },
      { parent: 'LCX', side: 'left', ts: [0.34, 0.52, 0.7], length: 0.28, width: 0.008, dz: -0.1 },
      { parent: 'RCA', side: 'right', ts: [0.3, 0.48, 0.63, 0.78], length: 0.27, width: 0.008, dz: -0.12 },
    ]
    const up = new THREE.Vector3(0, 0, 1)
    for (const spec of branchSpecs) {
      const parentEntry = this.groups[spec.parent]
      if (!parentEntry) continue
      const parentData = HEART_DATA.vessels.find((item) => item.id === spec.parent)
      const parentCurve = new THREE.CatmullRomCurve3(
        parentData.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
        false,
        'centripetal',
      )
      spec.ts.forEach((t, index) => {
        const point = parentCurve.getPointAt(t)
        const tangent = parentCurve.getTangentAt(t).normalize()
        const lateral = new THREE.Vector3().crossVectors(tangent, up)
        if (lateral.lengthSq() < 0.001) lateral.set(1, 0, 0)
        lateral.normalize().multiplyScalar(index % 2 === 0 ? 1 : -1)
        const direction = lateral
          .clone()
          .addScaledVector(tangent, 0.2)
          .add(new THREE.Vector3(0, 0, spec.dz))
          .normalize()
        const points = [
          point.clone(),
          point.clone().addScaledVector(direction, spec.length * 0.36),
          point.clone().addScaledVector(direction, spec.length * 0.68).addScaledVector(tangent, 0.025),
          point.clone().addScaledVector(direction, spec.length).addScaledVector(tangent, 0.04),
        ]
        const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
        const id = `${spec.parent}-b${index}`
        const geometry = this.buildTube(curve, { id, width: spec.width }, 54, 5)
        const mesh = new THREE.Mesh(geometry, parentEntry.material)
        mesh.renderOrder = 2
        mesh.visible = false
        this.treeRoot.add(mesh)
        this.groups[id] = { mesh, material: parentEntry.material }
        this.derivedIds[spec.side].push(id)
      })
    }
  }

  buildTube(curve, vessel, segments = 130, radialSegments = 6) {
    const frames = curve.computeFrenetFrames(segments, false)
    const positions = []
    const normals = []
    const ts = []
    const indices = []
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments
      const point = curve.getPointAt(t)
      let radius = vessel.width * 0.68 * (1 - 0.12 * t)
      if (vessel.id === LESION.vessel) {
        const distance = Math.abs(t - LESION.t)
        if (distance < 0.075) {
          radius *= 1 - LESION.severity * Math.exp(-Math.pow(distance / 0.024, 2) * 2.4)
        }
      }
      radius = Math.max(radius, vessel.width * 0.2)
      for (let j = 0; j <= radialSegments; j += 1) {
        const v = j / radialSegments
        const angle = v * Math.PI * 2
        const sin = Math.sin(angle)
        const cos = -Math.cos(angle)
        const normal = new THREE.Vector3(
          cos * frames.normals[i].x + sin * frames.binormals[i].x,
          cos * frames.normals[i].y + sin * frames.binormals[i].y,
          cos * frames.normals[i].z + sin * frames.binormals[i].z,
        ).normalize()
        positions.push(point.x + normal.x * radius, point.y + normal.y * radius, point.z + normal.z * radius)
        normals.push(normal.x, normal.y, normal.z)
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
    geometry.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1))
    geometry.setIndex(indices)
    return geometry
  }

  buildBones() {
    this.boneGroup = new THREE.Group()
    this.scene.add(this.boneGroup)
    const boneMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.boneMaterials.push(boneMaterial)

    for (let level = 0; level < 8; level += 1) {
      const z = -1.15 + level * 0.28
      for (const side of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.05, -0.78, z - 0.04),
          new THREE.Vector3(side * 0.55, -0.64, z),
          new THREE.Vector3(side * 1.02, -0.16, z + 0.1),
          new THREE.Vector3(side * 0.95, 0.38, z + 0.1),
          new THREE.Vector3(side * 0.42, 0.7, z),
          new THREE.Vector3(side * 0.06, 0.74, z - 0.03),
        ])
        const geometry = new THREE.TubeGeometry(curve, 44, 0.016, 4, false)
        this.boneGroup.add(new THREE.Mesh(geometry, boneMaterial))
      }
    }
    const spineGeometry = new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8)
    for (let i = 0; i < 11; i += 1) {
      const vertebra = new THREE.Mesh(spineGeometry, boneMaterial)
      vertebra.rotation.x = Math.PI / 2
      vertebra.position.set(0, -0.78, -1.1 + i * 0.2)
      this.boneGroup.add(vertebra)
    }
    const sternumGeometry = new THREE.BoxGeometry(0.08, 0.04, 1.8)
    const sternum = new THREE.Mesh(sternumGeometry, boneMaterial)
    sternum.position.set(0, 0.72, -0.05)
    this.boneGroup.add(sternum)

    const diaphragm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.5, 0, -1.5),
      new THREE.Vector3(-0.7, 0.15, -1.2),
      new THREE.Vector3(0, 0.2, -1.12),
      new THREE.Vector3(0.7, 0.15, -1.2),
      new THREE.Vector3(1.5, 0, -1.5),
    ])
    this.diaphragm = new THREE.Mesh(new THREE.TubeGeometry(diaphragm, 50, 0.014, 4, false), boneMaterial)
    this.boneGroup.add(this.diaphragm)
  }

  buildCatheter() {
    const catheterCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.62, -0.32, -1.52),
      new THREE.Vector3(-0.38, -0.16, -0.92),
      new THREE.Vector3(-0.16, 0.02, -0.24),
      new THREE.Vector3(0.02, 0.22, 0.35),
      new THREE.Vector3(0.1, 0.31, 0.52),
    ])
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.catheter = new THREE.Mesh(new THREE.TubeGeometry(catheterCurve, 80, 0.0075, 5, false), material)
    this.catheter.renderOrder = 3
    this.scene.add(this.catheter)

    const lad = HEART_DATA.vessels.find((v) => v.id === 'LAD')
    const points = lad.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    const wireCurve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    const wirePoints = wireCurve.getPoints(40).filter((point, index) => index < 32)
    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePoints), 100, 0.0038, 4, false),
      material.clone(),
    )
    wire.material.opacity = 0.8
    wire.renderOrder = 3
    this.scene.add(wire)
    this.boneMaterials.push(material, wire.material)
  }

  buildLabels() {
    const defs = [
      { vessel: 'LM', t: 0.3, text: 'LM' },
      { vessel: 'LAD', t: 0.4, text: 'LAD' },
      { vessel: 'LCX', t: 0.5, text: 'LCx' },
      { vessel: 'RCA', t: 0.48, text: 'RCA' },
      { vessel: 'PDA', t: 0.55, text: 'PDA' },
    ]
    this.angioLabels = []
    for (const def of defs) {
      const vessel = HEART_DATA.vessels.find((item) => item.id === def.vessel)
      if (!vessel) continue
      const curve = new THREE.CatmullRomCurve3(vessel.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])))
      const anchor = curve.getPointAt(def.t)
      const element = document.createElement('div')
      element.className = 'angio-label'
      element.innerHTML = `<i></i><span>${def.text}</span>`
      const object = new CSS2DObject(element)
      object.position.copy(anchor).add(new THREE.Vector3(0, 0.02, 0.03))
      this.scene.add(object)
      this.angioLabels.push({ object, element, vessel: def.vessel })
    }
  }

  buildQcaOverlay() {
    const lad = HEART_DATA.vessels.find((v) => v.id === 'LAD')
    const curve = new THREE.CatmullRomCurve3(lad.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])))
    const lesionPoint = curve.getPointAt(LESION.t)
    const refPoint = curve.getPointAt(0.8)

    this.qcaTag = document.createElement('div')
    this.qcaTag.className = 'qca-floating'
    this.qcaTag.innerHTML = `
      <span class="qca-ring"></span>
      <div class="qca-card">
        <span class="qca-kicker">QCA · LAD MID</span>
        <strong>70<small>%</small></strong>
        <em>MLD 0.96 mm · RVD 3.20 mm</em>
      </div>
    `
    this.qcaObject = new CSS2DObject(this.qcaTag)
    this.qcaObject.position.copy(lesionPoint)
    this.scene.add(this.qcaObject)

    this.qcaRefTag = document.createElement('div')
    this.qcaRefTag.className = 'qca-ref'
    this.qcaRefTag.innerHTML = 'REF · 3.20 mm'
    this.qcaRefObject = new CSS2DObject(this.qcaRefTag)
    this.qcaRefObject.position.copy(refPoint).add(new THREE.Vector3(0, 0.02, 0.02))
    this.scene.add(this.qcaRefObject)
    this.setQcaVisible(false)
  }

  buildPostProcessing() {
    this.postScene = new THREE.Scene()
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.postMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uTime: { value: 0 },
        uMode: { value: 0 },
        uGrain: { value: 1 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uMode;
        uniform float uGrain;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec2 uv = vUv;
          vec2 px = 1.0 / uResolution;
          float center = texture2D(tDiffuse, uv).r;
          float glow = 0.0;
          glow += texture2D(tDiffuse, uv + vec2(px.x, 0.0)).r;
          glow += texture2D(tDiffuse, uv - vec2(px.x, 0.0)).r;
          glow += texture2D(tDiffuse, uv + vec2(0.0, px.y)).r;
          glow += texture2D(tDiffuse, uv - vec2(0.0, px.y)).r;
          glow += texture2D(tDiffuse, uv + px * 2.0).r;
          glow += texture2D(tDiffuse, uv - px * 2.0).r;
          glow *= 0.16;

          float vessel = smoothstep(0.045, 0.82, center + glow * 1.05);
          float core = smoothstep(0.38, 0.98, center + glow * 0.5);
          float grain = (hash(uv * uResolution + uTime * 40.0) - 0.5) * 0.03 * uGrain;
          float scan = sin((uv.y + uTime * 0.012) * uResolution.y * 1.7) * 0.0022;
          float vignette = smoothstep(1.2, 0.35, length((uv - 0.5) * vec2(1.0, 1.12)));
          float shadow = smoothstep(0.62, 0.02, length((uv - vec2(0.49, 0.54)) * vec2(1.08, 1.3)));

          vec3 fluoro = vec3(0.715, 0.74, 0.69);
          fluoro -= vessel * vec3(0.64, 0.64, 0.59);
          fluoro -= core * vec3(0.22, 0.21, 0.18);
          fluoro -= shadow * 0.035;
          fluoro += grain + scan;
          fluoro *= 0.8 + 0.2 * vignette;

          vec3 dsa = vec3(vessel * 1.15) + glow * 0.85;
          dsa = pow(dsa, vec3(1.18));
          dsa *= 0.4 + 0.6 * vignette;
          dsa += grain * 0.55;

          float isDsa = smoothstep(0.5, 0.9, uMode);
          vec3 color = mix(fluoro, dsa, isDsa);
          color += vec3(0.006, 0.014, 0.011) * (1.0 - isDsa);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial)
    quad.frustumCulled = false
    this.postScene.add(quad)
  }

  applySide() {
    const visibleSet = new Set(this.side === 'left' ? LEFT : this.side === 'right' ? RIGHT : [...LEFT, ...RIGHT])
    if (this.side === 'both') visibleSet.delete('LPDA')
    const derived = this.side === 'both' ? [...this.derivedIds.left, ...this.derivedIds.right] : this.derivedIds[this.side] || []
    derived.forEach((id) => visibleSet.add(id))
    for (const [id, entry] of Object.entries(this.groups)) {
      entry.mesh.visible = visibleSet.has(id)
    }
    for (const label of this.angioLabels) {
      label.object.visible = this.labelsVisible && visibleSet.has(label.vessel)
    }
    this.qcaVisibleTarget = this.side !== 'right'
    this.qcaObject.visible = this.qcaVisible && this.qcaVisibleTarget
    this.qcaRefObject.visible = this.qcaVisible && this.qcaVisibleTarget
    this.catheter.visible = this.side !== 'both'
  }

  setSide(side) {
    this.side = side
    this.applySide()
  }

  setAngles(rot, tilt) {
    this.rot = rot
    this.tilt = tilt
  }

  setMode(mode) {
    this.mode = mode
    this.applyMode()
  }

  applyMode() {
    const isDsa = this.mode === 'dsa'
    this.postMaterial.uniforms.uMode.value = isDsa ? 1 : 0
    this.boneGroup.visible = this.mode === 'bone'
    for (const material of this.boneMaterials) {
      if (material.uniforms) continue
      material.opacity = this.mode === 'bone' ? 0.11 : this.mode === 'dsa' ? 0.02 : 0.035
    }
    if (this.mode === 'dsa') this.fill = 1.1
    if (this.mode === 'bone') {
      this.postMaterial.uniforms.uMode.value = 0.15
    }
  }

  setPlaying(playing) {
    this.playing = playing
  }

  setLabelsVisible(visible) {
    this.labelsVisible = visible
    for (const label of this.angioLabels) {
      label.object.visible = visible && (this.side === 'both' || (this.side === 'left' ? LEFT : RIGHT).includes(label.vessel))
    }
    this.labelRenderer.domElement.style.display = visible ? '' : 'none'
  }

  setQcaVisible(visible) {
    this.qcaVisible = visible
    this.qcaObject.visible = visible && this.qcaVisibleTarget
    this.qcaRefObject.visible = visible && this.qcaVisibleTarget
  }

  inject() {
    this.cycle = 0
    this.fill = 0
  }

  resize() {
    if (!this.renderer || this.disposed) return
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(2, Math.round(rect.width))
    const height = Math.max(2, Math.round(rect.height))
    this.renderer.setSize(width, height, false)
    this.rt.setSize(width, height)
    this.postMaterial.uniforms.uResolution.value.set(width, height)
    this.camera.left = (-FRAMES[this.side].view * width) / height / 2
    this.camera.right = (FRAMES[this.side].view * width) / height / 2
    this.camera.top = FRAMES[this.side].view / 2
    this.camera.bottom = -FRAMES[this.side].view / 2
    this.camera.updateProjectionMatrix()
    this.labelRenderer.setSize(width, height)
    this.aspect = width / height
  }

  updateCamera(delta) {
    this.currentRot += (this.rot - this.currentRot) * Math.min(1, delta * 7)
    this.currentTilt += (this.tilt - this.currentTilt) * Math.min(1, delta * 7)
    const a = (this.currentRot * Math.PI) / 180
    const t = (this.currentTilt * Math.PI) / 180
    const direction = new THREE.Vector3(Math.sin(a) * Math.cos(t), Math.cos(a) * Math.cos(t), Math.sin(t)).normalize()
    const frame = FRAMES[this.side]
    const target = frame.center
    const distance = 8
    this.camera.position.copy(target).addScaledVector(direction, distance)
    this.camera.lookAt(target)
    this.camera.zoom = 1
    const aspect = this.aspect || 1
    this.camera.top = frame.view / 2
    this.camera.bottom = -frame.view / 2
    this.camera.left = (-frame.view * aspect) / 2
    this.camera.right = (frame.view * aspect) / 2
    this.camera.updateProjectionMatrix()
  }

  animate() {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.animate)
    const delta = Math.min(0.05, this.clock.getDelta())
    const time = this.clock.elapsedTime
    this.phase = (this.phase + delta * (this.bpm / 60)) % 1

    if (this.mode === 'dsa') {
      this.fill = 1.1
    } else if (this.playing) {
      this.cycle = (this.cycle + delta) % 5.6
      if (this.cycle < 2.2) this.fill = this.cycle / 2.2
      else if (this.cycle < 4.5) this.fill = 1
      else this.fill = Math.max(0, 1 - (this.cycle - 4.5) / 0.7)
    }
    for (const material of this.vesselMaterials) {
      material.uniforms.uFill.value = this.fill
    }

    const systole = Math.exp(-Math.pow((this.phase - 0.26) / 0.09, 2))
    this.treeRoot.scale.setScalar(1 - systole * 0.0035)
    this.treeRoot.position.z = systole * 0.004
    this.postMaterial.uniforms.uTime.value = time + (this.playing ? 0 : 10)

    this.updateCamera(delta)
    this.renderer.setRenderTarget(this.rt)
    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.clear()
    this.renderer.render(this.postScene, this.postCamera)
    this.labelRenderer.render(this.scene, this.camera)
  }

  capture() {
    this.animate()
    return this.renderer.domElement.toDataURL('image/png')
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
    this.rt.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelRenderer.domElement.remove()
    this.scene.clear()
  }
}
