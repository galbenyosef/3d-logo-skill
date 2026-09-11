import { expect, test } from '@playwright/test'

const SCREENSHOT_DIR =
  '/private/tmp/claude-501/-Users-hasuwini-Documents-Frontend/c350e899-0c5c-42c3-ace1-783f28c15666/scratchpad/demo-shots'

test.describe('3D logo skill demo', () => {
  test('renders the coin, swaps presets, accepts uploads, and rejects non-images', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(String(err)))

    await page.goto('/')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()

    // The canvas actually occupies real space (not a collapsed / blank element).
    const box = await canvas.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(50)
    expect(box?.height ?? 0).toBeGreaterThan(50)

    const status = page.getByRole('status')
    await expect(status).toContainText('Phoenix Shield')

    for (const label of ['Cosmic Eye', 'Wolf Compass', 'Phoenix Shield']) {
      await page.getByRole('button', { name: label }).click()
      await expect(status).toContainText(label)
    }

    // Swapping in a sample logo file updates the status line.
    await page.setInputFiles('#logo-upload', '../images/logo2.png')
    await expect(status).toContainText('logo2.png', { timeout: 10_000 })

    // A non-image file is rejected with a clear message.
    await page.setInputFiles('#logo-upload', 'tests/fixtures/not-an-image.txt')
    await expect(status).toContainText("isn't an image")

    expect(consoleErrors).toEqual([])
  })

  test('captures visual verification screenshots at desktop and mobile widths', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('canvas')).toBeVisible()
    // The Environment HDR loads over the network — wait for it (and the coin
    // texture pipeline) to settle before trusting a frame is fully painted.
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/desktop-1440x900.png` })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile-390x844.png` })
  })
})
