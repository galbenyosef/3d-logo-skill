import { Component, Suspense, useMemo, useRef, useState, type MutableRefObject, type PointerEvent, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, useTexture } from '@react-three/drei'
import { BackSide, BufferGeometry, CanvasTexture, NeutralToneMapping, DoubleSide, type Group, LinearSRGBColorSpace, type Mesh, type Side, SRGBColorSpace, Vector2 } from 'three'
import studioHdrUrl from '../assets/hdri/studio_small_03_1k.hdr?url'
import warehouseHdrUrl from '../assets/hdri/empty_warehouse_01_1k.hdr?url'
import cityHdrUrl from '../assets/hdri/potsdamer_platz_1k.hdr?url'
import nightHdrUrl from '../assets/hdri/dikhololo_night_1k.hdr?url'
import dawnHdrUrl from '../assets/hdri/kiara_1_dawn_1k.hdr?url'
import sunsetHdrUrl from '../assets/hdri/venice_sunset_1k.hdr?url'
import { buildRim } from '../lib/rimGeometry'
import { computeCoinFaces, computeSeamLayout, seamShare } from '../lib/coinFaces'
import { splitSidedParts } from '../lib/sidedParts'
import { stepSpin, type SpinState } from '../lib/dragSpin'
import {
  applyBrightnessThreshold,
  clearDetachedSpecks,
  computeSquareFit,
  BG_TOLERANCE,
  detectSolidBackground,
  extractPerimeter,
  generateNormalMapData,
  hasNativeAlpha,
  pickRimPalette,
  removeBackgroundFromEdges,
} from '../lib/textureProcessing'
import type { EnvPreset } from '../lib/envPresets'

// Tunable constants from SKILL.md Step 4, unchanged.
const PLANE_SIZE = 4.8
const THICKNESS = 0.45
const SPIN_SPEED = 0.35
const BG_THRESHOLD = 18
const EMBOSS_STRENGTH = 1.1
// Text logos: the metal plate under the mirrored back art sits this far inside the back face.
const BACK_PLATE_INSET = 0.004

// r/threejs launch feedback (u/BigDeadPixel): "can you change the thickness
// of the coin?" — exposed as a prop instead of only the module constant.
// Clamped so the rim geometry never collapses (too thin) or dwarfs the
// logo faces (too thick).
const THICKNESS_MIN = 0.15
const THICKNESS_MAX = 1.2

function clampThickness(value: number): number {
  return Math.min(THICKNESS_MAX, Math.max(THICKNESS_MIN, value))
}

/** Pointer state shared from the DOM wrapper into the render loop without re-rendering. */
interface DragRef {
  active: boolean
  pointerId: number
  lastX: number
  startY: number
  pendingDx: number
  dyTotal: number
}

interface LogoAssets {
  colorTexture: CanvasTexture
  normalMap: CanvasTexture
  /** White where the rim's centred parts are opaque — cuts the text logo's back plate to shape. */
  maskTexture: CanvasTexture
  /** The rim that never changes: every part, or for a text logo the parts that are their own mirror image. */
  rimGeometry: BufferGeometry
  /** Text logos: the parts that aren't, which get a front rim and a mirrored back rim. */
  sidedRimGeometry: BufferGeometry | null
  rimColor: string
  rimEmissive: string
}

/** SKILL.md 2a + 2b + 2c, assembled: transparency, normal map, perimeter, rim. */
function useLogoAssets(logoUrl: string, thickness: number, hasText: boolean): LogoAssets {
  const srcTexture = useTexture(logoUrl)
  return useMemo(() => {
    const img = srcTexture.image as HTMLImageElement
    const srcWidth = img.naturalWidth || img.width
    const srcHeight = img.naturalHeight || img.height
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = srcWidth
    srcCanvas.height = srcHeight
    const srcCtx = srcCanvas.getContext('2d')!
    srcCtx.drawImage(img, 0, 0, srcWidth, srcHeight)
    const srcImageData = srcCtx.getImageData(0, 0, srcWidth, srcHeight)
    const sd = srcImageData.data

    // Only remove a background when the source has no real alpha of its own
    // (SKILL.md 2a: "if already transparent, skip"). A solid flat border
    // (white, black, or any other flat colour) is removed with a contiguous
    // flood fill so enclosed same-colour details inside the logo survive;
    // only a photo/gradient/busy edge — where detectSolidBackground finds
    // nothing — falls back to the old global dark-brightness threshold.
    if (!hasNativeAlpha(sd)) {
      const bg = detectSolidBackground(sd, srcWidth, srcHeight)
      if (bg) {
        removeBackgroundFromEdges(sd, srcWidth, srcHeight, bg, BG_TOLERANCE)
      } else {
        applyBrightnessThreshold(sd, BG_THRESHOLD)
      }
    }
    // Same speck rule the rim uses, applied to the colour texture too, so
    // stray pixels left by a noisy background don't float on the face.
    clearDetachedSpecks(sd, srcWidth, srcHeight)
    srcCtx.putImageData(srcImageData, 0, 0)

    // The faces are square planes: re-centre the artwork on a square canvas
    // so non-square uploads keep their proportions instead of stretching.
    const fit = computeSquareFit(sd, srcWidth, srcHeight)
    const width = fit ? fit.size : srcWidth
    const height = fit ? fit.size : srcHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    if (fit) ctx.drawImage(srcCanvas, fit.sx, fit.sy, fit.sw, fit.sh, fit.dx, fit.dy, fit.sw, fit.sh)
    else ctx.drawImage(srcCanvas, 0, 0)
    const d = ctx.getImageData(0, 0, width, height).data

    const colorTexture = new CanvasTexture(canvas)
    colorTexture.colorSpace = SRGBColorSpace
    // Keeps the face sharp at grazing angles — the last degrees before the
    // flip. three clamps this to what the GPU supports.
    colorTexture.anisotropy = 16

    const normalData = generateNormalMapData(d, width, height)
    const normalCanvas = document.createElement('canvas')
    normalCanvas.width = width
    normalCanvas.height = height
    const nCtx = normalCanvas.getContext('2d')!
    const normalImageData = nCtx.createImageData(width, height)
    normalImageData.data.set(normalData)
    nCtx.putImageData(normalImageData, 0, 0)
    const normalMap = new CanvasTexture(normalCanvas)
    // Normal maps must stay linear — SRGBColorSpace would gamma-correct the
    // direction vectors and flatten the lighting (SKILL.md pitfall list).
    normalMap.colorSpace = LinearSRGBColorSpace
    normalMap.anisotropy = 16

    const outlines = extractPerimeter(d, width, height)
    const parts = hasText ? splitSidedParts(outlines) : { centred: outlines, sided: [] }
    const rimGeometry = buildRim(parts.centred, PLANE_SIZE, thickness)
    const sidedRimGeometry = parts.sided.length ? buildRim(parts.sided, PLANE_SIZE, thickness) : null
    const { color, emissive } = pickRimPalette(d)

    // White where the centred parts are opaque — the text logo's back plate (SKILL.md 2d).
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = width
    maskCanvas.height = height
    const mCtx = maskCanvas.getContext('2d')!
    // Fill the centred parts' outlines, then keep only where the logo is
    // opaque. Built this way round so no centred parts means an EMPTY mask —
    // filling an empty path under destination-in is a no-op in the browser,
    // which left the whole logo as the plate.
    mCtx.fillStyle = '#ffffff'
    mCtx.beginPath()
    for (const loop of parts.centred) {
      loop.forEach(([x, y], i) => {
        const px = (x + 0.5) * width
        const py = (0.5 - y) * height
        if (i === 0) mCtx.moveTo(px, py)
        else mCtx.lineTo(px, py)
      })
      mCtx.closePath()
    }
    mCtx.fill()
    mCtx.globalCompositeOperation = 'destination-in'
    mCtx.drawImage(canvas, 0, 0)
    const maskTexture = new CanvasTexture(maskCanvas)
    maskTexture.colorSpace = SRGBColorSpace

    return { colorTexture, normalMap, maskTexture, rimGeometry, sidedRimGeometry, rimColor: color, rimEmissive: emissive }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- thickness rebuilds
    // only the rim, not the (expensive) texture/normal-map extraction; both
    // are re-derived here regardless since they share this one memo.
  }, [srcTexture, thickness, hasText])
}

function Coin({
  logoUrl,
  spinMultiplier,
  thickness,
  hasText,
  drag,
}: {
  logoUrl: string
  spinMultiplier: number
  thickness: number
  hasText: boolean
  drag: MutableRefObject<DragRef>
}) {
  const groupRef = useRef<Group>(null)
  const frontSidedRef = useRef<Mesh>(null)
  const backSidedRef = useRef<Mesh>(null)
  const spinRef = useRef<SpinState>({ angle: 0, velocity: 0, tilt: 0 })
  const { colorTexture, normalMap, maskTexture, rimGeometry, sidedRimGeometry, rimColor, rimEmissive } = useLogoAssets(logoUrl, thickness, hasText)
  const normalScale = useMemo(() => new Vector2(EMBOSS_STRENGTH, EMBOSS_STRENGTH), [])
  useFrame((_, delta) => {
    if (!groupRef.current) return
    const d = drag.current
    const spin = stepSpin(
      spinRef.current,
      { dragging: d.active, dx: d.pendingDx, dyTotal: d.dyTotal, baseSpeed: SPIN_SPEED * spinMultiplier },
      delta,
    )
    d.pendingDx = 0
    spinRef.current = spin
    // One continuous spin for every logo — text logos never wrap/snap the
    // yaw (issue #53).
    groupRef.current.rotation.y = spin.angle
    groupRef.current.rotation.x = spin.tilt

    // Text logos, sided parts only: the rim facing the camera owns the whole
    // thickness; right at edge-on the seam slides across. Both are
    // full-thickness geometry scaled in z — the walls' normals lie in the xy
    // plane, so the scale never bends the shading.
    const frontSided = frontSidedRef.current
    const backSided = backSidedRef.current
    if (frontSided && backSided) {
      const layout = computeSeamLayout(seamShare(spin.angle), thickness)
      frontSided.visible = layout.front.visible
      frontSided.scale.z = layout.front.scaleZ
      frontSided.position.z = layout.front.positionZ
      backSided.visible = layout.back.visible
      backSided.scale.z = layout.back.scaleZ
      backSided.position.z = layout.back.positionZ
    }
  })
  const { front, back } = useMemo(() => computeCoinFaces(thickness), [thickness])
  const faceMaterial = (side: Side) => (
    <meshStandardMaterial
      map={colorTexture}
      normalMap={normalMap}
      normalScale={normalScale}
      metalness={0.15}
      roughness={0.35}
      envMapIntensity={0.4}
      side={side}
      transparent
      depthWrite={false}
    />
  )
  // `mask` turns the rim metal into the text logo's back plate: a plane cut to shape.
  // Satin, not mirror: a mirror finish reflects the environment's dark floor
  // (a dark rim) and its sharp reflections sparkle and band across the walls
  // as they turn.
  const rimMaterial = (mask?: CanvasTexture, side: Side = DoubleSide) => (
    <meshStandardMaterial
      color={rimColor}
      metalness={0.95}
      roughness={0.26}
      emissive={rimEmissive}
      emissiveIntensity={0.15}
      envMapIntensity={1.5}
      map={mask ?? null}
      alphaTest={mask ? 0.5 : 0}
      side={side}
    />
  )
  return (
    <group ref={groupRef}>
      <mesh position={front.position} rotation-y={front.rotationY}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        {faceMaterial(front.side)}
      </mesh>
      {/*
        Back face = the same plane as the front seen from behind (BackSide) —
        SKILL.md 2d and computeCoinFaces (../lib/coinFaces.ts). A text logo
        mirrors it in x (scale x = -1) so the text reads correctly. Do NOT
        turn it by PI with FrontSide instead: it looks the same but lights
        differently from the front (measured: duller, angle-dependent).
      */}
      <mesh position={back.position} rotation-y={back.rotationY} scale={[hasText ? -1 : 1, 1, 1]}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        {faceMaterial(back.side)}
      </mesh>
      {/*
        Text logo: on the centred parts the mirrored art is a few pixels off
        the rim wherever the logo isn't perfectly symmetric. A metal plate in
        that rim's own shape, just under the art, turns the offset into a
        badge edge instead of a view into the hollow rim. Seen from behind only.
      */}
      {hasText ? (
        <mesh position={[0, 0, back.position[2] + BACK_PLATE_INSET]}>
          <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
          {rimMaterial(maskTexture, BackSide)}
        </mesh>
      ) : null}
      <mesh geometry={rimGeometry}>{rimMaterial()}</mesh>
      {sidedRimGeometry ? (
        <>
          <mesh ref={frontSidedRef} geometry={sidedRimGeometry}>
            {rimMaterial()}
          </mesh>
          <mesh ref={backSidedRef} geometry={sidedRimGeometry} scale={[-1, 1, 1]} visible={false}>
            {rimMaterial()}
          </mesh>
        </>
      ) : null}
    </group>
  )
}

/**
 * Every preset ships self-hosted (the same Poly Haven CC0 files drei's
 * `preset` prop would fetch from raw.githack.com), so reflections work
 * offline and behind firewalls. Each file is its own asset URL, so only the
 * preset a visitor actually picks is downloaded.
 */
const ENV_HDR_URLS: Record<EnvPreset, string> = {
  studio: studioHdrUrl,
  warehouse: warehouseHdrUrl,
  city: cityHdrUrl,
  night: nightHdrUrl,
  dawn: dawnHdrUrl,
  sunset: sunsetHdrUrl,
}

function CoinEnvironment({ envPreset }: { envPreset: EnvPreset }) {
  return <Environment files={ENV_HDR_URLS[envPreset]} />
}

/** Procedural studio lighting — no files, so it can never fail to load. */
function FallbackEnvironment() {
  return (
    <Environment resolution={64}>
      <Lightformer intensity={2} position={[0, 4, 3]} scale={[8, 2, 1]} />
      <Lightformer intensity={1.2} position={[-5, 0, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
      <Lightformer intensity={1.2} position={[5, 0, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
    </Environment>
  )
}

/**
 * If an HDR ever fails to load, fall back to procedural lighting instead of
 * letting the error unmount the whole Canvas (the coin used to vanish).
 */
class EnvironmentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <FallbackEnvironment /> : this.props.children
  }
}

export interface SpinningLogo3DProps {
  logoUrl: string
  envPreset: EnvPreset
  /** 1 = full speed, lower values honor prefers-reduced-motion. */
  spinMultiplier?: number
  /**
   * Coin edge thickness (SKILL.md's `THICKNESS` constant, now adjustable).
   * Clamped to [0.15, 1.2] — outside that range the rim either collapses to
   * nothing or dwarfs the logo faces. Defaults to the original 0.45.
   */
  thickness?: number
  /** Logo contains text: the back is mirrored so it reads correctly from both sides — see ../lib/sidedParts. */
  hasText?: boolean
}

export function SpinningLogo3D({ logoUrl, envPreset, spinMultiplier = 1, thickness = THICKNESS, hasText = false }: SpinningLogo3DProps) {
  const clampedThickness = clampThickness(thickness)
  const drag = useRef<DragRef>({ active: false, pointerId: -1, lastX: 0, startY: 0, pendingDx: 0, dyTotal: 0 })
  const [grabbing, setGrabbing] = useState(false)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    Object.assign(drag.current, { active: true, pointerId: e.pointerId, lastX: e.clientX, startY: e.clientY, pendingDx: 0, dyTotal: 0 })
    setGrabbing(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active || e.pointerId !== d.pointerId) return
    d.pendingDx += e.clientX - d.lastX
    d.lastX = e.clientX
    d.dyTotal = e.clientY - d.startY
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current.pointerId) return
    drag.current.active = false
    setGrabbing(false)
  }

  return (
    <div
      className={`coin-drag${grabbing ? ' is-grabbing' : ''}`}
      title="Drag to spin"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
    <Canvas
      camera={{ position: [0, 0, 7], fov: 40 }}
      // Khronos PBR Neutral instead of R3F's default ACES Filmic: ACES
      // desaturates bright base colours, which washed every logo toward
      // pastel (cyan -> mint, green -> sage). Neutral is built for base-colour
      // fidelity and keeps the chrome rim's highlights (issue #31).
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
        toneMapping: NeutralToneMapping,
      }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 5, 5]} intensity={2.5} />
      <directionalLight position={[-3, -2, 4]} intensity={0.8} color="#06b6d4" />
      <directionalLight position={[0, 0, -5]} intensity={0.5} color="#0ea5e9" />
      {/*
        Suspense MUST live inside Canvas — useTexture suspends in R3F's own
        reconciler, and an outer Suspense won't catch it. Two SEPARATE
        boundaries (not one shared by both): the coin's own texture usually
        resolves well before the environment map does, so splitting them
        lets the coin render immediately instead of waiting on Environment's
        own suspend (issue #13 — the coin used to only appear once the CDN
        HDR finished loading).
      */}
      <EnvironmentBoundary key={envPreset}>
        <Suspense fallback={null}>
          <CoinEnvironment envPreset={envPreset} />
        </Suspense>
      </EnvironmentBoundary>
      <Suspense fallback={null}>
        <Coin key={logoUrl} logoUrl={logoUrl} spinMultiplier={spinMultiplier} thickness={clampedThickness} hasText={hasText} drag={drag} />
      </Suspense>
    </Canvas>
    </div>
  )
}
