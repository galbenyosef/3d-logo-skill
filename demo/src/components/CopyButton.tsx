import { useCallback, useState } from 'react'

interface CopyButtonProps {
  text: string
  label?: string
}

/** Copies `text` to the clipboard and shows a brief checkmark confirmation. */
export function CopyButton({ text, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Clipboard permission denied — the text is still selectable manually.
      })
  }, [text])

  return (
    <button type="button" className="copy-btn" onClick={handleCopy} aria-label={copied ? 'Copied' : label}>
      {copied ? (
        <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true" focusable="false">
          <path
            d="M3 8.5l3 3 7-7"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true" focusable="false">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.5 10.5v-6a1 1 0 0 1 1-1h6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  )
}
