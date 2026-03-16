import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock D1Database interface for testing
function createMockD1() {
	const results: Record<string, unknown>[] = []
	const mockStatement = {
		bind: vi.fn().mockReturnThis(),
		run: vi.fn().mockResolvedValue({ success: true }),
		first: vi.fn().mockResolvedValue(null),
	}
	const mockDb = {
		prepare: vi.fn().mockReturnValue(mockStatement),
		_statement: mockStatement,
	}
	return mockDb
}

describe('upsertUser', () => {
	it('calls D1 with correct SQL and bindings', async () => {
		const { upsertUser } = await import('../../worker/lib/user-store')
		const db = createMockD1()

		await upsertUser(db as unknown as D1Database, {
			sub: 'user-123',
			email: 'test@example.com',
			name: 'Test User',
			avatar_url: 'https://example.com/avatar.jpg',
		})

		expect(db.prepare).toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO users'),
		)
		expect(db._statement.bind).toHaveBeenCalledWith(
			'user-123',
			'test@example.com',
			'Test User',
			'https://example.com/avatar.jpg',
		)
		expect(db._statement.run).toHaveBeenCalled()
	})
})

describe('getUserBySub', () => {
	it('returns user when found', async () => {
		const { getUserBySub } = await import('../../worker/lib/user-store')
		const db = createMockD1()
		db._statement.first.mockResolvedValue({
			sub: 'user-123',
			email: 'test@example.com',
			name: 'Test',
			avatar_url: null,
			created_at: '2026-03-16T00:00:00',
			last_seen_at: '2026-03-16T00:00:00',
		})

		const user = await getUserBySub(db as unknown as D1Database, 'user-123')

		expect(user).not.toBeNull()
		expect(user!.sub).toBe('user-123')
		expect(db._statement.bind).toHaveBeenCalledWith('user-123')
	})

	it('returns null when not found', async () => {
		const { getUserBySub } = await import('../../worker/lib/user-store')
		const db = createMockD1()

		const user = await getUserBySub(db as unknown as D1Database, 'nonexistent')
		expect(user).toBeNull()
	})
})
