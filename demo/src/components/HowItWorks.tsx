const STEPS = ['Transparent background, embossed depth.', 'Outline traced from the logo.', 'Chrome rim reflects the sky.'] as const

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
          <li key={step} className="how-step">
            <span className="how-step-index" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="how-step-text">{step}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
