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

// Regression guard: an UNPACK_FLIP_Y upload once drew the breeze canvas —
// which sits on top of the plate — upside down, clouds hanging from the top.
// The painting's upper sky is a smooth gradient and its clouds are the
// textured lower half, so luminance spread must be far higher low down.
test('the breeze canvas draws the painting upright', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('canvas.sky-breeze')).toHaveClass(/sky-breeze-visible/)
  // Only the sky should be in frame: no headline, dock or coin.
  await page.addStyleTag({ content: '.screen-1-inner { visibility: hidden !important }' })
  await page.waitForTimeout(300)

  const png = (await page.locator('.sky').screenshot()).toString('base64')
  const spread = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    // Middle columns only — the painting's right edge has a tall cloud tower.
    const stddev = (y0: number, y1: number) => {
      const x0 = Math.round(img.width * 0.2)
      const w = Math.round(img.width * 0.6)
      const top = Math.round(img.height * y0)
      const data = ctx.getImageData(x0, top, w, Math.round(img.height * y1) - top).data
      let sum = 0
      let sumSq = 0
      const n = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        sum += l
        sumSq += l * l
      }
      const mean = sum / n
      return Math.sqrt(sumSq / n - mean * mean)
    }
    return { top: stddev(0.05, 0.3), clouds: stddev(0.6, 0.78) }
  }, png)

  expect(spread.clouds, `cloud band spread ${spread.clouds} vs top sky ${spread.top}`).toBeGreaterThan(spread.top * 2)
})
