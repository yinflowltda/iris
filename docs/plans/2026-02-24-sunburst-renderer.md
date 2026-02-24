# Sunburst Renderer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the polar-chart mandala renderer with a D3-powered zoomable sunburst renderer that supports hierarchical data, transparent group nodes, and dual zoom modes.

**Architecture:** Tree-based data model (`TreeMapDefinition`) replaces the flat slice/cell model. D3 `d3-hierarchy` + `d3-shape` + `d3-interpolate` handle layout computation and arc generation. React renders SVG inside the existing TLDraw `ShapeUtil`. Two zoom modes: Focus (sunburst arc morphing) and Navigate (TLDraw camera zoom).

**Tech Stack:** D3 modular packages (computation only), React 19, TLDraw v4.3, TypeScript, Vitest

**Design doc:** `docs/plans/2026-02-24-sunburst-renderer-design.md`

---

### Task 1: Create branch and install D3 dependencies

**Files:**
- Modify: `package.json`

**Step 1: Create the feature branch**

```bash
git checkout -b feat/sunburst-renderer
```

**Step 2: Install D3 computation modules**

```bash
bun add d3-hierarchy d3-shape d3-interpolate
bun add -d @types/d3-hierarchy @types/d3-shape @types/d3-interpolate
```

**Step 3: Verify installation**

Run: `bun run typecheck`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add d3-hierarchy, d3-shape, d3-interpolate dependencies"
```

---

### Task 2: Add TreeNodeDef and TreeMapDefinition types

**Files:**
- Modify: `shared/types/MandalaTypes.ts` (add new types after line 41, keeping ALL existing types intact)
- Test: `tests/unit/tree-map-types.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/tree-map-types.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { TreeMapDefinition, TreeNodeDef } from '../../shared/types/MandalaTypes'

describe('TreeMapDefinition types', () => {
	it('allows a simple tree with root and children', () => {
		const tree: TreeMapDefinition = {
			id: 'test',
			name: 'Test Map',
			description: 'A test map',
			root: {
				id: 'root',
				label: 'Root',
				question: 'Root question?',
				guidance: 'Root guidance',
				examples: ['Example 1'],
				children: [
					{
						id: 'child-1',
						label: 'Child 1',
						question: 'Q1?',
						guidance: 'G1',
						examples: [],
					},
					{
						id: 'child-2',
						label: 'Child 2',
						question: 'Q2?',
						guidance: 'G2',
						examples: [],
						weight: 2,
						children: [
							{
								id: 'grandchild',
								label: 'Grandchild',
								question: 'Q3?',
								guidance: 'G3',
								examples: [],
							},
						],
					},
				],
			},
		}
		expect(tree.root.id).toBe('root')
		expect(tree.root.children).toHaveLength(2)
		expect(tree.root.children![1].weight).toBe(2)
		expect(tree.root.children![1].children![0].id).toBe('grandchild')
	})

	it('supports transparent grouping nodes', () => {
		const group: TreeNodeDef = {
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
					question: 'Q?',
					guidance: '',
					examples: [],
				},
				{
					id: 'member-b',
					label: 'Member B',
					question: 'Q?',
					guidance: '',
					examples: [],
				},
			],
		}
		expect(group.transparent).toBe(true)
		expect(group.children).toHaveLength(2)
	})

	it('supports metadataSchema on nodes', () => {
		const node: TreeNodeDef = {
			id: 'with-meta',
			label: 'With Meta',
			question: 'Q?',
			guidance: '',
			examples: [],
			metadataSchema: {
				intensity: 'number',
				is_primary: 'boolean',
				kind: 'string',
			},
		}
		expect(node.metadataSchema).toEqual({
			intensity: 'number',
			is_primary: 'boolean',
			kind: 'string',
		})
	})
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/tree-map-types.test.ts`
Expected: FAIL — `TreeMapDefinition` and `TreeNodeDef` not found

**Step 3: Add the types to MandalaTypes.ts**

Add after line 41 (after the `MapDefinition` interface), keeping all existing types:

```typescript
// ─── Tree-based map definition (sunburst renderer) ──────────────────────────

export interface TreeNodeDef {
	id: string
	label: string
	question: string
	guidance: string
	examples: string[]
	weight?: number
	metadataSchema?: Record<string, 'string' | 'number' | 'boolean'>
	children?: TreeNodeDef[]
	transparent?: boolean
}

export interface TreeMapDefinition {
	id: string
	name: string
	description: string
	root: TreeNodeDef
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/tree-map-types.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `bun run verify`
Expected: All existing tests still pass

**Step 6: Commit**

```bash
git add shared/types/MandalaTypes.ts tests/unit/tree-map-types.test.ts
git commit -m "feat: add TreeNodeDef and TreeMapDefinition types"
```

---

### Task 3: Build sunburst layout engine

This is the core computation layer. It takes a `TreeMapDefinition`, runs D3's partition layout, and returns arc parameters for each node. It also handles transparent node depth adjustment.

**Files:**
- Create: `client/lib/sunburst-layout.ts`
- Test: `tests/unit/sunburst-layout.test.ts`

**Step 1: Write the failing tests**

Create `tests/unit/sunburst-layout.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { TreeMapDefinition } from '../../shared/types/MandalaTypes'
import {
	computeSunburstLayout,
	type SunburstArc,
} from '../../client/lib/sunburst-layout'

const SIMPLE_TREE: TreeMapDefinition = {
	id: 'test',
	name: 'Test',
	description: 'Test map',
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
	name: 'Weighted',
	description: '',
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
	name: 'Transparent',
	description: '',
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
					{
						id: 'spanning',
						label: 'Spanning',
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

describe('computeSunburstLayout', () => {
	it('returns an arc for every node', () => {
		const arcs = computeSunburstLayout(SIMPLE_TREE)
		const ids = arcs.map((a) => a.id)
		expect(ids).toContain('root')
		expect(ids).toContain('a')
		expect(ids).toContain('b')
		expect(ids).toContain('a1')
		expect(ids).toContain('a2')
		expect(arcs).toHaveLength(5)
	})

	it('root arc spans full circle (0 to 2pi)', () => {
		const arcs = computeSunburstLayout(SIMPLE_TREE)
		const root = arcs.find((a) => a.id === 'root')!
		expect(root.x0).toBeCloseTo(0)
		expect(root.x1).toBeCloseTo(2 * Math.PI)
	})

	it('root is at depth 0', () => {
		const arcs = computeSunburstLayout(SIMPLE_TREE)
		const root = arcs.find((a) => a.id === 'root')!
		expect(root.depth).toBe(0)
	})

	it('children arcs are contained within parent arc angularly', () => {
		const arcs = computeSunburstLayout(SIMPLE_TREE)
		const a = arcs.find((arc) => arc.id === 'a')!
		const a1 = arcs.find((arc) => arc.id === 'a1')!
		const a2 = arcs.find((arc) => arc.id === 'a2')!
		expect(a1.x0).toBeGreaterThanOrEqual(a.x0 - 0.001)
		expect(a1.x1).toBeLessThanOrEqual(a.x1 + 0.001)
		expect(a2.x0).toBeGreaterThanOrEqual(a.x0 - 0.001)
		expect(a2.x1).toBeLessThanOrEqual(a.x1 + 0.001)
	})

	it('children arcs are one depth level below parent', () => {
		const arcs = computeSunburstLayout(SIMPLE_TREE)
		const a = arcs.find((arc) => arc.id === 'a')!
		const a1 = arcs.find((arc) => arc.id === 'a1')!
		expect(a1.y0).toBeGreaterThanOrEqual(a.y1 - 0.001)
	})

	it('respects weight for angular distribution', () => {
		const arcs = computeSunburstLayout(WEIGHTED_TREE)
		const big = arcs.find((a) => a.id === 'big')!
		const small = arcs.find((a) => a.id === 'small')!
		const bigSweep = big.x1 - big.x0
		const smallSweep = small.x1 - small.x0
		expect(bigSweep / smallSweep).toBeCloseTo(3)
	})

	it('transparent node children render at parent apparent depth', () => {
		const arcs = computeSunburstLayout(TRANSPARENT_TREE)
		const sibling = arcs.find((a) => a.id === 'sibling')!
		const memberA = arcs.find((a) => a.id === 'member-a')!
		// sibling is at depth 1; member-a should also appear at depth 1
		// (same y0/y1 range) because its parent is transparent
		expect(memberA.y0).toBeCloseTo(sibling.y0)
		expect(memberA.y1).toBeCloseTo(sibling.y1)
	})

	it('transparent node itself is not renderable', () => {
		const arcs = computeSunburstLayout(TRANSPARENT_TREE)
		const group = arcs.find((a) => a.id === 'group')!
		expect(group.transparent).toBe(true)
	})

	it('child of transparent group spans full group width', () => {
		const arcs = computeSunburstLayout(TRANSPARENT_TREE)
		const group = arcs.find((a) => a.id === 'group')!
		const spanning = arcs.find((a) => a.id === 'spanning')!
		// spanning is a direct child of the group, so it should span
		// the group's full angular range. Its apparent depth is one below
		// the group's children (member-a, member-b).
		expect(spanning.x0).toBeGreaterThanOrEqual(group.x0 - 0.001)
		expect(spanning.x1).toBeLessThanOrEqual(group.x1 + 0.001)
	})
})

describe('computeSunburstLayout with getAllNodeIds helper', () => {
	it('getAllNodeIds returns all node IDs via DFS', () => {
		const arcs = computeSunburstLayout(SIMPLE_TREE)
		expect(arcs.map((a) => a.id).sort()).toEqual(
			['root', 'a', 'b', 'a1', 'a2'].sort(),
		)
	})
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/sunburst-layout.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the sunburst layout engine**

Create `client/lib/sunburst-layout.ts`:

```typescript
import { hierarchy, partition } from 'd3-hierarchy'
import type { TreeMapDefinition, TreeNodeDef } from '../../shared/types/MandalaTypes'

export interface SunburstArc {
	id: string
	label: string
	depth: number
	x0: number
	x1: number
	y0: number
	y1: number
	transparent: boolean
	parentId: string | null
	hasChildren: boolean
}

/**
 * Compute sunburst arc layout from a tree definition.
 *
 * Uses D3's partition layout to assign angular (x0, x1) and radial (y0, y1)
 * coordinates to each node. Post-processes to adjust depths for transparent
 * nodes (group nodes that don't render their own ring).
 *
 * Radial coords (y0, y1) are normalized 0-1 where 0 = center and 1 = outer edge.
 * Angular coords (x0, x1) are in radians, 0 to 2*PI.
 */
export function computeSunburstLayout(treeDef: TreeMapDefinition): SunburstArc[] {
	const root = hierarchy<TreeNodeDef>(treeDef.root, (d) => d.children ?? [])

	// Use weight for angular distribution. Leaves get their own weight
	// (default 1). Internal nodes sum their children's weights.
	root.sum((d) => {
		if (d.children && d.children.length > 0) return 0
		return d.weight ?? 1
	})

	// Count max visual depth (excluding transparent nodes) for radial scaling
	const maxVisualDepth = computeMaxVisualDepth(root.data)

	// Run partition layout. The partition divides the rectangle [0, 2*PI] x [0, 1]
	// into cells for each node.
	const partitioned = partition<TreeNodeDef>()
		.size([2 * Math.PI, maxVisualDepth + 1])(root)

	// Build arc list with depth adjustment for transparent nodes
	const arcs: SunburstArc[] = []
	const depthOffsets = new Map<string, number>()
	depthOffsets.set(treeDef.root.id, 0)

	partitioned.each((node) => {
		const parentOffset = node.parent
			? depthOffsets.get(node.parent.data.id) ?? 0
			: 0
		const selfOffset = parentOffset + (node.parent?.data.transparent ? 1 : 0)
		depthOffsets.set(node.data.id, selfOffset)

		const adjustedY0 = (node.y0 - selfOffset) / (maxVisualDepth + 1 - selfOffset)
		const adjustedY1 = (node.y1 - selfOffset) / (maxVisualDepth + 1 - selfOffset)

		arcs.push({
			id: node.data.id,
			label: node.data.label,
			depth: node.depth - selfOffset,
			x0: node.x0,
			x1: node.x1,
			y0: Math.max(0, adjustedY0),
			y1: Math.min(1, adjustedY1),
			transparent: node.data.transparent ?? false,
			parentId: node.parent?.data.id ?? null,
			hasChildren: (node.data.children?.length ?? 0) > 0,
		})
	})

	return arcs
}

function computeMaxVisualDepth(node: TreeNodeDef, currentOffset: number = 0): number {
	if (!node.children || node.children.length === 0) {
		return 1 - currentOffset
	}
	const childOffset = currentOffset + (node.transparent ? 1 : 0)
	let maxChild = 0
	for (const child of node.children) {
		maxChild = Math.max(maxChild, computeMaxVisualDepth(child, childOffset))
	}
	return 1 + maxChild
}

/**
 * Get all node IDs from a tree definition via DFS.
 */
export function getAllTreeNodeIds(treeDef: TreeMapDefinition): string[] {
	const ids: string[] = []
	function walk(node: TreeNodeDef) {
		ids.push(node.id)
		if (node.children) {
			for (const child of node.children) walk(child)
		}
	}
	walk(treeDef.root)
	return ids
}

/**
 * Find a node in the tree by ID.
 */
export function findTreeNode(
	root: TreeNodeDef,
	nodeId: string,
): TreeNodeDef | null {
	if (root.id === nodeId) return root
	if (root.children) {
		for (const child of root.children) {
			const found = findTreeNode(child, nodeId)
			if (found) return found
		}
	}
	return null
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/sunburst-layout.test.ts`
Expected: Most tests PASS. If the transparent depth adjustment logic needs tweaking, iterate.

> **Note to implementer:** The transparent depth adjustment is the trickiest part. The key invariant: if a node's parent is `transparent`, the node should appear at the same radial depth as its parent's siblings. Run the tests, inspect the actual y0/y1 values, and adjust the offset math until the transparent test passes.

**Step 5: Run full test suite**

Run: `bun run verify`
Expected: All tests pass (existing tests unaffected)

**Step 6: Commit**

```bash
git add client/lib/sunburst-layout.ts tests/unit/sunburst-layout.test.ts
git commit -m "feat: add sunburst layout engine with D3 partition"
```

---

### Task 4: Convert emotions-map to TreeMapDefinition

The current `EMOTIONS_MAP` uses the old `MapDefinition` format. Create a parallel `EMOTIONS_TREE` in the same file that represents the same data as a tree. Keep the old `EMOTIONS_MAP` export intact — it's still used by the current renderer.

**Files:**
- Modify: `client/lib/frameworks/emotions-map.ts`
- Test: `tests/unit/emotions-tree.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/emotions-tree.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { EMOTIONS_TREE } from '../../client/lib/frameworks/emotions-map'
import { getAllTreeNodeIds } from '../../client/lib/sunburst-layout'

describe('EMOTIONS_TREE', () => {
	it('has root id "evidence"', () => {
		expect(EMOTIONS_TREE.root.id).toBe('evidence')
	})

	it('root has 3 children (past, future, present slices)', () => {
		expect(EMOTIONS_TREE.root.children).toHaveLength(3)
	})

	it('contains all 7 cell IDs from the original map', () => {
		const ids = getAllTreeNodeIds(EMOTIONS_TREE)
		const expected = [
			'evidence',
			'past-thoughts-emotions',
			'past-events',
			'future-beliefs',
			'future-events',
			'present-beliefs',
			'present-behaviors',
		]
		for (const id of expected) {
			expect(ids).toContain(id)
		}
	})

	it('preserves question text from original map', () => {
		expect(EMOTIONS_TREE.root.question).toContain('evidence')
	})

	it('past branch has weight proportional to its angular span', () => {
		const past = EMOTIONS_TREE.root.children!.find(
			(c) => c.id === 'past-thoughts-emotions',
		)
		const present = EMOTIONS_TREE.root.children!.find(
			(c) => c.id === 'present-beliefs',
		)
		// past: 140° sweep, present: 80° sweep, ratio ~1.75
		if (past?.weight && present?.weight) {
			expect(past.weight / present.weight).toBeCloseTo(1.75, 1)
		}
	})
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/emotions-tree.test.ts`
Expected: FAIL — `EMOTIONS_TREE` not exported

**Step 3: Add EMOTIONS_TREE to emotions-map.ts**

Add after the existing `EMOTIONS_MAP` definition but before `registerFramework()`. The tree structure maps: center → root, slices → root.children (inner ring cells), slice cells (outer ring) → grandchildren.

Looking at the emotions map structure:
- Center: evidence (root)
- Inner ring: past-thoughts-emotions, future-beliefs, present-beliefs (depth 1)
- Outer ring: past-events, future-events, present-behaviors (depth 2, leaves)

Angular sweeps for weights: past = 140°, future = 140°, present = 80°. Ratio: 140/80 = 1.75. Use weights: past = 1.75, future = 1.75, present = 1.

```typescript
export const EMOTIONS_TREE: TreeMapDefinition = {
	id: 'emotions-map',
	name: 'Emotions Map',
	description: EMOTIONS_MAP.description,
	root: {
		id: 'evidence',
		label: 'Evidence',
		question: EMOTIONS_MAP.center.question,
		guidance: EMOTIONS_MAP.center.guidance,
		examples: EMOTIONS_MAP.center.examples,
		metadataSchema: {
			direction: 'string',
			linked_belief_id: 'string',
		},
		children: [
			{
				id: 'past-thoughts-emotions',
				label: 'Thoughts & Emotions',
				question: EMOTIONS_MAP.slices[0].cells[1].question,
				guidance: EMOTIONS_MAP.slices[0].cells[1].guidance,
				examples: EMOTIONS_MAP.slices[0].cells[1].examples,
				weight: 1.75,
				metadataSchema: {
					kind: 'string',
					intensity_before: 'number',
					intensity_after: 'number',
					linked_event_id: 'string',
					distortion: 'string',
				},
				children: [
					{
						id: 'past-events',
						label: 'Events',
						question: EMOTIONS_MAP.slices[0].cells[0].question,
						guidance: EMOTIONS_MAP.slices[0].cells[0].guidance,
						examples: EMOTIONS_MAP.slices[0].cells[0].examples,
						metadataSchema: {
							trigger_type: 'string',
							is_primary: 'boolean',
						},
					},
				],
			},
			{
				id: 'future-beliefs',
				label: 'Beliefs',
				question: EMOTIONS_MAP.slices[1].cells[1].question,
				guidance: EMOTIONS_MAP.slices[1].cells[1].guidance,
				examples: EMOTIONS_MAP.slices[1].cells[1].examples,
				weight: 1.75,
				metadataSchema: {
					strength: 'number',
					linked_old_belief_id: 'string',
				},
				children: [
					{
						id: 'future-events',
						label: 'Events',
						question: EMOTIONS_MAP.slices[1].cells[0].question,
						guidance: EMOTIONS_MAP.slices[1].cells[0].guidance,
						examples: EMOTIONS_MAP.slices[1].cells[0].examples,
						metadataSchema: {
							action_type: 'string',
							linked_belief_id: 'string',
						},
					},
				],
			},
			{
				id: 'present-beliefs',
				label: 'Beliefs',
				question: EMOTIONS_MAP.slices[2].cells[1].question,
				guidance: EMOTIONS_MAP.slices[2].cells[1].guidance,
				examples: EMOTIONS_MAP.slices[2].cells[1].examples,
				weight: 1,
				metadataSchema: {
					belief_level: 'string',
					strength_before: 'number',
					strength_after: 'number',
					associated_emotion: 'string',
					associated_emotion_intensity: 'number',
					distortion: 'string',
				},
				children: [
					{
						id: 'present-behaviors',
						label: 'Behaviors',
						question: EMOTIONS_MAP.slices[2].cells[0].question,
						guidance: EMOTIONS_MAP.slices[2].cells[0].guidance,
						examples: EMOTIONS_MAP.slices[2].cells[0].examples,
						metadataSchema: {
							behavior_type: 'string',
						},
					},
				],
			},
		],
	},
}
```

Also add the import at the top of the file:
```typescript
import type { MapDefinition, TreeMapDefinition } from '../../../shared/types/MandalaTypes'
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/emotions-tree.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add client/lib/frameworks/emotions-map.ts tests/unit/emotions-tree.test.ts
git commit -m "feat: add EMOTIONS_TREE definition alongside existing EMOTIONS_MAP"
```

---

### Task 5: Convert life-map to TreeMapDefinition

Same pattern as Task 4 but for the life map.

**Files:**
- Modify: `client/lib/frameworks/life-map.ts`
- Test: `tests/unit/life-tree.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/life-tree.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { LIFE_TREE } from '../../client/lib/frameworks/life-map'
import { getAllTreeNodeIds } from '../../client/lib/sunburst-layout'

describe('LIFE_TREE', () => {
	it('has root id "essencia"', () => {
		expect(LIFE_TREE.root.id).toBe('essencia')
	})

	it('root has 6 children (life domains)', () => {
		expect(LIFE_TREE.root.children).toHaveLength(6)
	})

	it('contains all 25 cell IDs from the original map', () => {
		const ids = getAllTreeNodeIds(LIFE_TREE)
		// 1 center + 6 domains * 4 rings = 25
		expect(ids).toHaveLength(25)
	})

	it('each domain has 4 ring children', () => {
		for (const domain of LIFE_TREE.root.children!) {
			// Domain at depth 1 has querer as child,
			// which has ser, which has ter, which has saber (leaf).
			// OR: domain has 4 direct children (flat rings).
			// The actual structure depends on the hierarchy.
			// For life map: domain -> querer -> ser -> ter -> saber (chain)
			// OR: domain has all 4 as direct children.
			// Check total descendant count = 4 per domain.
			const domainIds = getAllTreeNodeIds({
				id: 'temp',
				name: '',
				description: '',
				root: domain,
			})
			// domain itself + 4 rings = 5
			expect(domainIds).toHaveLength(5)
		}
	})

	it('all domains have equal weight (or no weight)', () => {
		const weights = LIFE_TREE.root.children!.map((c) => c.weight ?? 1)
		expect(new Set(weights).size).toBe(1)
	})
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/life-tree.test.ts`
Expected: FAIL — `LIFE_TREE` not exported

**Step 3: Add LIFE_TREE to life-map.ts**

The life map has 6 equal slices, each with 4 concentric rings. In the tree: center (essencia) → 6 domains → each domain has a chain of 4 rings (querer → ser → ter → saber) where each ring is the child of the previous (innermost to outermost).

> **Note to implementer:** The life map's rings go from center outward: querer (innermost), ser, ter, saber (outermost). In the tree hierarchy, querer is at depth 1 (direct child of domain), and saber is the leaf at depth 4. Each ring node has exactly one child (the next ring outward), except saber which is a leaf. This creates a chain rather than flat siblings — matching the sunburst's concentric ring rendering.

Alternatively, if each domain has 4 direct children (flat), the sunburst would render them as 4 adjacent arcs at the same depth, not as concentric rings. The **chain structure** is correct for concentric rings.

```typescript
export const LIFE_TREE: TreeMapDefinition = {
	id: 'life-map',
	name: 'Life Map',
	description: LIFE_MAP.description,
	root: {
		id: 'essencia',
		label: 'Essência',
		question: LIFE_MAP.center.question,
		guidance: LIFE_MAP.center.guidance,
		examples: LIFE_MAP.center.examples,
		children: buildTreeSlices(),
	},
}
```

With a helper:

```typescript
function buildTreeSlice(sliceId: string): TreeNodeDef {
	const rings = RING_DEFS
	const content = RING_CONTENT
	// Build chain from innermost (querer) to outermost (saber)
	// querer -> ser -> ter -> saber
	let current: TreeNodeDef | undefined
	for (let i = rings.length - 1; i >= 0; i--) {
		const ring = rings[i]
		const rc = content[ring.id]
		const node: TreeNodeDef = {
			id: `${sliceId}-${ring.id}`,
			label: ring.label,
			question: rc.question,
			guidance: rc.guidance,
			examples: rc.examples,
			children: current ? [current] : undefined,
		}
		current = node
	}
	return current!
}

function buildTreeSlices(): TreeNodeDef[] {
	return ['espiritual', 'emocional', 'fisico', 'material', 'profissional', 'relacional']
		.map(buildTreeSlice)
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/life-tree.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add client/lib/frameworks/life-map.ts tests/unit/life-tree.test.ts
git commit -m "feat: add LIFE_TREE definition alongside existing LIFE_MAP"
```

---

### Task 6: Update framework registry to support TreeMapDefinition

The registry currently stores `MapDefinition`. It needs to also accept `TreeMapDefinition` so the sunburst renderer can look up tree definitions.

**Files:**
- Modify: `client/lib/frameworks/framework-registry.ts`
- Modify: `tests/unit/framework-registry.test.ts`

**Step 1: Read existing test**

Read: `tests/unit/framework-registry.test.ts` to understand current test coverage.

**Step 2: Add `treeDefinition` to FrameworkEntry**

In `client/lib/frameworks/framework-registry.ts`, add an optional `treeDefinition` field to `FrameworkEntry`:

```typescript
import type { MapDefinition, TreeMapDefinition } from '../../../shared/types/MandalaTypes'

export interface FrameworkEntry {
	definition: MapDefinition
	treeDefinition?: TreeMapDefinition  // NEW
	visual: FrameworkVisualConfig
	template: FrameworkTemplateConfig
}
```

**Step 3: Update emotions-map.ts and life-map.ts registrations**

In `client/lib/frameworks/emotions-map.ts`, add `treeDefinition: EMOTIONS_TREE` to the `registerFramework()` call.

In `client/lib/frameworks/life-map.ts`, add `treeDefinition: LIFE_TREE` to the `registerFramework()` call.

**Step 4: Add test for treeDefinition**

Add to `tests/unit/framework-registry.test.ts`:

```typescript
it('emotions-map has treeDefinition', () => {
	const fw = getFramework('emotions-map')
	expect(fw.treeDefinition).toBeDefined()
	expect(fw.treeDefinition!.root.id).toBe('evidence')
})
```

**Step 5: Run tests**

Run: `bun run verify`
Expected: All tests pass

**Step 6: Commit**

```bash
git add client/lib/frameworks/framework-registry.ts client/lib/frameworks/emotions-map.ts client/lib/frameworks/life-map.ts tests/unit/framework-registry.test.ts
git commit -m "feat: add treeDefinition to framework registry"
```

---

### Task 7: Build SunburstSvg rendering component

This replaces `MandalaSvg`. It takes D3-computed arc data and renders SVG paths with curved labels.

**Files:**
- Create: `client/shapes/SunburstSvg.tsx`
- Test: Visual validation (manual — sunburst rendering is visual)

**Step 1: Create the SunburstSvg component**

Create `client/shapes/SunburstSvg.tsx`. This component:

1. Gets the framework's tree definition and visual config
2. Calls `computeSunburstLayout()` to get arc params
3. Uses `d3.arc()` to generate SVG path strings
4. Renders `<path>` elements with curved `<textPath>` labels
5. Renders center circle with root/zoomed-node label

```typescript
import { type ReactElement, useMemo } from 'react'
import { arc as d3Arc } from 'd3-shape'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import { getFramework } from '../lib/frameworks/framework-registry'
import { computeSunburstLayout, type SunburstArc } from '../lib/sunburst-layout'

interface SunburstSvgProps {
	w: number
	h: number
	frameworkId: string
	mandalaState: MandalaState
	hoveredCell?: string | null
	zoomedNodeId?: string | null
	animatingArcs?: Map<string, { x0: number; x1: number; y0: number; y1: number }>
}
```

Key implementation notes for the builder:

- Use `d3Arc()` generator configured with `.startAngle(d => d.x0).endAngle(d => d.x1).innerRadius(d => d.y0 * outerRadius).outerRadius(d => d.y1 * outerRadius)`
- Filter out transparent nodes from rendering (they exist in layout but don't draw)
- Filter out the root node from arc rendering (it's the center circle instead)
- For labels: generate an invisible arc path at `(y1 * outerRadius - offset)` for each cell, then use `<textPath>` just like the current `MandalaSvg`
- Use the same flip logic from current code: if the mid-angle of the arc is between 0 and PI (top half), flip the text path direction
- Hide labels when `(x1 - x0)` sweep is less than 0.15 radians (~8.5 degrees)
- Center circle: draw a filled circle at center using the root's y1 value, show root label (or zoomed node label)
- During animation: if `animatingArcs` is provided, use those coordinates instead of the computed ones

**Step 2: Verify build compiles**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add client/shapes/SunburstSvg.tsx
git commit -m "feat: add SunburstSvg rendering component"
```

---

### Task 8: Add new shape props (zoomedNodeId, zoomMode)

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx` (shape type and getDefaultProps)

**Step 1: Update MandalaShapeProps**

In `client/shapes/MandalaShapeUtil.tsx`, add the two new props:

```typescript
export type MandalaShapeProps = {
	frameworkId: string
	w: number
	h: number
	state: MandalaState
	arrows: MandalaArrowRecord[]
	arrowsVisible: boolean
	zoomedNodeId: string | null    // NEW
	zoomMode: 'focus' | 'navigate' // NEW
}
```

Update `static override props` to include the new fields:

```typescript
static override props: RecordProps<MandalaShape> = {
	frameworkId: T.string,
	w: T.number,
	h: T.number,
	state: T.jsonValue as any,
	arrows: T.jsonValue as any,
	arrowsVisible: T.boolean,
	zoomedNodeId: T.jsonValue as any,  // NEW
	zoomMode: T.string,                // NEW
}
```

Update `getDefaultProps()`:

```typescript
getDefaultProps(): MandalaShapeProps {
	return {
		frameworkId: 'emotions-map',
		w: 800,
		h: 800,
		state: makeEmptyState(EMOTIONS_MAP),
		arrows: [],
		arrowsVisible: true,
		zoomedNodeId: null,
		zoomMode: 'navigate',
	}
}
```

**Step 2: Verify build**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add client/shapes/MandalaShapeUtil.tsx
git commit -m "feat: add zoomedNodeId and zoomMode shape props"
```

---

### Task 9: Wire SunburstSvg into MandalaShapeUtil

Replace `MandalaSvg` with `SunburstSvg` in the `component()` and `toSvg()` methods.

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx`

**Step 1: Update MandalaInteractive**

Replace the `MandalaSvg` call inside `MandalaInteractive` with `SunburstSvg`:

```typescript
import { SunburstSvg } from './SunburstSvg'

function MandalaInteractive({ shape }: { shape: MandalaShape }) {
	const editor = useEditor()
	const [hoveredCell, setHoveredCell] = useState<string | null>(null)
	const hoveredCellRef = useRef<string | null>(null)

	// ... existing hover tracking useEffect stays the same ...

	return (
		<SunburstSvg
			w={shape.props.w}
			h={shape.props.h}
			frameworkId={shape.props.frameworkId}
			mandalaState={shape.props.state}
			hoveredCell={hoveredCell}
			zoomedNodeId={shape.props.zoomedNodeId}
		/>
	)
}
```

**Step 2: Update toSvg**

```typescript
override toSvg(shape: MandalaShape, _ctx: SvgExportContext) {
	return (
		<SunburstSvg
			w={shape.props.w}
			h={shape.props.h}
			frameworkId={shape.props.frameworkId}
			mandalaState={shape.props.state}
			zoomedNodeId={shape.props.zoomedNodeId}
		/>
	)
}
```

**Step 3: Remove old MandalaSvg**

Delete the `MandalaSvg` function and its helper functions (`describeCellPath`, `describeTextArc`, `getMidAngle`) from `MandalaShapeUtil.tsx`. These are now replaced by D3's arc generator in `SunburstSvg`.

**Step 4: Verify build**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Visual test**

Run: `bun run dev`
Open browser, create an emotions map mandala. Verify it renders as a sunburst. The arcs should roughly match the original layout (same angular proportions due to weights).

**Step 6: Commit**

```bash
git add client/shapes/MandalaShapeUtil.tsx
git commit -m "feat: replace MandalaSvg with SunburstSvg in MandalaShapeUtil"
```

---

### Task 10: Rewrite mandala-geometry.ts for tree-based definitions

The geometry module needs to work with `TreeMapDefinition` instead of `MapDefinition`. This task updates the core functions used by snap, actions, and click handlers.

**Files:**
- Modify: `client/lib/mandala-geometry.ts`
- Modify: `tests/unit/mandala-geometry.test.ts`

**Step 1: Update geometry functions**

The functions need to accept either `MapDefinition` or `TreeMapDefinition`. The cleanest approach: add parallel functions that work with tree definitions and the sunburst layout.

Add new functions:

```typescript
import { computeSunburstLayout, getAllTreeNodeIds, type SunburstArc } from './sunburst-layout'
import type { TreeMapDefinition } from '../../shared/types/MandalaTypes'

export function getAllCellIdsFromTree(treeDef: TreeMapDefinition): string[] {
	return getAllTreeNodeIds(treeDef)
}

export function isValidCellIdInTree(treeDef: TreeMapDefinition, cellId: string): boolean {
	return getAllTreeNodeIds(treeDef).includes(cellId)
}

export function makeEmptyStateFromTree(treeDef: TreeMapDefinition): MandalaState {
	const state: MandalaState = {}
	for (const id of getAllTreeNodeIds(treeDef)) {
		state[id] = { status: 'empty', contentShapeIds: [] }
	}
	return state
}

export function getCellAtPointFromTree(
	treeDef: TreeMapDefinition,
	center: Point2d,
	outerRadius: number,
	point: Point2d,
): string | null {
	const dx = point.x - center.x
	const dy = center.y - point.y
	const distance = Math.sqrt(dx * dx + dy * dy)
	if (distance > outerRadius) return null

	const arcs = computeSunburstLayout(treeDef)
	const ratio = distance / outerRadius
	const angle = ((Math.atan2(dy, dx) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

	// Check root (center circle) first
	const root = arcs.find((a) => a.id === treeDef.root.id)
	if (root && ratio <= root.y1) return root.id

	// Check all non-transparent, non-root arcs
	for (const arc of arcs) {
		if (arc.transparent) continue
		if (arc.id === treeDef.root.id) continue
		if (ratio >= arc.y0 && ratio <= arc.y1) {
			if (isAngleInArc(angle, arc.x0, arc.x1)) {
				return arc.id
			}
		}
	}
	return null
}

function isAngleInArc(angle: number, x0: number, x1: number): boolean {
	const a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
	const s = ((x0 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
	const e = ((x1 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
	if (s < e) return a >= s && a < e
	return a >= s || a < e
}

export function getCellBoundsFromTree(
	treeDef: TreeMapDefinition,
	center: Point2d,
	outerRadius: number,
	cellId: string,
): CellBounds | null {
	const arcs = computeSunburstLayout(treeDef)
	const arc = arcs.find((a) => a.id === cellId)
	if (!arc) return null

	if (cellId === treeDef.root.id) {
		return {
			type: 'circle',
			center: { ...center },
			radius: arc.y1 * outerRadius,
		}
	}

	const sweep = arc.x1 - arc.x0
	const midAngle = ((arc.x0 + sweep / 2) * 180) / Math.PI

	return {
		type: 'sector',
		center: { ...center },
		innerRadius: arc.y0 * outerRadius,
		outerRadius: arc.y1 * outerRadius,
		startAngle: (arc.x0 * 180) / Math.PI,
		endAngle: (arc.x1 * 180) / Math.PI,
		midAngle,
	}
}
```

**Step 2: Update tests**

Add new describe block to `tests/unit/mandala-geometry.test.ts` testing the tree-based functions with `EMOTIONS_TREE`.

**Step 3: Run tests**

Run: `bun run verify`
Expected: All tests pass

**Step 4: Commit**

```bash
git add client/lib/mandala-geometry.ts tests/unit/mandala-geometry.test.ts
git commit -m "feat: add tree-based geometry functions for sunburst layout"
```

---

### Task 11: Implement Focus zoom animation

The core sunburst zoom: clicking a node morphs arcs so that node's subtree fills the circle.

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx` (onClick handler)
- Modify: `client/shapes/SunburstSvg.tsx` (animation support)
- Create: `client/lib/sunburst-zoom.ts` (zoom animation logic)

**Step 1: Create sunburst-zoom.ts**

This module computes target arc params for a zoom and drives the RAF animation loop.

```typescript
import { interpolate } from 'd3-interpolate'
import type { SunburstArc } from './sunburst-layout'

export interface ArcAnimationState {
	x0: number
	x1: number
	y0: number
	y1: number
}

/**
 * Compute target arc params when zooming to a specific node.
 * The target node's subtree fills the full circle.
 */
export function computeZoomTargets(
	arcs: SunburstArc[],
	targetNodeId: string,
): Map<string, ArcAnimationState> {
	const target = arcs.find((a) => a.id === targetNodeId)
	if (!target) return new Map()

	const targets = new Map<string, ArcAnimationState>()
	const xScale = (2 * Math.PI) / (target.x1 - target.x0)
	const yShift = target.y0

	for (const arc of arcs) {
		const newX0 = Math.max(0, Math.min(2 * Math.PI, (arc.x0 - target.x0) * xScale))
		const newX1 = Math.max(0, Math.min(2 * Math.PI, (arc.x1 - target.x0) * xScale))
		const newY0 = Math.max(0, arc.y0 - yShift)
		const newY1 = Math.max(0, arc.y1 - yShift)

		targets.set(arc.id, { x0: newX0, x1: newX1, y0: newY0, y1: newY1 })
	}

	return targets
}

/**
 * Run a RAF animation interpolating arc params from current to target.
 * Calls onFrame with interpolated arcs on each frame.
 * Calls onComplete when done.
 */
export function animateSunburstZoom(opts: {
	current: Map<string, ArcAnimationState>
	target: Map<string, ArcAnimationState>
	durationMs: number
	onFrame: (arcs: Map<string, ArcAnimationState>) => void
	onComplete: () => void
}): () => void {
	const { current, target, durationMs, onFrame, onComplete } = opts
	const interpolators = new Map<string, (t: number) => ArcAnimationState>()

	for (const [id, cur] of current) {
		const tgt = target.get(id)
		if (tgt) {
			const i = interpolate(cur, tgt)
			interpolators.set(id, i)
		}
	}

	const start = performance.now()
	let cancelled = false

	function frame(now: number) {
		if (cancelled) return
		const elapsed = now - start
		const t = Math.min(1, elapsed / durationMs)
		const eased = easeOutCubic(t)

		const interpolated = new Map<string, ArcAnimationState>()
		for (const [id, interp] of interpolators) {
			interpolated.set(id, interp(eased))
		}

		onFrame(interpolated)

		if (t < 1) {
			requestAnimationFrame(frame)
		} else {
			onComplete()
		}
	}

	requestAnimationFrame(frame)
	return () => { cancelled = true }
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3
}
```

**Step 2: Update onClick in MandalaShapeUtil**

Modify the `onClick` handler to dispatch based on `zoomMode`:

```typescript
override onClick(shape: MandalaShape) {
	this.editor.selectNone()
	setActiveMandalaId(shape.id)
	const pagePoint = this.editor.inputs.currentPagePoint
	const cellId = getLocalCellFromPage(this.editor, shape, pagePoint)

	if (!cellId) return { id: shape.id, type: 'mandala' as const }

	if (shape.props.zoomMode === 'focus') {
		// Sunburst zoom: update zoomedNodeId
		this.editor.updateShape({
			id: shape.id,
			type: 'mandala',
			props: { zoomedNodeId: cellId },
		})
	} else {
		// Navigate zoom: camera zoom (existing behavior)
		const outerR = computeMandalaOuterRadius(shape.props.w, shape.props.h)
		const localCenter = { x: shape.props.w / 2, y: shape.props.h / 2 }
		const { definition } = getFramework(shape.props.frameworkId)
		const box = getCellBoundingBox(definition, localCenter, outerR, cellId)
		if (box) {
			const pageBox = Box.From({
				x: box.x + shape.x,
				y: box.y + shape.y,
				w: box.w,
				h: box.h,
			})
			const shrunk = Box.From({
				x: pageBox.x + pageBox.w * 0.125,
				y: pageBox.y + pageBox.h * 0.125,
				w: pageBox.w * 0.75,
				h: pageBox.h * 0.75,
			})
			this.editor.zoomToBounds(shrunk, { animation: { duration: 300 } })
		}
	}
	return { id: shape.id, type: 'mandala' as const }
}
```

**Step 3: Update SunburstSvg to animate between zoomedNodeId states**

In `SunburstSvg.tsx`, add a `useEffect` that triggers the animation when `zoomedNodeId` changes. Store the animating arc params in a `useRef` and use `useState` counter to force re-renders during animation.

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Visual test**

Run: `bun run dev`
- Set zoom mode to 'focus' (you may need to temporarily hardcode `zoomMode: 'focus'` in getDefaultProps)
- Click a cell — arcs should animate, subtree fills circle
- Click center — should zoom back to parent

**Step 6: Commit**

```bash
git add client/lib/sunburst-zoom.ts client/shapes/SunburstSvg.tsx client/shapes/MandalaShapeUtil.tsx
git commit -m "feat: implement focus zoom animation for sunburst"
```

---

### Task 12: Update mandala-snap.ts for tree-based geometry

The snap system needs to use the new tree-based geometry functions.

**Files:**
- Modify: `client/lib/mandala-snap.ts`

**Step 1: Update imports and function calls**

Replace `getCellAtPoint` and `getCellBounds` calls with their tree-based equivalents when a `treeDefinition` is available on the framework entry.

The key changes in `processPendingSnaps()`:

```typescript
const framework = getFramework(mandala.props.frameworkId)
const treeDef = framework.treeDefinition

// Use tree-based geometry if available
const hit = treeDef
	? getBestCellHitForPageBoundsTree(treeDef, pageBounds, pageCenter, outerRadius)
	: getBestCellHitForPageBounds(framework.definition, pageBounds, pageCenter, outerRadius)
```

Add tree-based versions of `getBestCellHitForPageBounds` that use `getCellAtPointFromTree` and `getCellBoundsFromTree`.

**Step 2: Handle zoomedNodeId visibility**

When `mandala.props.zoomedNodeId` is set and `zoomMode === 'focus'`, notes in cells outside the zoomed subtree should be hidden. Add logic to check if a cell is within the zoomed subtree before snapping.

**Step 3: Run tests**

Run: `bun run verify`
Expected: All tests pass

**Step 4: Commit**

```bash
git add client/lib/mandala-snap.ts
git commit -m "feat: update snap system for tree-based geometry"
```

---

### Task 13: Update element-lookup-utils.ts for tree-based metadata

Replace the hardcoded `ALLOWED_KEYS_BY_CELL` with tree-based metadata lookup.

**Files:**
- Modify: `client/actions/element-lookup-utils.ts`
- Modify: `tests/unit/mandala-action-utils.test.ts`

**Step 1: Add tree-based metadata lookup**

```typescript
import { findTreeNode } from '../lib/sunburst-layout'
import type { TreeMapDefinition } from '../../shared/types/MandalaTypes'

export function getMetadataSchemaFromTree(
	treeDef: TreeMapDefinition,
	cellId: string,
): Record<string, 'string' | 'number' | 'boolean'> | null {
	const node = findTreeNode(treeDef.root, cellId)
	return node?.metadataSchema ?? null
}
```

Update `getMetadataSchemaForCell()` to accept an optional `TreeMapDefinition` parameter. If provided, use tree lookup. Otherwise, fall back to the hardcoded map (for backward compatibility during migration).

**Step 2: Update tests**

Add tests verifying that `getMetadataSchemaFromTree` returns correct schemas for emotions-tree nodes.

**Step 3: Run tests**

Run: `bun run verify`
Expected: All tests pass

**Step 4: Commit**

```bash
git add client/actions/element-lookup-utils.ts tests/unit/mandala-action-utils.test.ts
git commit -m "feat: add tree-based metadata schema lookup"
```

---

### Task 14: Update cell-layout.ts for sunburst-derived bounds

The cell layout system needs to work with bounds derived from the sunburst layout, which use the same `CellBounds` type.

**Files:**
- Modify: `client/lib/cell-layout.ts` (likely no changes needed — it already works with `CellBounds`)

**Step 1: Verify compatibility**

Read `cell-layout.ts` — it takes `CellBounds` (circle or sector) as input. The tree-based geometry functions (`getCellBoundsFromTree`) return the same `CellBounds` type. So cell-layout should work without changes.

**Step 2: Run existing tests**

Run: `bunx vitest run tests/unit/cell-layout.test.ts`
Expected: PASS (no changes needed)

**Step 3: Commit (only if changes were needed)**

---

### Task 15: Add zoom mode UI toggle

A small floating control that toggles between Focus and Navigate modes.

**Files:**
- Create: `client/components/ZoomModeToggle.tsx`
- Modify: `client/shapes/MandalaShapeUtil.tsx` (render the toggle near the mandala)

**Step 1: Create the toggle component**

A minimal toggle with two icon states. Uses `editor.updateShape()` to flip the `zoomMode` prop.

```typescript
import { useEditor } from 'tldraw'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'

export function ZoomModeToggle({ shape }: { shape: MandalaShape }) {
	const editor = useEditor()
	const isFocus = shape.props.zoomMode === 'focus'

	function toggle() {
		editor.updateShape({
			id: shape.id,
			type: 'mandala',
			props: {
				zoomMode: isFocus ? 'navigate' : 'focus',
				// Reset zoom when switching to navigate
				...(isFocus ? { zoomedNodeId: null } : {}),
			},
		})
	}

	return (
		<button
			onClick={toggle}
			style={{
				position: 'absolute',
				bottom: 8,
				right: 8,
				// ... styling
			}}
			title={isFocus ? 'Focus mode (click to switch to Navigate)' : 'Navigate mode (click to switch to Focus)'}
		>
			{isFocus ? '◎' : '⊕'}
		</button>
	)
}
```

**Step 2: Integrate into MandalaInteractive**

Add the toggle as a sibling of `SunburstSvg` inside `MandalaInteractive`, wrapped in a container div.

**Step 3: Visual test**

Run: `bun run dev`
- Verify toggle appears near mandala
- Click toggle — mode switches between Focus and Navigate
- In Focus mode: clicking cells does sunburst zoom
- In Navigate mode: clicking cells does camera zoom

**Step 4: Commit**

```bash
git add client/components/ZoomModeToggle.tsx client/shapes/MandalaShapeUtil.tsx
git commit -m "feat: add zoom mode toggle UI"
```

---

### Task 16: Hide notes outside focused subtree

When in Focus mode with a `zoomedNodeId`, notes in cells outside the zoomed subtree should be hidden.

**Files:**
- Modify: `client/lib/mandala-snap.ts` (add visibility logic)
- Modify: `client/shapes/MandalaShapeUtil.tsx` (trigger visibility update on zoom)

**Step 1: Add subtree membership check**

In `sunburst-layout.ts`, add:

```typescript
export function isNodeInSubtree(root: TreeNodeDef, subtreeRootId: string, nodeId: string): boolean {
	const subtreeRoot = findTreeNode(root, subtreeRootId)
	if (!subtreeRoot) return false
	return findTreeNode(subtreeRoot, nodeId) !== null
}
```

**Step 2: Update snap system**

After a zoom change, iterate through all cells in the mandala state. For each cell with content, check if the cell is in the zoomed subtree. If not, hide the notes (set opacity to 0 via `editor.updateShape`). If yes, show them.

**Step 3: Run tests**

Run: `bun run verify`
Expected: All tests pass

**Step 4: Commit**

```bash
git add client/lib/sunburst-layout.ts client/lib/mandala-snap.ts client/shapes/MandalaShapeUtil.tsx
git commit -m "feat: hide notes outside focused subtree in Focus mode"
```

---

### Task 17: Full integration test and verify

Run the complete verification suite and do manual visual testing.

**Files:**
- Modify: existing tests as needed for any failures

**Step 1: Run full verify**

Run: `bun run verify`
Fix any lint, type, or test failures.

**Step 2: Manual visual testing checklist**

- [ ] Emotions map renders as sunburst with correct proportions
- [ ] Life map renders as sunburst with 6 equal slices x 4 rings
- [ ] Hover highlighting works on all cells
- [ ] Labels are curved, readable, and correctly positioned
- [ ] Navigate mode: click cell → camera zooms to cell
- [ ] Focus mode: click cell → arcs morph, subtree fills circle
- [ ] Focus mode: click center → zoom back to parent
- [ ] Notes snap into cells correctly
- [ ] Notes hide/show when focus zooming
- [ ] Zoom mode toggle works
- [ ] SVG export works (copy as SVG)
- [ ] Double-click creates note in cell

**Step 3: Fix any issues found**

Iterate on visual bugs, label positioning, animation timing.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes for sunburst renderer"
```

---

### Task 18: Clean up and prepare for merge

Remove any dead code, ensure the old `MapDefinition`-based code paths are replaced.

**Files:**
- Review all modified files for dead code

**Step 1: Remove old MandalaSvg remnants**

Verify `describeCellPath`, `describeTextArc`, `getMidAngle` have been removed from `MandalaShapeUtil.tsx`.

**Step 2: Consider removing old MapDefinition**

If all consumers now use `TreeMapDefinition`, the old `MapDefinition`, `MapSliceDef`, `MapCellDef`, `MapCenterDef` types and the old `EMOTIONS_MAP`/`LIFE_MAP` constants can be removed. Only do this if all references have been migrated.

> **Caution:** If any action utils, prompt builders, or worker code still reference the old types, keep them. Check `worker/prompt/` and `shared/schema/` directories.

**Step 3: Run final verify**

Run: `bun run verify`
Expected: All tests pass, no lint errors, no type errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: clean up old polar chart renderer code"
```

---

## Execution Notes

**The trickiest tasks are:**
- Task 3 (sunburst layout engine) — transparent depth adjustment math
- Task 7 (SunburstSvg) — arc rendering, label positioning, getting it to look right
- Task 11 (Focus zoom animation) — RAF loop, interpolation, triggering re-renders

**Safe checkpoints for review:**
- After Task 6: Data model is complete, framework registry updated
- After Task 9: Rendering works (visual validation)
- After Task 11: Focus zoom works
- After Task 15: Both zoom modes work with UI toggle
