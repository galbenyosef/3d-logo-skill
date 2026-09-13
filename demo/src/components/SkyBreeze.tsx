import { useEffect, useRef, useState, type RefObject } from 'react'
import { parseObjectPosition, SUN_IMAGE_UV_LANDSCAPE, SUN_IMAGE_UV_PORTRAIT, SUN_RADIUS_RATIO } from '../lib/coverUv'

// Full-screen triangle in clip space — one draw call, no index/vertex-count
// bookkeeping, and no seam down the middle a quad's two triangles would need
// (see e.g. https://michaldrobot.com — the standard trick). Vertices past
// the [-1,1] clip box are simply clipped; only the on-screen slice of the
// interpolated v_uv below is ever sampled.
const VERT_SRC = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  // y-down uv (0,0 = top-left), matching CSS/coverUv.ts's convention.
  v_uv = vec2(a_position.x * 0.5 + 0.5, 1.0 - (a_position.y * 0.5 + 0.5));
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Displaces the cover-mapped lookup uv with slow value-noise flow so the
// painted clouds billow gently — calm air, not water or heat shimmer.
// Mirrors computeCoverMapping (coverUv.ts) so it samples the exact same
// pixel the <img> underneath shows at rest (displacement = 0).
const FRAG_SRC = `
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;     // container CSS px
uniform vec2 u_imageSize;      // natural image px
uniform vec2 u_objectPosition; // 0-1 fractions
uniform vec2 u_sunUv;          // image-space uv
uniform float u_sunRadius;     // fraction of image width
uniform float u_time;          // seconds

varying vec2 v_uv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  return 0.6 * valueNoise(p) + 0.4 * valueNoise(p * 2.13 + 17.0);
}

void main() {
  // ---- object-fit: cover mapping (mirrors coverUv.ts computeCoverMapping) ----
  float containerAspect = u_resolution.x / u_resolution.y;
  float imageAspect = u_imageSize.x / u_imageSize.y;
  float renderW;
  float renderH;
  if (imageAspect > containerAspect) {
    renderH = u_resolution.y;
    renderW = renderH * imageAspect;
  } else {
    renderW = u_resolution.x;
    renderH = renderW / imageAspect;
  }
  float scale = renderW / u_imageSize.x;
  float offsetX = ((renderW - u_resolution.x) * u_objectPosition.x) / scale / u_imageSize.x;
  float offsetY = ((renderH - u_resolution.y) * u_objectPosition.y) / scale / u_imageSize.y;
  float spanX = u_resolution.x / (scale * u_imageSize.x);
  float spanY = u_resolution.y / (scale * u_imageSize.y);

  vec2 imageUv = vec2(offsetX + v_uv.x * spanX, offsetY + v_uv.y * spanY);

  // ---- sun mask: 0 displacement inside the disc + its edge, aspect-corrected
  // so the smoothstep ring is round in real image pixels, not squashed. ----
  float aspect = u_imageSize.x / u_imageSize.y;
  vec2 sunDelta = imageUv - u_sunUv;
  sunDelta.y /= aspect;
  float sunDist = length(sunDelta);
  float sunMask = smoothstep(0.9 * u_sunRadius, 1.2 * u_sunRadius, sunDist);

  // ---- cloud weighting: displacement leans toward the lower (cloud) band. ----
  float cloudWeight = mix(0.4, 1.0, smoothstep(0.35, 0.75, imageUv.y));

  float t = u_time;
  vec2 flowA = vec2(fbm(imageUv * 3.0 + t * 0.015), fbm(imageUv * 3.0 + 11.0 + t * 0.015 * 0.8)) - 0.5;
  vec2 flowB = vec2(fbm(imageUv * 5.0 - t * 0.025), fbm(imageUv * 5.0 + 31.0 - t * 0.025 * 0.7)) - 0.5;
  vec2 displacement = flowA * 0.6 + flowB * 0.4;
  displacement.y *= 0.35; // mostly horizontal
  displacement.x += sin(t * 0.05 + imageUv.y * 6.0) * 0.0012;

  displacement *= 0.0035 * sunMask * cloudWeight;

  vec2 sampleUv = clamp(imageUv + displacement, vec2(0.0), vec2(1.0));
  gl_FragColor = texture2D(u_texture, sampleUv);
}
`

const TARGET_FPS = 30
const FRAME_BUDGET_MS = 1000 / TARGET_FPS
const MAX_DPR = 1.5

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  if (!vert || !frag) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  gl.deleteShader(vert)
  gl.deleteShader(frag)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

interface SkyBreezeProps {
  /** The already-mounted, already-loaded <img> whose picked source (`currentSrc`) this shader overlays. */
  imgRef: RefObject<HTMLImageElement | null>
  /** True once the img's `onLoad` has fired for its current source. */
  ready: boolean
}

/**
 * A full-screen WebGL quad drawn directly over the painted sky plate,
 * displacing the lookup uv with slow flowing noise so the clouds gently
 * billow — a "breeze" cinemagraph. Reuses the <img> element itself as the
 * texture source (no second fetch), so it always shows the exact
 * responsive image the browser picked. See coverUv.ts for the shared
 * cover-mapping math and .impeccable.md / the sky owner's ask for why this
 * stays this subtle (amplitude ~0.0035 uv, sun disc masked out).
 */
export function SkyBreeze({ imgRef, ready }: SkyBreezeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [supported, setSupported] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (reducedMotion || !ready) return
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) {
      setSupported(false)
      return
    }

    const program = createProgram(gl)
    if (!program) {
      setSupported(false)
      return
    }

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    // The oversized triangle: (-1,-1), (3,-1), (-1,3) — covers the whole viewport.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const positionLoc = gl.getAttribLocation(program, 'a_position')

    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    let destroyed = false
    let uploadedOnce = false

    const uploadTexture = () => {
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        uploadedOnce = true
      } catch {
        // Tainted/cross-origin or decode failure — bail out to the static img.
        setSupported(false)
      }
    }

    const decode = 'decode' in img ? img.decode().catch(() => undefined) : Promise.resolve()
    decode.then(() => {
      if (!destroyed) uploadTexture()
    })

    const u_texture = gl.getUniformLocation(program, 'u_texture')
    const u_resolution = gl.getUniformLocation(program, 'u_resolution')
    const u_imageSize = gl.getUniformLocation(program, 'u_imageSize')
    const u_objectPosition = gl.getUniformLocation(program, 'u_objectPosition')
    const u_sunUv = gl.getUniformLocation(program, 'u_sunUv')
    const u_sunRadius = gl.getUniformLocation(program, 'u_sunRadius')
    const u_time = gl.getUniformLocation(program, 'u_time')

    let cssWidth = 0
    let cssHeight = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      cssWidth = rect.width
      cssHeight = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let isIntersecting = true
    const screen1 = canvas.closest('.screen-1')
    const io = screen1
      ? new IntersectionObserver(
          ([entry]) => {
            isIntersecting = entry.isIntersecting
            if (isIntersecting) start()
            else stop()
          },
          { threshold: 0 },
        )
      : null
    if (io && screen1) io.observe(screen1)

    const startTime = performance.now()
    let raf = 0
    let running = false
    let lastFrame = 0
    let firstFrameDrawn = false

    const draw = (t: number) => {
      if (!uploadedOnce || cssWidth === 0 || cssHeight === 0) return
      const objectPosition = parseObjectPosition(getComputedStyle(img).objectPosition)
      const isPortrait = img.naturalWidth < img.naturalHeight
      const sunUv = isPortrait ? SUN_IMAGE_UV_PORTRAIT : SUN_IMAGE_UV_LANDSCAPE

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.enableVertexAttribArray(positionLoc)
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(u_texture, 0)
      gl.uniform2f(u_resolution, cssWidth, cssHeight)
      gl.uniform2f(u_imageSize, img.naturalWidth || 1, img.naturalHeight || 1)
      gl.uniform2f(u_objectPosition, objectPosition.x, objectPosition.y)
      gl.uniform2f(u_sunUv, sunUv.x, sunUv.y)
      gl.uniform1f(u_sunRadius, SUN_RADIUS_RATIO)
      gl.uniform1f(u_time, t)

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      if (!firstFrameDrawn) {
        firstFrameDrawn = true
        setVisible(true)
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - lastFrame < FRAME_BUDGET_MS) return
      lastFrame = now
      draw((now - startTime) / 1000)
    }

    function start() {
      if (running) return
      running = true
      raf = requestAnimationFrame(frame)
    }

    function stop() {
      running = false
      cancelAnimationFrame(raf)
    }

    const onVisibilityChange = () => {
      if (document.hidden) stop()
      else if (isIntersecting) start()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    start()

    return () => {
      destroyed = true
      stop()
      ro.disconnect()
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      gl.deleteTexture(texture)
      gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
      const lose = gl.getExtension('WEBGL_lose_context')
      lose?.loseContext()
    }
  }, [reducedMotion, ready, imgRef])

  if (reducedMotion || !supported) return null

  return <canvas ref={canvasRef} className={`sky-breeze${visible ? ' sky-breeze-visible' : ''}`} aria-hidden="true" />
}
