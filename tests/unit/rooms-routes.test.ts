import { describe, it, expect } from 'vitest'

describe('rooms routes', () => {
	it('placeholder — routes file exists and exports handlers', async () => {
		const mod = await import('../../worker/routes/rooms')
		expect(mod.createShareRoute).toBeDefined()
		expect(mod.deleteShareRoute).toBeDefined()
		expect(mod.updateShareRoute).toBeDefined()
		expect(mod.listSharesRoute).toBeDefined()
		expect(mod.sharedWithMeRoute).toBeDefined()
		expect(mod.resolveSlugRoute).toBeDefined()
	})
})
