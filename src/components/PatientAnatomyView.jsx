import { t, useI18n, serverText, measurementLabel } from '../i18n.js'
import { tImaging } from '../i18n-imaging.js'
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

const structureLabels = () => ({
  CORONARY_TREE: tImaging('anatomy.coronaryTree'),
  LV: t('anatomy.lv'),
  RV: t('anatomy.rv'),
  LA: t('anatomy.la'),
  RA: t('anatomy.ra'),
  AO: t('anatomy.ao'),
  MYO: t('cta.legendMuscle'),
  CALC: t('anatomy.metricCalcium'),
})

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
  useI18n()
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
  const [hiddenStructures, setHiddenStructures] = React.useState([])
  const [showTargets, setShowTargets] = React.useState(false)
  const [showCenterline, setShowCenterline] = React.useState(true)
  const structureNodesRef = React.useRef([])
  const targetsRef = React.useRef(null)
  const centerlineRef = React.useRef(null)
  const [stats, setStats] = React.useState({ vertices: 0, triangles: 0 })
  const registration = measurements.find((item) => item.code === 'ATLAS_REGISTRATION_RMS')
    || measurements.find((item) => item.code === 'ATLAS_REGISTRATION')
  const registrationTargets = registration?.provenance?.targets || []
  const centerlineMeasurement = measurements.find((item) => item.code === 'CORONARY_CENTERLINE_LENGTH')
  const coronaryCenterline = centerlineMeasurement?.provenance?.centerline || []
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
    setHiddenStructures([])
    setShowTargets(false)
    setShowCenterline(true)
    structureNodesRef.current = []
    targetsRef.current = null
    centerlineRef.current = null
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
          structureNodesRef.current.push(node)
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
        setStructureNames([...new Set(names)])
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
          markerGroup.visible = false
          targetsRef.current = markerGroup
          scene.add(markerGroup)
        }
        if (coronaryCenterline.length > 1) {
          const scale = study?.meshes?.[0]?.sceneTransform?.scale || 1
          const centered = centerlineMeasurement?.provenance?.centerline_frame === 'patient_preview_centered_mm'
          const center = study?.meshes?.[0]?.sceneTransform?.center_mm || [0, 0, 0]
          const points = coronaryCenterline.map((point) => new THREE.Vector3(
            (point[0] - (centered ? 0 : center[0])) * scale,
            (point[1] - (centered ? 0 : center[1])) * scale,
            (point[2] - (centered ? 0 : center[2])) * scale,
          ))
          const geometry = new THREE.BufferGeometry().setFromPoints(points)
          const line = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({ color: 0x67d8cc, transparent: true, opacity: 0.9, depthTest: false }),
          )
          line.renderOrder = 19
          centerlineRef.current = line
          scene.add(line)
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
          setError('patient.loadFailed')
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
    for (const node of structureNodesRef.current) {
      node.visible = !hiddenStructures.includes(node.name)
    }
  }, [hiddenStructures])

  React.useEffect(() => {
    if (targetsRef.current) targetsRef.current.visible = showTargets
  }, [showTargets])

  React.useEffect(() => {
    if (centerlineRef.current) centerlineRef.current.visible = showCenterline
  }, [showCenterline])

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

  const computed = measurements.filter((item) => item.status === 'computed'
    && typeof item.value === 'number' && Number.isFinite(item.value))
  const synthetic = measurements.some((item) => item.validationStatus === 'synthetic')
  const isPublic = study?.study?.source === 'public_dataset'
  const sourceText = isPublic
    ? tImaging('anatomy.publicSource')
    : t('patient.reconDescription')
  const title = isPublic ? tImaging('anatomy.researchTitle') : t('patient.reconTitle')
  const surfaceTitle = isPublic ? tImaging('anatomy.researchSurface') : t('patient.surface')

  if (!modelUrl) {
    return (
      <div className="module-view">
        <ViewHeader
          index="01"
          eyebrow="ANATOMY"
          title={t('anatomy.title')}
          titleSuffix="PATIENT MESH"
          description={t('patient.noMesh')}
          meta={<><span>NOT COMPUTED</span></>}
        />
        <div className="empty-module">
          <CircleAlert size={24} />
          <h2>{t('patient.emptyTitle')}</h2>
          <p>{tImaging('anatomy.noMeshBody')}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onNavigate?.('workbench')}>{t('unavailable.back')}</button>
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
            <span>{structureNames.length}{' '}{t('patient.structures')}</span>
            <i />
            <span>{stats.triangles.toLocaleString()}{' '}{t('patient.triangles')}</span>
            <i />
            <span>{study?.segmentations?.[0]?.modelId || '—'}</span>
          </>
        }
        actions={
          <>
            <Badge tone={synthetic ? 'amber' : 'teal'} dot>{synthetic ? t('patient.badgeSynthetic') : t('patient.badgeResearch')}</Badge>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>{t('patient.capture')}</Button>
            <Button variant="outline" size="sm" icon={<FolderOpen size={14} />} onClick={() => onNavigate?.('workbench')}>{t('patient.workbench')}</Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer anatomy-viewer">
          <div className="three-host" ref={hostRef} />
          {loading ? <div className="webgl-error">{t('patient.loading')}</div> : null}
          {error ? <div className="webgl-error">{t(error)}</div> : null}
          <div className="volume-overlay-top">
            <span>SEGMENTATION · 3D</span>
            <span>{autoRotate ? 'AUTO ROTATE' : 'STATIC'}</span>
          </div>
          <div className="volume-tip"><Rotate3d size={11} />{' '}{t('cta.drag')}</div>
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
                <small>{study?.study?.subject?.pseudonym || t('patient.anon')}</small>
              </div>
            </div>
            <p>
              {synthetic
                ? t('patient.syntheticBody')
                : isPublic
                  ? tImaging('anatomy.nativeSource')
                  : t('patient.researchBody')}
              {registrationTargets.length ? tImaging('anatomy.mappedTargets', { v0: registrationTargets.length }) : ''}
              {coronaryCenterline.length ? tImaging('anatomy.centerlineOverlay') : ''}
            </p>
            <div className="selection-stats">
              <Stat label={t('patient.structures')} value={structureNames.length} hint="GLB nodes" />
              <Stat label={t('patient.vertices')} value={stats.vertices.toLocaleString()} />
              <Stat label={t('patient.triangles')} value={stats.triangles.toLocaleString()} />
            </div>
          </div>

          <Section title={t('patient.list')} code="STRUCTURES" right={<Layers size={13} />}>
            <Button size="sm" onClick={() => setHiddenStructures([])}>{tImaging('anatomy.showAll')}</Button>
            <div className="patient-structure-list">
              {structureNames.map((name) => (
                <div key={name}>
                  <i style={{ background: `#${findNodeColor(name).toString(16).padStart(6, '0')}` }} />
                  <label>
                    <input
                      type="checkbox"
                      checked={!hiddenStructures.includes(name)}
                      onChange={() => setHiddenStructures((current) => current.includes(name)
                        ? current.filter((item) => item !== name) : [...current, name])}
                    />
                    {structureLabels()[name] || name}
                  </label>
                  <Button size="sm" aria-label={tImaging('anatomy.soloAria', { v0: structureLabels()[name] || name })} onClick={() => setHiddenStructures(structureNames.filter((item) => item !== name))}>{tImaging('anatomy.solo')}</Button>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t('patient.measurements')} code="MEASUREMENTS" right={<Box size={13} />}>
            <div className="patient-measurement-list">
              {computed.length ? computed.map((item) => (
                <div key={item.id}>
                  <span>{measurementLabel(item)}</span>
                  <b>{item.value} {item.unit}</b>
                  <small>{item.method} · {item.validationStatus}</small>
                </div>
              )) : <div className="wb-empty-line">{t('common.noComputedMeasurements')}</div>}
            </div>
          </Section>

          <Section title={t('patient.display')} code="RENDERING" right={<Box size={13} />}>
            {registrationTargets.length ? (
              <Toggle label={tImaging('anatomy.referenceTargets')} hint={tImaging('anatomy.targetAccuracy')} checked={showTargets} onChange={setShowTargets} />
            ) : registration?.reason ? <p className="workbench-hint">{serverText(registration.reason)}</p> : null}
            {coronaryCenterline.length ? (
              <Toggle label={tImaging('anatomy.centerline')} hint={tImaging('anatomy.longestPath')} checked={showCenterline} onChange={setShowCenterline} />
            ) : null}
            <Slider
              label={t('patient.opacity')}
              value={opacity}
              min={0.2}
              max={1}
              step={0.05}
              onChange={setOpacity}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Toggle label={t('cta.autoRotate')} hint={t('cta.showMode')} checked={autoRotate} onChange={setAutoRotate} />
          </Section>

          <div className="cta-disclaimer">
            <ShieldCheck size={12} />{t('patient.disclaimer')}</div>
        </aside>
      </div>
    </div>
  )
}
