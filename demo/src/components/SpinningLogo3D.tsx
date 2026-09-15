import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, useTexture } from '@react-three/drei'
import { BufferGeometry, CanvasTexture, NeutralToneMapping, DoubleSide, type Group, LinearSRGBColorSpace, SRGBColorSpace, Vector2 } from 'three'
import sunsetHdrUrl from '../assets/hdri/venice_sunset_1k.hdr?url'
import { buildRim } from '../lib/rimGeometry'
import { computeCoinFaces } from '../lib/coinFaces'
import {
  applyBrightnessThreshold,
  clearDetachedSpecks,
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
const EMBOSS_STRENGTH = 1.5

// r/threejs launch feedback (u/BigDeadPixel): "can you change the thickness
// of the coin?" — exposed as a prop instead of only the module constant.
// Clamped so the rim geometry never collapses (too thin) or dwarfs the
// logo faces (too thick).
const THICKNESS_MIN = 0.15
const THICKNESS_MAX = 1.2

function clampThickness(value: number): number {
  return Math.min(THICKNESS_MAX, Math.max(THICKNESS_MIN, value))
}

interface LogoAssets {
  colorTexture: CanvasTexture
  normalMap: CanvasTexture
  rimGeometry: BufferGeometry
  rimColor: string
  rimEmissive: string
}

/** SKILL.md 2a + 2b + 2c, assembled: transparency, normal map, perimeter, rim. */
function useLogoAssets(logoUrl: string, thickness: number): LogoAssets {
  const srcTexture = useTexture(logoUrl)
  return useMemo(() => {
    const img = srcTexture.image as HTMLImageElement
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    const d = imageData.data

    // Only remove a background when the source has no real alpha of its own
    // (SKILL.md 2a: "if already transparent, skip"). A solid flat border
    // (white, black, or any other flat colour) is removed with a contiguous
    // flood fill so enclosed same-colour details inside the logo survive;
    // only a photo/gradient/busy edge — where detectSolidBackground finds
    // nothing — falls back to the old global dark-brightness threshold.
    if (!hasNativeAlpha(d)) {
      const bg = detectSolidBackground(d, width, height)
      if (bg) {
        removeBackgroundFromEdges(d, width, height, bg, BG_TOLERANCE)
      } else {
        applyBrightnessThreshold(d, BG_THRESHOLD)
      }
    }
    // Same speck rule the rim uses, applied to the colour texture too, so
    // stray pixels left by a noisy background don't float on the face.
    clearDetachedSpecks(d, width, height)
    ctx.putImageData(imageData, 0, 0)

    const colorTexture = new CanvasTexture(canvas)
    colorTexture.colorSpace = SRGBColorSpace

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

    const outlines = extractPerimeter(d, width, height)
    const rimGeometry = buildRim(outlines, PLANE_SIZE, thickness)
    const { color, emissive } = pickRimPalette(d)

    return { colorTexture, normalMap, rimGeometry, rimColor: color, rimEmissive: emissive }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- thickness rebuilds
    // only the rim, not the (expensive) texture/normal-map extraction; both
    // are re-derived here regardless since they share this one memo.
  }, [srcTexture, thickness])
}

function Coin({
  logoUrl,
  spinMultiplier,
  thickness,
}: {
  logoUrl: string
  spinMultiplier: number
  thickness: number
}) {
  const groupRef = useRef<Group>(null)
  const { colorTexture, normalMap, rimGeometry, rimColor, rimEmissive } = useLogoAssets(logoUrl, thickness)
  const normalScale = useMemo(() => new Vector2(EMBOSS_STRENGTH, EMBOSS_STRENGTH), [])
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * SPIN_SPEED * spinMultiplier
  })
  const { front, back } = useMemo(() => computeCoinFaces(thickness), [thickness])
  return (
    <group ref={groupRef}>
      <mesh position={front.position} rotation-y={front.rotationY}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshStandardMaterial
          map={colorTexture}
          normalMap={normalMap}
          normalScale={normalScale}
          metalness={0.15}
          roughness={0.35}
          envMapIntensity={0.4}
          side={front.side}
          transparent
          depthWrite={false}
        />
      </mesh>
      {/*
        Back face = the same plane seen from behind (BackSide, no Y rotation),
        so its silhouette is exactly the rim's outline — SKILL.md 2d and
        computeCoinFaces (../lib/coinFaces.ts). Rotating it by PI made the
        logo "readable" from behind but mirrored its outline against the
        rim, which showed on every asymmetric logo (issue #11).
      */}
      <mesh position={back.position} rotation-y={back.rotationY}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshStandardMaterial
          map={colorTexture}
          normalMap={normalMap}
          normalScale={normalScale}
          metalness={0.15}
          roughness={0.35}
          envMapIntensity={0.4}
          side={back.side}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={rimGeometry}>
        <meshStandardMaterial
          color={rimColor}
          metalness={1.0}
          roughness={0.12}
          emissive={rimEmissive}
          emissiveIntensity={0.15}
          envMapIntensity={1.5}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}

/**
 * `sunset` — the default preset (see App.tsx) — ships self-hosted, since
 * defaulting to it means every first visit pays its fetch cost. Every other
 * preset still goes through drei's own CDN loader on demand.
 */
function CoinEnvironment({ envPreset }: { envPreset: EnvPreset }) {
  if (envPreset === 'sunset') return <Environment files={sunsetHdrUrl} />
  return <Environment preset={envPreset} />
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
}

export function SpinningLogo3D({ logoUrl, envPreset, spinMultiplier = 1, thickness = THICKNESS }: SpinningLogo3DProps) {
  const clampedThickness = clampThickness(thickness)
  return (
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
      <Suspense fallback={null}>
        <CoinEnvironment envPreset={envPreset} />
      </Suspense>
      <Suspense fallback={null}>
        <Coin key={logoUrl} logoUrl={logoUrl} spinMultiplier={spinMultiplier} thickness={clampedThickness} />
      </Suspense>
    </Canvas>
  )
}
