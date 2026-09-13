import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// Left over from the session that wrote this test — a scratchpad dir from a
// prior Claude Code session id, which doesn't exist on any other machine.
// An env var with a same-repo fallback keeps the test portable.
const SCREENSHOT_DIR = process.env.PLAYWRIGHT_SCREENSHOT_DIR ?? 'test-results/visual'

// The Hero's star count hits the live, unauthenticated GitHub API
// (60 req/hr per IP) — fine in production, but it makes local test runs
// flaky once that limit is exhausted (a real 403 the app already handles
// gracefully, but Chromium still logs it to console, tripping the
// `consoleErrors` assertions below). Mocking it keeps these tests
// deterministic regardless of live rate-limit state.
async function mockGithubStars(routable: Page | BrowserContext) {
  await routable.route('https://api.github.com/repos/**', (route) =>
    route.fulfill({ json: { stargazers_count: 1234 } }),
  )
}

test.describe('3D logo skill demo', () => {
  test.beforeEach(async ({ page }) => {
    await mockGithubStars(page)
  })

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
    await expect(status).toContainText('Firebird')

    for (const label of ['Koi', 'Manta', 'Firebird']) {
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

  test('hero renders the h1 and a working "Try your logo" CTA', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('3D out')
    await expect(page.getByRole('link', { name: /Star on GitHub/ })).toBeVisible()

    // The file chooser opens directly — no scrolling/focusing detour needed.
    const chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Try your logo' }).click()
    const chooser = await chooserPromise
    expect(chooser.isMultiple()).toBe(false)

    expect(consoleErrors).toEqual([])
  })

  test('pause toggle stops rotation and flips aria-pressed', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/')

    const pauseButton = page.getByRole('button', { name: 'Pause rotation' })
    await expect(pauseButton).toHaveAttribute('aria-pressed', 'false')

    await pauseButton.click()
    const playButton = page.getByRole('button', { name: 'Play rotation' })
    await expect(playButton).toHaveAttribute('aria-pressed', 'true')

    await playButton.click()
    await expect(page.getByRole('button', { name: 'Pause rotation' })).toHaveAttribute('aria-pressed', 'false')

    expect(consoleErrors).toEqual([])
  })

  test('install tabs switch panels and expose copy buttons', async ({ browser, baseURL }) => {
    // Clipboard writes need an explicit grant under Chromium, even headless.
    const context = await browser.newContext({ permissions: ['clipboard-write'] })
    await mockGithubStars(context)
    const page = await context.newPage()
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto(baseURL ?? '/')

    const npxTab = page.getByRole('tab', { name: 'npx' })
    const claudeTab = page.getByRole('tab', { name: 'Claude Code' })
    const npxCommand = page.getByText('npx skills add hasuwini77/3d-logo-skill')
    const marketplaceCommand = page.getByText('claude plugin marketplace add hasuwini77/3d-logo-skill')
    const pluginInstallCommand = page.getByText('claude plugin install 3d-logo@3d-logo-skill')

    // With "npx" selected, only its command is visible — the Claude Code
    // panel's commands must be genuinely hidden, not just visually stacked.
    await expect(npxTab).toHaveAttribute('aria-selected', 'true')
    await expect(npxCommand).toBeVisible()
    await expect(marketplaceCommand).toBeHidden()
    await expect(pluginInstallCommand).toBeHidden()

    await claudeTab.click()
    await expect(claudeTab).toHaveAttribute('aria-selected', 'true')
    await expect(npxTab).toHaveAttribute('aria-selected', 'false')
    await expect(marketplaceCommand).toBeVisible()
    await expect(pluginInstallCommand).toBeVisible()
    await expect(npxCommand).toBeHidden()

    // Keyboard operability: ArrowLeft from the Claude Code tab returns to npx.
    await claudeTab.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(npxTab).toHaveAttribute('aria-selected', 'true')
    await expect(npxCommand).toBeVisible()
    await expect(marketplaceCommand).toBeHidden()

    // Same hidden-panel behavior holds at mobile widths, not just desktop.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(npxCommand).toBeVisible()
    await expect(marketplaceCommand).toBeHidden()
    await expect(pluginInstallCommand).toBeHidden()

    const copyButtons = page.locator('.copy-btn')
    expect(await copyButtons.count()).toBeGreaterThanOrEqual(3)

    await copyButtons.first().click()
    await expect(copyButtons.first()).toHaveText(/Copied/)

    expect(consoleErrors).toEqual([])
    await context.close()
  })

  test('reduced motion still rotates the coin, just slower', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const first = await canvas.screenshot()
    await page.waitForTimeout(900)
    const second = await canvas.screenshot()

    // If reduced motion were still stuck at the old 12% multiplier, two
    // frames under a second apart could plausibly render identical pixels.
    // At 50% speed the coin has visibly moved.
    expect(Buffer.compare(first, second)).not.toBe(0)

    await context.close()
  })

  test('captures visual verification screenshots at 3 widths', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('canvas')).toBeVisible()
    // The Environment HDR loads over the network — wait for it (and the coin
    // texture pipeline) to settle before trusting a frame is fully painted.
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/desktop-1440x900.png`, fullPage: true })

    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tablet-768x1024.png`, fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile-390x844.png`, fullPage: true })
  })
})
