import { expect, test, type Page } from '@playwright/test'

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

type Box = { x: number; y: number; width: number; height: number }

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function boxOf(locator: ReturnType<Page['locator']>): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('expected a bounding box')
  return box
}

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
      ['upload control', page.getByRole('button', { name: 'Upload' })],
      ['preset row container', page.getByRole('group', { name: 'Presets' })],
      ['env select', page.locator('#env-preset')],
      // The full dock (its outer container), not just the controls inside
      // it — a dock whose own bottom edge falls below the fold can still
      // pass a check on individual controls near its top (pass-2 bug: the
      // status line and scroll cue fell off-screen at 390x844 while the
      // preset row above them still fit).
      ['dock', page.locator('.dock')],
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

    // The coin must never grow into the CTA row above it (pass-2 bug: at
    // 375x667 the coin, sized purely from width, overflowed its budgeted
    // height and visually overlapped "Try your logo" / "Star on GitHub").
    const canvasBox = await boxOf(page.locator('canvas'))
    const tryLogoBox = await boxOf(page.getByRole('button', { name: 'Try your logo' }))
    const starBox = await boxOf(page.getByRole('link', { name: /Star on GitHub/ }))
    expect(
      intersects(canvasBox, tryLogoBox),
      `canvas should not overlap the "Try your logo" CTA at ${viewport.width}x${viewport.height}`,
    ).toBe(false)
    expect(
      intersects(canvasBox, starBox),
      `canvas should not overlap the "Star on GitHub" CTA at ${viewport.width}x${viewport.height}`,
    ).toBe(false)

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

// Laptop-height desktop windows (issue #15): the phone-only svh caps once
// applied here too and shrank the hero coin to ~160px at 1280x720. In the
// two-column layout the coin owns a full column, so it should fill most
// of the viewport height.
test('the coin stays hero-sized on short desktop viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 800 },
  ]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(300)
    const wrap = await boxOf(page.locator('.coin-canvas-wrap'))
    expect(
      wrap.width,
      `coin should be at least 60% of the viewport height at ${viewport.width}x${viewport.height}`,
    ).toBeGreaterThanOrEqual(viewport.height * 0.6)
  }
})
