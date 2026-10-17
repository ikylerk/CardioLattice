import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export default class VolumeRenderer {
  constructor(container, volume, options = {}) {
    this.container = container
    this.volume = volume
    this.autoRotate = options.autoRotate !== false
    this.opacity = options.opacity ?? 1
    this.steps = options.steps ?? 92
    this.disposed = false
    this.lastRender = 0

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.domElement.className = 'volume-canvas'
    this.container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(2.65, 3.35, 2.15)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, -0.02)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.enablePan = false
    this.controls.minDistance = 2.6
    this.controls.maxDistance = 9
    this.controls.autoRotate = this.autoRotate
    this.controls.autoRotateSpeed = 0.38
    this.controls.rotateSpeed = 0.65

    this.buildVolume()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()
    this.animate = this.animate.bind(this)
    this.raf = requestAnimationFrame(this.animate)
  }

  buildVolume() {
    const { data, dims, bounds } = this.volume
    const [huMin, huMax] = this.volume.huRange || [-1024, 1600]
    const texture = new THREE.Data3DTexture(data, dims[0], dims[1], dims[2])
    texture.format = THREE.RedFormat
    texture.type = THREE.UnsignedByteType
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.unpackAlignment = 1
    texture.needsUpdate = true
    this.texture = texture

    const size = [
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ]
    const center = [
      (bounds.max[0] + bounds.min[0]) / 2,
      (bounds.max[1] + bounds.min[1]) / 2,
      (bounds.max[2] + bounds.min[2]) / 2,
    ]
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2])
    const radius = Math.max(size[0], size[1], size[2], 0.001)
    this.camera.position.set(radius * 0.7, radius * 0.88, radius * 0.56)
    this.controls.target.set(center[0], center[1], center[2])
    this.controls.minDistance = radius * 0.68
    this.controls.maxDistance = radius * 2.4
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
      uniforms: {
        uVolume: { value: texture },
        uBoxMin: { value: new THREE.Vector3(...bounds.min) },
        uBoxMax: { value: new THREE.Vector3(...bounds.max) },
        uOpacity: { value: this.opacity },
        uSteps: { value: this.steps },
        uHuMin: { value: huMin },
        uHuMax: { value: huMax },
        uVoxel: { value: new THREE.Vector3(1 / dims[0], 1 / dims[1], 1 / dims[2]) },
        uMode: { value: 0 },
      },
      vertexShader: `
        varying vec3 vPos;
        varying vec3 vOrigin;
        void main() {
          vPos = position;
          vOrigin = cameraPosition;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp sampler3D;
        uniform sampler3D uVolume;
        uniform vec3 uBoxMin;
        uniform vec3 uBoxMax;
        uniform float uOpacity;
        uniform float uSteps;
        uniform float uHuMin;
        uniform float uHuMax;
        uniform vec3 uVoxel;
        uniform float uMode;
        varying vec3 vPos;
        varying vec3 vOrigin;

        vec2 intersectBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
          vec3 inv = 1.0 / rd;
          vec3 t0 = (bmin - ro) * inv;
          vec3 t1 = (bmax - ro) * inv;
          vec3 tsmall = min(t0, t1);
          vec3 tbig = max(t0, t1);
          float tnear = max(max(tsmall.x, tsmall.y), tsmall.z);
          float tfar = min(min(tbig.x, tbig.y), tbig.z);
          return vec2(tnear, tfar);
        }

        float sampleDensity(vec3 uvw) {
          return texture(uVolume, uvw).r;
        }

        void main() {
          vec3 ro = vOrigin;
          vec3 rd = normalize(vPos - vOrigin);
          vec2 hit = intersectBox(ro, rd, uBoxMin, uBoxMax);
          if (hit.x > hit.y) discard;
          float t0 = max(hit.x, 0.0);
          float t1 = hit.y;
          float dt = (t1 - t0) / uSteps;
          vec3 size = uBoxMax - uBoxMin;
          vec4 acc = vec4(0.0);
          vec3 lightDir = normalize(vec3(0.45, 0.65, 0.8));

          for (int i = 0; i < 200; i++) {
            if (float(i) >= uSteps) break;
            float t = t0 + dt * (float(i) + 0.5);
            vec3 p = ro + rd * t;
            vec3 uvw = (p - uBoxMin) / size;
            if (uvw.x < 0.0 || uvw.y < 0.0 || uvw.z < 0.0 || uvw.x > 1.0 || uvw.y > 1.0 || uvw.z > 1.0) continue;
            float raw = sampleDensity(uvw);
            float hu = mix(uHuMin, uHuMax, raw);

            float bone = smoothstep(310.0, 760.0, hu);
            float contrast = smoothstep(140.0, 230.0, hu) * (1.0 - smoothstep(500.0, 760.0, hu));
            float soft = smoothstep(-30.0, 80.0, hu) * (1.0 - smoothstep(105.0, 260.0, hu));
            float alpha = (bone * 0.07 + contrast * 0.095 + soft * 0.006) * uOpacity;
            if (alpha < 0.001) continue;

            vec3 color = bone * vec3(0.92, 0.89, 0.8)
                       + contrast * vec3(0.9, 0.28, 0.2)
                       + soft * vec3(0.5, 0.23, 0.21);

            if (alpha > 0.004) {
              vec3 e = uVoxel * 2.0;
              float dx = sampleDensity(uvw + vec3(e.x, 0.0, 0.0)) - sampleDensity(uvw - vec3(e.x, 0.0, 0.0));
              float dy = sampleDensity(uvw + vec3(0.0, e.y, 0.0)) - sampleDensity(uvw - vec3(0.0, e.y, 0.0));
              float dz = sampleDensity(uvw + vec3(0.0, 0.0, e.z)) - sampleDensity(uvw - vec3(0.0, 0.0, e.z));
              vec3 normal = normalize(vec3(dx, dy, dz) + vec3(0.0001));
              float diffuse = clamp(dot(normal, lightDir) * 0.5 + 0.5, 0.25, 1.0);
              color *= 0.48 + diffuse * 0.72;
            }

            if (uMode > 0.5) {
              float mip = bone;
              color = vec3(0.9, 0.92, 0.9) * mip;
              alpha = mip * 0.1 * uOpacity;
            }

            acc.rgb += (1.0 - acc.a) * color * alpha;
            acc.a += (1.0 - acc.a) * alpha;
            if (acc.a > 0.94) break;
          }

          if (acc.a < 0.005) discard;
          gl_FragColor = vec4(pow(acc.rgb, vec3(0.86)), acc.a);
        }
      `,
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
    this.mesh.position.set(center[0], center[1], center[2])
    this.scene.add(this.mesh)
  }

  setOpacity(value) {
    this.opacity = value
    if (this.material) this.material.uniforms.uOpacity.value = value
  }

  setAutoRotate(value) {
    this.autoRotate = value
    this.controls.autoRotate = value
  }

  setMip(value) {
    if (this.material) this.material.uniforms.uMode.value = value ? 1 : 0
  }

  resetCamera() {
    this.camera.position.set(2.65, 3.35, 2.15)
    this.controls.target.set(0, 0, -0.02)
    this.controls.update()
  }

  resize() {
    if (!this.renderer || this.disposed) return
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(2, Math.round(rect.width))
    const height = Math.max(2, Math.round(rect.height))
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  capture() {
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }

  animate(time) {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.animate)
    if (time - this.lastRender < 32) return
    this.lastRender = time
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    this.controls.dispose()
    this.texture?.dispose()
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) object.material.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
