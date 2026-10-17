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
import { useI18n } from '../i18n.js'

const STRUCTURE_KEYS = {
  LV: 'patient.lv',
  RV: 'patient.rv',
  LA: 'patient.la',
  RA: 'patient.ra',
  AO: 'patient.ao',
  MYO: 'patient.myo',
  CALC: 'patient.calc',
}

const STRUCTURE_COLORS = {
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
  const { t } = useI18n()
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
          setError('load')
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
      notify?.(t('patient.exportToast'))
    }
  }

  const computed = measurements.filter((item) => item.status === 'computed')
  const synthetic = measurements.some((item) => item.validationStatus === 'synthetic')

  if (!modelUrl) {
    return (
      <div className="module-view">
        <ViewHeader
          index="01"
          eyebrow="ANATOMY"
          title={t('patient.title')}
          titleSuffix="PATIENT MESH"
          description={t('patient.noMesh')}
          meta={<><span>NOT COMPUTED</span></>}
        />
        <div className="empty-module">
          <CircleAlert size={24} />
          <h2>{t('patient.emptyTitle')}</h2>
          <p>{t('patient.emptyBody')}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onNavigate?.('workbench')}>
            {t('patient.back')}
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
        title={t('patient.reconTitle')}
        titleSuffix="SEGMENTATION → MESH"
        description={t('patient.reconDescription')}
        meta={
          <>
            <span>{t('common.structures', { count: structureNames.length })}</span>
            <i />
            <span>{t('common.triangles', { count: stats.triangles.toLocaleString() })}</span>
            <i />
            <span>{study?.segmentations?.[0]?.modelId || '—'}</span>
          </>
        }
        actions={
          <>
            <Badge tone={synthetic ? 'amber' : 'teal'} dot>{synthetic ? t('patient.badgeSynthetic') : t('patient.badgeResearch')}</Badge>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              {t('patient.capture')}
            </Button>
            <Button variant="outline" size="sm" icon={<FolderOpen size={14} />} onClick={() => onNavigate?.('workbench')}>
              {t('patient.workbench')}
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer anatomy-viewer">
          <div className="three-host" ref={hostRef} />
          {loading ? <div className="webgl-error">{t('patient.loading')}</div> : null}
          {error ? <div className="webgl-error">{t('patient.loadFailed')}</div> : null}
          <div className="volume-overlay-top">
            <span>PATIENT MESH · RAS</span>
            <span>{autoRotate ? 'AUTO ROTATE' : 'STATIC'}</span>
          </div>
          <div className="volume-tip"><Rotate3d size={11} /> {t('patient.drag')}</div>
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
                <h2>{t('patient.surface')}</h2>
                <small>{study?.study?.subject?.pseudonym || t('patient.anon')}</small>
              </div>
            </div>
            <p>{synthetic ? t('patient.syntheticBody') : t('patient.researchBody')}</p>
            <div className="selection-stats">
              <Stat label={t('patient.structures')} value={structureNames.length} hint="GLB nodes" />
              <Stat label={t('patient.vertices')} value={stats.vertices.toLocaleString()} />
              <Stat label={t('patient.triangles')} value={stats.triangles.toLocaleString()} />
            </div>
          </div>

          <Section title={t('patient.list')} code="STRUCTURES" right={<Layers size={13} />}>
            <div className="patient-structure-list">
              {structureNames.map((name) => (
                <div key={name}>
                  <i style={{ background: `#${findNodeColor(name).toString(16).padStart(6, '0')}` }} />
                  <span>{name}</span>
                  <small>{STRUCTURE_KEYS[name] ? t(STRUCTURE_KEYS[name]) : t('patient.other')}</small>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t('patient.measurements')} code="MEASUREMENTS" right={<Box size={13} />}>
            <div className="patient-measurement-list">
              {computed.length ? computed.map((item) => (
                <div key={item.id}>
                  <span>{item.label}</span>
                  <b>{item.value} {item.unit}</b>
                  <small>{item.method} · {item.validationStatus}</small>
                </div>
              )) : <div className="wb-empty-line">{t('common.noComputedMeasurements')}</div>}
            </div>
          </Section>

          <Section title={t('patient.display')} code="RENDERING" right={<Box size={13} />}>
            <Slider
              label={t('patient.opacity')}
              value={opacity}
              min={0.2}
              max={1}
              step={0.05}
              onChange={setOpacity}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Toggle label={t('patient.autoRotate')} hint={t('patient.showMode')} checked={autoRotate} onChange={setAutoRotate} />
          </Section>

          <div className="cta-disclaimer">
            <ShieldCheck size={12} />
            {t('disclaimer.body')}
          </div>
        </aside>
      </div>
    </div>
  )
}
