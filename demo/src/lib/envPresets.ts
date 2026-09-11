// Mirrors SKILL.md Step 3's documented environment presets exactly.
export const ENV_PRESETS = ['studio', 'warehouse', 'city', 'night', 'dawn', 'sunset'] as const

export type EnvPreset = (typeof ENV_PRESETS)[number]

export const ENV_PRESET_LABELS: Record<EnvPreset, string> = {
  studio: 'Studio — clean, professional',
  warehouse: 'Warehouse — industrial, gritty',
  city: 'City — urban, bright',
  night: 'Night — dark, moody',
  dawn: 'Dawn — soft, warm',
  sunset: 'Sunset — amber warmth',
}
