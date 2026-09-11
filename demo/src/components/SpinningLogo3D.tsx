import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, useTexture } from '@react-three/drei'
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  FrontSide,
  type Group,
  LinearSRGBColorSpace,
  SRGBColorSpace,
  Vector2,
} from 'three'
import { buildRim } from '../lib/rimGeometry'
import {
  applyBrightnessThreshold,
  extractPerimeter,
  generateNormalMapData,
  hasNativeAlpha,
  pickRimPalette,
} from '../lib/textureProcessing'
import type { EnvPreset } from '../lib/envPresets'

// Tunable constants from SKILL.md Step 4, unchanged.
const PLANE_SIZE = 4.8
const THICKNESS = 0.45
const SPIN_SPEED = 0.35
const BG_THRESHOLD = 18
const EMBOSS_STRENGTH = 1.5

interface LogoAssets {
  colorTexture: CanvasTexture
  normalMap: CanvasTexture
  rimGeometry: BufferGeometry
  rimColor: string
  rimEmissive: string
}

/** SKILL.md 2a + 2b + 2c, assembled: transparency, normal map, perimeter, rim. */
function useLogoAssets(logoUrl: string): LogoAssets {
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

    // Only threshold-remove a dark background when the source has no real
    // alpha of its own (SKILL.md 2a: "if already transparent, skip").
    if (!hasNativeAlpha(d)) {
      applyBrightnessThreshold(d, BG_THRESHOLD)
      ctx.putImageData(imageData, 0, 0)
    }

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

    const outline = extractPerimeter(d, width, height)
    const rimGeometry = buildRim(outline, PLANE_SIZE, THICKNESS)
    const { color, emissive } = pickRimPalette(d)

    return { colorTexture, normalMap, rimGeometry, rimColor: color, rimEmissive: emissive }
  }, [srcTexture])
}

function Coin({ logoUrl, spinMultiplier }: { logoUrl: string; spinMultiplier: number }) {
  const groupRef = useRef<Group>(null)
  const { colorTexture, normalMap, rimGeometry, rimColor, rimEmissive } = useLogoAssets(logoUrl)
  const normalScale = useMemo(() => new Vector2(EMBOSS_STRENGTH, EMBOSS_STRENGTH), [])
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * SPIN_SPEED * spinMultiplier
  })
  const half = THICKNESS / 2
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, half]}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshStandardMaterial
          map={colorTexture}
          normalMap={normalMap}
          normalScale={normalScale}
          metalness={0.15}
          roughness={0.35}
          envMapIntensity={0.4}
          side={FrontSide}
          transparent
          depthWrite={false}
        />
      </mesh>
      {/* Back face rotated on Y (not UV-flipped) so both sides read correctly — SKILL.md 2d. */}
      <mesh position={[0, 0, -half]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshStandardMaterial
          map={colorTexture}
          normalMap={normalMap}
          normalScale={normalScale}
          metalness={0.15}
          roughness={0.35}
          envMapIntensity={0.4}
          side={FrontSide}
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

export interface SpinningLogo3DProps {
  logoUrl: string
  envPreset: EnvPreset
  /** 1 = full speed, lower values honor prefers-reduced-motion. */
  spinMultiplier?: number
}

export function SpinningLogo3D({ logoUrl, envPreset, spinMultiplier = 1 }: SpinningLogo3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 40 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 5, 5]} intensity={2.5} />
      <directionalLight position={[-3, -2, 4]} intensity={0.8} color="#06b6d4" />
      <directionalLight position={[0, 0, -5]} intensity={0.5} color="#0ea5e9" />
      {/*
        Suspense MUST live inside Canvas — useTexture suspends in R3F's own
        reconciler, and an outer Suspense won't catch it. Environment also
        suspends while it fetches its HDR map, so it shares this boundary
        rather than risking an unhandled suspend above the Canvas tree.
      */}
      <Suspense fallback={null}>
        <Environment preset={envPreset} />
        <Coin key={logoUrl} logoUrl={logoUrl} spinMultiplier={spinMultiplier} />
      </Suspense>
    </Canvas>
  )
}
