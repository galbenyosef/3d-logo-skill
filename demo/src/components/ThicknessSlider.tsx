interface ThicknessSliderProps {
  thickness: number
  onChange: (thickness: number) => void
}

// Matches SpinningLogo3D's clamp range exactly (see THICKNESS_MIN/MAX there).
const MIN = 0.15
const MAX = 1.2
const STEP = 0.05

/**
 * Sits next to the "Reflection" env-preset select in the dock, styled to
 * match it (same label treatment, `.select`-adjacent spacing, mono type).
 * Answers the r/threejs launch question from u/BigDeadPixel: "Is there a
 * way to change the thickness of the coin?"
 */
export function ThicknessSlider({ thickness, onChange }: ThicknessSliderProps) {
  return (
    <div className="control-group">
      <label className="control-label" htmlFor="thickness-slider">
        Thickness
        <span className="control-value">{thickness.toFixed(2)}</span>
      </label>
      <input
        id="thickness-slider"
        className="slider"
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={thickness}
        aria-label="Coin thickness"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
