// Mirrors SKILL.md Step 3's documented environment presets exactly.
export const ENV_PRESETS = ['studio', 'warehouse', 'city', 'night', 'dawn', 'sunset'] as const

export type EnvPreset = (typeof ENV_PRESETS)[number]

export const ENV_PRESET_LABELS: Record<EnvPreset, string> = {
  studio: 'Studio',
  warehouse: 'Warehouse',
  city: 'City',
  night: 'Night',
  dawn: 'Dawn',
  sunset: 'Sunset',
}
