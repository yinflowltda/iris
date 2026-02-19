import { describe, expect, it } from 'vitest'
import { resolveMandalaId } from '../../client/actions/mandala-action-utils'
import type { SimpleShapeId } from '../../shared/types/ids-schema'

const sid = (s: string) => s as SimpleShapeId

describe('resolveMandalaId', () => {
	it('returns candidate when candidate exists and is a mandala', () => {
		const editor = {
			getShape: (id: string) => (id === 'shape:mandala-a' ? { type: 'mandala' } : null),
			getCurrentPageShapes: () => [{ id: 'shape:mandala-a', type: 'mandala' }],
		}
		const helpers = {
			ensureShapeIdExists: (id: string) => (id === 'mandala-a' ? sid('mandala-a') : null),
		}

		const resolved = resolveMandalaId(editor as any, helpers as any, sid('mandala-a'))
		expect(resolved).toBe('mandala-a')
	})

	it('falls back to single mandala on page when candidate is invalid', () => {
		const editor = {
			getShape: () => null,
			getCurrentPageShapes: () => [{ id: 'shape:mandala-1', type: 'mandala' }],
		}
		const helpers = {
			ensureShapeIdExists: () => null,
		}

		const resolved = resolveMandalaId(editor as any, helpers as any, sid('wrong-id'))
		expect(resolved).toBe('mandala-1')
	})

	it('returns null when there are zero or many mandalas', () => {
		const helpers = {
			ensureShapeIdExists: () => null,
		}

		const noMandalaEditor = {
			getShape: () => null,
			getCurrentPageShapes: () => [],
		}
		expect(resolveMandalaId(noMandalaEditor as any, helpers as any, sid('wrong-id'))).toBeNull()

		const manyMandalasEditor = {
			getShape: () => null,
			getCurrentPageShapes: () => [
				{ id: 'shape:mandala-1', type: 'mandala' },
				{ id: 'shape:mandala-2', type: 'mandala' },
			],
		}
		expect(resolveMandalaId(manyMandalasEditor as any, helpers as any, sid('wrong-id'))).toBeNull()
	})
})
