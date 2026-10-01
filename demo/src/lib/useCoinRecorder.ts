import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { SpinOverride } from '../components/SpinningLogo3D'
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import {
  EXPORT_BACKGROUND,
  EXPORT_FRAME_COUNT,
  H264_CODECS,
  angleAtFrame,
  frameTimestampUs,
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
  const hasEncoder = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
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

  /** Frame-exact path: N poses rendered synchronously, H.264 via WebCodecs, muxed to mp4. Null if unsupported. */
  const encodeFrameExact = useCallback(
    async (source: HTMLCanvasElement, out: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<Blob | null> => {
      const renderAt = spinOverride.current.renderAt
      if (!hasEncoder || !renderAt) return null
      let codec: string | null = null
      for (const c of H264_CODECS) {
        const cfg = { codec: c, width: EXPORT_SIZE, height: EXPORT_SIZE, bitrate: 8_000_000, framerate: EXPORT_FPS }
        try {
          if ((await VideoEncoder.isConfigSupported(cfg)).supported) {
            codec = c
            break
          }
        } catch {
          /* try the next profile */
        }
      }
      if (!codec) return null

      const target = new ArrayBufferTarget()
      const muxer = new Muxer({
        target,
        video: { codec: 'avc', width: EXPORT_SIZE, height: EXPORT_SIZE, frameRate: EXPORT_FPS },
        fastStart: 'in-memory',
      })
      let failure: unknown = null
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          failure = e
        },
      })
      encoder.configure({ codec, width: EXPORT_SIZE, height: EXPORT_SIZE, bitrate: 8_000_000, framerate: EXPORT_FPS })
      try {
        for (let i = 0; i < EXPORT_FRAME_COUNT; i++) {
          if (failure) throw failure
          renderAt(angleAtFrame(i))
          drawFrame(ctx, source)
          const frame = new VideoFrame(out, {
            timestamp: frameTimestampUs(i),
            duration: frameTimestampUs(i + 1) - frameTimestampUs(i),
          })
          encoder.encode(frame, { keyFrame: i % EXPORT_FPS === 0 })
          frame.close()
          // Backpressure + a paint every few frames so the progress label moves.
          while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4))
          if (i % 6 === 0) {
            if (mounted.current) setProgress(i / EXPORT_FRAME_COUNT)
            await nextFrame()
          }
        }
        await encoder.flush()
        if (failure) throw failure
        muxer.finalize()
        return new Blob([target.buffer], { type: 'video/mp4' })
      } finally {
        if (encoder.state !== 'closed') encoder.close()
      }
    },
    [hasEncoder, spinOverride],
  )

  /** Fallback: wall-clock MediaRecorder capture of the offscreen canvas. */
  const recordRealtime = useCallback(
    async (source: HTMLCanvasElement, out: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<Blob | null> => {
      if (!format) return null
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
          if (p >= 1) break
          spinOverride.current.angle = rotationAtProgress(p)
          drawFrame(ctx, source)
          if (mounted.current) setProgress(p)
        }
        recorder.stop()
        await stopped
        return new Blob(chunks, { type: format.mimeType.split(';')[0] })
      } finally {
        if (recorder.state !== 'inactive') recorder.stop()
      }
    },
    [format, spinOverride],
  )

  const start = useCallback(async () => {
    const source = getCanvas()
    if (!source || busy.current) return
    busy.current = true
    setDownloaded(false)
    setProgress(0)
    const out = document.createElement('canvas')
    out.width = out.height = EXPORT_SIZE
    const ctx = out.getContext('2d')!
    try {
      let blob: Blob | null = null
      let extension: string = format?.extension ?? 'mp4'
      try {
        blob = await encodeFrameExact(source, out, ctx)
        if (blob) extension = 'mp4'
      } catch (err) {
        console.warn('Frame-exact export failed, falling back to MediaRecorder', err)
      }
      if (!blob) {
        spinOverride.current.angle = null
        blob = await recordRealtime(source, out, ctx)
        extension = format?.extension ?? 'webm'
      }
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildFilename(logoName, extension)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      if (mounted.current) setDownloaded(true)
    } finally {
      spinOverride.current.angle = null
      busy.current = false
      if (mounted.current) setProgress(null)
    }
  }, [format, getCanvas, spinOverride, logoName, encodeFrameExact, recordRealtime])

  const dismiss = useCallback(() => setDownloaded(false), [])

  return { supported: format !== null || hasEncoder, progress, downloaded, dismiss, start }
}
