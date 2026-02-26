# Note Metadata Satellites — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add visual metadata badges ("satellites") that orbit circular notes, with progressive disclosure and sub-satellite editing.

**Architecture:** Metadata stored in `shape.meta.noteMetadata` (coexisting with `elementMetadata`). Satellites rendered as React components inside `CircularNoteShapeUtil.component()`. Agent integration via a new `set_note_metadata` action and `FocusedNoteShape` extension. All fields enabled by default, hidden until user adds them via hover-to-reveal `+` satellite.

**Tech Stack:** React 19, TLDraw v4.3, TypeScript, Zod, CSS transitions for animations.

---

## Task 1: Types & Constants

**Files:**
- Modify: `shared/types/MandalaTypes.ts:57-64` (after `TreeMapDefinition`)
- Create: `client/shapes/note-metadata-constants.ts`
- Test: `tests/unit/note-metadata-types.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/note-metadata-types.test.ts
import { describe, expect, it } from 'vitest'
import type { NoteMetadata, NoteMetadataConfig } from '../../shared/types/MandalaTypes'
import {
	ALL_METADATA_FIELDS,
	DEFAULT_PRIORITY_OPTIONS,
	DEFAULT_STATUS_OPTIONS,
	getEnabledFields,
	getStatusOptions,
} from '../../client/shapes/note-metadata-constants'

describe('NoteMetadata types', () => {
	it('allows empty metadata', () => {
		const meta: NoteMetadata = {}
		expect(meta).toEqual({})
	})

	it('allows all fields populated', () => {
		const meta: NoteMetadata = {
			status: 'done',
			priority: 'high',
			assignee: 'Alice',
			tags: ['urgent', 'bug'],
			dueDate: '2026-03-01',
			progress: { done: 3, total: 5 },
		}
		expect(meta.status).toBe('done')
		expect(meta.priority).toBe('high')
		expect(meta.tags).toHaveLength(2)
		expect(meta.progress?.done).toBe(3)
	})
})

describe('note-metadata-constants', () => {
	it('has 6 metadata fields', () => {
		expect(ALL_METADATA_FIELDS).toHaveLength(6)
		expect(ALL_METADATA_FIELDS).toContain('status')
		expect(ALL_METADATA_FIELDS).toContain('priority')
		expect(ALL_METADATA_FIELDS).toContain('assignee')
		expect(ALL_METADATA_FIELDS).toContain('tags')
		expect(ALL_METADATA_FIELDS).toContain('dueDate')
		expect(ALL_METADATA_FIELDS).toContain('progress')
	})

	it('has 4 default status options', () => {
		expect(DEFAULT_STATUS_OPTIONS).toHaveLength(4)
		expect(DEFAULT_STATUS_OPTIONS[0]).toEqual({ key: 'todo', emoji: '⭕', label: 'To Do' })
	})

	it('has 3 default priority options', () => {
		expect(DEFAULT_PRIORITY_OPTIONS).toHaveLength(3)
		expect(DEFAULT_PRIORITY_OPTIONS[0]).toEqual({ key: 'high', emoji: '🔴', label: 'High' })
	})

	it('returns all fields when no config', () => {
		expect(getEnabledFields()).toEqual(ALL_METADATA_FIELDS)
		expect(getEnabledFields(undefined)).toEqual(ALL_METADATA_FIELDS)
	})

	it('respects disabledFields', () => {
		const config: NoteMetadataConfig = { disabledFields: ['assignee', 'dueDate'] }
		const enabled = getEnabledFields(config)
		expect(enabled).not.toContain('assignee')
		expect(enabled).not.toContain('dueDate')
		expect(enabled).toContain('status')
		expect(enabled).toContain('priority')
		expect(enabled).toContain('tags')
		expect(enabled).toContain('progress')
	})

	it('returns custom status options when configured', () => {
		const custom = [{ key: 'wip', emoji: '🔧', label: 'WIP' }]
		const config: NoteMetadataConfig = { statusOptions: custom }
		expect(getStatusOptions(config)).toEqual(custom)
	})

	it('returns default status options when not configured', () => {
		expect(getStatusOptions()).toEqual(DEFAULT_STATUS_OPTIONS)
		expect(getStatusOptions(undefined)).toEqual(DEFAULT_STATUS_OPTIONS)
	})
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/note-metadata-types.test.ts`
Expected: FAIL — imports don't exist yet.

**Step 3: Add types to `shared/types/MandalaTypes.ts`**

After line 64 (after `TreeMapDefinition` closing brace), add:

```typescript
// ─── Note metadata (universal, stored in shape.meta.noteMetadata) ────────────

export interface NoteMetadataProgress {
	done: number
	total: number
}

export interface NoteMetadata {
	status?: string
	priority?: 'high' | 'medium' | 'low'
	assignee?: string
	tags?: string[]
	dueDate?: string
	progress?: NoteMetadataProgress
}

export type NoteMetadataFieldName = keyof NoteMetadata

export interface NoteMetadataOption {
	key: string
	emoji: string
	label: string
}

export interface NoteMetadataConfig {
	disabledFields?: NoteMetadataFieldName[]
	statusOptions?: NoteMetadataOption[]
}
```

Also add `noteMetadataConfig?: NoteMetadataConfig` to the `TreeMapDefinition` interface (after `startAngle?`).

**Step 4: Create `client/shapes/note-metadata-constants.ts`**

```typescript
import type {
	NoteMetadataConfig,
	NoteMetadataFieldName,
	NoteMetadataOption,
} from '../../shared/types/MandalaTypes'

export const ALL_METADATA_FIELDS: NoteMetadataFieldName[] = [
	'status',
	'priority',
	'assignee',
	'tags',
	'dueDate',
	'progress',
]

export const DEFAULT_STATUS_OPTIONS: NoteMetadataOption[] = [
	{ key: 'todo', emoji: '⭕', label: 'To Do' },
	{ key: 'in-progress', emoji: '🟡', label: 'In Progress' },
	{ key: 'done', emoji: '✅', label: 'Done' },
	{ key: 'blocked', emoji: '⛔', label: 'Blocked' },
]

export const DEFAULT_PRIORITY_OPTIONS: NoteMetadataOption[] = [
	{ key: 'high', emoji: '🔴', label: 'High' },
	{ key: 'medium', emoji: '🟠', label: 'Medium' },
	{ key: 'low', emoji: '🟢', label: 'Low' },
]

/** Hidden fields not yet shown in the UI */
export const HIDDEN_FIELDS: NoteMetadataFieldName[] = ['assignee']

export function getEnabledFields(config?: NoteMetadataConfig): NoteMetadataFieldName[] {
	if (!config?.disabledFields) return ALL_METADATA_FIELDS
	return ALL_METADATA_FIELDS.filter((f) => !config.disabledFields!.includes(f))
}

export function getStatusOptions(config?: NoteMetadataConfig): NoteMetadataOption[] {
	return config?.statusOptions ?? DEFAULT_STATUS_OPTIONS
}
```

**Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/unit/note-metadata-types.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add shared/types/MandalaTypes.ts client/shapes/note-metadata-constants.ts tests/unit/note-metadata-types.test.ts
git commit -m "feat(mandala): add NoteMetadata types and constants"
```

---

## Task 2: Satellite Position Math

**Files:**
- Create: `client/shapes/satellite-utils.ts`
- Test: `tests/unit/satellite-utils.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/satellite-utils.test.ts
import { describe, expect, it } from 'vitest'
import {
	computeSatellitePositions,
	computeSubSatellitePositions,
} from '../../client/shapes/satellite-utils'

describe('computeSatellitePositions', () => {
	it('returns empty array for 0 badges', () => {
		expect(computeSatellitePositions(0, 100, 12)).toEqual([])
	})

	it('places 1 badge at top (270 degrees = 12 o clock)', () => {
		const positions = computeSatellitePositions(1, 100, 12)
		expect(positions).toHaveLength(1)
		// At 270 deg (top): x ≈ center, y ≈ center - radius - offset
		expect(positions[0].x).toBeCloseTo(100, 0) // center
		expect(positions[0].y).toBeCloseTo(-12, 0) // top edge + offset
	})

	it('places 2 badges opposite each other', () => {
		const positions = computeSatellitePositions(2, 100, 12)
		expect(positions).toHaveLength(2)
		// First at top, second at bottom
		expect(positions[0].y).toBeLessThan(positions[1].y)
	})

	it('places 4 badges at compass points', () => {
		const positions = computeSatellitePositions(4, 100, 12)
		expect(positions).toHaveLength(4)
	})

	it('all positions are outside the circle radius', () => {
		const radius = 50
		const offset = 8
		const positions = computeSatellitePositions(3, radius, offset)
		const center = radius
		for (const pos of positions) {
			const dist = Math.sqrt((pos.x - center) ** 2 + (pos.y - center) ** 2)
			expect(dist).toBeGreaterThanOrEqual(radius)
		}
	})
})

describe('computeSubSatellitePositions', () => {
	it('returns positions in an arc around the parent', () => {
		const parent = { x: 100, y: 0 }
		const noteCenter = { x: 50, y: 50 }
		const positions = computeSubSatellitePositions(parent, noteCenter, 3, 24)
		expect(positions).toHaveLength(3)
	})

	it('spreads sub-satellites in an arc away from note center', () => {
		const parent = { x: 112, y: 50 } // right side
		const noteCenter = { x: 50, y: 50 }
		const positions = computeSubSatellitePositions(parent, noteCenter, 3, 24)
		// All sub-satellites should be further from center than parent
		const parentDist = Math.sqrt((parent.x - noteCenter.x) ** 2 + (parent.y - noteCenter.y) ** 2)
		for (const pos of positions) {
			const dist = Math.sqrt((pos.x - noteCenter.x) ** 2 + (pos.y - noteCenter.y) ** 2)
			expect(dist).toBeGreaterThan(parentDist)
		}
	})
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/satellite-utils.test.ts`
Expected: FAIL — module doesn't exist.

**Step 3: Implement `client/shapes/satellite-utils.ts`**

```typescript
export interface SatellitePosition {
	x: number
	y: number
	angleDeg: number
}

/**
 * Compute positions for N satellites orbiting a circle.
 * The circle has its center at (radius, radius) — matching TLDraw note geometry
 * where the shape origin is top-left.
 *
 * @param count Number of satellites
 * @param radius Note circle radius
 * @param offset Distance from circle edge to satellite center
 * @returns Array of {x, y, angleDeg} positions in shape-local coordinates
 */
export function computeSatellitePositions(
	count: number,
	radius: number,
	offset: number,
): SatellitePosition[] {
	if (count === 0) return []

	const cx = radius
	const cy = radius
	const orbitRadius = radius + offset
	const startAngleDeg = 270 // 12 o'clock

	return Array.from({ length: count }, (_, i) => {
		const angleDeg = (startAngleDeg + (360 / count) * i) % 360
		const angleRad = (angleDeg * Math.PI) / 180
		return {
			x: cx + orbitRadius * Math.cos(angleRad),
			y: cy + orbitRadius * Math.sin(angleRad),
			angleDeg,
		}
	})
}

/**
 * Compute positions for sub-satellites that bloom outward from a parent satellite.
 * Sub-satellites are arranged in an arc centered on the parent's angle away from the note center.
 *
 * @param parent Parent satellite position (shape-local)
 * @param noteCenter Note center position (shape-local)
 * @param count Number of sub-satellites
 * @param subOffset Distance from parent to sub-satellite center
 * @param spreadDeg Total arc spread in degrees (default 120)
 * @returns Array of {x, y, angleDeg} positions in shape-local coordinates
 */
export function computeSubSatellitePositions(
	parent: { x: number; y: number },
	noteCenter: { x: number; y: number },
	count: number,
	subOffset: number,
	spreadDeg = 120,
): SatellitePosition[] {
	if (count === 0) return []

	// Direction from note center to parent
	const dx = parent.x - noteCenter.x
	const dy = parent.y - noteCenter.y
	const baseAngleRad = Math.atan2(dy, dx)
	const baseAngleDeg = (baseAngleRad * 180) / Math.PI

	// Spread sub-satellites in an arc centered on baseAngle
	const halfSpread = spreadDeg / 2
	const step = count > 1 ? spreadDeg / (count - 1) : 0

	return Array.from({ length: count }, (_, i) => {
		const offsetDeg = count > 1 ? -halfSpread + step * i : 0
		const angleDeg = baseAngleDeg + offsetDeg
		const angleRad = (angleDeg * Math.PI) / 180
		return {
			x: parent.x + subOffset * Math.cos(angleRad),
			y: parent.y + subOffset * Math.sin(angleRad),
			angleDeg,
		}
	})
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/satellite-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add client/shapes/satellite-utils.ts tests/unit/satellite-utils.test.ts
git commit -m "feat(mandala): satellite position math utilities"
```

---

## Task 3: SatelliteBadge Component

**Files:**
- Create: `client/shapes/SatelliteBadge.tsx`

This is a pure UI component. Testing will be done visually and via E2E tests later.

**Step 1: Implement `client/shapes/SatelliteBadge.tsx`**

```tsx
import { type PointerEvent, useCallback, useRef, useState } from 'react'
import type { NoteMetadataOption } from '../../shared/types/MandalaTypes'
import type { SatellitePosition } from './satellite-utils'
import { computeSubSatellitePositions } from './satellite-utils'

interface SatelliteBadgeProps {
	/** Position of this badge in shape-local coordinates */
	position: SatellitePosition
	/** The emoji/text to display */
	display: string
	/** Note center in shape-local coordinates */
	noteCenter: { x: number; y: number }
	/** Badge diameter in px */
	size: number
	/** Options for sub-satellite picker */
	options: NoteMetadataOption[]
	/** Include a remove option */
	showRemove: boolean
	/** Called when user picks a value */
	onSelect: (key: string) => void
	/** Called when user picks remove */
	onRemove: () => void
}

export function SatelliteBadge({
	position,
	display,
	noteCenter,
	size,
	options,
	showRemove,
	onSelect,
	onRemove,
}: SatelliteBadgeProps) {
	const [expanded, setExpanded] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	const allOptions = showRemove
		? [...options, { key: '__remove__', emoji: '✕', label: 'Remove' }]
		: options

	const subPositions = expanded
		? computeSubSatellitePositions(position, noteCenter, allOptions.length, size + 8)
		: []

	const handleBadgeClick = useCallback(
		(e: PointerEvent) => {
			e.stopPropagation()
			e.preventDefault()
			setExpanded((prev) => !prev)
		},
		[],
	)

	const handleOptionClick = useCallback(
		(key: string) => (e: PointerEvent) => {
			e.stopPropagation()
			e.preventDefault()
			if (key === '__remove__') {
				onRemove()
			} else {
				onSelect(key)
			}
			setExpanded(false)
		},
		[onSelect, onRemove],
	)

	const half = size / 2

	return (
		<>
			{/* Main badge */}
			<div
				ref={containerRef}
				onPointerDown={handleBadgeClick}
				style={{
					position: 'absolute',
					left: position.x - half,
					top: position.y - half,
					width: size,
					height: size,
					borderRadius: '50%',
					background: 'white',
					border: '2px solid #e0e0e0',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: size * 0.6,
					cursor: 'pointer',
					pointerEvents: 'all',
					zIndex: 10,
					transition: 'transform 0.15s ease-out',
					transform: expanded ? 'scale(1.15)' : 'scale(1)',
					boxShadow: expanded ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)',
				}}
			>
				{display}
			</div>

			{/* Sub-satellites */}
			{subPositions.map((subPos, i) => {
				const option = allOptions[i]
				return (
					<div
						key={option.key}
						onPointerDown={handleOptionClick(option.key)}
						style={{
							position: 'absolute',
							left: subPos.x - half,
							top: subPos.y - half,
							width: size,
							height: size,
							borderRadius: '50%',
							background: option.key === '__remove__' ? '#fee' : 'white',
							border: `2px solid ${option.key === '__remove__' ? '#f88' : '#ccc'}`,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: size * 0.6,
							cursor: 'pointer',
							pointerEvents: 'all',
							zIndex: 20,
							animation: `satellite-bloom-in 0.2s ease-out ${i * 0.03}s both`,
						}}
						title={option.label}
					>
						{option.emoji}
					</div>
				)
			})}
		</>
	)
}
```

**Step 2: Commit**

```bash
git add client/shapes/SatelliteBadge.tsx
git commit -m "feat(mandala): SatelliteBadge component with sub-satellite picker"
```

---

## Task 4: AddFieldSatellite Component

**Files:**
- Create: `client/shapes/AddFieldSatellite.tsx`

**Step 1: Implement `client/shapes/AddFieldSatellite.tsx`**

```tsx
import { type PointerEvent, useCallback, useState } from 'react'
import type { NoteMetadataFieldName, NoteMetadataOption } from '../../shared/types/MandalaTypes'
import type { SatellitePosition } from './satellite-utils'
import { computeSubSatellitePositions } from './satellite-utils'

/** Visual config for each field type shown in the "+" picker */
const FIELD_OPTIONS: Record<NoteMetadataFieldName, NoteMetadataOption> = {
	status: { key: 'status', emoji: '⭕', label: 'Status' },
	priority: { key: 'priority', emoji: '🔴', label: 'Priority' },
	assignee: { key: 'assignee', emoji: '👤', label: 'Assignee' },
	tags: { key: 'tags', emoji: '🏷️', label: 'Tags' },
	dueDate: { key: 'dueDate', emoji: '📅', label: 'Due Date' },
	progress: { key: 'progress', emoji: '📊', label: 'Progress' },
}

interface AddFieldSatelliteProps {
	position: SatellitePosition
	noteCenter: { x: number; y: number }
	size: number
	/** Fields available to add (not yet on the note, not disabled, not hidden) */
	availableFields: NoteMetadataFieldName[]
	/** Called when user picks a field to add */
	onAddField: (field: NoteMetadataFieldName) => void
	/** Whether the + button is visible (controlled by parent hover state) */
	visible: boolean
}

export function AddFieldSatellite({
	position,
	noteCenter,
	size,
	availableFields,
	onAddField,
	visible,
}: AddFieldSatelliteProps) {
	const [expanded, setExpanded] = useState(false)

	const options = availableFields.map((f) => FIELD_OPTIONS[f])
	const subPositions = expanded
		? computeSubSatellitePositions(position, noteCenter, options.length, size + 8)
		: []

	const handleClick = useCallback(
		(e: PointerEvent) => {
			e.stopPropagation()
			e.preventDefault()
			setExpanded((prev) => !prev)
		},
		[],
	)

	const handleFieldClick = useCallback(
		(field: NoteMetadataFieldName) => (e: PointerEvent) => {
			e.stopPropagation()
			e.preventDefault()
			onAddField(field)
			setExpanded(false)
		},
		[onAddField],
	)

	const half = size / 2

	if (!visible && !expanded) return null

	return (
		<>
			<div
				onPointerDown={handleClick}
				style={{
					position: 'absolute',
					left: position.x - half,
					top: position.y - half,
					width: size,
					height: size,
					borderRadius: '50%',
					background: 'white',
					border: '2px dashed #bbb',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: size * 0.7,
					cursor: 'pointer',
					pointerEvents: 'all',
					zIndex: 10,
					opacity: expanded ? 1 : 0.8,
					transition: 'opacity 0.2s ease-out, transform 0.15s ease-out',
					transform: expanded ? 'scale(1.15)' : 'scale(1)',
				}}
			>
				+
			</div>

			{subPositions.map((subPos, i) => {
				const option = options[i]
				return (
					<div
						key={option.key}
						onPointerDown={handleFieldClick(option.key as NoteMetadataFieldName)}
						style={{
							position: 'absolute',
							left: subPos.x - half,
							top: subPos.y - half,
							width: size,
							height: size,
							borderRadius: '50%',
							background: 'white',
							border: '2px solid #ccc',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: size * 0.6,
							cursor: 'pointer',
							pointerEvents: 'all',
							zIndex: 20,
							animation: `satellite-bloom-in 0.2s ease-out ${i * 0.03}s both`,
						}}
						title={option.label}
					>
						{option.emoji}
					</div>
				)
			})}
		</>
	)
}
```

**Step 2: Commit**

```bash
git add client/shapes/AddFieldSatellite.tsx
git commit -m "feat(mandala): AddFieldSatellite component for adding metadata fields"
```

---

## Task 5: NoteSatellites Container & CSS

**Files:**
- Create: `client/shapes/NoteSatellites.tsx`
- Create: `client/shapes/note-satellites.css`

**Step 1: Create CSS for animations**

```css
/* client/shapes/note-satellites.css */
@keyframes satellite-bloom-in {
	from {
		transform: scale(0);
		opacity: 0;
	}
	to {
		transform: scale(1);
		opacity: 1;
	}
}
```

**Step 2: Implement `client/shapes/NoteSatellites.tsx`**

This is the main container that reads `shape.meta.noteMetadata`, computes badge positions, and renders all satellites.

```tsx
import { useCallback, useState } from 'react'
import type { JsonObject, TLNoteShape } from 'tldraw'
import { useEditor } from 'tldraw'
import type { NoteMetadata, NoteMetadataFieldName } from '../../shared/types/MandalaTypes'
import { AddFieldSatellite } from './AddFieldSatellite'
import {
	ALL_METADATA_FIELDS,
	DEFAULT_PRIORITY_OPTIONS,
	DEFAULT_STATUS_OPTIONS,
	HIDDEN_FIELDS,
	getEnabledFields,
} from './note-metadata-constants'
import './note-satellites.css'
import { SatelliteBadge } from './SatelliteBadge'
import { computeSatellitePositions } from './satellite-utils'

const NOTE_BASE_SIZE = 200
const BADGE_SIZE = 24
const BADGE_OFFSET = 8

interface NoteSatellitesProps {
	shape: TLNoteShape
}

/** Get display emoji for a metadata field value */
function getFieldDisplay(field: NoteMetadataFieldName, metadata: NoteMetadata): string {
	switch (field) {
		case 'status': {
			const opt = DEFAULT_STATUS_OPTIONS.find((o) => o.key === metadata.status)
			return opt?.emoji ?? '⭕'
		}
		case 'priority': {
			const opt = DEFAULT_PRIORITY_OPTIONS.find((o) => o.key === metadata.priority)
			return opt?.emoji ?? '🔴'
		}
		case 'assignee':
			return '👤'
		case 'tags':
			return '🏷️'
		case 'dueDate':
			return '📅'
		case 'progress': {
			const p = metadata.progress
			return p ? `${p.done}/${p.total}` : '📊'
		}
		default:
			return '?'
	}
}

/** Get the fields that currently have values in the metadata */
function getActiveFields(metadata: NoteMetadata): NoteMetadataFieldName[] {
	const active: NoteMetadataFieldName[] = []
	if (metadata.status !== undefined) active.push('status')
	if (metadata.priority !== undefined) active.push('priority')
	if (metadata.assignee !== undefined) active.push('assignee')
	if (metadata.tags !== undefined && metadata.tags.length > 0) active.push('tags')
	if (metadata.dueDate !== undefined) active.push('dueDate')
	if (metadata.progress !== undefined) active.push('progress')
	return active
}

export function NoteSatellites({ shape }: NoteSatellitesProps) {
	const editor = useEditor()
	const [hovered, setHovered] = useState(false)

	const metadata = ((shape.meta as Record<string, unknown>)?.noteMetadata as NoteMetadata) ?? {}
	const enabledFields = getEnabledFields()
	const activeFields = getActiveFields(metadata)

	// Fields available to add: enabled, not active, not hidden
	const availableToAdd = enabledFields.filter(
		(f) => !activeFields.includes(f) && !HIDDEN_FIELDS.includes(f),
	)
	const showAddButton = availableToAdd.length > 0

	const radius = (NOTE_BASE_SIZE * shape.props.scale) / 2
	const badgeSize = BADGE_SIZE * shape.props.scale
	const offset = BADGE_OFFSET * shape.props.scale

	// Total satellites = active badges + (optionally) the + button
	const totalCount = activeFields.length + (showAddButton ? 1 : 0)
	const positions = computeSatellitePositions(totalCount, radius, offset + badgeSize / 2)

	const noteCenter = { x: radius, y: radius }

	const updateMetadata = useCallback(
		(update: Partial<NoteMetadata>) => {
			const existingMeta = (shape.meta as Record<string, unknown>) ?? {}
			const existingNoteMetadata = (existingMeta.noteMetadata as NoteMetadata) ?? {}
			editor.updateShape({
				id: shape.id,
				type: shape.type,
				meta: {
					...existingMeta,
					noteMetadata: { ...existingNoteMetadata, ...update },
				} as Partial<JsonObject>,
			})
		},
		[editor, shape.id, shape.type, shape.meta],
	)

	const removeField = useCallback(
		(field: NoteMetadataFieldName) => {
			const existingMeta = (shape.meta as Record<string, unknown>) ?? {}
			const existingNoteMetadata = { ...((existingMeta.noteMetadata as NoteMetadata) ?? {}) }
			delete existingNoteMetadata[field]
			editor.updateShape({
				id: shape.id,
				type: shape.type,
				meta: {
					...existingMeta,
					noteMetadata: existingNoteMetadata,
				} as Partial<JsonObject>,
			})
		},
		[editor, shape.id, shape.type, shape.meta],
	)

	const handleAddField = useCallback(
		(field: NoteMetadataFieldName) => {
			// Set a default value for the field
			switch (field) {
				case 'status':
					updateMetadata({ status: 'todo' })
					break
				case 'priority':
					updateMetadata({ priority: 'medium' })
					break
				case 'tags':
					updateMetadata({ tags: [] })
					break
				case 'dueDate':
					updateMetadata({ dueDate: new Date().toISOString().split('T')[0] })
					break
				case 'progress':
					updateMetadata({ progress: { done: 0, total: 1 } })
					break
				case 'assignee':
					updateMetadata({ assignee: '' })
					break
			}
		},
		[updateMetadata],
	)

	const handleSelectValue = useCallback(
		(field: NoteMetadataFieldName, key: string) => {
			switch (field) {
				case 'status':
					updateMetadata({ status: key })
					break
				case 'priority':
					updateMetadata({ priority: key as NoteMetadata['priority'] })
					break
			}
		},
		[updateMetadata],
	)

	const getOptionsForField = (field: NoteMetadataFieldName) => {
		switch (field) {
			case 'status':
				return DEFAULT_STATUS_OPTIONS
			case 'priority':
				return DEFAULT_PRIORITY_OPTIONS
			default:
				return []
		}
	}

	return (
		<div
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: radius * 2,
				height: radius * 2,
				pointerEvents: 'none',
			}}
		>
			{/* Active field badges */}
			{activeFields.map((field, i) => (
				<SatelliteBadge
					key={field}
					position={positions[i]}
					display={getFieldDisplay(field, metadata)}
					noteCenter={noteCenter}
					size={badgeSize}
					options={getOptionsForField(field)}
					showRemove={true}
					onSelect={(key) => handleSelectValue(field, key)}
					onRemove={() => removeField(field)}
				/>
			))}

			{/* Add field button */}
			{showAddButton && positions[activeFields.length] && (
				<AddFieldSatellite
					position={positions[activeFields.length]}
					noteCenter={noteCenter}
					size={badgeSize}
					availableFields={availableToAdd}
					onAddField={handleAddField}
					visible={hovered}
				/>
			)}
		</div>
	)
}
```

**Step 3: Commit**

```bash
git add client/shapes/NoteSatellites.tsx client/shapes/note-satellites.css
git commit -m "feat(mandala): NoteSatellites container component"
```

---

## Task 6: Wire Into CircularNoteShapeUtil

**Files:**
- Modify: `client/shapes/CircularNoteShapeUtil.tsx`

**Step 1: Override `component()` to render satellites**

Add a `component()` override to `CircularNoteShapeUtil` that wraps the parent's component with `NoteSatellites`:

```tsx
// Add imports at top of CircularNoteShapeUtil.tsx
import { NoteSatellites } from './NoteSatellites'

// Add inside the class, after getGeometry():
override component(shape: TLNoteShape) {
	const baseComponent = super.component(shape)
	return (
		<>
			{baseComponent}
			<NoteSatellites shape={shape} />
		</>
	)
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `bun run lint`
Expected: PASS (or fix any issues)

**Step 4: Commit**

```bash
git add client/shapes/CircularNoteShapeUtil.tsx
git commit -m "feat(mandala): wire NoteSatellites into CircularNoteShapeUtil"
```

---

## Task 7: Agent Action — `set_note_metadata`

**Files:**
- Modify: `shared/schema/AgentActionSchemas.ts`
- Create: `client/actions/SetNoteMetadataActionUtil.ts`
- Modify: `client/modes/AgentModeDefinitions.ts`

**Step 1: Add Zod schema to `shared/schema/AgentActionSchemas.ts`**

Add after the existing `SetMetadataAction` definition (around line 467):

```typescript
// Set Note Metadata Action (universal note metadata)
export const SetNoteMetadataAction = z
	.object({
		_type: z.literal('set_note_metadata'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		metadata: z.record(z.unknown()),
	})
	.meta({
		title: 'Set Note Metadata',
		description:
			'Sets universal metadata on a note shape (status, priority, tags, dueDate, progress). Partial updates are merged into existing metadata.',
	})

export type SetNoteMetadataAction = z.infer<typeof SetNoteMetadataAction>
```

Also add `SetNoteMetadataAction` to the `AgentAction` union type and the `AGENT_ACTIONS` array (follow the existing pattern — find where `SetMetadataAction` is referenced and add `SetNoteMetadataAction` alongside it).

**Step 2: Create `client/actions/SetNoteMetadataActionUtil.ts`**

```typescript
import type { JsonObject, TLShapeId } from 'tldraw'
import type { SetNoteMetadataAction } from '../../shared/schema/AgentActionSchemas'
import type { NoteMetadata } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const SetNoteMetadataActionUtil = registerActionUtil(
	class SetNoteMetadataActionUtil extends AgentActionUtil<SetNoteMetadataAction> {
		static override type = 'set_note_metadata' as const

		override getInfo(action: Streaming<SetNoteMetadataAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<SetNoteMetadataAction>, _helpers: AgentHelpers) {
			if (!action.complete) return action
			if (!action.shapeId) return null
			if (!action.metadata || typeof action.metadata !== 'object') return null
			return action
		}

		override applyAction(action: Streaming<SetNoteMetadataAction>) {
			if (!action.complete) return

			const { editor } = this
			const shapeId = `shape:${action.shapeId}` as TLShapeId
			const shape = editor.getShape(shapeId)
			if (!shape || shape.type !== 'note') return

			const existingMeta = (shape.meta as Record<string, unknown>) ?? {}
			const existingNoteMetadata = (existingMeta.noteMetadata as NoteMetadata) ?? {}
			const merged = { ...existingNoteMetadata, ...action.metadata }

			editor.updateShape({
				id: shape.id,
				type: shape.type,
				meta: {
					...existingMeta,
					noteMetadata: merged,
				} as Partial<JsonObject>,
			})
		}
	},
)
```

**Step 3: Register in `client/modes/AgentModeDefinitions.ts`**

Add import at the top (after `SetMetadataActionUtil` import):

```typescript
import { SetNoteMetadataActionUtil } from '../actions/SetNoteMetadataActionUtil'
```

Add `SetNoteMetadataActionUtil.type` to the `actions` array in both the `'working'` and `'mandala'` modes, right after `SetMetadataActionUtil.type`.

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add shared/schema/AgentActionSchemas.ts client/actions/SetNoteMetadataActionUtil.ts client/modes/AgentModeDefinitions.ts
git commit -m "feat(mandala): set_note_metadata agent action"
```

---

## Task 8: FocusedShape Conversion Pipeline

**Files:**
- Modify: `shared/format/FocusedShape.ts:56-66`
- Modify: `shared/format/convertTldrawShapeToFocusedShape.ts:231-244`
- Modify: `shared/format/convertFocusedShapeToTldrawShape.ts:525-574`

**Step 1: Add `noteMetadata` to `FocusedNoteShape` schema**

In `shared/format/FocusedShape.ts`, modify the `FocusedNoteShape` definition (line 56-64):

```typescript
const FocusedNoteShape = z.object({
	_type: z.literal('note'),
	color: FocusedColor,
	note: z.string(),
	shapeId: SimpleShapeIdSchema,
	text: FocusedLabel.optional(),
	x: z.number(),
	y: z.number(),
	noteMetadata: z.record(z.unknown()).optional(),
})
```

**Step 2: Extract `noteMetadata` in `convertTldrawShapeToFocusedShape.ts`**

Modify `convertNoteShapeToFocused` (around line 231) to include `noteMetadata`:

```typescript
function convertNoteShapeToFocused(editor: Editor, shape: TLNoteShape): FocusedNoteShape {
	const util = editor.getShapeUtil(shape)
	const text = util.getText(shape)
	const bounds = getSimpleBounds(editor, shape)
	const meta = shape.meta as Record<string, unknown>
	const noteMetadata = meta?.noteMetadata as Record<string, unknown> | undefined

	return {
		_type: 'note',
		color: shape.props.color,
		note: (meta.note as string) ?? '',
		shapeId: convertTldrawIdToSimpleId(shape.id),
		text: text ?? '',
		x: bounds.x,
		y: bounds.y,
		...(noteMetadata && Object.keys(noteMetadata).length > 0 ? { noteMetadata } : {}),
	}
}
```

**Step 3: Write `noteMetadata` in `convertFocusedShapeToTldrawShape.ts`**

Modify `convertNoteShapeToTldrawShape` (around line 525) to preserve `noteMetadata`:

In the `meta` object (line 569-571), change from:

```typescript
meta: {
	note: focusedShape.note ?? defaultNoteShape.meta?.note ?? '',
},
```

to:

```typescript
meta: {
	note: focusedShape.note ?? defaultNoteShape.meta?.note ?? '',
	...((focusedShape as any).noteMetadata ? { noteMetadata: (focusedShape as any).noteMetadata } : {}),
	...(defaultNoteShape.meta?.noteMetadata && !(focusedShape as any).noteMetadata
		? { noteMetadata: defaultNoteShape.meta.noteMetadata }
		: {}),
},
```

Note: The `as any` cast is needed because `FocusedNoteShape` in the function signature doesn't include the optional `noteMetadata` field in the imported type. Alternatively, import the updated type.

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Run existing tests**

Run: `bun run test`
Expected: All existing tests still PASS.

**Step 6: Commit**

```bash
git add shared/format/FocusedShape.ts shared/format/convertTldrawShapeToFocusedShape.ts shared/format/convertFocusedShapeToTldrawShape.ts
git commit -m "feat(mandala): noteMetadata in FocusedShape conversion pipeline"
```

---

## Task 9: Verify & Smoke Test

**Step 1: Run full verification**

Run: `bun run verify`
Expected: All lint, typecheck, and tests PASS.

**Step 2: Manual smoke test**

Run: `bun run dev`

1. Open the app in browser
2. Create a note on the canvas
3. Hover over the note — verify `+` satellite appears
4. Click `+` — verify field options bloom outward
5. Pick "Status" — verify status badge appears with default "⭕ To Do"
6. Click the status badge — verify status options bloom as sub-satellites
7. Pick "✅ Done" — verify badge updates
8. Click the status badge again — pick "✕ Remove" — verify badge disappears
9. Mouse leave — verify `+` fades out

**Step 3: Commit any fixes**

If any issues found during smoke testing, fix and commit with descriptive messages.

---

## Task 10: Final Commit & Cleanup

**Step 1: Run full verification one more time**

Run: `bun run verify`
Expected: PASS

**Step 2: Review all changes**

Run: `git log --oneline feat/note-metadata-satellites ^main`

Verify the commit history is clean and each commit is focused.
