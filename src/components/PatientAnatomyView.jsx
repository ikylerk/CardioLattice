import React from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  Box,
  Camera,
  CircleAlert,
  FolderOpen,
  Layers,
  Rotate3d,
  ShieldCheck,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import { Badge, Button, Section, Slider, Stat, Toggle } from './ui.jsx'
import { useStudy } from '../study/StudyContext.jsx'

const STRUCTURE_NAMES = {
  CORONARY_TREE: '冠脉树（公开数据）',
  LV: '左心室',
  RV: '右心室',
  LA: '左心房',
  RA: '右心房',
  AO: '主动脉',
  MYO: '心肌',
  CALC: '钙化',
}

const STRUCTURE_COLORS = {
  CORONARY_TREE: 0xc45258,
  LV: 0xc45258,
  RV: 0x5684be,
  LA: 0xd69a52,
  RA: 0x68b284,
  AO: 0x967cbe,
  MYO: 0xb06078,
  CALC: 0xe8e2ce,
}

function findNodeColor(name) {
  const parts = String(name || '').split(/[^A-Za-z0-9]+/)
  const code = parts.find((part) => STRUCTURE_COLORS[part])
  return code ? STRUCTURE_COLORS[code] : 0xa0a8b0
}

export default function PatientAnatomyView({ notify, onNavigate }) {
  const { study, measurements } = useStudy()
  const meshes = study?.meshes || []
  const modelUrl = meshes[0]?.url
  const hostRef = React.useRef(null)
  const engineRef = React.useRef(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [autoRotate, setAutoRotate] = React.useState(true)
  const [opacity, setOpacity] = React.useState(1)
  const [structureNames, setStructureNames] = React.useState([])
  const [stats, setStats] = React.useState({ vertices: 0, triangles: 0 })
  const registration = measurements.find((item) => item.code === 'ATLAS_REGISTRATION_RMS')
  const registrationTargets = registration?.provenance?.targets || []
  const autoRotateRef = React.useRef(autoRotate)
  const materialsRef = React.useRef([])

  React.useEffect(() => {
    if (!hostRef.current || !modelUrl) return undefined
    const host = hostRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.className = 'volume-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, host.clientWidth / Math.max(1, host.clientHeight), 0.01, 100)
    camera.position.set(3.4, 3.9, 2.8)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.5
    controls.target.set(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(3, 4, 5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x88bbff, 0.45)
    fill.position.set(-4, -2, -3)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffb070, 0.35)
    rim.position.set(-2, 3, -4)
    scene.add(rim)

    let disposed = false
    let raf = 0
    const loader = new GLTFLoader()
    setLoading(true)
    setError('')
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return
        const root = gltf.scene
        const names = []
        const materials = []
        let triangles = 0
        let vertices = 0
        root.traverse((node) => {
          if (!node.isMesh) return
          names.push(node.name)
          const geometry = node.geometry
          vertices += geometry?.attributes?.position?.count || 0
          triangles += geometry?.index ? geometry.index.count / 3 : (geometry?.attributes?.position?.count || 0) / 3
          const color = findNodeColor(`${node.name} ${node.parent?.name || ''}`)
          node.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            emissive: new THREE.Color(color).multiplyScalar(0.06),
            roughness: 0.52,
            metalness: 0.02,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            vertexColors: false,
          })
          materials.push(node.material)
        })
        materialsRef.current = materials
        setStructureNames(names)
        setStats({ vertices, triangles: Math.round(triangles) })
        scene.add(root)
        if (registrationTargets.length) {
          const markerGroup = new THREE.Group()
          const markerMaterial = new THREE.MeshBasicMaterial({
            color: 0x67d8cc,
            depthTest: false,
            transparent: true,
            opacity: 0.92,
          })
          const scale = study?.meshes?.[0]?.sceneTransform?.scale || 1
          for (const target of registrationTargets) {
            const [x, y, z] = target.patientMm || [0, 0, 0]
            const marker = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), markerMaterial)
            marker.position.set(x * scale, y * scale, z * scale)
            marker.renderOrder = 20
            marker.userData.targetId = target.id
            markerGroup.add(marker)
          }
          scene.add(markerGroup)
        }
        const box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const radius = Math.max(size.x, size.y, size.z, 0.01)
        controls.target.copy(center)
        camera.position.set(center.x + radius * 1.25, center.y + radius * 1.35, center.z + radius * 1.0)
        controls.minDistance = radius * 0.8
        controls.maxDistance = radius * 5
        camera.near = radius / 100
        camera.far = radius * 20
        camera.updateProjectionMatrix()
        setLoading(false)
      },
      undefined,
      (err) => {
        console.error(err)
        if (!disposed) {
          setError('患者 3D 网格加载失败。请确认流水线已生成 GLB。')
          setLoading(false)
        }
      },
    )

    const animate = () => {
      raf = requestAnimationFrame(animate)
      controls.autoRotate = autoRotateRef.current
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return
      renderer.setSize(host.clientWidth, host.clientHeight)
      camera.aspect = host.clientWidth / host.clientHeight
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    engineRef.current = {
      capture: () => renderer.domElement.toDataURL('image/png'),
      dispose: () => {
        disposed = true
        cancelAnimationFrame(raf)
        observer.disconnect()
        controls.dispose()
        renderer.dispose()
        renderer.domElement.remove()
        scene.traverse((node) => {
          node.geometry?.dispose?.()
          if (Array.isArray(node.material)) node.material.forEach((item) => item.dispose?.())
          else node.material?.dispose?.()
        })
      },
    }

    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl])

  React.useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])

  React.useEffect(() => {
    for (const material of materialsRef.current) {
      material.opacity = opacity
      material.transparent = opacity < 1
      material.needsUpdate = true
    }
  }, [opacity])

  const capture = () => {
    const url = engineRef.current?.capture()
    if (url) {
      const link = document.createElement('a')
      link.href = url
      link.download = 'CardioScope_patient_3D.png'
      link.click()
      notify?.('患者三维网格已导出为 PNG')
    }
  }

  const computed = measurements.filter((item) => item.status === 'computed')
  const synthetic = measurements.some((item) => item.validationStatus === 'synthetic')
  const isPublic = study?.study?.source === 'public_dataset'
  const sourceText = isPublic
    ? '来自公开数据集的 NIfTI 标签与 GLB 表面；不是患者级临床分割。'
    : '来自上传 DICOM 的分割掩膜与 GLB 表面；非演示心脏模型。'
  const title = isPublic ? '研究三维重建' : '患者三维重建'
  const surfaceTitle = isPublic ? '研究三维表面' : '患者级三维表面' 

  if (!modelUrl) {
    return (
      <div className="module-view">
        <ViewHeader
          index="01"
          eyebrow="ANATOMY"
          title="三维心脏解剖"
          titleSuffix="PATIENT MESH"
          description="该检查尚无患者级 3D 网格"
          meta={<><span>NOT COMPUTED</span></>}
        />
        <div className="empty-module">
          <CircleAlert size={24} />
          <h2>尚未生成患者 3D 网格</h2>
          <p>
            需要分割模型输出掩膜后，服务端才能通过 marching cubes 生成 GLB。当前研究原型不提供
            冠脉管腔或狭窄的自动建模，也不会用演示心脏模型代替患者解剖。
          </p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onNavigate?.('workbench')}>
            返回检查工作台
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="module-view anatomy-view patient-anatomy">
      <ViewHeader
        index="01"
        eyebrow="PATIENT ANATOMY"
        title={title}
        titleSuffix="SEGMENTATION → MESH"
        description={sourceText}
        meta={
          <>
            <span>{structureNames.length} 结构</span>
            <i />
            <span>{stats.triangles.toLocaleString()} 三角面</span>
            <i />
            <span>{study?.segmentations?.[0]?.modelId || '—'}</span>
          </>
        }
        actions={
          <>
            <Badge tone={synthetic ? 'amber' : 'teal'} dot>{synthetic ? '合成 / 研究分割' : '研究分割'}</Badge>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              截取视图
            </Button>
            <Button variant="outline" size="sm" icon={<FolderOpen size={14} />} onClick={() => onNavigate?.('workbench')}>
              工作台
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer anatomy-viewer">
          <div className="three-host" ref={hostRef} />
          {loading ? <div className="webgl-error">正在加载 GLB 网格…</div> : null}
          {error ? <div className="webgl-error">{error}</div> : null}
          <div className="volume-overlay-top">
            <span>PATIENT MESH · RAS</span>
            <span>{autoRotate ? 'AUTO ROTATE' : 'STATIC'}</span>
          </div>
          <div className="volume-tip"><Rotate3d size={11} /> 拖动旋转 · 滚轮缩放</div>
        </div>

        <aside className="inspector anatomy-inspector">
          <div className="selection-hero">
            <div className="selection-eyebrow">
              <span>SEGMENTATION</span>
              <span className="selection-id">{study?.study?.source?.toUpperCase()}</span>
            </div>
            <div className="selection-title">
              <span className="structure-swatch swatch-great" />
              <div>
                <h2>{surfaceTitle}</h2>
                <small>{study?.study?.subject?.pseudonym || '匿名受试者'}</small>
              </div>
            </div>
            <p>
              {synthetic
                ? '当前网格由合成夹具的 ground-truth 掩膜生成，仅用于验证 DICOM → 掩膜 → GLB 链路。'
                : '当前网格由研究分割模型生成，未经临床验证；冠脉管腔与狭窄未包含在此模型中。'}
              {registrationTargets.length ? ` 已将 ${registrationTargets.length} 个参考靶点映射到患者坐标系（研究性配准，非患者病灶）。` : ''}
            </p>
            <div className="selection-stats">
              <Stat label="结构" value={structureNames.length} hint="GLB nodes" />
              <Stat label="顶点" value={stats.vertices.toLocaleString()} />
              <Stat label="三角面" value={stats.triangles.toLocaleString()} />
            </div>
          </div>

          <Section title="结构清单" code="STRUCTURES" right={<Layers size={13} />}>
            <div className="patient-structure-list">
              {structureNames.map((name) => (
                <div key={name}>
                  <i style={{ background: `#${findNodeColor(name).toString(16).padStart(6, '0')}` }} />
                  <span>{name}</span>
                  <small>{STRUCTURE_NAMES[name] || '分割结构'}</small>
                </div>
              ))}
            </div>
          </Section>

          <Section title="测量" code="MEASUREMENTS" right={<Box size={13} />}>
            <div className="patient-measurement-list">
              {computed.length ? computed.map((item) => (
                <div key={item.id}>
                  <span>{item.label}</span>
                  <b>{item.value} {item.unit}</b>
                  <small>{item.method} · {item.validationStatus}</small>
                </div>
              )) : <div className="wb-empty-line">尚无已计算测量</div>}
            </div>
          </Section>

          <Section title="显示" code="RENDERING" right={<Box size={13} />}>
            <Slider
              label="透明度"
              value={opacity}
              min={0.2}
              max={1}
              step={0.05}
              onChange={setOpacity}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Toggle label="自动旋转" hint="展示模式" checked={autoRotate} onChange={setAutoRotate} />
          </Section>

          <div className="cta-disclaimer">
            <ShieldCheck size={12} />
            研究原型。网格与测量需医生复核；未验证模型输出不用于临床诊断或治疗决策。
          </div>
        </aside>
      </div>
    </div>
  )
}
