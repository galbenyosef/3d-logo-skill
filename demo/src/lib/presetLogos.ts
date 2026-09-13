export interface PresetLogo {
  id: string
  label: string
  file: string
}

// The sample logos shipped in the skill repo's images/ folder. The first
// entry is the default on page load — the Wipeout-style AG Shield matches
// the page's livery.
export const PRESET_LOGOS: PresetLogo[] = [
  { id: 'logo4', label: 'AG Shield', file: 'logo4.png' },
  { id: 'logo5', label: 'Hazard Wing', file: 'logo5.png' },
  { id: 'logo1', label: 'Phoenix Shield', file: 'logo1.png' },
  { id: 'logo2', label: 'Cosmic Eye', file: 'logo2.png' },
  { id: 'logo3', label: 'Wolf Compass', file: 'logo3.png' },
]

export function presetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`
}
