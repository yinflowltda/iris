import { describe, it, expect } from 'vitest'
import { renderInviteEmailHtml } from '../../worker/lib/email'

describe('renderInviteEmailHtml', () => {
	it('includes owner name in the email', () => {
		const html = renderInviteEmailHtml({
			ownerName: 'Rafael',
			permission: 'edit',
			roomSlug: 'k7x9m2',
		})
		expect(html).toContain('Rafael')
	})

	it('includes the room link', () => {
		const html = renderInviteEmailHtml({
			ownerName: 'Rafael',
			permission: 'edit',
			roomSlug: 'k7x9m2',
		})
		expect(html).toContain('iris.yinflow.life/r/k7x9m2')
	})

	it('shows edit permission text', () => {
		const html = renderInviteEmailHtml({
			ownerName: 'Rafael',
			permission: 'edit',
			roomSlug: 'k7x9m2',
		})
		expect(html).toContain('view and edit')
	})

	it('shows view-only permission text', () => {
		const html = renderInviteEmailHtml({
			ownerName: 'Rafael',
			permission: 'view',
			roomSlug: 'k7x9m2',
		})
		expect(html).toContain('view this session')
		expect(html).not.toContain('view and edit')
	})
})
