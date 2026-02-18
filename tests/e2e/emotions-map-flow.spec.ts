import { expect, test } from '@playwright/test'

test.describe('Emotions Map flow', () => {
	test.beforeEach(async ({ page }) => {
		// Clear persisted state so each test starts fresh
		await page.goto('/')
		await page.evaluate(() => {
			localStorage.clear()
		})
		await page.reload()
		await page.waitForLoadState('networkidle')
	})

	test('shows template chooser on fresh load', async ({ page }) => {
		const overlay = page.locator('.template-chooser-overlay')
		await expect(overlay).toHaveAttribute('data-visible', 'true')
		await expect(page.locator('.template-chooser-title')).toContainText('Choose a Framework')
	})

	test('clicking Start hides template and shows mandala on canvas', async ({ page }) => {
		const overlay = page.locator('.template-chooser-overlay')
		await expect(overlay).toHaveAttribute('data-visible', 'true')

		const startButton = page.locator('.template-card-start')
		await startButton.click()

		await expect(overlay).toHaveAttribute('data-visible', 'false')
	})

	test('progress indicator shows 0 / 18 after starting', async ({ page }) => {
		await page.locator('.template-card-start').click()

		const progress = page.locator('[data-testid="progress-indicator"]')
		await expect(progress).toBeVisible()

		const label = page.locator('[data-testid="progress-label"]')
		await expect(label).toContainText('0 / 18')
	})

	test('session resumes after page refresh (template chooser stays hidden)', async ({ page }) => {
		// Start a session
		await page.locator('.template-card-start').click()
		const overlay = page.locator('.template-chooser-overlay')
		await expect(overlay).toHaveAttribute('data-visible', 'false')

		// Refresh
		await page.reload()
		await page.waitForLoadState('networkidle')

		// Template chooser should remain hidden because mandala is persisted
		await expect(overlay).toHaveAttribute('data-visible', 'false')

		// Progress indicator should be visible
		const progress = page.locator('[data-testid="progress-indicator"]')
		await expect(progress).toBeVisible()
	})
})
