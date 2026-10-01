interface DownloadVideoButtonProps {
  /** 0..1 while recording, null when idle. */
  progress: number | null
  onClick: () => void
}

/** Dock control: records one full turn of the coin. Shows live progress and is disabled meanwhile. */
export function DownloadVideoButton({ progress, onClick }: DownloadVideoButtonProps) {
  const recording = progress !== null
  return (
    <button
      type="button"
      className="btn btn-secondary download-video"
      disabled={recording}
      aria-busy={recording}
      onClick={onClick}
    >
      {recording ? `Recording… ${Math.round(progress * 100)}%` : 'Download video'}
    </button>
  )
}
