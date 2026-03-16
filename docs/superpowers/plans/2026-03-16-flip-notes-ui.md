# Flip Notes UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dual-sided (past-present / present-future) flippable notes to the mandala, with per-note flip icon, bulk toggle, green tint for aspirations, and an agent `flip_note` action.

**Architecture:** Each note stores its alternate side in `shape.meta.flipContent` (RichText) and `shape.meta.flipTense`. The mandala gains a `viewTense` prop for bulk toggling. The swap is atomic (single `editor.updateShape`). A new `flip_note` agent action lets Iris add flip sides to notes.

**Tech Stack:** tldraw shape system, Zod schemas, React components, Cloudflare Worker prompt sections

**Spec:** `docs/superpowers/specs/2026-03-16-flip-notes-ui-design.md`

---

## Chunk 1: Data Model & Action Schema

### Task 1: Add `viewTense` to MandalaShapeProps

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx:39-49` (MandalaShapeProps type)
- Modify: `client/shapes/MandalaShapeUtil.tsx:283-293` (props validator)
- Modify: `client/shapes/MandalaShapeUtil.tsx:295-307` (getDefaultProps)

- [ ] **Step 1: Add `viewTense` to the TypeScript type**

In `MandalaShapeProps` (line 39), add after `cover`:

```typescript
export type MandalaShapeProps = {
	frameworkId: string
	w: number
	h: number
	state: MandalaState
	arrows: MandalaArrowRecord[]
	arrowsVisible: boolean
	zoomedNodeId: string | null
	zoomMode: string
	cover: CoverConfig | null
	viewTense: string
}
```

- [ ] **Step 2: Add validator and default**

In `static override props` (line 283), add:
```typescript
viewTense: T.string,
```

In `getDefaultProps()` (line 295), add:
```typescript
viewTense: 'past-present',
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `viewTense`

- [ ] **Step 4: Commit**

```bash
git add client/shapes/MandalaShapeUtil.tsx
git commit -m "feat(flip-notes): add viewTense prop to MandalaShapeProps"
```

---

### Task 2: Add `FlipNoteAction` schema

**Files:**
- Modify: `shared/schema/AgentActionSchemas.ts:537-549` (before UnknownAction)

- [ ] **Step 1: Add FlipNoteAction schema**

Insert before the `UnknownAction` definition (line 539):

```typescript
// Flip Note Action (mandala-specific)
export const FlipNoteAction = z
	.object({
		_type: z.literal('flip_note'),
		intent: z.string(),
		mandalaId: SimpleShapeIdSchema,
		noteId: SimpleShapeIdSchema.describe(
			'The ID of the note shape to add or update a flip side on (e.g. "mandala-1-profissional-ser-0").',
		),
		content: z.string().describe(
			'The text for the other side of the note.',
		),
	})
	.meta({
		title: 'Flip Note',
		description:
			'Add or update the alternate side of a mandala note. Use when the user expresses dissatisfaction or desire for change — the flip side captures the aspiration.',
		_systemPromptCategory: 'edit',
	})

export type FlipNoteAction = z.infer<typeof FlipNoteAction>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add shared/schema/AgentActionSchemas.ts
git commit -m "feat(flip-notes): add FlipNoteAction schema"
```

---

## Chunk 2: Action Util & Registration

### Task 3: Create `FlipNoteActionUtil`

**Files:**
- Create: `client/actions/FlipNoteActionUtil.ts`
- Reference: `client/actions/MoveNoteActionUtil.ts` (pattern to follow)
- Reference: `client/actions/element-lookup-utils.ts` (validateElementExists)
- Reference: `client/actions/mandala-action-utils.ts` (resolveMandalaId)

- [ ] **Step 1: Create the action util**

Create `client/actions/FlipNoteActionUtil.ts`:

```typescript
import { type TLShapeId, toRichText } from 'tldraw'
import type { FlipNoteAction } from '../../shared/schema/AgentActionSchemas'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { validateElementExists } from './element-lookup-utils'
import { resolveMandalaId } from './mandala-action-utils'

export const FlipNoteActionUtil = registerActionUtil(
	class FlipNoteActionUtil extends AgentActionUtil<FlipNoteAction> {
		static override type = 'flip_note' as const

		override getInfo(action: Streaming<FlipNoteAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<FlipNoteAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = resolveMandalaId(this.editor, helpers, action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			const mandalaShapeId = `shape:${mandalaId}` as TLShapeId
			const mandala = this.editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return null

			// Validate note exists
			const noteId = helpers.ensureShapeIdExists(action.noteId)
			if (!noteId) return null
			action.noteId = noteId

			const sourceShape = validateElementExists(this.editor, mandala, noteId)
			if (!sourceShape) return null

			return action
		}

		override applyAction(action: Streaming<FlipNoteAction>) {
			if (!action.complete) return

			const noteShapeId = `shape:${action.noteId}` as TLShapeId
			const shape = this.editor.getShape(noteShapeId)
			if (!shape) return

			const meta = shape.meta as Record<string, unknown>
			const elementMetadata = (meta.elementMetadata ?? {}) as Record<string, unknown>
			const currentTense = (elementMetadata.tense as string) ?? 'past-present'
			const oppositeTense = currentTense === 'past-present' ? 'present-future' : 'past-present'

			this.editor.updateShape({
				id: noteShapeId,
				type: 'note',
				meta: {
					...meta,
					flipContent: toRichText(action.content),
					flipTense: oppositeTense,
					elementMetadata: {
						...elementMetadata,
						tense: currentTense, // ensure tense is set
					},
				},
			})
		}
	},
)
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/actions/FlipNoteActionUtil.ts
git commit -m "feat(flip-notes): create FlipNoteActionUtil"
```

---

### Task 4: Register action in mode definitions

**Files:**
- Modify: `client/modes/AgentModeDefinitions.ts:1-38` (imports)
- Modify: `client/modes/AgentModeDefinitions.ts:184-192` (working mode actions)
- Modify: `client/modes/AgentModeDefinitions.ts:237-244` (mandala mode actions)

- [ ] **Step 1: Import FlipNoteActionUtil**

Add import at top of file, alongside the other action imports:

```typescript
import { FlipNoteActionUtil } from '../actions/FlipNoteActionUtil'
```

- [ ] **Step 2: Add to both mode action arrays**

In the `working` mode actions array (around line 192, after `MoveNoteActionUtil.type`):
```typescript
FlipNoteActionUtil.type,
```

In the `mandala` mode actions array (around line 244, after `MoveNoteActionUtil.type`):
```typescript
FlipNoteActionUtil.type,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/modes/AgentModeDefinitions.ts
git commit -m "feat(flip-notes): register FlipNoteActionUtil in mode definitions"
```

---

## Chunk 3: Note Rendering — Color Override & Flip Icon

### Task 5: Add present-future color override to `CircularNoteShapeUtil`

**Files:**
- Modify: `client/shapes/CircularNoteShapeUtil.tsx:59-174` (component method)

- [ ] **Step 1: Add tense-based color override**

In `component()`, after `const isEmpty = ...` (line 93-95), add tense detection:

```typescript
const meta = shape.meta as Record<string, unknown>
const elementMetadata = (meta.elementMetadata ?? {}) as Record<string, unknown>
const tense = elementMetadata.tense as string | undefined
const isPresentFuture = tense === 'present-future'
```

Then modify the container `style` (line 109-116) to conditionally override colors:

```typescript
style={{
	width: nw,
	height: nh,
	backgroundColor: isPresentFuture ? '#d1fae5' : getColorValue(theme, color, 'noteFill'),
	borderBottom: isPresentFuture
		? `${2 * scale}px solid #10b981`
		: isDarkMode
			? `${2 * scale}px solid rgb(20, 20, 20)`
			: `${2 * scale}px solid rgb(144, 144, 144)`,
}}
```

Also update the `labelColor` in `RichTextLabel` (line 140-143) to handle present-future:

```typescript
labelColor={
	isPresentFuture
		? '#065f46'
		: labelColor === 'black'
			? getColorValue(theme, color, 'noteText')
			: getColorValue(theme, labelColor, 'fill')
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/shapes/CircularNoteShapeUtil.tsx
git commit -m "feat(flip-notes): add present-future green tint color override"
```

---

### Task 6: Add flip icon on hover

> **Note:** The spec has a contradiction between line 64 ("Appears **only** on dual-sided notes") and line 65 ("even if `meta.flipContent` is null"). We follow line 64: the flip icon only appears on dual-sided notes (where flipContent is non-null).

**Files:**
- Modify: `client/shapes/CircularNoteShapeUtil.tsx:59-174` (component method)

- [ ] **Step 1: Add flip state and icon**

After the tense detection code (from Task 5), add:

```typescript
const hasFlipContent = meta.flipContent != null
```

After the closing `</div>` of the content area (before the container's closing `</div>`, line ~171), add the flip icon:

```typescript
{hasFlipContent && (
	<div
		style={{
			position: 'absolute',
			top: 4 * scale,
			right: 4 * scale,
			width: 24 * scale,
			height: 24 * scale,
			borderRadius: '50%',
			background: 'rgba(0, 0, 0, 0.6)',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			cursor: 'pointer',
			fontSize: 14 * scale,
			color: 'white',
			opacity: 0,
			transition: 'opacity 0.15s',
			pointerEvents: 'all',
		}}
		className="flip-icon"
		onPointerDown={(e) => {
			e.stopPropagation()
			e.preventDefault()
			// Atomic swap
			const currentShape = editor.getShape(shape.id)
			if (!currentShape) return
			const m = currentShape.meta as Record<string, unknown>
			const em = (m.elementMetadata ?? {}) as Record<string, unknown>
			editor.updateShape({
				id: shape.id,
				type: 'note',
				props: { richText: m.flipContent as any },
				meta: {
					...m,
					flipContent: currentShape.props.richText,
					flipTense: em.tense ?? 'past-present',
					elementMetadata: {
						...em,
						tense: m.flipTense,
					},
				},
			})
		}}
	>
		↻
	</div>
)}
```

- [ ] **Step 2: Add CSS for hover visibility**

The flip icon uses `opacity: 0` by default and needs to show on hover of the parent note. Add a `<style>` tag or a CSS class. The simplest approach: add a CSS rule to the existing global styles or use a `:hover` pseudo-selector on the container.

Add to the container div (the outer `<div>` at line 106):
```typescript
className={`tl-note__container ${hasFlipContent ? 'has-flip' : ''}`}
```

Then in a `<style>` tag or the app's global CSS:
```css
.has-flip:hover .flip-icon {
	opacity: 1 !important;
}
```

For simplicity, inject this with a `<style>` tag inside the component (rendered once):
```typescript
{hasFlipContent && (
	<style>{`.has-flip:hover .flip-icon { opacity: 1 !important; }`}</style>
)}
```

Place this inside the component return, before the flip icon div.

- [ ] **Step 3: Verify TypeScript compiles and test manually**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/shapes/CircularNoteShapeUtil.tsx
git commit -m "feat(flip-notes): add flip icon on hover for dual-sided notes"
```

---

### Task 7: Add flip animation

> **Note:** This task **replaces** the flip handler from Task 6 entirely. The new handler wraps the same swap logic with animation timing.

**Files:**
- Modify: `client/shapes/CircularNoteShapeUtil.tsx:59-174` (component method)

- [ ] **Step 1: Add flip animation state**

Import `useState` from React at the top of the file (add `import { useState } from 'react'`).

In `component()`, add animation state:

```typescript
// biome-ignore lint/correctness/useHookAtTopLevel: tldraw component() methods use hooks
const [isFlipping, setIsFlipping] = useState(false)
```

- [ ] **Step 2: Wrap the flip handler with animation**

Replace the flip icon's `onPointerDown` handler to trigger animation:

```typescript
onPointerDown={(e) => {
	e.stopPropagation()
	e.preventDefault()
	setIsFlipping(true)
	// Swap content at midpoint (150ms)
	setTimeout(() => {
		const currentShape = editor.getShape(shape.id)
		if (!currentShape) return
		const m = currentShape.meta as Record<string, unknown>
		const em = (m.elementMetadata ?? {}) as Record<string, unknown>
		editor.updateShape({
			id: shape.id,
			type: 'note',
			props: { richText: m.flipContent as any },
			meta: {
				...m,
				flipContent: currentShape.props.richText,
				flipTense: em.tense ?? 'past-present',
				elementMetadata: {
					...em,
					tense: m.flipTense,
				},
			},
		})
	}, 150)
	// End animation
	setTimeout(() => setIsFlipping(false), 300)
}}
```

- [ ] **Step 3: Apply animation CSS to the container**

Add to the container div's style:

```typescript
style={{
	width: nw,
	height: nh,
	backgroundColor: isPresentFuture ? '#d1fae5' : getColorValue(theme, color, 'noteFill'),
	borderBottom: /* ... existing ... */,
	transition: isFlipping ? 'transform 0.3s ease-in-out' : undefined,
	transform: isFlipping ? 'scaleX(0)' : 'scaleX(1)',
}}
```

Note: The `scaleX(0)` triggers at animation start, then at 150ms the content swaps, then at 300ms `isFlipping` becomes false and `scaleX(1)` restores. The CSS transition handles the smooth animation.

Actually, for a proper two-phase animation (shrink then expand), use keyframes:

```typescript
// Add near the style injection
{isFlipping && (
	<style>{`
		@keyframes flip-card {
			0% { transform: scaleX(1); }
			50% { transform: scaleX(0); }
			100% { transform: scaleX(1); }
		}
	`}</style>
)}
```

And on the container:
```typescript
animation: isFlipping ? 'flip-card 0.3s ease-in-out' : undefined,
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/shapes/CircularNoteShapeUtil.tsx
git commit -m "feat(flip-notes): add flip card animation on individual note flip"
```

---

## Chunk 4: Bulk Toggle

### Task 8: Create `ViewTenseToggle` component

**Files:**
- Create: `client/components/ViewTenseToggle.tsx`
- Reference: `client/components/ZoomModeToggle.tsx` (pattern to follow)

- [ ] **Step 1: Create the component**

Create `client/components/ViewTenseToggle.tsx`:

```typescript
import type { PointerEvent as ReactPointerEvent } from 'react'
import { type TLShapeId, useEditor } from 'tldraw'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'

/** Collect all note shape IDs from MandalaState (the canonical source for which notes belong to the mandala) */
function getAllNoteShapeIds(state: MandalaState): TLShapeId[] {
	const ids: TLShapeId[] = []
	for (const cell of Object.values(state)) {
		if (cell?.contentShapeIds) {
			for (const simpleId of cell.contentShapeIds) {
				ids.push(`shape:${simpleId}` as TLShapeId)
			}
		}
	}
	return ids
}

export function ViewTenseToggle({ shape }: { shape: MandalaShape }) {
	const editor = useEditor()
	const isPastPresent = shape.props.viewTense === 'past-present'
	const newTense = isPastPresent ? 'present-future' : 'past-present'

	// Check if any note has flipContent (using MandalaState, not parent-child hierarchy)
	const noteIds = getAllNoteShapeIds(shape.props.state)
	const hasAnyFlipContent = noteIds.some((noteId) => {
		const note = editor.getShape(noteId)
		if (!note) return false
		const meta = note.meta as Record<string, unknown>
		return meta.flipContent != null
	})

	if (!hasAnyFlipContent) return null

	function toggle(e: ReactPointerEvent) {
		e.stopPropagation()
		e.preventDefault()

		// Update mandala viewTense and swap all dual-sided notes in one batch
		editor.batch(() => {
			editor.updateShape({
				id: shape.id,
				type: 'mandala',
				props: { viewTense: newTense },
			})

			// Swap all dual-sided notes whose tense doesn't match
			const ids = getAllNoteShapeIds(shape.props.state)
			for (const noteId of ids) {
				const note = editor.getShape(noteId)
				if (!note || note.type !== 'note') continue
				const meta = note.meta as Record<string, unknown>
				if (meta.flipContent == null) continue // single-sided, skip

				const em = (meta.elementMetadata ?? {}) as Record<string, unknown>
				const currentTense = (em.tense as string) ?? 'past-present'
				if (currentTense === newTense) continue // already matches

				// Atomic swap
				editor.updateShape({
					id: noteId,
					type: 'note',
					props: { richText: meta.flipContent as any },
					meta: {
						...meta,
						flipContent: note.props.richText,
						flipTense: em.tense ?? 'past-present',
						elementMetadata: {
							...em,
							tense: meta.flipTense,
						},
					},
				})
			}
		})
	}

	return (
		<div
			style={{
				position: 'absolute',
				bottom: 8,
				left: 8,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 2,
				pointerEvents: 'all',
			}}
		>
			<button
				type="button"
				onPointerDown={toggle}
				style={{
					width: 36,
					height: 36,
					borderRadius: '50%',
					background: isPastPresent ? 'rgba(255, 255, 255, 0.9)' : '#d1fae5',
					border: isPastPresent ? '1px solid #ccc' : '1px solid #10b981',
					cursor: 'pointer',
					fontSize: 18,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					backdropFilter: 'blur(4px)',
					userSelect: 'none',
				}}
				title={`Switch to ${newTense} view`}
			>
				↻
			</button>
			<span
				style={{
					fontSize: 9,
					fontFamily: 'system-ui, sans-serif',
					fontWeight: 600,
					color: isPastPresent ? '#555' : '#10b981',
					textTransform: 'uppercase',
					whiteSpace: 'nowrap',
					userSelect: 'none',
				}}
			>
				{isPastPresent ? 'Past-Present' : 'Present-Future'}
			</span>
		</div>
	)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/components/ViewTenseToggle.tsx
git commit -m "feat(flip-notes): create ViewTenseToggle bulk toggle component"
```

---

### Task 9: Place `ViewTenseToggle` in mandala interactive

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx:17-18` (imports)
- Modify: `client/shapes/MandalaShapeUtil.tsx:254-277` (MandalaInteractive return)

- [ ] **Step 1: Import ViewTenseToggle**

Add import at top:
```typescript
import { ViewTenseToggle } from '../components/ViewTenseToggle'
```

- [ ] **Step 2: Add to MandalaInteractive render**

In the return JSX of `MandalaInteractive` (line 254-277), add after `<ZoomModeToggle shape={shape} />`:

```typescript
<ViewTenseToggle shape={shape} />
```

The return should look like:
```typescript
return (
	<div style={{ position: 'relative', width: shape.props.w, height: shape.props.h }}>
		<SunburstSvg ... />
		<ZoomModeToggle shape={shape} />
		<ViewTenseToggle shape={shape} />
	</div>
)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/shapes/MandalaShapeUtil.tsx
git commit -m "feat(flip-notes): place ViewTenseToggle in mandala interactive"
```

---

## Chunk 5: Note Creation Tense Initialization

### Task 10: Set initial tense on agent-created notes

**Files:**
- Modify: `client/actions/StreamingCellFillActionUtil.ts:145-164` (createShape call)
- Modify: `client/actions/FillCellActionUtil.ts:113-132` (createShape call)

- [ ] **Step 1: Add tense meta to StreamingCellFillActionUtil**

In `StreamingCellFillActionUtil.ts`, the `editor.createShape()` call (line 145-164) already accepts a `meta` field. Add it inline. First, read the mandala's `viewTense` — the mandala shape is already available via `mandalaShapeId`.

Before the `createShape` call, resolve the mandala:
```typescript
const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
const initialTense = mandala?.props.viewTense ?? 'past-present'
```

Then add `meta` to the existing `createShape` call (alongside `id`, `type`, `parentId`, `x`, `y`, `props`):
```typescript
meta: {
	elementMetadata: {
		tense: initialTense,
	},
},
```

Import `MandalaShape` type if not already imported:
```typescript
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
```

- [ ] **Step 2: Add tense meta to FillCellActionUtil**

Same pattern in `FillCellActionUtil.ts`. Add `meta` inline in its `createShape` call (line 113-132):

```typescript
meta: {
	elementMetadata: {
		tense: initialTense,
	},
},
```

Resolve the mandala and `initialTense` the same way before the `createShape` call. Import `MandalaShape` type if not already imported.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/actions/StreamingCellFillActionUtil.ts client/actions/FillCellActionUtil.ts
git commit -m "feat(flip-notes): set initial tense on agent-created notes"
```

---

### Task 11: Set initial tense on user double-click created notes

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx:381-401` (onDoubleClick handler)

- [ ] **Step 1: Add meta with tense to double-click note creation**

In `onDoubleClick()` (line 392-398), the `createShape` call currently sets only `props: { scale }`. tldraw `createShape` does accept a `meta` field. Add it:

```typescript
this.editor.createShape({
	id: noteId,
	type: 'note',
	x: pagePoint.x - halfSize,
	y: pagePoint.y - halfSize,
	props: { scale },
	meta: {
		elementMetadata: {
			tense: shape.props.viewTense ?? 'past-present',
		},
	},
})
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/shapes/MandalaShapeUtil.tsx
git commit -m "feat(flip-notes): set initial tense on double-click created notes"
```

---

## Chunk 6: Prompt Integration

### Task 12: Add `hasFlipNote` flag

**Files:**
- Modify: `worker/prompt/getSystemPromptFlags.ts:65-69` (mandala-specific flags)

- [ ] **Step 1: Add flag**

After `hasGetMetadata` (line 69), add:

```typescript
hasFlipNote: actions.includes('flip_note'),
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add worker/prompt/getSystemPromptFlags.ts
git commit -m "feat(flip-notes): add hasFlipNote system prompt flag"
```

---

### Task 13: Add flip_note prompt guidance

**Files:**
- Modify: `worker/prompt/sections/life-map-section.ts:140-141` (after existing Flippable Notes Guidance)

- [ ] **Step 1: Add flagged prompt section**

Insert a new `${flagged(...)}` template interpolation between the end of the "Flippable Notes Guidance" markdown (line 140) and the existing `${flagged(flags.hasCreateArrow, ...)}` block (line 142). The blank line 141 separates them. Place the new block after line 141, on a new line before the arrow system block. This is inside a template literal, so use `${flagged(...)}` syntax:

```typescript
${flagged(
	flags.hasFlipNote,
	`### flip_note Action

**\`flip_note\`** parameters: \`noteId\`, \`mandalaId\`, \`content\`
- Use when the user expresses dissatisfaction or desire for change about an existing note
- When used, ask the user "How would you like <note> to be different?"
- Don't flip prematurely — let dissatisfaction surface naturally
- Content should be concrete and identity-aligned, not vague aspirations
- After adding a flip side, the note gains a green "other side" accessible via the flip icon or bulk toggle
- To update an existing flip side, call \`flip_note\` again with the same noteId and new content
- \`flip_note\` goes in the "actions" array (NOT "cells"). NEVER use "cells" to simulate flipping.`,
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/rafarj/code/iris && bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add worker/prompt/sections/life-map-section.ts
git commit -m "feat(flip-notes): add flip_note prompt guidance behind hasFlipNote flag"
```

> **Note on `buildSystemPrompt.ts`:** No changes needed. `buildStreamingCellsSchemaSection` automatically includes all non-builtin action types from the mode's action list. Since `flip_note` is registered in both modes (Task 4), it will be auto-included in the hybrid streaming format's action schemas.

---

### Task 14: Manual integration test

No file changes — verification only.

- [ ] **Step 1: Start dev server**

Run: `cd /Users/rafarj/code/iris && bun run dev`

- [ ] **Step 2: Test flip_note action via agent**

1. Open the app, create a Life Map mandala
2. Have Iris fill a few notes via conversation
3. Express dissatisfaction about one note (e.g., "I don't like being anxious")
4. Verify Iris uses `flip_note` in the actions array
5. Verify the note gets `flipContent` in meta (check via tldraw debug)
6. Verify the flip icon appears on hover over that note
7. Click the flip icon — verify the note swaps content and turns green
8. Click again — verify it swaps back to original

- [ ] **Step 3: Test bulk toggle**

1. Have Iris flip several notes
2. Verify the ViewTenseToggle button appears (bottom-left of mandala)
3. Click it — verify all dual-sided notes swap to present-future (green)
4. Verify single-sided notes are unaffected
5. Click again — verify all swap back to past-present

- [ ] **Step 4: Test color override**

1. Verify past-present notes show their original warm colors
2. Verify present-future notes show green tint (#d1fae5 background, #10b981 border)
3. Verify flip animation plays (~300ms card flip effect)

- [ ] **Step 5: Test new note tense init**

1. Double-click on the mandala to create a note — verify it has `tense: 'past-present'` in meta
2. Toggle bulk to present-future view
3. Have Iris create a note — verify it has `tense: 'present-future'` in meta
