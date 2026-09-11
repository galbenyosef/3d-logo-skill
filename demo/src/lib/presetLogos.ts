export interface PresetLogo {
  id: string
  label: string
  file: string
}

// The 3 sample logos already shipped in the skill repo's images/ folder.
export const PRESET_LOGOS: PresetLogo[] = [
  { id: 'logo1', label: 'Phoenix Shield', file: 'logo1.png' },
  { id: 'logo2', label: 'Cosmic Eye', file: 'logo2.png' },
  { id: 'logo3', label: 'Wolf Compass', file: 'logo3.png' },
]

export function presetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`
}
