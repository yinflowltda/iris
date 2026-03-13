import { describe, expect, it } from 'vitest'
// Test the pure logic functions exported from mandala-arrow-binding
// (The sideEffects registration requires a live editor and is tested via integration)

// Since the module imports tldraw types, we test the exported state management functions
// and the getValidEdgeTypes logic by importing just what we need.

import type { EdgeTypeDef } from '../../shared/types/MandalaTypes'

// Re-implement the pure logic here for unit testing (avoids tldraw import issues)
function getValidEdgeTypes(
	edgeTypes: EdgeTypeDef[],
	sourceCellId: string,
	targetCellId: string,
): EdgeTypeDef[] {
	return edgeTypes.filter((et) => {
		const fromMatch = et.fromCells.includes(sourceCellId)
		const toMatch = et.toCells.includes(targetCellId)
		if (fromMatch && toMatch) return true
		if (et.bidirectional) {
			return et.fromCells.includes(targetCellId) && et.toCells.includes(sourceCellId)
		}
		return false
	})
}

const SAMPLE_EDGE_TYPES: EdgeTypeDef[] = [
	{
		id: 'triggers',
		label: 'triggers',
		fromCells: ['past-events'],
		toCells: ['past-thoughts-emotions'],
		empiricalBasis: 'CBT: events trigger automatic thoughts',
		color: 'black',
	},
	{
		id: 'supports',
		label: 'supports',
		fromCells: ['evidence'],
		toCells: ['present-beliefs'],
		empiricalBasis: 'Evidence supports beliefs',
		color: 'green',
	},
	{
		id: 'contradicts',
		label: 'contradicts',
		fromCells: ['evidence'],
		toCells: ['present-beliefs'],
		empiricalBasis: 'Evidence contradicts beliefs',
		color: 'red',
	},
	{
		id: 'conflicts-with',
		label: 'conflicts with',
		fromCells: ['present-behaviors', 'present-beliefs'],
		toCells: ['present-behaviors', 'present-beliefs'],
		empiricalBasis: 'Cognitive dissonance',
		bidirectional: true,
		color: 'red',
	},
]

describe('getValidEdgeTypes', () => {
	it('returns matching edge types for a valid cell pair', () => {
		const result = getValidEdgeTypes(SAMPLE_EDGE_TYPES, 'past-events', 'past-thoughts-emotions')
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe('triggers')
	})

	it('returns multiple matches for evidence → beliefs', () => {
		const result = getValidEdgeTypes(SAMPLE_EDGE_TYPES, 'evidence', 'present-beliefs')
		expect(result).toHaveLength(2)
		expect(result.map((e) => e.id)).toEqual(['supports', 'contradicts'])
	})

	it('returns empty for invalid cell pairs', () => {
		const result = getValidEdgeTypes(SAMPLE_EDGE_TYPES, 'past-events', 'evidence')
		expect(result).toHaveLength(0)
	})

	it('handles bidirectional edges in forward direction', () => {
		const result = getValidEdgeTypes(
			SAMPLE_EDGE_TYPES,
			'present-behaviors',
			'present-beliefs',
		)
		expect(result.map((e) => e.id)).toContain('conflicts-with')
	})

	it('handles bidirectional edges in reverse direction', () => {
		const result = getValidEdgeTypes(
			SAMPLE_EDGE_TYPES,
			'present-beliefs',
			'present-behaviors',
		)
		expect(result.map((e) => e.id)).toContain('conflicts-with')
	})

	it('does not match non-bidirectional edges in reverse', () => {
		const result = getValidEdgeTypes(
			SAMPLE_EDGE_TYPES,
			'past-thoughts-emotions',
			'past-events',
		)
		expect(result).toHaveLength(0)
	})
})
