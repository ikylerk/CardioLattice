import React from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

function makeArcCurve() {
  const points = []
  for (let index = 0; index <= 40; index += 1) {
    const angle = THREE.MathUtils.degToRad(-62 + (304 * index) / 40)
    points.push(new THREE.Vector3(Math.cos(angle) * 1.02, Math.sin(angle) * 1.02, 0))
  }
  return new THREE.CatmullRomCurve3(points, false, 'centripetal')
}

export default function Carm3D({ rot = 0, tilt = 0 }) {
  const hostRef = React.useRef(null)
  const engineRef = React.useRef(null)

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.domElement.className = 'carm3d-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50)
    camera.position.set(3.4, 2.7, 4.2)
    camera.lookAt(0, 1.15, 0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.05, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 2.6
    controls.maxDistance = 8
    controls.autoRotate = false

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(3, 5, 4)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x6fa8c8, 0.55)
    fill.position.set(-4, 2, -2)
    scene.add(fill)
    const warm = new THREE.PointLight(0xffb36b, 12, 8)
    warm.position.set(-2, 2.5, 2)
    scene.add(warm)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5.5, 64),
      new THREE.MeshStandardMaterial({ color: 0x080d12, roughness: 1, metalness: 0 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    scene.add(floor)
    const grid = new THREE.GridHelper(9, 18, 0x1b2b36, 0x111c24)
    grid.position.y = 0.002
    scene.add(grid)

    const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x2a333b, roughness: 0.7, metalness: 0.2 })
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 2.7), tableMaterial)
    table.position.set(0, 0.72, 0)
    scene.add(table)
    const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 16), tableMaterial)
    tableLeg.position.set(0, 0.36, 0.9)
    scene.add(tableLeg)

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.24, 1.25, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x6c3d3a, roughness: 0.65, metalness: 0.03 }),
    )
    torso.rotation.x = Math.PI / 2
    torso.position.set(0, 0.98, -0.05)
    scene.add(torso)
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x8c6a5a, roughness: 0.7 }),
    )
    head.position.set(0, 1.02, 1.05)
    scene.add(head)

    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa8b2, roughness: 0.35, metalness: 0.65 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x303b45, roughness: 0.45, metalness: 0.5 })

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.68, 0.15, 28), dark)
    base.position.set(1.65, 0.08, 0)
    scene.add(base)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.55, 18), steel)
    column.position.set(1.65, 0.92, 0)
    scene.add(column)
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), steel)
    joint.position.set(1.65, 1.72, 0)
    scene.add(joint)

    const armGroup = new THREE.Group()
    armGroup.position.set(0, 1.55, 0)
    scene.add(armGroup)
    const arc = new THREE.Mesh(new THREE.TubeGeometry(makeArcCurve(), 48, 0.075, 10, false), steel)
    armGroup.add(arc)

    const detector = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.36, 0.62), dark)
    detector.position.set(0.5, -0.9, 0)
    detector.rotation.z = -0.25
    armGroup.add(detector)
    const detectorFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x67d8cc, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    )
    detectorFace.position.set(0.5, -0.9, 0.32)
    armGroup.add(detectorFace)

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 20), dark)
    tube.position.set(-0.5, -0.9, 0)
    tube.rotation.z = Math.PI / 2
    armGroup.add(tube)
    const tubeGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb36b }),
    )
    tubeGlow.position.set(-0.5, -0.9, 0.22)
    armGroup.add(tubeGlow)

    const armTarget = { rot: rot * 0.55, tilt: tilt * 0.42 }
    armGroup.rotation.z = THREE.MathUtils.degToRad(armTarget.rot)
    armGroup.rotation.x = THREE.MathUtils.degToRad(armTarget.tilt)

    const animate = () => {
      engineRef.current.raf = requestAnimationFrame(animate)
      const targetRot = THREE.MathUtils.degToRad(engineRef.current.targetRot)
      const targetTilt = THREE.MathUtils.degToRad(engineRef.current.targetTilt)
      armGroup.rotation.z += (targetRot - armGroup.rotation.z) * 0.08
      armGroup.rotation.x += (targetTilt - armGroup.rotation.x) * 0.08
      controls.update()
      renderer.render(scene, camera)
    }

    const resize = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    engineRef.current = {
      targetRot: armTarget.rot,
      targetTilt: armTarget.tilt,
      raf: 0,
      dispose: () => {
        cancelAnimationFrame(engineRef.current?.raf || 0)
        observer.disconnect()
        controls.dispose()
        scene.traverse((node) => {
          node.geometry?.dispose?.()
          if (Array.isArray(node.material)) node.material.forEach((item) => item.dispose?.())
          else node.material?.dispose?.()
        })
        renderer.dispose()
        renderer.domElement.remove()
      },
    }
    animate()

    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (!engineRef.current) return
    engineRef.current.targetRot = rot * 0.55
    engineRef.current.targetTilt = tilt * 0.42
  }, [rot, tilt])

  return (
    <div className="carm3d">
      <div className="carm3d-host" ref={hostRef} />
      <div className="carm3d-legend">
        <span><i className="carm-dot detector" /> Detector</span>
        <span><i className="carm-dot tube" /> X-ray tube</span>
      </div>
    </div>
  )
}
