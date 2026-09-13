const STEPS = [
  {
    title: 'Background → transparency + normal map',
    body: 'Dark pixels are converted to transparent on an offscreen canvas, and a Sobel filter generates a normal map from the same pixels for embossed depth on both coin faces.',
  },
  {
    title: 'Outline traced from the alpha channel',
    body: "The alpha channel is scanned row by row to trace the logo's exact perimeter — around 800 vertices, smoothed to remove pixel-level jitter.",
  },
  {
    title: 'Chrome rim + environment reflections',
    body: 'An indexed rim geometry follows that outline exactly, finished with high metalness, low roughness, and an environment map for premium chrome reflections.',
  },
] as const

export function HowItWorks() {
  return (
    <section className="how" aria-labelledby="how-title">
      <div className="section-head">
        <div>
          <span className="section-eyebrow">Sequence // 02</span>
          <h2 id="how-title" className="section-title">
            How it works
          </h2>
        </div>
      </div>
      <ol className="how-steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="how-step">
            <span className="how-step-index" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <p className="how-step-title">{step.title}</p>
              <p className="how-step-body">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
