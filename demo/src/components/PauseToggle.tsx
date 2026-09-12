interface PauseToggleProps {
  isPaused: boolean
  onToggle: () => void
}

/**
 * Icon-only rotation control pinned to the stage. `aria-pressed` reflects
 * whether rotation is currently paused, satisfying WCAG 2.2.2 (Pause, Stop,
 * Hide) for the continuously-spinning coin.
 */
export function PauseToggle({ isPaused, onToggle }: PauseToggleProps) {
  return (
    <button
      type="button"
      className="stage-pause"
      aria-pressed={isPaused}
      aria-label={isPaused ? 'Play rotation' : 'Pause rotation'}
      onClick={onToggle}
    >
      {isPaused ? (
        <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" focusable="false">
          <path d="M4 2.3v11.4a.6.6 0 0 0 .92.5l9.1-5.7a.6.6 0 0 0 0-1l-9.1-5.7a.6.6 0 0 0-.92.5z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" focusable="false">
          <rect x="3.5" y="2.5" width="3" height="11" rx="0.75" fill="currentColor" />
          <rect x="9.5" y="2.5" width="3" height="11" rx="0.75" fill="currentColor" />
        </svg>
      )}
    </button>
  )
}
