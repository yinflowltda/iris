# Note Metadata Satellites — Design

## Summary

Add visual metadata badges ("satellites") that orbit circular notes. Each note can display status, priority, tags, due date, and progress as small badge icons positioned around its edge. All fields are available by default on every map, but start hidden — users add them progressively via a `+` satellite that appears on hover.

## Data Model

### `NoteMetadata` (stored in `shape.meta.noteMetadata`)

```typescript
interface NoteMetadata {
  status?: string                        // key like 'todo', 'in-progress', 'done', 'blocked'
  priority?: 'high' | 'medium' | 'low'
  assignee?: string                      // freeform text (future: user ID)
  tags?: string[]                        // freeform tag strings
  dueDate?: string                       // ISO date string
  progress?: { done: number; total: number }
}
```

Each field is optional. A note with no `noteMetadata` (or `{}`) shows zero badges.

Coexists alongside the existing `shape.meta.elementMetadata` (domain-specific therapy metadata). They are independent systems.

### Map-Level Configuration (optional override)

All metadata fields are **enabled by default** on every framework. Maps only declare config to customize or disable:

```typescript
// On TreeMapDefinition (optional)
interface NoteMetadataConfig {
  disabledFields?: Array<'status' | 'priority' | 'assignee' | 'tags' | 'dueDate' | 'progress'>
  statusOptions?: Array<{ key: string; emoji: string; label: string }>
}
```

No config = all fields available with default options.

### Default Status Options

```typescript
const DEFAULT_STATUS_OPTIONS = [
  { key: 'todo',        emoji: '⭕', label: 'To Do' },
  { key: 'in-progress', emoji: '🟡', label: 'In Progress' },
  { key: 'done',        emoji: '✅', label: 'Done' },
  { key: 'blocked',     emoji: '⛔', label: 'Blocked' },
]
```

### Default Priority Options

```typescript
const DEFAULT_PRIORITY_OPTIONS = [
  { key: 'high',   emoji: '🔴', label: 'High' },
  { key: 'medium', emoji: '🟠', label: 'Medium' },
  { key: 'low',    emoji: '🟢', label: 'Low' },
]
```

## Visual Design

### Satellite Badge Layout

Badges orbit the circular note at evenly-distributed angular positions:

```
        [status 🟡]
           |
  [tag]----●----[priority 🔴]
           |
        [+ add]
```

- Each badge is a small circle (~24px diameter, scaled with the note's `scale` prop)
- Positioned at the note's edge, offset outward by ~8px
- With N badges, each sits at `(360 / N) * i` degrees around the circle
- The `+` badge is always last in the orbital sequence
- As badges are added/removed, all badges redistribute evenly with a smooth animation

### Progressive Disclosure

1. **Fresh note**: Clean circle with text. No satellites visible.
2. **On hover**: `+` satellite fades in at the first orbital position.
3. **Click `+`**: Sub-satellites bloom outward showing available fields.
4. **Pick a field**: Badge appears, immediately shows value picker as sub-satellites.
5. **Pick a value**: Badge shows selected value. `+` shifts to next position.
6. **On mouse leave**: `+` fades out (unless sub-satellites are expanded). Active badges remain visible always.

### The `+` Satellite

- Hidden by default, fades in on note hover
- Fades out on mouse leave IF no sub-satellites are expanded
- After adding a field, stays visible (user may want to add more)
- Only shows fields not yet added to the note
- When all fields are added, `+` no longer appears

## Interaction: Sub-Satellite Editing

When a user clicks any satellite badge, its possible values appear as sub-satellites:

1. **Badge pulses** to indicate selection
2. **Sub-satellites bloom outward** in an arc around the parent badge, animating from the parent's position outward
3. **User clicks a value** — it animates back into the parent badge, parent updates to show the new value
4. **User clicks elsewhere** — sub-satellites animate back and collapse (cancel)

### Sub-satellite options per field

| Field | Sub-satellite options |
|-------|---------------------|
| Status | `⭕ To Do`, `🟡 In Progress`, `✅ Done`, `⛔ Blocked`, `✕ Remove` |
| Priority | `🔴 High`, `🟠 Medium`, `🟢 Low`, `✕ Remove` |
| Assignee | (hidden for now — future: user picker) |
| Tags | Text input sub-satellite + existing tags as chips, `✕ Remove` |
| Due Date | Date picker sub-satellite, `✕ Remove` |
| Progress | Increment/decrement controls, `✕ Remove` |

Every field includes a `✕ Remove` sub-satellite that clears the field and removes the badge.

### Animation Spec

- **Bloom out**: sub-satellites scale from 0 to 1 and translate from parent center outward, staggered by 30ms each, easing `ease-out` ~200ms
- **Collapse**: reverse animation, same timing
- **Badge reposition**: when badges are added/removed, all badges smoothly transition to new angular positions over ~250ms

## Rendering Architecture

All rendering within `CircularNoteShapeUtil`:

- `component()` renders a `<NoteSatellites>` React component as an overlay
- `NoteSatellites` reads `shape.meta.noteMetadata` and the map's `noteMetadataConfig`
- Each badge is a `<SatelliteBadge>` component managing its own expand/collapse state
- The `+` badge is a `<AddFieldSatellite>` component
- Badges use `pointerEvents: 'all'` + `onPointerDown` + `stopPropagation` (matching established TLDraw custom element pattern)
- `getGeometry()` unchanged — badges are visual overlays, not part of shape geometry
- Badge positions computed relative to note center and radius

## Agent Integration

### Reading metadata

The `FocusedNoteShape` conversion pipeline includes `noteMetadata` so the agent sees current values:

```typescript
// In convertTldrawShapeToFocusedShape
type FocusedNoteShape = {
  // ... existing fields
  noteMetadata?: NoteMetadata
}
```

### Setting metadata

Extend the existing `set_metadata` action (or add `set_note_metadata`) to let the agent set universal metadata fields:

```typescript
// Agent action
{ _type: 'set_note_metadata', shapeId: 'element-5', metadata: { status: 'done', priority: 'high' } }
```

### AI visibility

The agent's prompt parts include note metadata when present, so it can reason about task status, priorities, etc.

## Files to Create/Modify

| File | Change |
|------|--------|
| `shared/types/MandalaTypes.ts` | Add `NoteMetadata`, `NoteMetadataConfig` types |
| `shared/types/MandalaTypes.ts` | Add `noteMetadataConfig?` to `TreeMapDefinition` |
| `client/shapes/CircularNoteShapeUtil.tsx` | Render `<NoteSatellites>` in component |
| `client/shapes/NoteSatellites.tsx` | **New** — satellite badge container component |
| `client/shapes/SatelliteBadge.tsx` | **New** — individual badge with sub-satellite expand |
| `client/shapes/AddFieldSatellite.tsx` | **New** — the `+` badge for adding fields |
| `client/shapes/satellite-utils.ts` | **New** — orbital position math, animation helpers |
| `shared/format/FocusedShape.ts` | Add `noteMetadata?` to `FocusedNoteShape` |
| `shared/format/convertTldrawShapeToFocusedShape.ts` | Extract `noteMetadata` from meta |
| `shared/format/convertFocusedShapeToTldrawShape.ts` | Write `noteMetadata` to meta |
| `shared/schema/AgentActionSchemas.ts` | Add `set_note_metadata` action schema |
| `client/actions/SetNoteMetadataActionUtil.ts` | **New** — apply note metadata action |
| `client/modes/AgentModeDefinitions.ts` | Register new action in relevant modes |

## Out of Scope (Future)

- Assignee field UI (data model included, UI hidden)
- Collaborative assignee picker with real user accounts
- Filtering/searching notes by metadata
- Bulk metadata editing
- Metadata-based note coloring or sizing
