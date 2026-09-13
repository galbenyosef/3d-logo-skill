import { useRef, useState, type SyntheticEvent } from 'react'
import platePortrait800 from '../assets/sky/plate-portrait-800.webp'
import platePortrait1200 from '../assets/sky/plate-portrait-1200.webp'
import plate1600 from '../assets/sky/plate-1600.webp'
import plate2400 from '../assets/sky/plate-2400.webp'
import plate3200 from '../assets/sky/plate-3200.webp'

const LANDSCAPE_SRCSET = `${plate1600} 1600w, ${plate2400} 2400w, ${plate3200} 3200w`
const PORTRAIT_SRCSET = `${platePortrait800} 800w, ${platePortrait1200} 1200w`

// object-fit: cover on a tall/narrow viewport renders the (16:9) landscape
// plate *wider* than the viewport itself (it scales to cover height, not
// width) — `sizes` has to say so, or the browser picks a source sized for
// 100vw and it looks soft once stretched to the real (wider) render width.
// 178svh ~= 16:9's width-per-height; `max()` covers the normal wide case too.
const LANDSCAPE_SIZES = 'max(100vw, 178svh)'

/**
 * Painted dusk sky behind screen 1: a hand-painted plate (see
 * demo/src/assets/sky/, exported at the frozen STRATOS gradient's
 * composition), replacing the old procedural CSS sky. A responsive
 * <picture> — a taller crop below 768px, the landscape plate above it —
 * object-fit: cover, so it always fills `.screen-1` exactly.
 *
 * The `.sky` div's own background gradient (frozen tokens, styles.css) is
 * the first-paint fallback before the plate has loaded; the img itself
 * fades in on load. Purely decorative — aria-hidden and pointer-events:none
 * throughout.
 */
export function Sky() {
  const imgRef = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    if (e.currentTarget.complete && e.currentTarget.naturalWidth > 0) setLoaded(true)
  }

  return (
    <div className="sky" aria-hidden="true">
      <picture>
        <source media="(max-width: 767px)" srcSet={PORTRAIT_SRCSET} sizes="100vw" />
        <img
          ref={imgRef}
          className={`sky-plate${loaded ? ' sky-plate-loaded' : ''}`}
          src={plate2400}
          srcSet={LANDSCAPE_SRCSET}
          sizes={LANDSCAPE_SIZES}
          alt=""
          fetchPriority="high"
          decoding="async"
          onLoad={handleLoad}
        />
      </picture>

      <div className="sky-vignette-top" />
    </div>
  )
}
