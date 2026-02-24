import { describe, expect, it } from 'vitest'
import {
	computeSunburstLayout,
	findTreeNode,
	getAllTreeNodeIds,
	type SunburstArc,
} from '../../client/lib/sunburst-layout'
import type { TreeMapDefinition } from '../../shared/types/MandalaTypes'

const TAU = 2 * Math.PI

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SIMPLE_TREE: TreeMapDefinition = {
	id: 'simple',
	name: 'Simple Tree',
	description: 'A simple test tree',
	root: {
		id: 'root',
		label: 'Root',
		question: '',
		guidance: '',
		examples: [],
		children: [
			{
				id: 'a',
				label: 'A',
				question: '',
				guidance: '',
				examples: [],
				children: [
					{ id: 'a1', label: 'A1', question: '', guidance: '', examples: [] },
					{ id: 'a2', label: 'A2', question: '', guidance: '', examples: [] },
				],
			},
			{
				id: 'b',
				label: 'B',
				question: '',
				guidance: '',
				examples: [],
			},
		],
	},
}

const WEIGHTED_TREE: TreeMapDefinition = {
	id: 'weighted',
	name: 'Weighted Tree',
	description: 'A tree with weighted leaves',
	root: {
		id: 'root',
		label: 'Root',
		question: '',
		guidance: '',
		examples: [],
		children: [
			{
				id: 'big',
				label: 'Big',
				question: '',
				guidance: '',
				examples: [],
				weight: 3,
			},
			{
				id: 'small',
				label: 'Small',
				question: '',
				guidance: '',
				examples: [],
				weight: 1,
			},
		],
	},
}

const TRANSPARENT_TREE: TreeMapDefinition = {
	id: 'transparent',
	name: 'Transparent Tree',
	description: 'A tree with a transparent grouping node',
	root: {
		id: 'root',
		label: 'Root',
		question: '',
		guidance: '',
		examples: [],
		children: [
			{
				id: 'group',
				label: 'Group',
				question: '',
				guidance: '',
				examples: [],
				transparent: true,
				children: [
					{
						id: 'member-a',
						label: 'Member A',
						question: '',
						guidance: '',
						examples: [],
					},
					{
						id: 'member-b',
						label: 'Member B',
						question: '',
						guidance: '',
						examples: [],
					},
				],
			},
			{
				id: 'sibling',
				label: 'Sibling',
				question: '',
				guidance: '',
				examples: [],
			},
		],
	},
}

// ─── computeSunburstLayout ───────────────────────────────────────────────────

describe('computeSunburstLayout', () => {
	const simpleArcs = computeSunburstLayout(SIMPLE_TREE)
	const byId = (arcs: SunburstArc[], id: string) => arcs.find((a) => a.id === id)!

	it('returns an arc for every node', () => {
		// root, a, a1, a2, b = 5 nodes
		expect(simpleArcs).toHaveLength(5)
		expect(simpleArcs.map((a) => a.id).sort()).toEqual(['a', 'a1', 'a2', 'b', 'root'].sort())
	})

	it('root spans full circle (x0=0, x1=2*PI)', () => {
		const root = byId(simpleArcs, 'root')
		expect(root.x0).toBeCloseTo(0, 5)
		expect(root.x1).toBeCloseTo(TAU, 5)
	})

	it('root is at depth 0', () => {
		const root = byId(simpleArcs, 'root')
		expect(root.depth).toBe(0)
	})

	it('children are angularly contained within parent', () => {
		const a = byId(simpleArcs, 'a')
		const a1 = byId(simpleArcs, 'a1')
		const a2 = byId(simpleArcs, 'a2')

		// a1 and a2 should be within a's angular range
		expect(a1.x0).toBeGreaterThanOrEqual(a.x0 - 1e-9)
		expect(a1.x1).toBeLessThanOrEqual(a.x1 + 1e-9)
		expect(a2.x0).toBeGreaterThanOrEqual(a.x0 - 1e-9)
		expect(a2.x1).toBeLessThanOrEqual(a.x1 + 1e-9)
	})

	it('children are one depth below parent radially', () => {
		const root = byId(simpleArcs, 'root')
		const a = byId(simpleArcs, 'a')
		const a1 = byId(simpleArcs, 'a1')

		expect(a.depth).toBe(root.depth + 1)
		expect(a1.depth).toBe(a.depth + 1)
	})

	it('weight is respected in angular distribution (3:1 → 3:1 sweep)', () => {
		const arcs = computeSunburstLayout(WEIGHTED_TREE)
		const big = byId(arcs, 'big')
		const small = byId(arcs, 'small')

		const bigSweep = big.x1 - big.x0
		const smallSweep = small.x1 - small.x0

		expect(bigSweep / smallSweep).toBeCloseTo(3, 1)
	})
})

// ─── Transparent node handling ───────────────────────────────────────────────

describe('transparent node handling', () => {
	const arcs = computeSunburstLayout(TRANSPARENT_TREE)
	const byId = (id: string) => arcs.find((a) => a.id === id)!

	it('transparent node is marked as transparent', () => {
		const group = byId('group')
		expect(group.transparent).toBe(true)
	})

	it('non-transparent nodes are not marked transparent', () => {
		const sibling = byId('sibling')
		expect(sibling.transparent).toBe(false)
	})

	it('children of transparent node appear at same visual depth as siblings', () => {
		const sibling = byId('sibling')
		const memberA = byId('member-a')
		const memberB = byId('member-b')

		// MemberA and MemberB should have the same y0/y1 as Sibling
		expect(memberA.y0).toBeCloseTo(sibling.y0, 5)
		expect(memberA.y1).toBeCloseTo(sibling.y1, 5)
		expect(memberB.y0).toBeCloseTo(sibling.y0, 5)
		expect(memberB.y1).toBeCloseTo(sibling.y1, 5)
	})

	it('children of transparent node have adjusted depth', () => {
		const sibling = byId('sibling')
		const memberA = byId('member-a')

		expect(memberA.depth).toBe(sibling.depth)
	})

	it('child of transparent group spans full group angular width', () => {
		const group = byId('group')
		const memberA = byId('member-a')
		const memberB = byId('member-b')

		// Combined angular extent of members should cover the group
		const minX0 = Math.min(memberA.x0, memberB.x0)
		const maxX1 = Math.max(memberA.x1, memberB.x1)
		expect(minX0).toBeCloseTo(group.x0, 5)
		expect(maxX1).toBeCloseTo(group.x1, 5)
	})
})

// ─── getAllTreeNodeIds ────────────────────────────────────────────────────────

describe('getAllTreeNodeIds', () => {
	it('returns all IDs via DFS traversal', () => {
		const ids = getAllTreeNodeIds(SIMPLE_TREE)
		expect(ids.sort()).toEqual(['a', 'a1', 'a2', 'b', 'root'].sort())
	})

	it('returns IDs in DFS order (parent before children)', () => {
		const ids = getAllTreeNodeIds(SIMPLE_TREE)
		expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('a'))
		expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('a1'))
		expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('a2'))
	})
})

// ─── findTreeNode ────────────────────────────────────────────────────────────

describe('findTreeNode', () => {
	it('finds root node', () => {
		const node = findTreeNode(SIMPLE_TREE.root, 'root')
		expect(node).not.toBeNull()
		expect(node!.id).toBe('root')
	})

	it('finds deeply nested node', () => {
		const node = findTreeNode(SIMPLE_TREE.root, 'a1')
		expect(node).not.toBeNull()
		expect(node!.label).toBe('A1')
	})

	it('returns null for non-existent ID', () => {
		const node = findTreeNode(SIMPLE_TREE.root, 'nonexistent')
		expect(node).toBeNull()
	})
})
