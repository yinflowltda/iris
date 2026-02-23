# Mandala Overlap Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent new mandalas from overlapping existing ones, and allow users to unlock and reposition mandalas.

**Architecture:** Extract a `findNonOverlappingPosition` utility, use it in `handleSelectTemplate`, lock mandalas by default, and expose TLDraw's built-in unlock UX by showing selection bounds.

**Tech Stack:** TLDraw v4.3, React, Vitest

**Design doc:** `docs/plans/2026-02-23-mandala-overlap-fix-design.md`

---

### Task 1: Auto-Placement Utility — Test

**Files:**
- Create: `tests/unit/mandala-placement.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { findNonOverlappingPosition } from '../../client/lib/mandala-placement'

describe('findNonOverlappingPosition', () => {
	it('centers in viewport when no existing mandalas', () => {
		const viewport = { x: 0, y: 0, w: 1200, h: 800 }
		const pos = findNonOverlappingPosition([], viewport, 600)
		expect(pos).toEqual({ x: 300, y: 100 })
	})

	it('places to the right of existing mandala with gap', () => {
		const viewport = { x: 0, y: 0, w: 1200, h: 800 }
		const existing = [{ x: 300, y: 100, w: 600, h: 600 }]
		const pos = findNonOverlappingPosition(existing, viewport, 600)
		expect(pos.x).toBe(300 + 600 + 80) // rightmost edge + gap
	})

	it('vertically centers new mandala relative to viewport', () => {
		const viewport = { x: 0, y: 0, w: 1200, h: 800 }
		const existing = [{ x: 300, y: 100, w: 600, h: 600 }]
		const pos = findNonOverlappingPosition(existing, viewport, 600)
		expect(pos.y).toBe(100) // viewport.y + viewport.h/2 - size/2
	})

	it('handles multiple existing mandalas — places after rightmost', () => {
		const viewport = { x: 0, y: 0, w: 2000, h: 800 }
		const existing = [
			{ x: 0, y: 100, w: 600, h: 600 },
			{ x: 700, y: 100, w: 600, h: 600 },
		]
		const pos = findNonOverlappingPosition(existing, viewport, 600)
		expect(pos.x).toBe(700 + 600 + 80) // right edge of rightmost + gap
	})

	it('handles different mandala sizes', () => {
		const viewport = { x: 0, y: 0, w: 2000, h: 800 }
		const existing = [{ x: 100, y: 50, w: 700, h: 700 }]
		const pos = findNonOverlappingPosition(existing, viewport, 600)
		expect(pos.x).toBe(100 + 700 + 80)
	})
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/mandala-placement.test.ts`
Expected: FAIL — module `../../client/lib/mandala-placement` not found

---

### Task 2: Auto-Placement Utility — Implementation

**Files:**
- Create: `client/lib/mandala-placement.ts`

**Step 1: Write minimal implementation**

```ts
interface Rect {
	x: number
	y: number
	w: number
	h: number
}

const MANDALA_GAP = 80

/**
 * Find a non-overlapping position for a new mandala.
 * Places to the right of the rightmost existing mandala, or centers in viewport if none exist.
 */
export function findNonOverlappingPosition(
	existingMandalas: Rect[],
	viewport: Rect,
	newSize: number,
): { x: number; y: number } {
	const centerY = viewport.y + viewport.h / 2 - newSize / 2

	if (existingMandalas.length === 0) {
		return {
			x: viewport.x + viewport.w / 2 - newSize / 2,
			y: centerY,
		}
	}

	let rightEdge = -Infinity
	for (const m of existingMandalas) {
		const edge = m.x + m.w
		if (edge > rightEdge) rightEdge = edge
	}

	return {
		x: rightEdge + MANDALA_GAP,
		y: centerY,
	}
}
```

**Step 2: Run test to verify it passes**

Run: `bunx vitest run tests/unit/mandala-placement.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add client/lib/mandala-placement.ts tests/unit/mandala-placement.test.ts
git commit -m "feat(mandala): add findNonOverlappingPosition utility with tests"
```

---

### Task 3: Wire Auto-Placement into App.tsx

**Files:**
- Modify: `client/App.tsx:485-523`

**Step 1: Update handleSelectTemplate to use auto-placement**

Import at the top of `client/App.tsx`:
```ts
import { findNonOverlappingPosition } from './lib/mandala-placement'
```

Replace the shape creation block (lines 495-509) with:

```ts
const framework = getFramework(template.frameworkId)
const editor = app.editor
const viewport = editor.getViewportPageBounds()
const size = framework.visual.defaultSize

// Gather existing mandala bounds
const existingMandalas = editor
	.getCurrentPageShapes()
	.filter((s): s is MandalaShape => s.type === 'mandala')
	.map((s) => ({ x: s.x, y: s.y, w: s.props.w, h: s.props.h }))

const position = findNonOverlappingPosition(
	existingMandalas,
	{ x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h },
	size,
)

editor.createShape({
	type: 'mandala',
	x: position.x,
	y: position.y,
	isLocked: true,
	props: {
		frameworkId: template.frameworkId,
		w: size,
		h: size,
		state: makeEmptyState(framework.definition),
	},
})
```

**Step 2: Verify build compiles**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add client/App.tsx
git commit -m "feat(mandala): auto-place new mandalas without overlap, lock by default"
```

---

### Task 4: Show Selection Bounds When Unlocked

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx:583-589`

**Step 1: Remove hideSelectionBoundsBg and hideSelectionBoundsFg overrides**

Delete these two methods (lines 583-589):

```ts
// DELETE these:
override hideSelectionBoundsBg() {
	return true
}

override hideSelectionBoundsFg() {
	return true
}
```

Keep `hideResizeHandles` and `hideRotateHandle` as-is (resize and rotate stay disabled).

**Step 2: Verify build compiles**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add client/shapes/MandalaShapeUtil.tsx
git commit -m "feat(mandala): show selection bounds when mandala is unlocked"
```

---

### Task 5: Run Full Verification

**Step 1: Run verify suite**

Run: `bun run verify`
Expected: lint + typecheck + all tests pass

**Step 2: Manual verification checklist**

Run: `bun run dev`

- [ ] Create first mandala → appears centered in viewport, locked (can't drag)
- [ ] Click cells → zoom-to-cell still works on locked mandala
- [ ] Double-click cell → creates note in cell
- [ ] Create second mandala → appears to the right with gap, not overlapping
- [ ] Right-click mandala → context menu shows "Unlock" option
- [ ] Unlock mandala → selection bounds visible, can drag
- [ ] Drag mandala → notes inside move with it
- [ ] Create notes in second mandala → they snap correctly

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(mandala): address verification issues"
```
