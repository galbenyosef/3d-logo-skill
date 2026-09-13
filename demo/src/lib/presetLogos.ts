export interface PresetLogo {
  id: string
  label: string
  file: string
}

// The sample logos shipped in the skill repo's images/ folder. The first
// entry is the default on page load — Firebird's palette matches the sky.
// All three are asymmetric on purpose: they show the rim tracing a custom
// outline from every angle.
export const PRESET_LOGOS: PresetLogo[] = [
  { id: 'firebird', label: 'Firebird', file: 'firebird.png' },
  { id: 'koi', label: 'Koi', file: 'koi.png' },
  { id: 'manta', label: 'Manta', file: 'manta.png' },
]

export function presetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`
}
