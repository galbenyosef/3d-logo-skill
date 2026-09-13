import { expect, test } from '@playwright/test'

// The painted plate + breeze shader replace the old procedural CSS sky
// (issue #17) — these checks stand in for that suite: the responsive
// <picture> actually decodes an image at both breakpoints, and the breeze
// canvas mounts by default but respects prefers-reduced-motion.

test.describe('painted sky plate', () => {
  test('the plate image loads at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')

    const plate = page.locator('.sky-plate')
    await expect(plate).toBeVisible()
    await expect
      .poll(() => plate.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)
    await expect(plate).toHaveClass(/sky-plate-loaded/)
  })

  test('the plate image loads at mobile width (portrait source)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const plate = page.locator('.sky-plate')
    await expect(plate).toBeVisible()
    await expect
      .poll(() => plate.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)
    // Below 767px the <source> picks the portrait crop — narrower than tall.
    const isPortrait = await plate.evaluate((img: HTMLImageElement) => img.naturalWidth < img.naturalHeight)
    expect(isPortrait).toBe(true)
  })
})

test.describe('breeze cinemagraph', () => {
  test('the breeze canvas mounts by default and fades in', async ({ page }) => {
    await page.goto('/')

    const canvas = page.locator('canvas.sky-breeze')
    await expect(canvas).toBeAttached()
    await expect(canvas).toHaveClass(/sky-breeze-visible/, { timeout: 10_000 })
  })

  test('the breeze canvas is absent under prefers-reduced-motion: reduce', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')

    // Give the shader a moment to (not) mount, then assert it never does —
    // the static plate stays as the only sky layer.
    await page.waitForTimeout(1000)
    await expect(page.locator('canvas.sky-breeze')).toHaveCount(0)
    await expect(page.locator('.sky-plate')).toBeVisible()

    await context.close()
  })
})
