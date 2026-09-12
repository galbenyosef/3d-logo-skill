import { useEffect, useState } from 'react'

/**
 * Fetches a repo's live star count client-side. Resolves to `null` on any
 * failure (network, rate limit, bad shape) so the caller can render the
 * "Star on GitHub" link without a count instead of surfacing an error.
 */
export function useGithubStars(repo: string): number | null {
  const [stars, setStars] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${repo}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown) => {
        if (cancelled) return
        const count = (data as { stargazers_count?: unknown } | null)?.stargazers_count
        if (typeof count === 'number') setStars(count)
      })
      .catch(() => {
        // Silently keep `null` — the link still renders without a count.
      })
    return () => {
      cancelled = true
    }
  }, [repo])

  return stars
}
