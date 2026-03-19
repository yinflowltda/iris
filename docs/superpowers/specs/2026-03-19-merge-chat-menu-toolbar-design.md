# Merge Chat Sidebar + Menu Bar + Toolbar

**Date:** 2026-03-19
**Status:** Draft

## Problem

The UI currently has three separate chrome components scattered around the canvas:
- **Menu bar** (top-left): hamburger menu with undo/redo and custom items (show arrows, privacy & learning)
- **Toolbar** (bottom-left): vertical tldraw tool icons + mandala tool + chat toggle button
- **Chat sidebar** (right): slides in/out, 416px wide, contains chat header + history + input

This creates a fragmented experience. The goal is to merge all three into a single unified left-side panel, treating the chat as the primary interface with tools and menu integrated into it.

## Design

### Component Architecture

**New component: `LeftPanel`**

Replaces: `ToolbarWithStylePanel`, `MenuPanelWithActions`, `IrisMainMenu`, `ChatToggleButton`

Contains three sub-sections:
1. **Header bar** — hamburger menu (dropdown with "Show arrows" toggle, "Privacy & Learning"), "New Chat" title, undo/redo/new-chat/history buttons
2. **Chat body** — reuses existing `ChatHistory`/`ChatWelcome`, quick action pills, `ChatInput`, `TodoList`
3. **Tool rail** — vertical strip to the right of the chat body, vertically centered cluster of tldraw tools (select, hand, arrow, text, note, mandala) + lock button + collapse chevron

**App layout:**
```tsx
<div className="iris-app">
  <LeftPanel />
  <div className="iris-canvas-container">
    <Tldraw ... />
  </div>
</div>
```

Both are sibling flex children with a gap (~8px). Each has its own `border-radius`, `background`, and subtle `box-shadow`, appearing as separate floating cards. The outer container has a neutral dark background visible in the gap.

**State:**
- `panelOpen` (boolean) — controls chat visibility, owned by `LeftPanel` (adapts existing `ChatPanelContext`)
- Tool rail is always rendered regardless of `panelOpen`

### Desktop Layout (≥ 768px)

**Expanded (default):**
- `LeftPanel` width: 416px (matches current chat width)
  - Chat section: `flex: 1` (fills available width minus rail)
  - Tool rail: 44px fixed width, vertically centered cluster with rounded container
- Canvas: `flex: 1` (fills remaining space)
- Gap: 8px between the two cards

**Collapsed:**
- Chat section width animates to 0 (hidden)
- `LeftPanel` shrinks to just the tool rail (~44px + padding)
- Canvas expands to fill the freed space
- Transition: smooth width animation (~250ms ease)

**Collapse/expand triggers:**
- Chevron button (`«`/`»`) at the top of the tool rail
- Keyboard shortcut (e.g., `Cmd+\` or `Cmd+.`)

### Mobile Layout (< 768px)

Flex direction switches from row to column:
- **Canvas** takes the top ~50% of the viewport
- **Chat panel** takes the bottom ~50%

On mobile, the tool rail is NOT a separate vertical strip. Instead it renders as a **horizontal row inside the chat panel**, between the header and the chat body:

```
┌────────────────────────────────┐
│         Canvas (top half)      │
├────────────────────────────────┤
│ ☰ New Chat        ↩ ↪ ✏️ 🕒    │  ← header
│ ↗  ✋  ↙  T  🗒  M  🔒         │  ← tools as horizontal row
│       Chat History             │
│  ┌────────────────────────┐   │
│  │ Message Iris...         │   │
│  └────────────────────────┘   │
└────────────────────────────────┘
```

**Collapse on mobile:** chat collapses downward, leaving canvas full-screen + a thin bottom tool bar.

### Visual Treatment

Both cards share the existing dark theme:
- Background: linear gradient `#0f172a → #1e293b`
- Border: `1px solid rgba(255, 255, 255, 0.08)`
- Border-radius: `12px`
- Box-shadow: subtle dark shadow for depth
- Backdrop blur on the tool rail cluster: `20px`
- Outer container background: slightly darker than the cards (e.g., `#0a0f1a`)

### Components Removed

- `ToolbarWithStylePanel` (App.tsx) — replaced by tool rail inside `LeftPanel`
- `MenuPanelWithActions` (App.tsx) — replaced by header bar inside `LeftPanel`
- `IrisMainMenu` (App.tsx) — replaced by new hamburger dropdown in `LeftPanel` header. The `DefaultMainMenuContent` items (zoom, preferences, etc.) are **dropped** — only custom items ("Show arrows", "Privacy & Learning") move to the new dropdown.
- `ChatToggleButton` (App.tsx) — replaced by chevron on tool rail

### Components Reused (no changes)

- `ChatInput` (includes `QuickActionPills`, `PromptTag`, `SelectionTag`, `ContextItemTag` internally)
- `ChatHistory`
- `TodoList`
- `CustomHelperButtons` / `GoToAgentButton` (stay on canvas, unrelated)
- `FLSettingsPanel` / `FLSettingsContext` — modal overlays, unaffected by layout changes
- `ShareButton`, `back-to-rooms` button, `readonly-badge` — absolutely positioned, stay as-is

### Components Modified

- `App.tsx` — new layout structure; set tldraw `components` prop entries to `null` for `Toolbar`, `MenuPanel`, and `MainMenu` (prevents tldraw from rendering its defaults); wire up `LeftPanel`
- `ChatPanel.tsx` — the existing `ChatHeader` (private function, not exported) is **replaced** by the new `LeftPanel` header which has different content (hamburger + undo/redo + new-chat/history). `ChatWelcome` (also private) needs to be **exported** or moved to `LeftPanel`. `ChatPanel` becomes a "body-only" component (history + input).
- `index.css` — remove old `.agent-chat-slot`, `.iris-main-toolbar--dock-bottom-left`, `.tlui-menu-zone` styles; add new `.iris-app`, `.left-panel`, `.tool-rail`, `.iris-canvas-container` styles

### Tldraw Integration

The tool rail needs to trigger tldraw tool changes:
- Use `editor.setCurrentTool(toolId)` from the tldraw editor instance (available via `useEditor()`)
- The rail buttons are custom React components that call this API directly
- Active tool state read via `useValue('current tool id', () => editor.getCurrentToolId())`
- Tldraw `components` prop: set `Toolbar: null`, `MenuPanel: null`, `MainMenu: null` to suppress built-in chrome

This decouples our tool rail from tldraw's built-in toolbar component entirely. We render our own buttons and wire them to the editor API.

### Keyboard Shortcut

- Panel toggle: register via tldraw's keyboard shortcut system or a global `useEffect` listener
- Candidate binding: `Cmd+\` (common for sidebar toggle, no conflict with tldraw defaults)

### Future: Tool Rail Drawer

The tool rail is designed to be replaceable with a slide-out drawer in the future. The vertically centered cluster is already visually self-contained, so wrapping it in a drawer/tooltip pattern later is straightforward.
