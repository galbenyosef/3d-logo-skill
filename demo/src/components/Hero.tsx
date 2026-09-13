import { useGithubStars } from '../lib/githubStars'

const REPO = 'hasuwini77/3d-logo-skill'
const REPO_URL = `https://github.com/${REPO}`

function formatStars(count: number): string {
  if (count < 1000) return String(count)
  return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
}

interface HeroProps {
  onTryLogo: () => void
}

// A count under 10 reads as anti-social-proof — better to show no count at
// all than to advertise a small one.
const MIN_STARS_TO_SHOW = 10

export function Hero({ onTryLogo }: HeroProps) {
  const stars = useGithubStars(REPO)

  return (
    <header className="hero">
      <p className="dr-label">
        <span className="dr-accent">3D-LOGO</span> // AG-SYS 01 — COIN FORGE
      </p>
      <h1 className="hero-title">
        <span className="hero-title-line">Flat in.</span> <span className="hero-title-line">3D out.</span>
      </h1>
      <p className="hero-subline">
        An agent skill that turns any flat logo into a 3D spinning coin — for Claude Code, Cursor, Codex, Copilot,
        Gemini CLI and 50+ more agents.
      </p>
      <div className="hero-actions">
        <button type="button" className="btn btn-primary chamfer hero-cta" onClick={onTryLogo}>
          Try your logo
        </button>
        <a className="btn btn-ghost chamfer hero-star" href={REPO_URL} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" focusable="false">
            <path
              d="M8 .8l2.06 4.53 4.94.5-3.73 3.4.99 4.87L8 11.7 3.74 14.1l.99-4.87-3.73-3.4 4.94-.5z"
              fill="currentColor"
            />
          </svg>
          Star on GitHub{stars !== null && stars >= MIN_STARS_TO_SHOW ? ` · ${formatStars(stars)}` : ''}
        </a>
      </div>
    </header>
  )
}
