/** Pure logic for the "Download video" export — no DOM, so it is unit-tested. */

export const EXPORT_SIZE = 1080
export const EXPORT_DURATION_MS = 6000
export const EXPORT_FPS = 30
/** The dusk sky's mid tone (--sky-mid): the WebGL canvas is transparent, so each frame sits on this. */
export const EXPORT_BACKGROUND = '#3b3f8f'
export const EXPORT_CREDIT = '3d-logo-skill'

export const DEMO_URL = 'https://hasuwini77.github.io/3d-logo-skill/'
export const REPO_URL = 'https://github.com/hasuwini77/3d-logo-skill'
export const SHARE_TEXT = 'Turned my logo into a 3D coin with 3d-logo-skill'

export interface ExportFormat {
  mimeType: string
  extension: 'mp4' | 'webm'
}

const MIME_PREFERENCE: ExportFormat[] = [
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
]

/** Best supported container: mp4, else vp9 webm, else plain webm. Null when nothing is supported. */
export function pickExportFormat(isTypeSupported: (mime: string) => boolean): ExportFormat | null {
  return MIME_PREFERENCE.find((f) => isTypeSupported(f.mimeType)) ?? null
}

/** Yaw for a recording at `progress` (0..1): fixed angular speed, exactly one turn. */
export function rotationAtProgress(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  return p * Math.PI * 2
}

/** `coin-<name>.<ext>`; the name is a logo label or an uploaded file name, sanitised for file systems. */
export function buildFilename(logoName: string | null | undefined, extension: string): string {
  const base = (logoName ?? '').replace(/\.[a-z0-9]{1,5}$/i, '')
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `coin-${slug || 'custom'}.${extension}`
}

export function buildXIntentUrl(text: string = SHARE_TEXT, url: string = DEMO_URL): string {
  const params = new URLSearchParams({ text, url })
  return `https://x.com/intent/post?${params.toString()}`
}
