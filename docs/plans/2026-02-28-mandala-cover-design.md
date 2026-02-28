# Mandala Cover System Design

## Overview

A cover system for mandalas that displays an opaque overlay with a text carousel on top of the mandala shape. Used as the initial state when a mandala is first created — the user sees rotating questions before interacting. Clicking a question sends it as an agent message to chat, opens the chat sidebar, and dismisses the cover.

## Terminology

- **Root cell**: the center circle of a mandala (e.g., "evidence" in emotions map, "essence" in life map)
- **Mandala**: the whole shape, all cells combined
- **Cover**: an opaque overlay that can be placed over the entire mandala (mandala-level cover). Future: group-level covers over slices like "past"

## Data Model

### New types (MandalaTypes.ts)

```typescript
interface CoverConfig {
  active: boolean
  content?: CoverContent
}

interface CoverContent {
  type: 'text-carousel'
  slides: string[]
  intervalMs: number  // default 5000
}
```

### Shape prop

New optional prop on mandala shape: `cover: CoverConfig | null`. Defaults to `null`.

### Framework definition

New optional field on `FrameworkEntry`:

```typescript
initialCover?: CoverContent  // per-framework initial carousel content
```

## Component Architecture

```
MandalaInteractive()
  -> SunburstSvg
  -> ZoomModeToggle
  -> MandalaCover        (new, absolute positioned, full w x h coverage)
      -> TextCarousel    (cycles slides with fade transitions)
```

### MandalaCover (new file: client/components/MandalaCover.tsx)

- Renders only when `cover?.active === true`
- Opaque div covering the full mandala dimensions
- Contains TextCarousel
- Handles click dismiss flow

### TextCarousel

- Cycles through `slides` array on `intervalMs` interval
- Fade in/fade out CSS transitions (~500ms crossfade)
- Autoplay, infinite loop
- Clickable — triggers dismiss flow with current slide text

## Dismiss Flow

When user clicks the carousel:

1. Capture current slide text
2. Send as agent message to chat (role: assistant)
3. Open chat sidebar via ChatPanelContext
4. Focus chat input field
5. Fade out the cover overlay (~500ms)
6. Update mandala shape prop: `cover.active = false`

## Integration Points

### Mandala creation (App.tsx handleSelectTemplate)

After `editor.createShape()`, if the framework has `initialCover`, set cover prop:
```typescript
cover: { active: true, content: framework.initialCover }
```

### Chat integration

- Agent message injection via existing agent/chat API
- Sidebar open via `setChatPanelOpen(true)` from ChatPanelContext
- Input focus via exposed `focusChatInput()` or ref

### Interaction blocking

Cover div sits on top and captures all pointer events, preventing mandala interaction (zoom, cell selection) while active.

## Emotions Map Content

```typescript
initialCover: {
  type: 'text-carousel',
  slides: [
    "How do I resolve these emotions?",
    "What's really behind this feeling?",
    "How can I stop ruminating about this?",
    "Why is this concerning me so much?",
    "What am I not seeing about this situation?"
  ],
  intervalMs: 5000
}
```

## Scope

- Mandala-level covers only (not group-level)
- Text carousel cover content type only
- Emotions map initial cover content
- Fade in/fade out transitions (no particle effects)
