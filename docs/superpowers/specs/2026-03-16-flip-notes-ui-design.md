# Flip Notes UI Design

## Overview

Flippable notes allow each mandala note to have two sides: **past-present** (how things are now) and **present-future** (how the user wants them to be). This is core to the Yinflow methodology — articulating change starts by contrasting the current state with an aspiration.

A note with only one side represents contentment (no change desired). A note with both sides represents change articulated. When past-present eventually matches present-future, transformation is achieved.

## Data Model

### Shape Meta Additions

Each note shape gains two new fields in `shape.meta`:

- `flipContent: RichTextContent | null` — the alternate side's text. `null` = single-sided note.
- `flipTense: "past-present" | "present-future" | null` — which tense `flipContent` holds. `null` = single-sided.

The shape's existing `richText` prop always holds the **currently visible** side. The existing `elementMetadata.tense` always reflects the currently visible tense.

Since `meta` is typed as `JsonObject` (untyped), all access uses `(shape.meta as Record<string, unknown>)` casts — consistent with how `elementMetadata` is accessed in `SetMetadataActionUtil` and `GetMetadataActionUtil`. The `tense` field is a cross-cutting metadata property that lives on `meta.elementMetadata` alongside the cell-type-specific metadata (e.g., `PastEventsMetadata`). Existing notes without `tense` are treated as `"past-present"` by default.

### Flip Swap Operation

The swap **must be atomic** — a single `editor.updateShape()` call that updates both `props.richText` and `meta` together:

```typescript
editor.updateShape({
  id: noteId,
  type: 'note',
  props: { richText: shape.meta.flipContent },
  meta: {
    ...shape.meta,
    flipContent: shape.props.richText,
    flipTense: shape.meta.elementMetadata?.tense ?? 'past-present',
    elementMetadata: {
      ...shape.meta.elementMetadata,
      tense: shape.meta.flipTense,
    },
  },
})
```

This prevents intermediate states where `richText` and `tense` are out of sync.

### Mandala-Level View State

Add `viewTense` to `MandalaShapeProps` with explicit type declaration and validator:

```typescript
// In mandala shape props definition — use T.string, matching the zoomMode pattern
viewTense: T.string,
```

- `viewTense: "past-present" | "present-future"` — controls bulk toggle state. Defaults to `"past-present"`.

When `viewTense` changes: iterate all notes in the mandala. For each dual-sided note (has `flipContent`), if its `elementMetadata.tense` doesn't match `viewTense`, perform the swap. Single-sided notes are skipped entirely — they represent contentment and don't participate in the toggle.

The bulk swap uses `editor.batch()` to wrap all individual `updateShape` calls into a single undo step and avoid redundant re-renders.

## Rendering

### Flip Icon

- Appears **only** on dual-sided notes (where `meta.flipContent` is non-null)
- Visible on hover — a 24px circle with ↻ symbol, positioned top-right of the note
- Clicking the icon performs the swap on that single note
- Uses `onPointerDown` + `stopPropagation` to avoid triggering tldraw selection

### Note Colors by Tense

- **Past-present**: warm color (current note color — unchanged from existing behavior)
- **Present-future**: green tint — `background: #d1fae5`, `border: #10b981`, `text: #065f46`
- Color override is render-time only: `CircularNoteShapeUtil.component()` checks `meta.elementMetadata?.tense === 'present-future'` and overrides background/border colors in the JSX. The shape's `color` prop is **not** changed — it preserves the original palette color for the past-present side.

No tense label below the note — colors alone distinguish the tenses.

### Flip Animation

Brief CSS scale transform: `scaleX` 1 → 0 → 1 over ~300ms to simulate a card flip. Content swaps at the midpoint (scaleX = 0).

## Bulk Toggle

### Location

In the toolbar area near the Focus/Navigate zoom mode toggle — **not** on the mandala itself.

### Appearance

A 36px circle icon button with ↻ icon. Small label below showing current mode: "PAST-PRESENT" or "PRESENT-FUTURE".

### Behavior

- Clicking toggles `mandala.props.viewTense` between the two values
- All dual-sided notes whose visible tense doesn't match the new `viewTense` are swapped
- Single-sided notes are unaffected

### Visibility

Only shown when at least one note in the mandala has `flipContent`. Hidden otherwise.

## Agent Layer

### `flip_note` Action Schema

```typescript
{
  _type: "flip_note",
  intent: string,
  mandalaId: SimpleShapeId,
  noteId: SimpleShapeId,       // the existing note to add/update a flip side on
  content: string,             // text for the other side
}
```

### `FlipNoteActionUtil`

**`sanitizeAction`:**
- Validate mandala exists
- Validate note exists and belongs to the mandala

**`applyAction`:**
1. Set `meta.flipContent` to `toRichText(content)`
2. If note already has `flipContent`, this overwrites it (agent updates existing flip side)
3. Set `meta.flipTense` to the opposite of the note's current `elementMetadata.tense` (if current tense is `"past-present"`, flipTense = `"present-future"`, and vice versa)
4. If `elementMetadata.tense` is not set, default it to `"past-present"` and set `flipTense` to `"present-future"`
5. Do NOT auto-flip — note stays showing the current side

### Registration

- Add `FlipNoteAction` schema to `AgentActionSchemas.ts`
- Create `FlipNoteActionUtil` in `client/actions/`
- Register in both `working` and `mandala` modes in `AgentModeDefinitions.ts`
- Add `hasFlipNote` flag to `getSystemPromptFlags.ts`
- Add action-specific prompt guidance in `life-map-section.ts` behind `flagged(flags.hasFlipNote, ...)`. Note: the existing conceptual "Flippable Notes Guidance" section (already in the prompt) remains ungated — it describes the concept. The flagged section adds only the `flip_note` action usage instructions.
- Include in hybrid streaming format's action schemas (actions array in cells format)

### Prompt Guidance

Behind `flagged(flags.hasFlipNote)`:
- Use `flip_note` when the user expresses dissatisfaction or desire for change
- Don't flip prematurely — let dissatisfaction surface naturally
- Content should be concrete and identity-aligned, not vague aspirations
- After flipping, the note gains a green "other side" accessible via the flip icon or bulk toggle
- To update an existing flip side, call `flip_note` again with the same noteId and new content

### New Notes and Initial Tense

All note creation paths must set `elementMetadata.tense` to the mandala's current `viewTense`:

- `StreamingCellFillActionUtil.ts` — agent cell fill (streaming format)
- `FillCellActionUtil.ts` — agent cell fill (legacy format)
- `MandalaShapeUtil.onDoubleClick` — user double-click creation

Notes start as single-sided with no `flipContent` until `flip_note` is called.

## Key Files

- `client/shapes/CircularNoteShapeUtil.tsx` — flip icon rendering, color override, flip animation
- `client/shapes/MandalaShapeUtil.tsx` — `viewTense` prop + validator, bulk toggle logic, `onDoubleClick` tense init
- `client/components/ZoomModeToggle.tsx` — bulk toggle button (nearby in toolbar)
- `shared/schema/AgentActionSchemas.ts` — FlipNoteAction schema
- `client/actions/FlipNoteActionUtil.ts` — action util (new file)
- `client/actions/StreamingCellFillActionUtil.ts` — add tense init on note creation
- `client/actions/FillCellActionUtil.ts` — add tense init on note creation (legacy path)
- `client/modes/AgentModeDefinitions.ts` — registration
- `worker/prompt/getSystemPromptFlags.ts` — hasFlipNote flag
- `worker/prompt/sections/life-map-section.ts` — prompt guidance
- `worker/prompt/buildSystemPrompt.ts` — hybrid format includes flip_note
