import { useCallback, useEffect, useRef, useState } from 'react'
import { Hero } from './components/Hero'
import { PauseToggle } from './components/PauseToggle'
import { SpinningLogo3D } from './components/SpinningLogo3D'
import { ENV_PRESET_LABELS, ENV_PRESETS, type EnvPreset } from './lib/envPresets'
import { isAllowedImageType } from './lib/fileValidation'
import { prepareUploadedLogo } from './lib/imagePipeline'
import { PRESET_LOGOS, presetUrl } from './lib/presetLogos'

const REPO_URL = 'https://github.com/hasuwini77/3d-logo-skill'

type StatusKind = 'idle' | 'loading' | 'ready' | 'error'

interface Status {
  kind: StatusKind
  message: string
}

interface ActiveLogo {
  url: string
  label: string
  isUpload: boolean
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export default function App() {
  const defaultLogo = PRESET_LOGOS[0]
  const [activeLogo, setActiveLogo] = useState<ActiveLogo>({
    url: presetUrl(defaultLogo.file),
    label: defaultLogo.label,
    isUpload: false,
  })
  const [envPreset, setEnvPreset] = useState<EnvPreset>('studio')
  const [status, setStatus] = useState<Status>({
    kind: 'ready',
    message: `Showing the ${defaultLogo.label} sample. Drop your own logo anywhere on the stage.`,
  })
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const uploadedObjectUrl = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const reducedMotion = useReducedMotion()
  // Reduced motion used to drop to 12% speed, which on the many iPhones that
  // ship Reduce Motion on by default read as "broken", not "gentle" (issue #5).
  // 50% keeps the coin legibly slower without looking stuck; the explicit
  // pause control below is what actually satisfies WCAG 2.2.2 for this motion.
  const spinMultiplier = isPaused ? 0 : reducedMotion ? 0.5 : 1

  const handlePreset = useCallback((file: string, label: string) => {
    setActiveLogo({ url: presetUrl(file), label, isUpload: false })
    setStatus({ kind: 'ready', message: `Showing the ${label} sample.` })
  }, [])

  const handleFile = useCallback(async (file: File) => {
    if (!isAllowedImageType(file.type)) {
      setStatus({
        kind: 'error',
        message: `"${file.name}" isn't an image this demo can use. Try a PNG, JPG, WebP, GIF, or SVG.`,
      })
      return
    }
    setStatus({ kind: 'loading', message: `Processing "${file.name}"…` })
    try {
      const url = await prepareUploadedLogo(file)
      if (uploadedObjectUrl.current) URL.revokeObjectURL(uploadedObjectUrl.current)
      uploadedObjectUrl.current = url
      setActiveLogo({ url, label: file.name, isUpload: true })
      setStatus({ kind: 'ready', message: `Spinning "${file.name}" — it never left your device.` })
    } catch {
      setStatus({ kind: 'error', message: 'Could not read that image. Try a different file.' })
    }
  }, [])

  useEffect(() => {
    return () => {
      if (uploadedObjectUrl.current) URL.revokeObjectURL(uploadedObjectUrl.current)
    }
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleFile(file)
      e.target.value = ''
    },
    [handleFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      setIsDraggingOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setIsDraggingOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (e.currentTarget === e.target) setIsDraggingOver(false)
  }, [])

  return (
    <div className="page">
      <Hero onTryLogo={() => fileInputRef.current?.click()} />

      <main className="layout">
        <section
          className={`stage${isDraggingOver ? ' stage-dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label={`3D preview: ${activeLogo.label}`}
        >
          <div className="stage-canvas" aria-hidden="true">
            <SpinningLogo3D logoUrl={activeLogo.url} envPreset={envPreset} spinMultiplier={spinMultiplier} />
          </div>
          <figure className="stage-thumb">
            <img src={activeLogo.url} alt="" width={40} height={40} />
            <figcaption>Your PNG</figcaption>
          </figure>
          <PauseToggle isPaused={isPaused} onToggle={() => setIsPaused((p) => !p)} />
          <p className="stage-hint">Drag any logo here — it never leaves your browser</p>
          {isDraggingOver && (
            <div className="stage-overlay" aria-hidden="true">
              Drop to use this logo
            </div>
          )}
        </section>

        <aside className="controls">
          <div className="control-group">
            <span className="control-label" id="presets-label">
              Sample logos
            </span>
            <div className="preset-row" role="group" aria-labelledby="presets-label">
              {PRESET_LOGOS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="preset-btn"
                  aria-pressed={!activeLogo.isUpload && activeLogo.label === preset.label}
                  onClick={() => handlePreset(preset.file, preset.label)}
                >
                  <img src={presetUrl(preset.file)} alt="" width={28} height={28} />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label className="control-label" htmlFor="logo-upload">
              Use your own logo
            </label>
            <div className="upload-row">
              <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                Choose an image
              </button>
              <input
                ref={fileInputRef}
                id="logo-upload"
                type="file"
                accept="image/*"
                className="visually-hidden"
                onChange={handleFileInputChange}
              />
            </div>
            <p className="control-note">Stays on your device — nothing is uploaded anywhere.</p>
          </div>

          <div className="control-group">
            <label className="control-label" htmlFor="env-preset">
              Reflection environment
            </label>
            <select
              id="env-preset"
              className="select"
              value={envPreset}
              onChange={(e) => setEnvPreset(e.target.value as EnvPreset)}
            >
              {ENV_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {ENV_PRESET_LABELS[preset]}
                </option>
              ))}
            </select>
          </div>

          <p className="status" role="status" aria-live="polite" data-kind={status.kind}>
            {status.message}
          </p>
        </aside>
      </main>

      <footer className="footer">
        <p>
          Built from the open-source{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            3d-logo-skill
          </a>
          , an installable skill for Claude Code, Cursor, Copilot, and 50+ other agents. If this saved you time, drop
          a star.
        </p>
      </footer>
    </div>
  )
}
