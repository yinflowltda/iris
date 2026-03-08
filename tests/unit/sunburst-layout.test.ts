import { describe, expect, it } from 'vitest'
import {
	computeSunburstLayout,
	findTreeNode,
	getAllTreeNodeIds,
	isNodeInSubtree,
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

/** Tree with two halves that have different radial band configs */
const REMAPPED_TREE: TreeMapDefinition = {
	id: 'remapped',
	name: 'Remapped Tree',
	description: 'A tree with radial band remapping',
	startAngle: Math.PI / 2, // first child at 3 o'clock
	root: {
		id: 'root',
		label: 'Root',
		question: '',
		guidance: '',
		examples: [],
		children: [
			// Bottom half: 2 children, each with 1 leaf (depth 2)
			{
				id: 'bottom-a',
				label: 'Bottom A',
				question: '',
				guidance: '',
				examples: [],
				children: [
					{ id: 'bottom-a-leaf', label: 'Leaf', question: '', guidance: '', examples: [] },
				],
			},
			{
				id: 'bottom-b',
				label: 'Bottom B',
				question: '',
				guidance: '',
				examples: [],
				children: [
					{ id: 'bottom-b-leaf', label: 'Leaf', question: '', guidance: '', examples: [] },
				],
			},
			// Top half: 2 children, each with 1 leaf (depth 2)
			{
				id: 'top-a',
				label: 'Top A',
				question: '',
				guidance: '',
				examples: [],
				children: [
					{ id: 'top-a-leaf', label: 'Leaf', question: '', guidance: '', examples: [] },
				],
			},
			{
				id: 'top-b',
				label: 'Top B',
				question: '',
				guidance: '',
				examples: [],
				children: [
					{ id: 'top-b-leaf', label: 'Leaf', question: '', guidance: '', examples: [] },
				],
			},
		],
	},
	radialBands: {
		centerRadius: 0.1,
		regions: [
			{
				// Bottom half: π/2 to 3π/2 (after startAngle offset)
				angularRange: [Math.PI / 2, (3 * Math.PI) / 2],
				bands: {
					1: [0.1, 0.5],
					2: [0.5, 1.0],
				},
			},
			{
				// Top half: 3π/2 to 5π/2 (after startAngle offset)
				angularRange: [(3 * Math.PI) / 2, (5 * Math.PI) / 2],
				bands: {
					1: [0.1, 0.3],
					2: [0.3, 0.8],
				},
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

// ─── isNodeInSubtree ─────────────────────────────────────────────────────────

describe('isNodeInSubtree', () => {
	const root = SIMPLE_TREE.root

	it('returns true when nodeId is the subtree root itself', () => {
		expect(isNodeInSubtree(root, 'a', 'a')).toBe(true)
	})

	it('returns true for a direct child of the subtree root', () => {
		expect(isNodeInSubtree(root, 'a', 'a1')).toBe(true)
		expect(isNodeInSubtree(root, 'a', 'a2')).toBe(true)
	})

	it('returns false for a node in a different subtree', () => {
		expect(isNodeInSubtree(root, 'a', 'b')).toBe(false)
	})

	it('returns false when subtree root does not exist', () => {
		expect(isNodeInSubtree(root, 'nonexistent', 'a1')).toBe(false)
	})

	it('returns true for all nodes when root is the subtree root', () => {
		expect(isNodeInSubtree(root, 'root', 'root')).toBe(true)
		expect(isNodeInSubtree(root, 'root', 'a')).toBe(true)
		expect(isNodeInSubtree(root, 'root', 'a1')).toBe(true)
		expect(isNodeInSubtree(root, 'root', 'a2')).toBe(true)
		expect(isNodeInSubtree(root, 'root', 'b')).toBe(true)
	})
})

// ─── Radial band remapping ──────────────────────────────────────────────────

describe('radial band remapping', () => {
	const arcs = computeSunburstLayout(REMAPPED_TREE)
	const byId = (id: string) => arcs.find((a) => a.id === id)!

	it('root y1 equals centerRadius', () => {
		const root = byId('root')
		expect(root.y0).toBeCloseTo(0, 5)
		expect(root.y1).toBeCloseTo(0.1, 5)
	})

	it('bottom-half depth-1 arcs use bottom region bands', () => {
		const bottomA = byId('bottom-a')
		expect(bottomA.y0).toBeCloseTo(0.1, 5)
		expect(bottomA.y1).toBeCloseTo(0.5, 5)
	})

	it('bottom-half depth-2 arcs use bottom region bands', () => {
		const bottomALeaf = byId('bottom-a-leaf')
		expect(bottomALeaf.y0).toBeCloseTo(0.5, 5)
		expect(bottomALeaf.y1).toBeCloseTo(1.0, 5)
	})

	it('top-half depth-1 arcs use top region bands', () => {
		const topA = byId('top-a')
		expect(topA.y0).toBeCloseTo(0.1, 5)
		expect(topA.y1).toBeCloseTo(0.3, 5)
	})

	it('top-half depth-2 arcs use top region bands', () => {
		const topALeaf = byId('top-a-leaf')
		expect(topALeaf.y0).toBeCloseTo(0.3, 5)
		expect(topALeaf.y1).toBeCloseTo(0.8, 5)
	})

	it('angular allocation (x0/x1) is unchanged — 4 equal children', () => {
		const bottomA = byId('bottom-a')
		const topB = byId('top-b')
		const sweep = bottomA.x1 - bottomA.x0
		expect(sweep).toBeCloseTo(TAU / 4, 3)
		const topSweep = topB.x1 - topB.x0
		expect(topSweep).toBeCloseTo(TAU / 4, 3)
	})

	it('without radialBands, partition-computed y values are used (no remapping)', () => {
		// SIMPLE_TREE has no radialBands — values should be partition-default
		const simpleArcs = computeSunburstLayout(SIMPLE_TREE)
		const a = simpleArcs.find((arc) => arc.id === 'a')!
		// maxDepth=3, depth 1 → y0=1/3≈0.333, y1=2/3≈0.667
		expect(a.y0).toBeCloseTo(1 / 3, 3)
		expect(a.y1).toBeCloseTo(2 / 3, 3)
	})
})
