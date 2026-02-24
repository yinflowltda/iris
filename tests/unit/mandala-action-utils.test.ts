import { describe, expect, it } from 'vitest'
import {
	getMetadataSchemaForCell,
	getMetadataSchemaFromTree,
} from '../../client/actions/element-lookup-utils'
import { resolveMandalaId } from '../../client/actions/mandala-action-utils'
import { EMOTIONS_TREE } from '../../client/lib/frameworks/emotions-map'
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

describe('getMetadataSchemaFromTree', () => {
	it('returns correct schema for root node', () => {
		const schema = getMetadataSchemaFromTree(EMOTIONS_TREE, 'evidence')
		expect(schema).toEqual({ direction: 'string', linked_belief_id: 'string' })
	})

	it('returns correct schema for a nested node', () => {
		const schema = getMetadataSchemaFromTree(EMOTIONS_TREE, 'past-events')
		expect(schema).toEqual({ trigger_type: 'string', is_primary: 'boolean' })
	})

	it('returns correct schema for an inner node', () => {
		const schema = getMetadataSchemaFromTree(EMOTIONS_TREE, 'present-beliefs')
		expect(schema).toEqual({
			belief_level: 'string',
			strength_before: 'number',
			strength_after: 'number',
			associated_emotion: 'string',
			associated_emotion_intensity: 'number',
			distortion: 'string',
		})
	})

	it('returns null for unknown node', () => {
		expect(getMetadataSchemaFromTree(EMOTIONS_TREE, 'nonexistent-cell')).toBeNull()
	})
})

describe('getMetadataSchemaForCell with tree def', () => {
	it('uses tree lookup when tree def is provided', () => {
		const schema = getMetadataSchemaForCell('past-events', EMOTIONS_TREE)
		expect(schema).toEqual({ trigger_type: 'string', is_primary: 'boolean' })
	})

	it('returns null from tree for unknown cell', () => {
		expect(getMetadataSchemaForCell('nonexistent', EMOTIONS_TREE)).toBeNull()
	})

	it('falls back to hardcoded map without tree def', () => {
		const schema = getMetadataSchemaForCell('past-events')
		expect(schema).toEqual({ trigger_type: 'string', is_primary: 'boolean' })
	})

	it('returns null from hardcoded map for unknown cell', () => {
		expect(getMetadataSchemaForCell('nonexistent')).toBeNull()
	})
})
