import { describe, it, expect, vi } from 'vitest'

describe('isPublicRoute', () => {
	it('returns true for GET /fl/keys', async () => {
		const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
		expect(isPublicRoute('GET', '/fl/keys')).toBe(true)
	})

	it('returns true for GET /fl/rounds/status', async () => {
		const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
		expect(isPublicRoute('GET', '/fl/rounds/status')).toBe(true)
	})

	it('returns true for GET /fl/rounds/aggregate', async () => {
		const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
		expect(isPublicRoute('GET', '/fl/rounds/aggregate')).toBe(true)
	})

	it('returns false for POST /fl/rounds/aggregate', async () => {
		const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
		expect(isPublicRoute('POST', '/fl/rounds/aggregate')).toBe(false)
	})

	it('returns true for GET /fl/rounds/metrics', async () => {
		const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
		expect(isPublicRoute('GET', '/fl/rounds/metrics')).toBe(true)
	})

	it('returns false for POST /stream', async () => {
		const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
		expect(isPublicRoute('POST', '/stream')).toBe(false)
	})

	it('returns false for GET /me', async () => {
		const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
		expect(isPublicRoute('GET', '/me')).toBe(false)
	})

	it('returns false for POST /fl/rounds/open', async () => {
		const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
		expect(isPublicRoute('POST', '/fl/rounds/open')).toBe(false)
	})
})
