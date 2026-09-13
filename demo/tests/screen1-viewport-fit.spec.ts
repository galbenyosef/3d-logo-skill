import { expect, test } from '@playwright/test'

// The 100vh rule: screen 1 must let a visitor read the headline, see the
// coin, switch presets, upload their own logo, and change the reflection
// environment without ever scrolling — on both a big desktop screen and a
// small phone (iPhone SE at 375x667 is the tightest constraint).
//
// One page load, resized in place across all 4 viewports: four separate
// page.goto()s would each spin up their own WebGL/HDR-environment render,
// which is expensive enough on a software (swiftshader) rasterizer that
// running them concurrently with the rest of the suite starves everything
// of CPU. A resize is cheap by comparison.
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]

test('screen 1 fits in exactly one viewport at every required size (STRATOS 100vh rule)', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[0])
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(300)

    const targets: Array<[string, ReturnType<typeof page.locator>]> = [
      ['canvas', page.locator('canvas')],
      ['upload control', page.getByRole('button', { name: 'Choose an image' })],
      ['preset row container', page.getByRole('group', { name: 'Sample logos' })],
      ['env select', page.locator('#env-preset')],
    ]

    for (const [name, locator] of targets) {
      await expect(locator, `${name} should be visible at ${viewport.width}x${viewport.height}`).toBeVisible()
      const box = await locator.boundingBox()
      expect(box, `${name} should have a bounding box at ${viewport.width}x${viewport.height}`).not.toBeNull()
      if (box) {
        expect(
          box.y + box.height,
          `${name} bottom edge (${box.y + box.height}) should be within the ${viewport.height}px viewport`,
        ).toBeLessThanOrEqual(viewport.height + 1)
      }
    }

    // No horizontal scroll anywhere on the page — not just within screen 1.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth, `no horizontal overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
      overflow.clientWidth + 1,
    )

    // The page must not have auto-scrolled away from the top.
    const scrollY = await page.evaluate(() => window.scrollY)
    expect(scrollY, `no auto-scroll at ${viewport.width}x${viewport.height}`).toBe(0)
  }
})
