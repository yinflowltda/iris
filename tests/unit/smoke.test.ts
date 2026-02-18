import { describe, expect, it } from 'vitest'

describe('smoke test', () => {
	it('vitest is configured correctly', () => {
		expect(1 + 1).toBe(2)
	})

	it('can import shared types', async () => {
		const module = await import('../../shared/models')
		expect(module.DEFAULT_MODEL_NAME).toBeDefined()
	})
})
