import { useCallback, useEffect, useRef, useState } from 'react'
import { GetItSection } from './components/GetItSection'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { PauseToggle } from './components/PauseToggle'
import { Sky } from './components/Sky'
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
  // The coin reflects the dusk sky it floats in — sunset reads truest
  // against the twilight gradient of every other preset (see report).
  const [envPreset, setEnvPreset] = useState<EnvPreset>('sunset')
  const [status, setStatus] = useState<Status>({
    kind: 'ready',
    message: `Showing the ${defaultLogo.label} sample. Drop your own logo anywhere on this screen.`,
  })
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  // One-shot intro fade (see .intro-wipe): removed from the DOM once its
  // animation finishes so it doesn't sit around as inert markup.
  const [introDone, setIntroDone] = useState(false)
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

  // "Less is more": the status line is a live region for screen readers at
  // all times, but only earns screen space when it says something the
  // preset chips/upload control don't already show — a transient loading or
  // error message. The default/ready state stays visually hidden.
  const statusVisible = status.kind === 'loading' || status.kind === 'error'

  return (
    <>
      {!introDone && <div className="intro-wipe" aria-hidden="true" onAnimationEnd={() => setIntroDone(true)} />}
      <div className="page">
        <section
          className="screen screen-1"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Full-bleed: .sky fills this outer, un-constrained section so the
              twilight gradient spans the whole viewport width. Actual content
              lives in .screen-1-inner, which carries the max-width column. */}
          <Sky />
          <div className="screen-1-inner">
            <Hero onTryLogo={() => fileInputRef.current?.click()} />

            <div className="coin-stage" aria-label={`3D preview: ${activeLogo.label}`}>
              <div className="coin-glow" aria-hidden="true" />
              <div className="coin-canvas-wrap">
                <SpinningLogo3D logoUrl={activeLogo.url} envPreset={envPreset} spinMultiplier={spinMultiplier} />
              </div>
              <PauseToggle isPaused={isPaused} onToggle={() => setIsPaused((p) => !p)} />

              {isDraggingOver && (
                <div className="drop-overlay" aria-hidden="true">
                  Drop to use this logo
                </div>
              )}
            </div>

            <div className="dock glass-panel">
              <div className="control-group">
                <span className="control-label" id="presets-label">
                  Presets
                </span>
                <div className="preset-row" role="group" aria-labelledby="presets-label">
                  {PRESET_LOGOS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="chip"
                      aria-pressed={!activeLogo.isUpload && activeLogo.label === preset.label}
                      onClick={() => handlePreset(preset.file, preset.label)}
                    >
                      <img src={presetUrl(preset.file)} alt="" width={22} height={22} />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-row">
                <div className="control-group">
                  <label className="control-label" htmlFor="logo-upload">
                    Upload
                  </label>
                  <div className="upload-row">
                    <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
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
                  <p className="control-note">Stays on your device.</p>
                </div>

                <div className="control-group">
                  <label className="control-label" htmlFor="env-preset">
                    Reflection
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
              </div>

              <p
                className={`status${statusVisible ? '' : ' visually-hidden'}`}
                role="status"
                aria-live="polite"
                data-kind={status.kind}
              >
                {status.message}
              </p>
            </div>

            <a className="scroll-cue" href="#install">
              <span className="scroll-cue-chevrons" aria-hidden="true">
                ›››
              </span>
              Install
            </a>
          </div>
        </section>

        <section className="screen screen-2" id="install">
          <div className="screen-2-ground" aria-hidden="true">
            <div className="cloud-sea" />
            <span className="star star-1" />
            <span className="star star-2" />
            <span className="star star-3" />
          </div>
          <div className="screen-2-inner">
            <GetItSection />
            <HowItWorks />
            <footer className="footer">
              <p>
                MIT licence · <a href={REPO_URL} target="_blank" rel="noreferrer">3d-logo-skill on GitHub</a> · Built by{' '}
                <a href="https://github.com/hasuwini77" target="_blank" rel="noreferrer">
                  hasuwini77
                </a>
              </p>
            </footer>
          </div>
        </section>
      </div>
    </>
  )
}
