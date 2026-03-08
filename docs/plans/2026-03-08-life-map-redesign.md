# Life Map Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Life Map to have two 180° halves — bottom with 6 life domains (4 rings each), top with a temporal calendar (days → weeks → months → 7-year blocks) — using the existing transparent node grouping system.

**Architecture:** No engine changes needed. The existing transparent node system (used for Past/Present/Future in the emotions map) already provides visual grouping: spanning labels, merged angular width, and collapsed radial bands. The life-map tree uses transparent wrappers for domain groups and week groups, with visible cells for all 4 rings. Leaf weights balance the two halves at 180° each.

**Tech Stack:** TypeScript, d3-hierarchy, React SVG, Vitest

**Key files:**
- Tree definition: `client/lib/frameworks/life-map.ts`
- Layout engine: `client/lib/sunburst-layout.ts` (unchanged)
- Renderer: `client/shapes/SunburstSvg.tsx` (unchanged except month dividers)
- Types: `shared/types/MandalaTypes.ts` (unchanged)
- Tests: `tests/unit/sunburst-layout.test.ts`

---

### Task 1: Rewrite life-map.ts tree definition

**Files:**
- Modify: `client/lib/frameworks/life-map.ts`

This is the core task. Replace the current 6-domain-only tree with the full two-half structure.

**Step 1: Update domain names**

Replace `LIFE_MAP.slices` domain names:
- Old: Espiritual, Emocional, Físico, Material, Profissional, Relacional
- New: Espiritual, Mental, Físico, Material, Profissional, Pessoal

Update the `slices` array in the `LIFE_MAP` MapDefinition and the `buildSliceCells` references.

**Step 2: Add temporal constants**

Add above the tree definition:

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
	'January', 'February', 'March',
	'April', 'May', 'June',
	'July', 'August', 'September',
	'October', 'November', 'December',
] as const

const MONTH_TO_BLOCK: Record<number, { id: string; label: string }> = {
	0: { id: 'phase-0-6', label: '0–6' },
	1: { id: 'phase-0-6', label: '0–6' },
	2: { id: 'phase-7-13', label: '7–13' },
	3: { id: 'phase-14-20', label: '14–20' },
	4: { id: 'phase-21-27', label: '21–27' },
	5: { id: 'phase-28-34', label: '28–34' },
	6: { id: 'phase-35-41', label: '35–41' },
	7: { id: 'phase-35-41', label: '35–41' },
	8: { id: 'phase-35-41', label: '35–41' },
	9: { id: 'phase-42-48', label: '42–48' },
	10: { id: 'phase-42-48', label: '42–48' },
	11: { id: 'phase-42-48', label: '42–48' },
}
```

**Step 3: Build temporal day chain function**

Each day creates a chain: day (ring 1) → week-slot (ring 2) → 3 month branches (ring 3) → block leaves (ring 4).

```typescript
function buildTemporalDayNode(dayIndex: number): TreeNodeDef {
	const day = DAYS[dayIndex]
	const weekIndex = Math.floor(dayIndex / 2)
	const week = WEEK_GROUPS[weekIndex]
	const monthOffset = weekIndex * 3

	const monthChildren: TreeNodeDef[] = []
	for (let m = 0; m < 3; m++) {
		const monthIdx = monthOffset + m
		const monthName = MONTHS[monthIdx]
		const block = MONTH_TO_BLOCK[monthIdx]

		monthChildren.push({
			id: `${day.id}-${monthName.toLowerCase()}`,
			label: monthName,
			question: '',
			guidance: '',
			examples: [],
			children: [{
				id: `${day.id}-${monthName.toLowerCase()}-block`,
				label: block.label,
				question: '',
				guidance: '',
				examples: [],
				// leaf — weight 1 (default)
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
			question: '',
			guidance: '',
			examples: [],
			children: monthChildren,
		}],
	}
}
```

**Step 4: Update buildDomainChain to add weight to saber leaf**

The bottom half needs balanced angular allocation. 6 domains × 1 leaf each = 6 leaves. Top half has 8 days × 3 months = 24 leaves. For 180°/180° split: domain leaf weight = 4.

Modify the existing `buildDomainChain` (or create `buildDomainChainWeighted`):

```typescript
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
```

**Step 5: Build the full LIFE_TREE**

```typescript
const BOTTOM_DOMAINS = [
	{ id: 'espiritual', label: 'Espiritual' },
	{ id: 'mental', label: 'Mental' },
	{ id: 'fisico', label: 'Físico' },
	{ id: 'material', label: 'Material' },
	{ id: 'profissional', label: 'Profissional' },
	{ id: 'pessoal', label: 'Pessoal' },
]

export const LIFE_TREE: TreeMapDefinition = {
	id: 'life-map',
	name: 'Life Map',
	description: 'A holistic mandala for exploring six key life dimensions with temporal planning across days, weeks, months, and life phases.',
	startAngle: Math.PI / 2, // first child at 3 o'clock
	root: {
		id: 'essencia',
		label: 'Essência',
		question: 'What is your essence — the core of who you are beyond roles and titles?',
		guidance: 'Help the user connect with their deepest sense of self.',
		examples: ['Curiosity and compassion', 'A seeker of truth and beauty'],
		children: [
			// Bottom half (3 o'clock → 9 o'clock): 6 domains with transparent wrappers
			...BOTTOM_DOMAINS.map((d): TreeNodeDef => ({
				id: d.id,
				label: d.label,
				question: '',
				guidance: '',
				examples: [],
				transparent: true,
				children: [buildDomainChainWeighted(d.id)],
			})),
			// Top half (9 o'clock → 3 o'clock): 8 day chains
			...DAYS.map((_, i) => buildTemporalDayNode(i)),
		],
	},
}
```

**Step 6: Update the LIFE_MAP MapDefinition to match new domain names**

Update slices array: replace Emocional→Mental, Relacional→Pessoal. Adjust angles for the new layout.

**Step 7: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep -v prompt-lab`
Expected: No new errors

**Step 8: Visual smoke test**

Run: `bun run dev`
- Create a Life Map — verify:
  - Bottom half: 6 equal domain slices with Querer/Ser/Ter/Saber rings
  - Top half: 8 day cells at ring 1, week-slot cells at ring 2, month cells at ring 3, block cells at ring 4
  - Both halves are 180° each
  - Title "Life Map" visible above mandala
- Create an Emotions Map — verify no regression

**Step 9: Commit**

```bash
git add client/lib/frameworks/life-map.ts
git commit -m "feat: redesign life map with two-half temporal + domains structure"
```

---

### Task 2: Update existing tests

**Files:**
- Modify: `tests/unit/sunburst-layout.test.ts`

**Step 1: Update life map test expectations**

The life map now has more nodes. Update arc count assertions:
- root: 1
- 6 domain transparent wrappers: 6
- 6 × 4 ring cells (querer/ser/ter/saber): 24
- 8 day cells: 8
- 8 week-slot cells: 8
- 8 × 3 = 24 month cells: 24
- 24 block cells: 24
- **Total: 95 arcs**

**Step 2: Add structural tests**

```typescript
it('life map has 95 arcs total', () => {
	const arcs = computeSunburstLayout(LIFE_TREE)
	expect(arcs).toHaveLength(95)
})

it('bottom half domains each span ~30° (π/6 rad)', () => {
	const arcs = computeSunburstLayout(LIFE_TREE)
	const domains = arcs.filter(a => a.transparent && a.depth === 1)
	// 6 domains in bottom half
	const bottomDomains = domains.filter(a => !DAYS.some(d => d.id === a.id))
	expect(bottomDomains).toHaveLength(6)
	for (const d of bottomDomains) {
		const sweep = d.x1 - d.x0
		expect(sweep).toBeCloseTo(Math.PI / 6, 1) // ~30°
	}
})

it('top and bottom halves each span π radians', () => {
	const arcs = computeSunburstLayout(LIFE_TREE)
	const dayArcs = arcs.filter(a => DAYS.some(d => d.id === a.id))
	const topStart = Math.min(...dayArcs.map(a => a.x0))
	const topEnd = Math.max(...dayArcs.map(a => a.x1))
	expect(topEnd - topStart).toBeCloseTo(Math.PI, 1)
})
```

**Step 3: Run tests**

Run: `bun run vitest run tests/unit/sunburst-layout.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add tests/unit/sunburst-layout.test.ts
git commit -m "test: update sunburst layout tests for life map redesign"
```

---

### Task 3: Visual polish — month dividers

**Files:**
- Modify: `client/shapes/SunburstSvg.tsx`

The reference image shows dividers between each month. Since each day chain creates separate month cells, the existing cell stroke already provides dividers between month cells within the same day. But we may want additional emphasis on the month boundaries that align across days.

**Step 1: Check if existing cell strokes are sufficient**

Run: `bun run dev`
Look at the month cells at ring 3. If the standard cell stroke lines between adjacent month cells look correct, no additional dividers needed.

**Step 2: If needed, add explicit month boundary lines**

If the dividers need emphasis, add thin radial lines at month boundaries. These would be drawn at the angular positions where month groups change (every 3 month-cells within each week's angular span).

The existing cell rendering already draws stroked `<path>` elements for each cell. Since months are individual cells, they'll already have stroke borders. This step may be a no-op.

**Step 3: Commit if changes were made**

```bash
git add client/shapes/SunburstSvg.tsx
git commit -m "feat: enhance month divider visibility in life map"
```

---

### Task 4: Final cleanup and PR

**Step 1: Run all tests**

Run: `bun run vitest run`
Expected: All tests pass

**Step 2: Remove stale code**

- Remove references to Emocional/Relacional domain names
- Remove unused `buildSliceCells` if the old MapDefinition is no longer needed
- Remove unused `buildDomainChain` (replaced by `buildDomainChainWeighted`)
- Clean up the `RING_DEFS` if `innerRatio`/`outerRatio` fields are unused by the tree path

**Step 3: Final visual check**

Run: `bun run dev`
Verify both Life Map and Emotions Map work correctly with all features: cover, title, zoom, notes, labels.

**Step 4: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove stale life map code after redesign"
```

**Step 5: Create PR**

```bash
gh pr create --title "feat: redesign life map with temporal calendar + domain halves" --body "$(cat <<'EOF'
## Summary
- Redesign Life Map with two 180° halves: bottom (6 life domains) and top (temporal calendar)
- Bottom: Espiritual, Mental, Físico, Material, Profissional, Pessoal × Querer/Ser/Ter/Saber rings
- Top: 8 days (Flow + Mon–Sun) → 4 weeks → 12 months → 7 life-phase blocks (7-year increments)
- Uses existing transparent node grouping system — no engine changes
- Leaf weights (4:1) balance both halves at exactly 180° each

## Test plan
- [ ] Life Map renders with correct two-half layout
- [ ] Bottom half: 6 equal domain slices with 4 rings each
- [ ] Top half: days/weeks/months/blocks at rings 1-4
- [ ] Emotions Map unchanged (no regression)
- [ ] Unit tests pass for new arc counts and angular spans
- [ ] Title, cover, zoom, and notes work on Life Map

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
