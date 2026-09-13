export interface PresetLogo {
  id: string
  label: string
  file: string
}

// The sample logos shipped in the skill repo's images/ folder. The first
// entry is the default on page load — Storm Cloud matches the STRATOS sky.
export const PRESET_LOGOS: PresetLogo[] = [
  { id: 'sky1', label: 'Storm Cloud', file: 'sky1.png' },
  { id: 'sky2', label: 'Crescent', file: 'sky2.png' },
  { id: 'sky3', label: 'Paper Crane', file: 'sky3.png' },
]

export function presetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`
}
