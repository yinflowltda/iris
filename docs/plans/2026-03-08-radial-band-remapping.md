# Radial Band Remapping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow independent radial band sizing per angular region, so the Life Map's top half (temporal) and bottom half (life domains) can have different ring proportions while sharing a single d3 partition.

**Architecture:** Keep d3 partition for angular allocation (x0/x1) — it handles weight-based proportional sweep perfectly. After partition, remap each arc's y0/y1 based on explicit band definitions keyed by angular region + visual depth. This is a thin post-processing layer: ~30 lines of logic in `computeSunburstLayout`, a new type, and band config on `TreeMapDefinition`. All downstream consumers (zoom, snap, hit-test, render) work unchanged because they already consume normalized y0/y1 ratios.

**Tech Stack:** TypeScript, d3-hierarchy (partition unchanged), Vitest

---

## Context for Implementer

### How d3 partition works
`partition().size([2π, maxDepth])` assigns:
- **x0/x1** (angular): proportional by leaf weight — this is correct and unchanged
- **y0/y1** (radial): equal bands per tree depth — this is what we override

### Current y0/y1 computation in `computeSunburstLayout` (sunburst-layout.ts:46-77)
```typescript
for (const node of partitioned.descendants()) {
    const offset = transparentOffsets.get(node.data.id) ?? 0
    const rawY0 = node.y0 / maxDepth     // normalize to [0,1]
    const rawY1 = node.y1 / maxDepth
    const bandSize = 1 / maxDepth
    const adjustedY0 = rawY0 - offset * bandSize  // shift for transparent ancestors
    const adjustedY1 = rawY1 - offset * bandSize
    // ... push arc with y0: adjustedY0, y1: adjustedY1
}
```

The remapping replaces `adjustedY0/adjustedY1` with explicit values from a band config, looked up by visual depth and angular position.

### Life Map structure
- **Bottom half** (6 domains, angular range π/2 → 3π/2 after startAngle offset):
  - Depth 1: Querer, Depth 2: Ser, Depth 3: Ter, Depth 4: Saber
  - Currently equal bands — this is fine, we'll define them explicitly anyway
- **Top half** (4 week groups, angular range 3π/2 → 5π/2):
  - Depth 1: Day, Depth 2: Week-slot (groupId merged), Depth 3: Month (hideLabel)
  - Needs: Day area large (for future 5 sub-rings), Week aligned with Ter, Month aligned with Saber

### Key files
- Types: `shared/types/MandalaTypes.ts`
- Layout: `client/lib/sunburst-layout.ts`
- Life map config: `client/lib/frameworks/life-map.ts`
- Layout tests: `tests/unit/sunburst-layout.test.ts`
- Life tree tests: `tests/unit/life-tree.test.ts`

---

### Task 1: Add RadialBands type to MandalaTypes

**Files:**
- Modify: `shared/types/MandalaTypes.ts:69-80`

**Step 1: Add the types**

Add these types right before the `TreeMapDefinition` interface (after `OverlayArc`):

```typescript
/** Defines custom radial band sizes for an angular region of the mandala */
export interface RadialBandRegion {
	/** Angular range [start, end] in radians (post-startAngle offset, may exceed 2π) */
	angularRange: [number, number]
	/** Map from visual depth (post-transparent-offset) → [y0, y1] ratios */
	bands: Record<number, [number, number]>
}

/** Configuration for per-region radial band overrides */
export interface RadialBandsConfig {
	/** Radius ratio for the center circle (root y1). All depth-1 bands should start at this value. */
	centerRadius: number
	/** Per-region band definitions. Arcs not matching any region keep partition-computed values. */
	regions: RadialBandRegion[]
}
```

Then add the optional property to `TreeMapDefinition`:

```typescript
export interface TreeMapDefinition {
	id: string
	name: string
	description: string
	root: TreeNodeDef
	startAngle?: number
	overlayRing?: { startNodeId: string; endNodeId: string; arcs: OverlayArc[] }
	/** Per-region radial band overrides. When set, y0/y1 values from d3 partition
	 *  are replaced with explicit values based on visual depth and angular position. */
	radialBands?: RadialBandsConfig
}
```

**Step 2: Run type check to verify no errors**

Run: `cd /Users/rafarj/code/iris/.claude/worktrees/implement-life-map && bun run tsc --noEmit 2>&1 | head -20`
Expected: No errors (new types are additive)

**Step 3: Commit**

```bash
git add shared/types/MandalaTypes.ts
git commit -m "feat: add RadialBandsConfig type for per-region radial band control"
```

---

### Task 2: Write failing tests for radial band remapping

**Files:**
- Modify: `tests/unit/sunburst-layout.test.ts`

**Step 1: Add test fixture and tests**

Add this fixture and describe block after the existing `TRANSPARENT_TREE` fixture (after line 123) and after the last describe block (after line 295):

Fixture (add after line 123):

```typescript
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
```

Tests (add after the last describe block):

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/rafarj/code/iris/.claude/worktrees/implement-life-map && bun run vitest run tests/unit/sunburst-layout.test.ts 2>&1 | tail -20`
Expected: 7 new tests FAIL (radialBands config is ignored — y values are still partition-computed)

**Step 3: Commit**

```bash
git add tests/unit/sunburst-layout.test.ts
git commit -m "test: add failing tests for radial band remapping"
```

---

### Task 3: Implement radial band remapping in computeSunburstLayout

**Files:**
- Modify: `client/lib/sunburst-layout.ts:25-81`

**Step 1: Add the remapping helper**

Add this function before `computeSunburstLayout` (around line 24):

```typescript
import type {
	TreeMapDefinition,
	TreeNodeDef,
	RadialBandsConfig,
	RadialBandRegion,
} from '../../shared/types/MandalaTypes'

/**
 * Find the region that an arc belongs to based on its angular midpoint.
 * Returns undefined if no region matches (arc keeps partition-computed values).
 */
function findRegionForAngle(
	angle: number,
	regions: RadialBandRegion[],
): RadialBandRegion | undefined {
	const PI2 = 2 * Math.PI
	const normalized = ((angle % PI2) + PI2) % PI2
	for (const region of regions) {
		const [start, end] = region.angularRange
		const normStart = ((start % PI2) + PI2) % PI2
		const normEnd = ((end % PI2) + PI2) % PI2
		if (normStart < normEnd) {
			// Normal range (no wrap)
			if (normalized >= normStart && normalized < normEnd) return region
		} else {
			// Wraps around 2π
			if (normalized >= normStart || normalized < normEnd) return region
		}
	}
	return undefined
}
```

**Step 2: Add remapping step to `computeSunburstLayout`**

In the `computeSunburstLayout` function, replace the arc-building loop (lines 46-78) with this version that adds remapping after building the arc:

```typescript
	const arcs: SunburstArc[] = []

	for (const node of partitioned.descendants()) {
		const offset = transparentOffsets.get(node.data.id) ?? 0
		const isTransparent = node.data.transparent === true

		// Normalize y values to 0-1 range
		const rawY0 = node.y0 / maxDepth
		const rawY1 = node.y1 / maxDepth

		// Adjust for transparent nodes: shift up by offset bands
		const bandSize = 1 / maxDepth
		let adjustedY0 = rawY0 - offset * bandSize
		let adjustedY1 = rawY1 - offset * bandSize

		// Apply angular offset and wrap to [0, 2π]
		const x0 = (((node.x0 + angleOffset) % PI2) + PI2) % PI2
		const x1 = x0 + (node.x1 - node.x0)

		const visualDepth = node.depth - offset

		// Radial band remapping: override y0/y1 with explicit band definitions
		if (treeDef.radialBands) {
			if (visualDepth === 0) {
				// Root always gets [0, centerRadius]
				adjustedY0 = 0
				adjustedY1 = treeDef.radialBands.centerRadius
			} else {
				const midAngle = (x0 + x1) / 2
				const region = findRegionForAngle(midAngle, treeDef.radialBands.regions)
				if (region) {
					const band = region.bands[visualDepth]
					if (band) {
						adjustedY0 = band[0]
						adjustedY1 = band[1]
					}
				}
			}
		}

		arcs.push({
			id: node.data.id,
			label: node.data.label,
			depth: visualDepth,
			x0,
			x1,
			y0: adjustedY0,
			y1: adjustedY1,
			transparent: isTransparent,
			parentId: node.parent?.data.id ?? null,
			hasChildren: (node.data.children?.length ?? 0) > 0,
			groupId: node.data.groupId,
			hideLabel: node.data.hideLabel,
			labelScale: node.data.labelScale,
		})
	}

	return arcs
```

**Important:** Make sure the import at the top of the file includes `RadialBandsConfig` and `RadialBandRegion`:

```typescript
import type {
	TreeMapDefinition,
	TreeNodeDef,
	RadialBandsConfig,
	RadialBandRegion,
} from '../../shared/types/MandalaTypes'
```

**Step 3: Run tests to verify they pass**

Run: `cd /Users/rafarj/code/iris/.claude/worktrees/implement-life-map && bun run vitest run tests/unit/sunburst-layout.test.ts 2>&1 | tail -30`
Expected: ALL tests pass (existing + new radial band tests)

**Step 4: Run all tests to verify no regressions**

Run: `cd /Users/rafarj/code/iris/.claude/worktrees/implement-life-map && bun run vitest run 2>&1 | tail -20`
Expected: All tests pass. No regressions — trees without `radialBands` use the existing partition-computed values.

**Step 5: Commit**

```bash
git add client/lib/sunburst-layout.ts
git commit -m "feat: implement radial band remapping in computeSunburstLayout"
```

---

### Task 4: Configure Life Map with radialBands

**Files:**
- Modify: `client/lib/frameworks/life-map.ts:306-329`

**Step 1: Add radialBands config to LIFE_TREE**

In `life-map.ts`, add the `radialBands` property to the `LIFE_TREE` export. Add it after `startAngle` (line 311):

```typescript
export const LIFE_TREE: TreeMapDefinition = {
	id: 'life-map',
	name: LIFE_MAP.name,
	description: LIFE_MAP.description,
	startAngle: Math.PI / 2,
	radialBands: {
		centerRadius: 0.1,
		regions: [
			{
				// Bottom half: 6 domains (3 o'clock → 9 o'clock, clockwise)
				angularRange: [Math.PI / 2, (3 * Math.PI) / 2],
				bands: {
					1: [0.1, 0.325],   // Querer
					2: [0.325, 0.55],   // Ser
					3: [0.55, 0.775],   // Ter
					4: [0.775, 1.0],    // Saber
				},
			},
			{
				// Top half: temporal (9 o'clock → 3 o'clock, clockwise, wraps around)
				angularRange: [(3 * Math.PI) / 2, (5 * Math.PI) / 2],
				bands: {
					1: [0.1, 0.55],     // Day (large — will hold 5 sub-rings later)
					2: [0.55, 0.775],   // Week (aligned with Ter)
					3: [0.775, 1.0],    // Month (aligned with Saber)
				},
			},
		],
	},
	root: {
		// ... rest unchanged
```

**Step 2: Run all tests**

Run: `cd /Users/rafarj/code/iris/.claude/worktrees/implement-life-map && bun run vitest run 2>&1 | tail -20`
Expected: All tests pass. The life-tree tests check tree structure (IDs, children, weights) — they don't assert specific y0/y1 values, so they should be unaffected. The `getCellBoundsFromTree` tests check for non-null results, not exact positions.

**Step 3: Run the dev server and visually verify**

Run: `cd /Users/rafarj/code/iris/.claude/worktrees/implement-life-map && bun run dev`

Visually verify:
- Bottom half rings still look correct (4 equal bands)
- Top half: day area is visually larger than before
- Week ring outer edge aligns with Ter ring outer edge
- Month ring outer edge aligns with Saber ring outer edge
- Center circle size unchanged
- Hit-testing (click cells) works for both halves
- Note creation (double-click) works for both halves

**Step 4: Commit**

```bash
git add client/lib/frameworks/life-map.ts
git commit -m "feat: configure Life Map with per-region radial band definitions"
```

---

### Task 5: Add life-tree test for radial band alignment

**Files:**
- Modify: `tests/unit/life-tree.test.ts`

**Step 1: Add band alignment test**

Add this test at the end of the `LIFE_TREE` describe block (after line 126):

```typescript
	it('week ring y-band aligns with Ter ring y-band', () => {
		const arcs = computeSunburstLayout(LIFE_TREE)
		const terArc = arcs.find((a) => a.id === 'espiritual-ter')!
		const weekArc = arcs.find((a) => a.id === 'flow-week1')!

		// Week and Ter should occupy the same radial band
		expect(weekArc.y0).toBeCloseTo(terArc.y0, 5)
		expect(weekArc.y1).toBeCloseTo(terArc.y1, 5)
	})

	it('month ring y-band aligns with Saber ring y-band', () => {
		const arcs = computeSunburstLayout(LIFE_TREE)
		const saberArc = arcs.find((a) => a.id === 'espiritual-saber')!
		const monthArc = arcs.find((a) => a.id === 'flow-january')!

		// Month and Saber should occupy the same radial band
		expect(monthArc.y0).toBeCloseTo(saberArc.y0, 5)
		expect(monthArc.y1).toBeCloseTo(saberArc.y1, 5)
	})

	it('day ring is wider than a single bottom-half ring', () => {
		const arcs = computeSunburstLayout(LIFE_TREE)
		const quererArc = arcs.find((a) => a.id === 'espiritual-querer')!
		const dayArc = arcs.find((a) => a.id === 'flow')!

		const quererWidth = quererArc.y1 - quererArc.y0
		const dayWidth = dayArc.y1 - dayArc.y0
		expect(dayWidth).toBeGreaterThan(quererWidth)
	})
```

Add the import for `computeSunburstLayout` at the top of the file:

```typescript
import { computeSunburstLayout } from '../../client/lib/sunburst-layout'
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/rafarj/code/iris/.claude/worktrees/implement-life-map && bun run vitest run tests/unit/life-tree.test.ts 2>&1 | tail -20`
Expected: All 12 tests pass (9 existing + 3 new alignment tests)

**Step 3: Commit**

```bash
git add tests/unit/life-tree.test.ts
git commit -m "test: add radial band alignment assertions for Life Map"
```

---

## Band Value Reference

These are the exact y0/y1 values used. To adjust proportions, change these numbers in `life-map.ts`:

| Region | Depth | Ring | y0 | y1 | Width |
|--------|-------|------|------|------|-------|
| Root | 0 | Essência | 0.0 | 0.1 | 0.1 |
| Bottom | 1 | Querer | 0.1 | 0.325 | 0.225 |
| Bottom | 2 | Ser | 0.325 | 0.55 | 0.225 |
| Bottom | 3 | Ter | 0.55 | 0.775 | 0.225 |
| Bottom | 4 | Saber | 0.775 | 1.0 | 0.225 |
| Top | 1 | Day | 0.1 | 0.55 | 0.45 |
| Top | 2 | Week | 0.55 | 0.775 | 0.225 |
| Top | 3 | Month | 0.775 | 1.0 | 0.225 |

Week (0.55→0.775) = Ter (0.55→0.775) ✓
Month (0.775→1.0) = Saber (0.775→1.0) ✓
Day (0.1→0.55) = Querer+Ser combined width ✓
