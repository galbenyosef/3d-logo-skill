---
name: 3d-logo
description: Create a 3D spinning coin/medal effect from any logo image using React Three Fiber. Auto-detects the logo's outline, removes solid backgrounds (white, black or any flat colour), builds a chrome-rimmed coin that follows the exact logo shape, and adds environment reflections. Use when the user wants a 3D logo, spinning logo, rotating logo, coin effect, medal effect, logo animation, or mentions making a logo "3D" or "spin." Also trigger when user says "3d-logo", "spinning coin", "logo coin", "3D badge", or wants to turn a flat image into a premium 3D rotating element.
---

# 3D Logo Spinner

Generate a self-contained React component that renders any logo as a premium 3D spinning coin/medal with chrome edges and environment reflections.

## What it produces

A `SpinningLogo3D.tsx` component that:
- Takes any logo image (PNG, JPG, SVG rasterized) and renders it as a 3D coin
- Auto-removes solid backgrounds (white, black or any flat colour) by converting to transparency at runtime
- Extracts the logo's exact perimeter from the alpha channel
- Builds a chrome rim that follows the logo's actual outline shape
- Renders the logo on BOTH faces, with the back face's outline matching the rim exactly (seen from behind it's the mirror image, as on a real stamped coin)
- Adds environment reflections for a premium chrome finish
- Spins smoothly on the Y axis

## Dependencies

The target project needs these packages:
```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

## How to build the component

### Step 1: Identify the logo

Ask the user for the logo path (relative to `public/` or `src/assets/`). Check the file exists. Read it to see the logo visually — this helps you understand the shape.

Check the actual file format:
```bash
file <path-to-logo>
```
The extension may lie (e.g., a `.png` that's actually JPEG). This matters because JPEG has no alpha channel — the transparency must be generated at runtime.

### Step 2: Generate the component

Create `SpinningLogo3D.tsx` using this architecture:

#### 2a. Dynamic transparency generation and normal map

The logo image likely has a solid background — white, black, or any other flat colour — with no alpha channel. Detect that background by sampling the image's 1px border and taking the median colour; if enough border pixels agree, remove it with a **contiguous** flood fill seeded from the border, so only the background region actually connected to the edge clears — an enclosed same-colour detail inside the logo (the white of an eye, the counter of an "O") is never touched, because the fill can only reach it through connected matching pixels and there's no path in from the border. A border that doesn't agree on one colour (a photo, a gradient, a busy edge) falls back to the old global dark-brightness threshold. Also generate a normal map via Sobel filter for embossed depth on the coin faces. Requires `Vector2` and `LinearSRGBColorSpace` from Three.js in addition to the other imports:

```tsx
const BG_TOLERANCE = 24 // max per-channel diff to count as "the same colour" as the background
const BORDER_MATCH_RATIO = 0.85 // fraction of border pixels that must agree for it to count as solid
interface RGB { r: number; g: number; b: number }

// Median colour of the image's border; null if the border doesn't agree
// (a photo/gradient/busy edge) — caller falls back to the brightness threshold.
function detectSolidBackground(data: Uint8ClampedArray, width: number, height: number): RGB | null {
  const pixelAt = (x: number, y: number): RGB => {
    const i = (y * width + x) * 4
    return { r: data[i], g: data[i + 1], b: data[i + 2] }
  }
  const border: RGB[] = []
  for (let x = 0; x < width; x++) { border.push(pixelAt(x, 0)); border.push(pixelAt(x, height - 1)) }
  for (let y = 1; y < height - 1; y++) { border.push(pixelAt(0, y)); border.push(pixelAt(width - 1, y)) }
  const median = (vals: number[]) => [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)]
  const bg: RGB = { r: median(border.map((p) => p.r)), g: median(border.map((p) => p.g)), b: median(border.map((p) => p.b)) }
  const diff = (p: RGB) => Math.max(Math.abs(p.r - bg.r), Math.abs(p.g - bg.g), Math.abs(p.b - bg.b))
  const matches = border.filter((p) => diff(p) <= BG_TOLERANCE).length
  return matches / border.length >= BORDER_MATCH_RATIO ? bg : null
}

// Iterative (explicit stack, never recursive — must handle 1024x1024 fast)
// 4-connected flood fill seeded from every border pixel matching `bg`. Only
// the background CONTIGUOUS with the border is cleared. Near-match pixels
// next to the cleared region get their alpha scaled down for a soft,
// anti-aliased edge instead of a hard white/colour halo.
function removeBackgroundFromEdges(
  data: Uint8ClampedArray, width: number, height: number, bg: RGB, tolerance = BG_TOLERANCE,
): void {
  const n = width * height
  const removed = new Uint8Array(n)
  const visited = new Uint8Array(n)
  const stack = new Int32Array(n)
  let stackLen = 0
  const dist = (i: number) => {
    const o = i * 4
    return Math.max(Math.abs(data[o] - bg.r), Math.abs(data[o + 1] - bg.g), Math.abs(data[o + 2] - bg.b))
  }
  const visit = (i: number) => {
    if (visited[i]) return
    visited[i] = 1
    if (dist(i) <= tolerance) { removed[i] = 1; stack[stackLen++] = i }
  }
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1) }
  while (stackLen > 0) {
    const i = stack[--stackLen]
    const x = i % width, y = (i / width) | 0
    if (x > 0) visit(i - 1)
    if (x < width - 1) visit(i + 1)
    if (y > 0) visit(i - width)
    if (y < height - 1) visit(i + width)
  }
  for (let i = 0; i < n; i++) {
    const o = i * 4
    if (removed[i]) { data[o + 3] = 0; continue }
    const x = i % width, y = (i / width) | 0
    const nearRemoved =
      (x > 0 && removed[i - 1] === 1) || (x < width - 1 && removed[i + 1] === 1) ||
      (y > 0 && removed[i - width] === 1) || (y < height - 1 && removed[i + width] === 1)
    if (!nearRemoved) continue
    const d = dist(i)
    if (d > tolerance && d < 2 * tolerance) data[o + 3] = Math.round(data[o + 3] * ((d - tolerance) / tolerance))
  }
}

function useLogoTextures(logoPath: string, threshold = 18) {
  const srcTexture = useTexture(logoPath)
  return useMemo(() => {
    const img = srcTexture.image as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = imageData.data
    const bg = detectSolidBackground(d, canvas.width, canvas.height)
    if (bg) {
      removeBackgroundFromEdges(d, canvas.width, canvas.height, bg)
    } else {
      // No solid border found (photo/gradient/busy edge) — fall back to the
      // old global dark-brightness threshold.
      for (let i = 0; i < d.length; i += 4) {
        const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3
        if (brightness < threshold) d[i + 3] = 0
      }
    }
    clearDetachedSpecks(d, canvas.width, canvas.height) // see 2b
    ctx.putImageData(imageData, 0, 0)
    const colorTexture = new CanvasTexture(canvas)
    colorTexture.colorSpace = SRGBColorSpace

    // Generate normal map from brightness using Sobel filter
    const w = canvas.width, h = canvas.height
    const normalCanvas = document.createElement('canvas')
    normalCanvas.width = w
    normalCanvas.height = h
    const nCtx = normalCanvas.getContext('2d')!
    const normalData = nCtx.createImageData(w, h)
    const nd = normalData.data
    const bright = (x: number, y: number) => {
      const cx = Math.max(0, Math.min(w - 1, x))
      const cy = Math.max(0, Math.min(h - 1, y))
      const i = (cy * w + cx) * 4
      return (d[i] + d[i + 1] + d[i + 2]) / 765
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = bright(x + 1, y) - bright(x - 1, y)
        const dy = bright(x, y + 1) - bright(x, y - 1)
        const len = Math.sqrt(dx * dx + dy * dy + 1)
        const i = (y * w + x) * 4
        nd[i]     = ((-dx / len) * 0.5 + 0.5) * 255
        nd[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
        nd[i + 2] = ((1   / len) * 0.5 + 0.5) * 255
        nd[i + 3] = d[i + 3]
      }
    }
    nCtx.putImageData(normalData, 0, 0)
    const normalMap = new CanvasTexture(normalCanvas)
    normalMap.colorSpace = LinearSRGBColorSpace

    return { colorTexture, normalMap }
  }, [srcTexture, threshold])
}
```

**Why contiguous-only:** the flood fill only clears background pixels reachable from the border through 4-connected matching pixels. An enclosed same-colour region inside the logo — the white of an eye, the counter of an "O" — has no connected path back to the border, so it's never visited and stays opaque. This is also why a black background no longer punches holes in dark details inside the logo: the old global brightness threshold cleared every dark pixel regardless of position, while the flood fill only clears the connected background.

If the logo already has a transparent background (actual PNG with alpha), skip both the flood fill and the brightness threshold and just use the existing alpha. You can detect this: if `file` reports "PNG image data" (not JPEG), the image may have native transparency. Still apply the same hook but check alpha instead of brightness.

#### 2b. Perimeter extraction

Trace the **outer contour of each connected component** in the opaque mask with a Moore-neighbour boundary tracer. **Do not test `alpha > 0`** — real logo images (especially AI-generated ones) often carry residual low-alpha noise from compression/dithering scattered across nominally-transparent regions, sometimes reaching alpha values in the dozens far from the actual artwork. A raw `> 0` test lets that noise into the mask as its own tiny component. Threshold at a real opacity cutoff and drop tiny detached specks (a watermark, a stray bright pixel) that pass the threshold but sit outside the real logo shape — **do not just keep the single largest connected region**, since that would break a multi-part logo (an icon plus a separate wordmark, individual letters): keep every component that's at least `MIN_COMPONENT_RATIO` of the largest one's size, so real secondary pieces survive and only disproportionately tiny specks are dropped.

**Do not row-scan for left/right edges** — keeping only each row's leftmost and rightmost opaque pixel (the previous version of this section) is only correct for row-convex shapes. On a real logo it bridges gaps: a solid rim bar spans the empty space between two raised wingtips, and flat horizontal "shelves" appear wherever a tail or fin separates from the body within a row. A proper contour trace follows every concavity instead, and — because it runs per connected component — gives each separate piece of a multi-part logo its own loop instead of one hull-ish loop for the whole thing:

```tsx
const ALPHA_OPAQUE_THRESHOLD = 128
const MIN_COMPONENT_RATIO = 0.005 // components smaller than 0.5% of the largest are specks, not logo parts
type Point = [number, number]

// 4-connected flood-fill labelling, shared by dropSmallSpecks (needs sizes)
// and the contour tracer (needs each component isolated so a trace can't
// leak across a diagonal touch between two different pieces).
function labelComponents(mask: Uint8Array, width: number, height: number) {
  const n = width * height
  const labels = new Int32Array(n).fill(-1)
  const sizes: number[] = []
  const stack = new Int32Array(n)
  for (let start = 0; start < n; start++) {
    if (mask[start] !== 1 || labels[start] !== -1) continue
    const label = sizes.length
    let size = 0, stackLen = 0
    stack[stackLen++] = start
    labels[start] = label
    while (stackLen > 0) {
      const idx = stack[--stackLen]
      size++
      const x = idx % width, y = (idx / width) | 0
      if (x > 0 && mask[idx - 1] === 1 && labels[idx - 1] === -1) { labels[idx - 1] = label; stack[stackLen++] = idx - 1 }
      if (x < width - 1 && mask[idx + 1] === 1 && labels[idx + 1] === -1) { labels[idx + 1] = label; stack[stackLen++] = idx + 1 }
      if (y > 0 && mask[idx - width] === 1 && labels[idx - width] === -1) { labels[idx - width] = label; stack[stackLen++] = idx - width }
      if (y < height - 1 && mask[idx + width] === 1 && labels[idx + width] === -1) { labels[idx + width] = label; stack[stackLen++] = idx + width }
    }
    sizes.push(size)
  }
  return { labels, sizes }
}

// Drops any component under MIN_COMPONENT_RATIO of the largest.
function dropSmallSpecks(opaque: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height
  const { labels, sizes } = labelComponents(opaque, width, height)
  const result = new Uint8Array(n)
  if (sizes.length === 0) return result
  const largestSize = Math.max(...sizes)
  const minSize = largestSize * MIN_COMPONENT_RATIO
  for (let i = 0; i < n; i++) {
    const label = labels[i]
    if (label !== -1 && sizes[label] >= minSize) result[i] = 1
  }
  return result
}

// Apply the same speck rule to the COLOUR TEXTURE (call it in 2a, after the
// background removal and before creating the CanvasTexture). Background
// removal on a textured or noisy backdrop leaves isolated pixels just
// outside the colour tolerance; the rim ignores them, but without this the
// face texture still paints them as dust floating around the logo.
function clearDetachedSpecks(d: Uint8ClampedArray, width: number, height: number) {
  const n = width * height
  const visible = new Uint8Array(n)
  for (let i = 0; i < n; i++) visible[i] = d[i * 4 + 3] > 0 ? 1 : 0
  const kept = dropSmallSpecks(visible, width, height)
  for (let i = 0; i < n; i++) if (visible[i] && !kept[i]) d[i * 4 + 3] = 0
}

// Clockwise-ordered 8-neighbour offsets used by the Moore boundary tracer.
const MOORE_DIRS: Point[] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
]
function mooreDirIndex(dx: number, dy: number): number {
  for (let i = 0; i < 8; i++) if (MOORE_DIRS[i][0] === dx && MOORE_DIRS[i][1] === dy) return i
  return 0
}

// Moore-neighbour trace of one labelled component's OUTER boundary, in pixel
// coordinates. Starting from the component's topmost-then-leftmost pixel
// (always on the outer border — a raster-first pixel can never sit inside a
// hole) and always resuming the neighbour scan just past the direction we
// arrived from, the walk stays on the outside of the shape: interior holes
// are never visited, so a ring produces one outer loop and no hole loop.
// This walks clockwise in pixel space (y grows downward); the caller's
// y-flip into normalized coordinates turns that into counter-clockwise
// winding in the (y-up) space buildRim expects, so its tangent-derived
// normals come out pointing outward.
function traceComponentBoundary(labels: Int32Array, width: number, height: number, label: number): Point[] {
  const n = width * height
  let startIdx = -1
  for (let i = 0; i < n; i++) if (labels[i] === label) { startIdx = i; break }
  if (startIdx === -1) return []
  const startX = startIdx % width, startY = (startIdx / width) | 0
  const isFg = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && labels[y * width + x] === label

  let hasNeighbour = false
  for (const [dx, dy] of MOORE_DIRS) if (isFg(startX + dx, startY + dy)) { hasNeighbour = true; break }
  if (!hasNeighbour) {
    // Isolated single pixel: emit a tiny 1px square so resampling stays valid.
    return [[startX, startY], [startX + 1, startY], [startX + 1, startY + 1], [startX, startY + 1]]
  }

  const initialBacktrackX = startX - 1, initialBacktrackY = startY
  let cx = startX, cy = startY, bx = initialBacktrackX, by = initialBacktrackY
  const boundary: Point[] = [[cx, cy]]
  const maxSteps = n * 4 + 16
  for (let step = 0; step < maxSteps; step++) {
    const startDir = (mooreDirIndex(bx - cx, by - cy) + 1) % 8
    let foundDir = -1, lastBgX = bx, lastBgY = by
    for (let k = 0; k < 8; k++) {
      const d = (startDir + k) % 8
      const nx = cx + MOORE_DIRS[d][0], ny = cy + MOORE_DIRS[d][1]
      if (isFg(nx, ny)) { foundDir = d; break }
      lastBgX = nx; lastBgY = ny
    }
    if (foundDir === -1) break
    const nx = cx + MOORE_DIRS[foundDir][0], ny = cy + MOORE_DIRS[foundDir][1]
    bx = lastBgX; by = lastBgY; cx = nx; cy = ny
    if (cx === startX && cy === startY && bx === initialBacktrackX && by === initialBacktrackY) break
    boundary.push([cx, cy])
  }
  return boundary
}

function polygonPerimeter(pts: Point[]): number {
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

// Resamples a closed polygon to `count` points evenly spaced by arc length.
function resampleByArcLength(pts: Point[], count: number): Point[] {
  const n = pts.length
  if (n < 2 || count < 1) return pts
  const total = polygonPerimeter(pts)
  if (total === 0) return pts
  const step = total / count
  const result: Point[] = []
  let edgeIndex = 0
  let edgeStart = pts[0], edgeEnd = pts[1 % n]
  let edgeLen = Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1])
  let accumulated = 0
  for (let i = 0; i < count; i++) {
    const target = i * step
    while (accumulated + edgeLen < target && edgeIndex < n - 1) {
      accumulated += edgeLen
      edgeIndex++
      edgeStart = pts[edgeIndex % n]
      edgeEnd = pts[(edgeIndex + 1) % n]
      edgeLen = Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1])
    }
    const t = edgeLen === 0 ? 0 : (target - accumulated) / edgeLen
    result.push([edgeStart[0] + (edgeEnd[0] - edgeStart[0]) * t, edgeStart[1] + (edgeEnd[1] - edgeStart[1]) * t])
  }
  return result
}

// Traces every kept component's outer contour and returns one loop per piece.
function extractPerimeter(data: Uint8ClampedArray, width: number, height: number): Point[][] {
  const n = width * height
  const opaque = new Uint8Array(n)
  for (let i = 0; i < n; i++) opaque[i] = data[i * 4 + 3] > ALPHA_OPAQUE_THRESHOLD ? 1 : 0
  const mask = dropSmallSpecks(opaque, width, height)
  const { labels, sizes } = labelComponents(mask, width, height)
  if (sizes.length === 0) return []

  const loops: Point[][] = []
  for (let label = 0; label < sizes.length; label++) {
    const traced = traceComponentBoundary(labels, width, height, label)
    if (traced.length < 3) continue
    // Resample proportional to this loop's own perimeter (200-900 pts) so a
    // small secondary piece doesn't get the same vertex budget as the body.
    const targetCount = Math.max(200, Math.min(900, Math.round(polygonPerimeter(traced) / 3)))
    const resampled = resampleByArcLength(traced, targetCount)
    const normalized: Point[] = resampled.map(([px, py]) => [px / width - 0.5, 0.5 - py / height])
    // Laplacian smoothing removes pixel-level jitter for cleaner reflections
    loops.push(smoothOutline(normalized, 5))
  }
  return loops
}

function smoothOutline(outline: Point[], iterations: number): Point[] {
  let pts = outline
  const n = pts.length
  if (n < 3) return pts
  for (let iter = 0; iter < iterations; iter++) {
    const next: Point[] = []
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]
      const curr = pts[i]
      const nxt = pts[(i + 1) % n]
      next.push([
        curr[0] + 0.5 * ((prev[0] + nxt[0]) / 2 - curr[0]),
        curr[1] + 0.5 * ((prev[1] + nxt[1]) / 2 - curr[1]),
      ])
    }
    pts = next
  }
  return pts
}
```

**Why smoothing matters:** The perimeter traces pixel boundaries, creating micro-jitter. Each jagged step produces a slightly different normal, which chrome (metalness=1, low roughness) amplifies into visible horizontal bands. Laplacian smoothing averages each vertex toward its neighbors, producing a continuous curve that reflects the environment smoothly. It runs per loop (closed-loop aware via modulo indexing), so each piece of a multi-part logo is smoothed independently of the others.

#### 2c. Rim geometry builder

Build an indexed ring **per loop** (one wall per connected component from 2b) with manually computed tangent-based normals, all written into a single BufferGeometry. Each vertex's outward normal is derived from the averaged tangent direction of its neighbors — this produces much smoother reflections than `computeVertexNormals()` which averages face normals:

```tsx
function buildRim(outlines: Point[][], planeSize: number, thickness: number) {
  const half = thickness / 2
  const s = planeSize
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  let vertexOffset = 0

  for (const outline of outlines) {
    const n = outline.length
    if (n < 3) continue
    for (let i = 0; i < n; i++) {
      const prev = outline[(i - 1 + n) % n]
      const curr = outline[i]
      const next = outline[(i + 1) % n]
      // Averaged tangent → perpendicular = smooth outward normal
      const tx = next[0] - prev[0]
      const ty = next[1] - prev[1]
      const len = Math.sqrt(tx * tx + ty * ty) || 1
      const nx = ty / len
      const ny = -tx / len
      const x = curr[0] * s
      const y = curr[1] * s
      positions.push(x, y, half)    // front vertex
      normals.push(nx, ny, 0)
      positions.push(x, y, -half)   // back vertex
      normals.push(nx, ny, 0)
    }
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n
      const f1 = vertexOffset + i * 2, b1 = vertexOffset + i * 2 + 1
      const f2 = vertexOffset + i2 * 2, b2 = vertexOffset + i2 * 2 + 1
      indices.push(f1, b1, f2)
      indices.push(b1, b2, f2)
    }
    vertexOffset += n * 2
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geo.setIndex(indices)
  return geo
}
```

**Why tangent-based normals:** `computeVertexNormals()` averages face normals weighted by area — with hundreds of thin horizontal quads, the face normals barely differ between neighbors, so averaging doesn't help. Computing normals from the outline tangent direction gives each vertex a geometrically correct outward normal that interpolates smoothly along the rim surface. This only comes out pointing outward because each loop from 2b winds counter-clockwise in the normalized (y-up) coordinate space — check the sign if you change the tracer's winding.

#### 2d. Coin assembly

Two `PlaneGeometry` faces (front + back) with the transparent texture. The back face is the **same plane seen from behind**: same orientation as the front, pushed to `z = -half`, rendered with `side={BackSide}` (import `BackSide` from `three` alongside `FrontSide` and `DoubleSide`).

**Critical**: Do NOT rotate the back face `[0, PI, 0]`, and do NOT flip its UVs. Either one makes the back logo "readable" but mirrors its silhouette against the rim, which keeps the front outline — so on any asymmetric logo the rim visibly traces a reversed shape behind the face (issue #11). The back face must be the same plane as the front, just seen from behind: same position/rotation, pushed to `-half`, `side={BackSide}`.

```tsx
function Coin() {
  const groupRef = useRef<Group>(null)
  const { colorTexture, normalMap, rimGeometry } = useLogoAssets()
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * SPIN_SPEED
  })
  const half = THICKNESS / 2
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, half]}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshStandardMaterial
          map={colorTexture}
          normalMap={normalMap}
          normalScale={new Vector2(EMBOSS_STRENGTH, EMBOSS_STRENGTH)}
          metalness={0.15}
          roughness={0.35}
          envMapIntensity={0.4}
          side={FrontSide}
          transparent
          depthWrite={false}
        />
      </mesh>
      {/* Same plane seen from behind: silhouette matches the rim exactly. */}
      <mesh position={[0, 0, -half]}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshStandardMaterial
          map={colorTexture}
          normalMap={normalMap}
          normalScale={new Vector2(EMBOSS_STRENGTH, EMBOSS_STRENGTH)}
          metalness={0.15}
          roughness={0.35}
          envMapIntensity={0.4}
          side={BackSide}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={rimGeometry}>
        <meshStandardMaterial
          color="#8ecae6" metalness={1.0} roughness={0.12}
          emissive="#06b6d4" emissiveIntensity={0.15}
          envMapIntensity={1.5} side={DoubleSide}
        />
      </mesh>
    </group>
  )
}
```

#### 2e. Canvas and lighting

`preserveDrawingBuffer: true` enables `toDataURL()` for screenshots — can be set to `false` for slightly better GPU performance if not needed.

```tsx
export function SpinningLogo3D({ size = 540 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }} className="mx-auto">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 40 }}
        // NeutralToneMapping (import from `three`): R3F's default ACES Filmic
        // desaturates bright base colours and washes logos toward pastel.
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true, toneMapping: NeutralToneMapping }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={2.5} />
        <directionalLight position={[-3, -2, 4]} intensity={0.8} color="#06b6d4" />
        <directionalLight position={[0, 0, -5]} intensity={0.5} color="#0ea5e9" />
        <Environment preset="warehouse" />
        <Suspense fallback={null}>
          <Coin />
        </Suspense>
      </Canvas>
    </div>
  )
}
```

### Step 3: Environment preset

Ask the user which reflection environment they want:
- **"studio"** — clean, professional, neutral chrome
- **"warehouse"** — industrial, gritty, darker
- **"city"** — urban reflections, bright
- **"night"** — dark, moody, elegant
- **"dawn"** — soft, warm
- **"sunset"** — amber warmth

Default to "studio" if the user doesn't specify.

### Step 4: Tunable constants

Place these at the top of the file so the user can easily adjust:

| Constant | Default | What it controls |
|----------|---------|-----------------|
| `PLANE_SIZE` | 4.8 | Size of the logo face in 3D units |
| `THICKNESS` | 0.45 | Coin edge thickness |
| `SPIN_SPEED` | 0.35 | Rotation speed (radians/sec) |
| `BG_THRESHOLD` | 18 | Brightness cutoff for the dark-background fallback (0-255), used only when no solid border is detected |
| `BG_TOLERANCE` | 24 | Max per-channel colour difference for a pixel to count as background, in both border detection and the flood fill (0-255) |
| `BORDER_MATCH_RATIO` | 0.85 | Fraction of border pixels that must agree on a colour for it to count as a solid background |
| `EMBOSS_STRENGTH` | 1.5 | Normal map intensity (0 = flat, 3+ = deep emboss) |

### Step 5: Integration

Wrap the component in `<Suspense>` when used — the texture loading suspends inside the R3F Canvas, which is handled internally:

```tsx
// Just drop it in — Suspense is handled inside the Canvas
<SpinningLogo3D size={540} />
```

## Common pitfalls

- **DO NOT use CircleGeometry** for the face — its UV mapping mirrors the texture. Always use PlaneGeometry.
- **DO NOT flip UVs or rotate the back face by PI** — both mirror the back silhouette against the rim. The back face is the front plane moved to `-half` with `side={BackSide}`.
- **Suspense MUST be inside `<Canvas>`** — R3F's `useTexture` suspends within its own reconciler. An outer Suspense won't catch it and the component will flash/disappear.
- **Use `DoubleSide` on the rim material** — the perimeter winding creates mixed normal directions. DoubleSide ensures all faces render regardless.
- **Use `depthWrite={false}`** on the transparent face materials — prevents z-fighting between front and back faces during rotation.
- **Check the actual file format** — `.png` files are sometimes JPEG internally. JPEG has no alpha, so transparency must always be generated from brightness.
- **Use `NeutralToneMapping` on the Canvas** — R3F defaults to ACES Filmic, which desaturates bright base colours: a vivid green logo comes out sage, cyan comes out mint. Khronos PBR Neutral keeps the logo's own colours and still lets the chrome rim highlight.
- **Normal maps MUST use `LinearSRGBColorSpace`** — setting `SRGBColorSpace` on a normal map gamma-corrects the direction vectors, producing incorrect lighting and a flat appearance.
- **`preserveDrawingBuffer: true` enables screenshots** — without it, `toDataURL()` returns blank frames. Can be set to `false` for slightly better GPU performance if screenshots aren't needed.
- **DO NOT test `alpha > 0` in `extractPerimeter`** — low-alpha compression/dithering noise in "transparent" regions will pass that test and survive as its own stray component. Threshold at a real opacity cutoff and drop tiny detached specks (not just "keep the largest component" — a multi-part logo like an icon plus a separate wordmark has more than one real piece, and all of them must survive).
- **DO NOT row-scan for left/right edges per row** — that only traces a correct outline for row-convex shapes. On a real logo it bridges concave gaps: a solid bar spans the empty space between two raised wingtips, and flat "shelves" appear wherever a tail or fin separates from the body within a row. Trace each component's actual contour (Moore-neighbour boundary tracing) instead.

## Rim color customization

The chrome rim color should complement the logo. For most logos:
- Cyan/blue logos → `color="#8ecae6"` with `emissive="#06b6d4"` (default)
- Gold/warm logos → `color="#e6c88e"` with `emissive="#d4a506"`
- Red logos → `color="#e68e8e"` with `emissive="#d40606"`
- Green logos → `color="#8ee6ae"` with `emissive="#06d46a"`
- Neutral/white logos → `color="#c0c0c0"` with `emissive="#888888"`

Match the rim to the logo's dominant accent color for a cohesive look.
