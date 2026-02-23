# Mandala Overlap Fix — Design

## Problem

When a new mandala is created, it's always placed at the viewport center (`App.tsx:485-523`). If a mandala already exists there, the new one stacks directly on top. Since mandalas can't be selected or moved, the overlapping mandala is unrecoverable.

## Requirements

- Multiple mandalas supported on the same page
- New mandalas must not overlap existing ones
- Mandalas must be draggable (but locked by default)
- Notes snapped inside a mandala must move with it when dragged
- Active mandala tracking must work with multiple mandalas

## Design

### 1. Smart Auto-Placement

**File**: `client/App.tsx` — `handleSelectTemplate`

When creating a new mandala:
- Query all existing mandala shapes on the current page
- If none exist, place at viewport center (current behavior)
- If mandalas exist, find a non-overlapping position by placing to the **right** of the rightmost existing mandala with an 80px gap
- After placing, pan/zoom to show the new mandala

Extract a utility function: `findNonOverlappingPosition(editor, newSize) => {x, y}`

### 2. Locked by Default

**File**: `client/App.tsx` — `handleSelectTemplate`

Set `isLocked: true` on the created shape:

```ts
editor.createShape({
  type: 'mandala',
  x: position.x,
  y: position.y,
  isLocked: true,
  props: { ... }
})
```

While locked:
- Single click → zoom to cell (existing `onClick` behavior)
- Double click → create note in cell (existing `onDoubleClick` behavior)
- Cannot be dragged or selected

### 3. Unlockable via TLDraw Defaults

TLDraw provides built-in lock/unlock UX:
- Right-click context menu → "Unlock"
- Lock icon in selection toolbar

Once unlocked:
- Mandala can be selected and dragged
- Selection bounds become visible

### 4. Show Selection Bounds When Unlocked

**File**: `client/shapes/MandalaShapeUtil.tsx`

Remove or conditionalize these overrides:
- `hideSelectionBoundsBg()` — remove (return `false`)
- `hideSelectionBoundsFg()` — remove (return `false`)
- `hideResizeHandles()` — keep (resize stays disabled)
- `hideRotateHandle()` — keep (rotation stays disabled)

### 5. Notes Move with Mandala (Already Working)

`mandala-snap.ts` already reparents notes to the mandala via `editor.reparentShapes(ids, mandala.id)`. TLDraw moves children with parents automatically. No changes needed — just verify behavior.

### 6. Active Mandala Tracking (Already Working)

`active-framework.ts` tracks `activeMandalaId`. Both `onClick` and `onDoubleClick` already call `setActiveMandalaId(shape.id)`. No changes needed.

## Files to Modify

| File | Change |
|------|--------|
| `client/App.tsx` | Auto-placement logic + `isLocked: true` |
| `client/shapes/MandalaShapeUtil.tsx` | Remove hidden selection bounds overrides |

## Files to Verify (No Changes Expected)

| File | Verify |
|------|--------|
| `client/lib/mandala-snap.ts` | Notes still reparent correctly with draggable mandala |
| `client/lib/frameworks/active-framework.ts` | Active tracking works with multiple mandalas |

## Testing

- Unit test: `findNonOverlappingPosition` returns correct offsets
- Integration test: creating two mandalas produces non-overlapping positions
- Manual: unlock mandala, drag it, verify notes move along
- Manual: create mandala, verify it's locked, verify cell clicks still work
