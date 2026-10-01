import { REPO_URL, buildXIntentUrl } from '../lib/coinExport'

/** Small dismissible nudge shown once a clip has been saved. */
export function ShareNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="share-note" role="status">
      <a className="share-link" href={buildXIntentUrl()} target="_blank" rel="noreferrer">
        Post it on X
      </a>
      <a className="share-link" href={REPO_URL} target="_blank" rel="noreferrer">
        Star on GitHub
      </a>
      <button type="button" className="share-dismiss" aria-label="Dismiss" onClick={onDismiss}>
        <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" focusable="false">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
