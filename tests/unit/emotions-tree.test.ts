import { describe, expect, it } from 'vitest'
import { EMOTIONS_TREE } from '../../client/lib/frameworks/emotions-map'
import type { TreeNodeDef } from '../../shared/types/MandalaTypes'

function collectIds(node: TreeNodeDef): string[] {
	const ids = [node.id]
	for (const child of node.children ?? []) {
		ids.push(...collectIds(child))
	}
	return ids
}

describe('EMOTIONS_TREE', () => {
	it('has root id "evidence"', () => {
		expect(EMOTIONS_TREE.root.id).toBe('evidence')
	})

	it('has 3 transparent group children at depth 1 (past, future, present)', () => {
		expect(EMOTIONS_TREE.root.children).toHaveLength(3)
		for (const child of EMOTIONS_TREE.root.children!) {
			expect(child.transparent).toBe(true)
		}
	})

	it('contains all 10 node IDs (3 groups + 7 cells)', () => {
		const ids = collectIds(EMOTIONS_TREE.root)
		expect(ids).toHaveLength(10)
		// Group nodes
		expect(ids).toContain('past')
		expect(ids).toContain('future')
		expect(ids).toContain('present')
		// Cell nodes
		expect(ids).toContain('evidence')
		expect(ids).toContain('past-events')
		expect(ids).toContain('past-thoughts-emotions')
		expect(ids).toContain('future-events')
		expect(ids).toContain('future-beliefs')
		expect(ids).toContain('present-behaviors')
		expect(ids).toContain('present-beliefs')
	})

	it('has weight ratio 1.75:1.75:1.0 for past:future:present groups', () => {
		const children = EMOTIONS_TREE.root.children!
		const past = children.find((c) => c.id === 'past')!
		const future = children.find((c) => c.id === 'future')!
		const present = children.find((c) => c.id === 'present')!

		expect(past.weight).toBe(1.75)
		expect(future.weight).toBe(1.75)
		expect(present.weight).toBe(1.0)
	})

	it('has metadataSchema on every non-group node', () => {
		function checkMetadata(node: TreeNodeDef) {
			if (!node.transparent) {
				expect(node.metadataSchema).toBeDefined()
				expect(Object.keys(node.metadataSchema!).length).toBeGreaterThan(0)
			}
			for (const child of node.children ?? []) {
				checkMetadata(child)
			}
		}
		checkMetadata(EMOTIONS_TREE.root)
	})

	it('has correct metadataSchema for evidence (root)', () => {
		expect(EMOTIONS_TREE.root.metadataSchema).toEqual({
			direction: 'string',
			linked_belief_id: 'string',
		})
	})

	it('reuses question/guidance/examples from EMOTIONS_MAP', () => {
		// Spot-check: root should have a non-empty question
		expect(EMOTIONS_TREE.root.question).toBeTruthy()
		expect(EMOTIONS_TREE.root.guidance).toBeTruthy()
		expect(EMOTIONS_TREE.root.examples.length).toBeGreaterThan(0)
	})
})
