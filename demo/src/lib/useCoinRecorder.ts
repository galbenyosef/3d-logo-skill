import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { SpinOverride } from '../components/SpinningLogo3D'
import {
  EXPORT_BACKGROUND,
  EXPORT_CREDIT,
  EXPORT_DURATION_MS,
  EXPORT_FPS,
  EXPORT_SIZE,
  buildFilename,
  pickExportFormat,
  rotationAtProgress,
} from './coinExport'

interface Options {
  /** The R3F WebGL canvas to capture. */
  getCanvas: () => HTMLCanvasElement | null
  spinOverride: MutableRefObject<SpinOverride>
  logoName: string | null
}

export interface CoinRecorder {
  /** False when MediaRecorder or a usable video format is missing — hide the control. */
  supported: boolean
  /** 0..1 while recording, null otherwise. */
  progress: number | null
  /** True after a clip was saved, until dismissed. */
  downloaded: boolean
  dismiss: () => void
  start: () => Promise<void>
}

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))

function drawFrame(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement) {
  ctx.fillStyle = EXPORT_BACKGROUND
  ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
  // Centre-crop to a square (the stage is square; this only guards odd sizes).
  const side = Math.min(source.width, source.height)
  ctx.drawImage(
    source,
    (source.width - side) / 2,
    (source.height - side) / 2,
    side,
    side,
    0,
    0,
    EXPORT_SIZE,
    EXPORT_SIZE,
  )
  ctx.font = "22px 'JetBrains Mono', ui-monospace, Menlo, monospace"
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.38)'
  ctx.fillText(EXPORT_CREDIT, EXPORT_SIZE - 36, EXPORT_SIZE - 36)
}

/**
 * Records exactly one 360° turn of the coin. Each frame is composited onto an
 * offscreen 2D canvas (solid dusk background + credit) and that canvas is what
 * MediaRecorder sees, since the WebGL canvas itself is transparent.
 */
export function useCoinRecorder({ getCanvas, spinOverride, logoName }: Options): CoinRecorder {
  const format = useMemo(
    () =>
      typeof MediaRecorder === 'undefined' ? null : pickExportFormat((m) => MediaRecorder.isTypeSupported(m)),
    [],
  )
  const [progress, setProgress] = useState<number | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      spinOverride.current.angle = null
    }
  }, [spinOverride])

  const start = useCallback(async () => {
    const source = getCanvas()
    if (!format || !source || busy.current) return
    busy.current = true
    setDownloaded(false)
    setProgress(0)

    const out = document.createElement('canvas')
    out.width = out.height = EXPORT_SIZE
    const ctx = out.getContext('2d')!
    const recorder = new MediaRecorder(out.captureStream(EXPORT_FPS), {
      mimeType: format.mimeType,
      videoBitsPerSecond: 8_000_000,
    })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })

    try {
      // Park at angle 0 and let the render loop show it before the first frame.
      spinOverride.current.angle = rotationAtProgress(0)
      await nextFrame()
      await nextFrame()
      drawFrame(ctx, source)
      recorder.start()
      const t0 = performance.now()
      for (;;) {
        const now = await nextFrame()
        const elapsed = Math.max(0, Math.min(now, performance.now()) - t0)
        const p = elapsed / EXPORT_DURATION_MS
        // The last frame stays short of 2π, which is frame 0 again — no doubled frame in the loop.
        if (p >= 1) break
        spinOverride.current.angle = rotationAtProgress(p)
        drawFrame(ctx, source)
        if (mounted.current) setProgress(p)
      }
      recorder.stop()
      await stopped
      const blob = new Blob(chunks, { type: format.mimeType.split(';')[0] })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildFilename(logoName, format.extension)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      if (mounted.current) setDownloaded(true)
    } finally {
      if (recorder.state !== 'inactive') recorder.stop()
      spinOverride.current.angle = null
      busy.current = false
      if (mounted.current) setProgress(null)
    }
  }, [format, getCanvas, spinOverride, logoName])

  const dismiss = useCallback(() => setDownloaded(false), [])

  return { supported: format !== null, progress, downloaded, dismiss, start }
}
