const CLOUD_LAYER_COUNT = 4

/**
 * Fixed twilight skybox behind the whole page: a gradient (frozen contract)
 * plus up to 4 parallax cloud layers. Purely decorative — every layer is
 * aria-hidden and pointer-events: none (see styles.css `.sky`). Animates
 * only `transform`/`opacity`, never blur, and collapses to static under
 * prefers-reduced-motion via the page-wide umbrella rule.
 */
export function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <div className="sky-vignette-top" />
      {Array.from({ length: CLOUD_LAYER_COUNT }, (_, i) => (
        <div key={i} className={`cloud-layer cloud-layer-${i + 1}`} />
      ))}
      <div className="sky-haze-bottom" />
    </div>
  )
}
