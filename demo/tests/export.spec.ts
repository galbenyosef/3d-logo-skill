import { expect, test } from '@playwright/test'

// Records one real 6 s turn through MediaRecorder on the software rasterizer,
// so allow well beyond the default 30 s test timeout.
test('Download video saves a non-empty clip and then shows the share note', async ({ page }) => {
  test.setTimeout(90_000)
  await page.route('https://api.github.com/repos/**', (route) =>
    route.fulfill({ json: { stargazers_count: 1234 } }),
  )
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Download video' })
  await expect(button).toBeVisible()

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await button.click()
  await expect(page.getByRole('button', { name: /Recording/ })).toBeDisabled()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^coin-firebird\.(mp4|webm)$/)
  const path = await download.path()
  const { size } = await (await import('node:fs/promises')).stat(path)
  expect(size).toBeGreaterThan(1000)

  const note = page.locator('.share-note')
  await expect(note.getByRole('link', { name: 'Post it on X' })).toHaveAttribute('href', /^https:\/\/x\.com\/intent\/post\?/)
  await expect(note.getByRole('link', { name: 'Star on GitHub' })).toHaveAttribute('href', 'https://github.com/hasuwini77/3d-logo-skill')
  await note.getByRole('button', { name: 'Dismiss' }).click()
  await expect(note).toHaveCount(0)
})
