# Streaming Cell Fill

## Problem

The current `fill_cell` action requires the LLM to generate ~30 tokens per note (`_type`, `intent`, `mandalaId`, `cellId`, `content`). Each action goes through sanitize → apply → create shape → update state → zoom. For a mandala with 15+ notes, this is slow and token-heavy.

## Solution

Replace the action-per-note approach with a streaming cell-content mapping. The LLM generates a single JSON object with `message` + `cells`, and the server emits lightweight `cell_fill` events as each content string completes in the stream.

### LLM Response Format

```json
{
  "message": "Here's what I see in your situation...",
  "cells": {
    "past-events": ["Lost my job", "Moved to new city"],
    "past-thoughts": ["Felt overwhelmed"],
    "evidence": ["Got new job quickly", "Friends supported me"]
  }
}
```

### Architecture

Three changes, same infrastructure:

#### 1. Server: `AgentService.streamActionsWithModel()`

New parsing branch that detects the `{ message, cells }` format (presence of `cells` key). Tracks which `cellId[index]` pairs have been emitted. For each new complete string in `cells`, yields:

```ts
{ _type: 'cell_fill', cellId: 'past-events', content: 'Lost my job', complete: true }
```

For the message field, yields standard message actions as content grows:

```ts
{ _type: 'message', text: 'Here\'s what I see...', complete: false }
```

The existing SSE transport (`TransformStream` + `data: ...\n\n`) and client SSE reader are unchanged.

#### 2. Client: `StreamingCellFillActionUtil`

A new action util registered as `cell_fill`. Reuses the core note-creation logic from `FillCellActionUtil`:

- Resolve mandala (same `resolveMandalaId` fallback)
- Compute cell layout (`computeCellContentLayout`)
- Create note shape with color from `NODULE_COLOR_SEQUENCE`
- Update `MandalaState` with new shapeId
- Zoom camera to new note (`editor.zoomToBounds`)

The old `FillCellActionUtil` stays in the codebase but is removed from the mandala mode's action list.

#### 3. Prompt: Simpler schema for mandala mode

Instead of the full action union schema, mandala mode gets:

```
Return a JSON object with two fields:
- "message": your response to the user (string)
- "cells": an object mapping cellId to an array of short labels (Record<string, string[]>)
```

Valid cell IDs are listed per framework as before.

### Camera "Guided Tour"

Each `cell_fill` event triggers `zoomToBounds` on the new note, identical to current behavior. Since events arrive one at a time as strings complete in the stream, the camera smoothly pans from cell to cell — like auto-scroll follows streaming text.

### Token Savings

- Before: ~30 tokens/note (action object with type, intent, mandalaId, cellId, content)
- After: ~5 tokens/note (just the content string in the cells mapping)
- ~6x reduction in fill tokens, plus smaller system prompt (no action schema)

### What Changes vs. What Stays

| Component | Status |
|---|---|
| `AgentService.streamActionsWithModel()` | Modified: new branch for `cells` format |
| `buildSystemPrompt()` | Modified: simpler schema for mandala mode |
| `StreamingCellFillActionUtil` (new) | New: thin wrapper reusing FillCell positioning |
| `AgentActionSchemas.ts` | New `CellFillAction` schema added |
| Mandala mode action list | Swap `fill_cell` -> `cell_fill` |
| `FillCellActionUtil` | Kept intact, removed from active action list |
| SSE transport, client action loop | No changes |
| Cell layout, positioning, colors | No changes (reused directly) |
| `closeAndParseJson` / `tryParseStreamingJson` | No changes |

### Risk Mitigation

- Old `FillCellActionUtil` kept in codebase for easy rollback
- New path reuses identical note creation logic (positioning, colors, zoom)
- Same `tryParseStreamingJson` parser handles incremental JSON
