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
  const starSuffix = stars !== null && stars >= MIN_STARS_TO_SHOW ? ` · ${formatStars(stars)}` : ''

  return (
    <header className="hero-copy">
      <h1 className="headline">
        <span className="headline-line">Flat in.</span> <span className="headline-line">3D out.</span>
      </h1>
      <p className="subline">Any logo → a 3D spinning coin.</p>
      <div className="hero-actions">
        <button type="button" className="btn btn-primary hero-cta" onClick={onTryLogo}>
          Try your logo
        </button>
        <a className="btn btn-ghost" href={REPO_URL} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" focusable="false">
            <path
              d="M8 .8l2.06 4.53 4.94.5-3.73 3.4.99 4.87L8 11.7 3.74 14.1l.99-4.87-3.73-3.4 4.94-.5z"
              fill="currentColor"
            />
          </svg>
          Star on GitHub{starSuffix}
        </a>
      </div>
    </header>
  )
}
