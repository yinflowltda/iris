# Life Map Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Life Map to have two 180° halves — bottom with 6 life domains (4 rings each), top with a temporal calendar (days → weeks → months → 7-year blocks) — using a new `groupId` system to visually merge adjacent arc cells.

**Architecture:** Add `groupId` field to `TreeNodeDef` and `SunburstArc`. After layout, adjacent arcs at same depth with same groupId merge into a single visual arc. The life-map tree has 6 domain chains (bottom) + 8 day chains that branch into months and blocks (top), balanced via leaf weights.

**Tech Stack:** TypeScript, d3-hierarchy, React SVG, Vitest

---

### Task 1: Add `groupId` to TreeNodeDef

**Files:**
- Modify: `shared/types/MandalaTypes.ts:45-55`

**Step 1: Add groupId field**

```typescript
export interface TreeNodeDef {
	id: string
	label: string
	question: string
	guidance: string
	examples: string[]
	weight?: number
	groupId?: string
	metadataSchema?: Record<string, 'string' | 'number' | 'boolean'>
	children?: TreeNodeDef[]
	transparent?: boolean
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep -v prompt-lab`
Expected: No new errors

**Step 3: Commit**

```bash
git add shared/types/MandalaTypes.ts
git commit -m "feat: add groupId field to TreeNodeDef for arc merging"
```

---

### Task 2: Add `groupId` to SunburstArc and propagate in layout

**Files:**
- Modify: `client/lib/sunburst-layout.ts:6-17` (SunburstArc interface)
- Modify: `client/lib/sunburst-layout.ts:42-71` (arc construction loop)

**Step 1: Add groupId to SunburstArc interface**

At `client/lib/sunburst-layout.ts:6-17`, add `groupId` field:

```typescript
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
	groupId?: string
}
```

**Step 2: Propagate groupId from tree node to arc**

In the arc construction loop (around line 60-70 where arcs are pushed), add groupId from the tree node:

```typescript
arcs.push({
	id: node.data.id,
	label: node.data.label,
	depth: node.depth,
	x0: x0,
	x1,
	y0: adjustedY0,
	y1: adjustedY1,
	transparent: isTransparent,
	parentId: node.parent?.data.id ?? null,
	hasChildren: (node.data.children?.length ?? 0) > 0,
	groupId: node.data.groupId,
})
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep -v prompt-lab`

**Step 4: Commit**

```bash
git add client/lib/sunburst-layout.ts
git commit -m "feat: propagate groupId through sunburst layout"
```

---

### Task 3: Add groupId merge utility

**Files:**
- Create: `client/lib/sunburst-groups.ts`
- Create: `tests/unit/sunburst-groups.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import type { SunburstArc } from '../../client/lib/sunburst-layout'
import { mergeGroupArcs, type MergedArc } from '../../client/lib/sunburst-groups'

function makeArc(overrides: Partial<SunburstArc> & { id: string }): SunburstArc {
	return {
		label: overrides.id,
		depth: 1,
		x0: 0,
		x1: 1,
		y0: 0,
		y1: 0.25,
		transparent: false,
		parentId: null,
		hasChildren: false,
		...overrides,
	}
}

describe('mergeGroupArcs', () => {
	it('returns arcs unchanged when no groupIds', () => {
		const arcs = [
			makeArc({ id: 'a', x0: 0, x1: 1 }),
			makeArc({ id: 'b', x0: 1, x1: 2 }),
		]
		const merged = mergeGroupArcs(arcs)
		expect(merged).toHaveLength(2)
		expect(merged[0].id).toBe('a')
		expect(merged[1].id).toBe('b')
	})

	it('merges adjacent arcs with same groupId at same depth', () => {
		const arcs = [
			makeArc({ id: 'a', x0: 0, x1: 0.5, depth: 2, groupId: 'week-1' }),
			makeArc({ id: 'b', x0: 0.5, x1: 1.0, depth: 2, groupId: 'week-1' }),
			makeArc({ id: 'c', x0: 1.0, x1: 1.5, depth: 2, groupId: 'week-2' }),
		]
		const merged = mergeGroupArcs(arcs)
		expect(merged).toHaveLength(2)
		expect(merged[0].groupId).toBe('week-1')
		expect(merged[0].x0).toBe(0)
		expect(merged[0].x1).toBe(1.0)
		expect(merged[0].memberIds).toEqual(['a', 'b'])
		expect(merged[1].groupId).toBe('week-2')
	})

	it('does not merge arcs at different depths even with same groupId', () => {
		const arcs = [
			makeArc({ id: 'a', x0: 0, x1: 1, depth: 2, groupId: 'g1' }),
			makeArc({ id: 'b', x0: 0, x1: 1, depth: 3, groupId: 'g1' }),
		]
		const merged = mergeGroupArcs(arcs)
		expect(merged).toHaveLength(2)
	})

	it('preserves non-grouped arcs alongside merged ones', () => {
		const arcs = [
			makeArc({ id: 'day1', x0: 0, x1: 0.5, depth: 1 }),
			makeArc({ id: 'day2', x0: 0.5, x1: 1.0, depth: 1 }),
			makeArc({ id: 'w1a', x0: 0, x1: 0.5, depth: 2, groupId: 'week-1' }),
			makeArc({ id: 'w1b', x0: 0.5, x1: 1.0, depth: 2, groupId: 'week-1' }),
		]
		const merged = mergeGroupArcs(arcs)
		expect(merged).toHaveLength(3) // day1, day2, merged week-1
	})
})
```

**Step 2: Run tests to verify they fail**

Run: `bun run vitest run tests/unit/sunburst-groups.test.ts`
Expected: FAIL — module not found

**Step 3: Implement mergeGroupArcs**

```typescript
import type { SunburstArc } from './sunburst-layout'

export interface MergedArc extends SunburstArc {
	/** IDs of the individual arcs that were merged into this one */
	memberIds: string[]
}

/**
 * Merge adjacent arcs at the same depth that share a groupId into single visual arcs.
 * Non-grouped arcs pass through unchanged (with memberIds = [own id]).
 */
export function mergeGroupArcs(arcs: SunburstArc[]): MergedArc[] {
	// Group arcs by (depth, groupId) — only those with a groupId
	const groups = new Map<string, SunburstArc[]>()
	const ungrouped: SunburstArc[] = []

	for (const arc of arcs) {
		if (arc.groupId) {
			const key = `${arc.depth}:${arc.groupId}`
			const group = groups.get(key)
			if (group) {
				group.push(arc)
			} else {
				groups.set(key, [arc])
			}
		} else {
			ungrouped.push(arc)
		}
	}

	const merged: MergedArc[] = ungrouped.map((a) => ({ ...a, memberIds: [a.id] }))

	for (const [, group] of groups) {
		const sorted = group.sort((a, b) => a.x0 - b.x0)
		const first = sorted[0]
		const last = sorted[sorted.length - 1]
		merged.push({
			...first,
			id: first.groupId!,
			label: first.label,
			x0: first.x0,
			x1: last.x1,
			memberIds: sorted.map((a) => a.id),
		})
	}

	return merged.sort((a, b) => a.depth - b.depth || a.x0 - b.x0)
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run vitest run tests/unit/sunburst-groups.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add client/lib/sunburst-groups.ts tests/unit/sunburst-groups.test.ts
git commit -m "feat: add mergeGroupArcs utility for grouped arc rendering"
```

---

### Task 4: Integrate groupId merging into SunburstSvg renderer

**Files:**
- Modify: `client/shapes/SunburstSvg.tsx`

This task modifies the renderer to use merged arcs for cells that have groupIds. The key changes:

1. After computing arcs, compute merged arcs
2. Use merged arcs for rendering paths and labels (for grouped cells)
3. Keep individual arcs for hover/click state (mapped back via memberIds)

**Step 1: Import and compute merged arcs**

Near the top of the SunburstSvg component (after `computeSunburstLayout` call), add:

```typescript
import { mergeGroupArcs, type MergedArc } from '../lib/sunburst-groups'
```

After the base arcs are computed (the line that calls `computeSunburstLayout`), compute merged arcs:

```typescript
const mergedArcs = useMemo(() => mergeGroupArcs(baseArcs), [baseArcs])
```

**Step 2: Use merged arcs for path rendering**

In the rendering loop that builds `cellPaths` and `cellLabels`, iterate `mergedArcs` instead of raw arcs for the visual output. When a merged arc has multiple `memberIds`, render ONE path spanning the full merged bounds. For hover state, check if ANY memberId matches the hovered cell.

Replace the iteration variable from the raw arcs to merged arcs. For each merged arc:
- Path: use merged x0/x1/y0/y1
- Hover: `const isHovered = mergedArc.memberIds.some(id => id === hoveredCell)`
- Arc defs (textPath): use merged bounds for label placement
- For transparent merged arcs: same label logic but with merged angular span

**Step 3: Handle animation with merged arcs**

When `animatingArcs` is present (zoom animation), apply animation to merged arcs by finding the merged bounds of all memberIds' animated positions.

**Step 4: Verify visually**

Run: `bun run dev`
Open the existing Life Map — should render identically (no groupIds yet).
Open the Emotions Map — should render identically (no groupIds).

**Step 5: Commit**

```bash
git add client/shapes/SunburstSvg.tsx
git commit -m "feat: render merged arcs for grouped cells in SunburstSvg"
```

---

### Task 5: Update hit-testing for grouped arcs

**Files:**
- Modify: `client/lib/mandala-geometry.ts:359-391` (getCellAtPointFromArcs)

**Step 1: Update getCellAtPointFromArcs to handle groupId**

When a hit is found on an arc that has a groupId, return the groupId instead of the individual arc id. This ensures clicking anywhere on a merged week/month/block arc returns a consistent identifier.

Add logic after the hit is found:
```typescript
// If the hit arc has a groupId, return the groupId as the cell identifier
if (hitArc.groupId) return hitArc.groupId
return hitArc.id
```

**Step 2: Update getCellBoundsFromArcs to handle groupId lookups**

When `cellId` matches a `groupId`, compute bounds from all arcs with that groupId at the same depth (merged x0→x1 range).

**Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep -v prompt-lab`

**Step 4: Commit**

```bash
git add client/lib/mandala-geometry.ts
git commit -m "feat: support groupId in hit-testing and bounds lookup"
```

---

### Task 6: Rewrite life-map.ts tree definition

**Files:**
- Modify: `client/lib/frameworks/life-map.ts`

This is the core task. Replace the current simple 6-domain tree with the full two-half structure.

**Step 1: Update domain names and structure**

Replace the `LIFE_MAP` slice definitions. Update domain names to: Espiritual, Mental, Físico, Material, Profissional, Pessoal.

Keep the existing `RING_DEFS` and `RING_CONTENT` for the bottom half (Querer/Ser/Ter/Saber).

**Step 2: Build temporal tree helper functions**

Add constants and builders for the top half:

```typescript
const DAYS = [
	{ id: 'fluxo', label: 'Flow' },
	{ id: 'monday', label: 'Monday' },
	{ id: 'tuesday', label: 'Tuesday' },
	{ id: 'wednesday', label: 'Wednesday' },
	{ id: 'thursday', label: 'Thursday' },
	{ id: 'friday', label: 'Friday' },
	{ id: 'saturday', label: 'Saturday' },
	{ id: 'sunday', label: 'Sunday' },
] as const

const WEEK_GROUPS = [
	{ id: 'week-1', label: 'Week 1', dayIndices: [0, 1] },
	{ id: 'week-2', label: 'Week 2', dayIndices: [2, 3] },
	{ id: 'week-3', label: 'Week 3', dayIndices: [4, 5] },
	{ id: 'week-4', label: 'Week 4', dayIndices: [6, 7] },
] as const

const MONTHS = [
	'January', 'February', 'March',        // Week 1
	'April', 'May', 'June',                // Week 2
	'July', 'August', 'September',         // Week 3
	'October', 'November', 'December',     // Week 4
] as const

// Month index → 7-year block groupId
const MONTH_TO_BLOCK: Record<number, string> = {
	0: 'phase-0-6',    // Jan
	1: 'phase-0-6',    // Feb   → shares with Jan
	2: 'phase-7-13',   // Mar
	3: 'phase-14-20',  // Apr
	4: 'phase-21-27',  // May
	5: 'phase-28-34',  // Jun
	6: 'phase-35-41',  // Jul
	7: 'phase-35-41',  // Aug   → shares with Jul
	8: 'phase-35-41',  // Sep   → shares with Jul
	9: 'phase-42-48',  // Oct
	10: 'phase-42-48', // Nov   → shares with Oct
	11: 'phase-42-48', // Dec   → shares with Oct
}

const BLOCK_LABELS: Record<string, string> = {
	'phase-0-6': '0–6',
	'phase-7-13': '7–13',
	'phase-14-20': '14–20',
	'phase-21-27': '21–27',
	'phase-28-34': '28–34',
	'phase-35-41': '35–41',
	'phase-42-48': '42–48',
}
```

**Step 3: Build the temporal day chains**

```typescript
function buildTemporalDayNode(dayIndex: number): TreeNodeDef {
	const day = DAYS[dayIndex]
	const weekIndex = Math.floor(dayIndex / 2)
	const week = WEEK_GROUPS[weekIndex]
	const monthOffset = weekIndex * 3 // 3 months per week

	// 3 month children, each with 1 block-part child
	const monthChildren: TreeNodeDef[] = []
	for (let m = 0; m < 3; m++) {
		const monthIdx = monthOffset + m
		const monthName = MONTHS[monthIdx]
		const blockGroupId = MONTH_TO_BLOCK[monthIdx]

		monthChildren.push({
			id: `${day.id}-${monthName.toLowerCase()}`,
			label: monthName,
			groupId: `month-${monthIdx}`,
			question: '',
			guidance: '',
			examples: [],
			children: [{
				id: `${day.id}-${monthName.toLowerCase()}-block`,
				label: BLOCK_LABELS[blockGroupId],
				groupId: blockGroupId,
				question: '',
				guidance: '',
				examples: [],
			}],
		})
	}

	return {
		id: day.id,
		label: day.label,
		question: '',
		guidance: '',
		examples: [],
		children: [{
			id: `${day.id}-${week.id}`,
			label: week.label,
			groupId: week.id,
			question: '',
			guidance: '',
			examples: [],
			children: monthChildren,
		}],
	}
}
```

**Step 4: Build the full LIFE_TREE**

```typescript
// Bottom half: 6 domains (clockwise from 3 o'clock)
const BOTTOM_DOMAINS = ['espiritual', 'mental', 'fisico', 'material', 'profissional', 'pessoal']
const BOTTOM_LABELS: Record<string, string> = {
	espiritual: 'Espiritual',
	mental: 'Mental',
	fisico: 'Físico',
	material: 'Material',
	profissional: 'Profissional',
	pessoal: 'Pessoal',
}

function buildDomainNode(domainId: string): TreeNodeDef {
	return {
		id: domainId,
		label: BOTTOM_LABELS[domainId],
		question: '',
		guidance: '',
		examples: [],
		transparent: true,
		children: [buildDomainChain(domainId)],  // reuse existing chain builder
	}
}

// Override saber leaf weight to 4 for angular balance
function buildDomainChainWeighted(domainId: string): TreeNodeDef {
	const ringIds = ['querer', 'ser', 'ter', 'saber'] as const
	let current: TreeNodeDef | undefined
	for (let i = ringIds.length - 1; i >= 0; i--) {
		const ringId = ringIds[i]
		const content = RING_CONTENT[ringId]
		const ringDef = RING_DEFS[i]
		const node: TreeNodeDef = {
			id: `${domainId}-${ringId}`,
			label: ringDef.label,
			question: content.question,
			guidance: content.guidance,
			examples: content.examples,
			...(current ? { children: [current] } : { weight: 4 }),
		}
		current = node
	}
	return current!
}

export const LIFE_TREE: TreeMapDefinition = {
	id: 'life-map',
	name: 'Life Map',
	description: 'A holistic mandala for exploring six key life dimensions through four lenses of self-awareness, with temporal planning across days, weeks, months, and life phases.',
	startAngle: Math.PI / 2,
	root: {
		id: 'essencia',
		label: 'Essência',
		question: 'What is your essence — the core of who you are beyond roles and titles?',
		guidance: 'Help the user connect with their deepest sense of self.',
		examples: ['Curiosity and compassion', 'A seeker of truth and beauty'],
		children: [
			// Bottom half: 6 domains (clockwise from 3 o'clock → 9 o'clock)
			...BOTTOM_DOMAINS.map((id) => ({
				id,
				label: BOTTOM_LABELS[id],
				question: '',
				guidance: '',
				examples: [],
				transparent: true,
				children: [buildDomainChainWeighted(id)],
			} as TreeNodeDef)),
			// Top half: 8 temporal day chains (clockwise from 9 o'clock → 3 o'clock)
			...DAYS.map((_, i) => buildTemporalDayNode(i)),
		],
	},
}
```

**Step 5: Update the MapDefinition to match**

Update `LIFE_MAP` slices to use the new domain names: Espiritual, Mental, Físico, Material, Profissional, Pessoal.

**Step 6: Update registerFramework call**

Keep existing visual config and template. The `treeDefinition` now uses the new `LIFE_TREE`.

**Step 7: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep -v prompt-lab`

**Step 8: Commit**

```bash
git add client/lib/frameworks/life-map.ts
git commit -m "feat: redesign life map with two-half temporal + domains structure"
```

---

### Task 7: Update existing tests

**Files:**
- Modify: `tests/unit/sunburst-layout.test.ts`

**Step 1: Update life map test expectations**

The life map now has more nodes (6 domain chains + 8 temporal chains with branching). Update test assertions:
- Total arc count: root(1) + 6 domain transparent(6) + 6×4 rings(24) + 8 days(8) + 8 week-parts(8) + 24 months(24) + 24 blocks(24) = **95 arcs**
- Verify bottom half arcs span π/2 to 3π/2 (with startAngle offset)
- Verify top half arcs span 3π/2 to 5π/2

**Step 2: Add groupId-specific tests**

```typescript
it('temporal arcs have correct groupIds', () => {
	const arcs = computeSunburstLayout(LIFE_TREE)
	const weekArcs = arcs.filter(a => a.groupId?.startsWith('week-'))
	expect(weekArcs).toHaveLength(8) // 2 per week × 4 weeks
	const week1Arcs = weekArcs.filter(a => a.groupId === 'week-1')
	expect(week1Arcs).toHaveLength(2)
})
```

**Step 3: Run all tests**

Run: `bun run vitest run tests/unit/sunburst-layout.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add tests/unit/sunburst-layout.test.ts
git commit -m "test: update sunburst layout tests for life map redesign"
```

---

### Task 8: Visual verification and month dividers

**Files:**
- Modify: `client/shapes/SunburstSvg.tsx`

**Step 1: Add month divider rendering**

In SunburstSvg, after rendering cell paths, add thin radial lines between each month arc at ring 3. For arcs with groupId starting with `month-`, draw a line from the arc's inner radius to outer radius at each arc boundary (x0 position).

```typescript
// Month dividers: thin radial lines between month arcs
const monthDividers: JSX.Element[] = []
for (const arc of mergedArcs) {
	if (arc.groupId?.startsWith('month-')) {
		const angle = arc.x0 - Math.PI / 2 // convert d3 angle to SVG angle
		const r0 = arc.y0 * outerRadius
		const r1 = arc.y1 * outerRadius
		monthDividers.push(
			<line
				key={`divider-${arc.id}`}
				x1={Math.cos(angle) * r0}
				y1={Math.sin(angle) * r0}
				x2={Math.cos(angle) * r1}
				y2={Math.sin(angle) * r1}
				stroke={colors.stroke}
				strokeWidth={0.5}
			/>
		)
	}
}
// Add to the <g transform={translate}> group
```

**Step 2: Visual verification**

Run: `bun run dev`
- Create a Life Map and verify:
  - Bottom half shows 6 domains with correct labels
  - Top half shows 8 day arcs at ring 1
  - 4 week arcs at ring 2 (visually merged)
  - 12 month arcs at ring 3 with dividers between them
  - 7 block arcs at ring 4 (visually merged)
  - Both halves are 180° each
  - Title "Life Map" visible above mandala
- Create an Emotions Map and verify it still works correctly

**Step 3: Commit**

```bash
git add client/shapes/SunburstSvg.tsx
git commit -m "feat: add month divider lines to life map temporal half"
```

---

### Task 9: Final cleanup and PR

**Step 1: Run all tests**

Run: `bun run vitest run`
Expected: All tests pass

**Step 2: Remove stale code**

- Remove old domain names from `LIFE_MAP.slices` if they reference Emocional/Relacional
- Remove unused `buildSliceCells` if it's no longer referenced
- Clean up any dead `RING_DEFS` references if the ratio fields are unused

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: clean up stale life map code"
```

**Step 4: Create PR**

```bash
gh pr create --title "feat: redesign life map with temporal calendar + domain halves" --body "..."
```
