/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// The 3 sample logos live in the skill repo's own `images/` folder, one level
// up — reusing them here (instead of copying into demo/) keeps the demo an
// honest showcase of the skill's real sample assets.
const repoImages = path.resolve(dirname, '../images')

export default defineConfig({
  base: '/3d-logo-skill/',
  plugins: [react()],
  publicDir: repoImages,
  server: {
    fs: {
      allow: [dirname, repoImages],
    },
  },
  preview: {
    port: 4317,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
