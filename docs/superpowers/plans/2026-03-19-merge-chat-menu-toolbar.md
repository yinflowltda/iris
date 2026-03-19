# Merge Chat + Menu + Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the chat sidebar, menu bar, and toolbar into a single unified left-side panel with collapsible chat and a compact tool rail.

**Architecture:** New `LeftPanel` component replaces three separate chrome components. Chat panel on the left, vertical tool rail to its right, canvas fills the rest. The panel and canvas render as two separate floating cards with a gap between them. Chat collapses via chevron + keyboard shortcut; tool rail stays visible. Mobile stacks vertically (canvas top, chat bottom) with tools as a horizontal row inside the chat.

**Tech Stack:** React, tldraw (useEditor, useValue, setCurrentTool), CSS (flexbox, transitions)

**Spec:** `docs/superpowers/specs/2026-03-19-merge-chat-menu-toolbar-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `client/components/LeftPanel.tsx` | New unified panel: header + chat body + tool rail |
| Create | `client/components/LeftPanel.css` | All styles for the left panel, tool rail, and layout |
| Create | `client/components/ToolRail.tsx` | Vertical tool rail with centered cluster + collapse chevron |
| Create | `client/components/PanelHeader.tsx` | Header bar with hamburger dropdown, title, undo/redo/new-chat/history |
| Modify | `client/App.tsx` | New layout structure, remove old toolbar/menu/chat-slot, wire LeftPanel |
| Modify | `client/components/ChatPanel.tsx` | Remove ChatHeader/ChatWelcome (moved), export body-only component |
| Modify | `client/index.css` | Remove old layout styles, add new `.iris-app` / `.iris-canvas-container` |

---

## Task 1: Create ToolRail component

**Files:**
- Create: `client/components/ToolRail.tsx`

This is the vertical strip of tldraw tool buttons that sits to the right of the chat panel. It renders a centered cluster of tool icons + a collapse chevron at the top.

- [ ] **Step 1: Create ToolRail component**

```tsx
// client/components/ToolRail.tsx
import { useEditor, useValue } from 'tldraw'
import { MandalaIcon } from '../../shared/icons/MandalaIcon'
import { NoteIcon } from '../../shared/icons/NoteIcon'

const TOOLS = [
	{ id: 'select', label: 'Select', kbd: 'V', icon: '↗' },
	{ id: 'hand', label: 'Hand', kbd: 'H', icon: '✋' },
	{ id: 'arrow', label: 'Arrow', kbd: 'A', icon: '↙' },
	{ id: 'text', label: 'Text', kbd: 'T', icon: 'T' },
	{ id: 'note', label: 'Note', kbd: 'N', icon: 'note' },
	{ id: 'mandala', label: 'Mandala', kbd: 'M', icon: 'mandala' },
] as const

function ToolIcon({ tool }: { tool: (typeof TOOLS)[number] }) {
	if (tool.icon === 'note') return <NoteIcon />
	if (tool.icon === 'mandala') return <MandalaIcon />
	return <span className="tool-rail-icon-text">{tool.icon}</span>
}

export function ToolRail({
	panelOpen,
	onTogglePanel,
	onMandalaToolSelect,
}: {
	panelOpen: boolean
	onTogglePanel: () => void
	onMandalaToolSelect: () => void
}) {
	const editor = useEditor()
	const activeToolId = useValue('current tool id', () => editor.getCurrentToolId(), [editor])

	return (
		<div className="tool-rail">
			{/* Collapse/expand chevron */}
			<button
				className="tool-rail-toggle"
				onClick={onTogglePanel}
				title={panelOpen ? 'Collapse chat (⌘\\)' : 'Expand chat (⌘\\)'}
				aria-label={panelOpen ? 'Collapse chat' : 'Expand chat'}
			>
				{panelOpen ? '«' : '»'}
			</button>

			{/* Centered tool cluster */}
			<div className="tool-rail-cluster">
				{TOOLS.map((tool) => (
					<button
						key={tool.id}
						className={`tool-rail-btn${activeToolId === tool.id ? ' tool-rail-btn--active' : ''}`}
						onClick={() => {
							if (tool.id === 'mandala') {
								onMandalaToolSelect()
							} else {
								editor.setCurrentTool(tool.id)
							}
						}}
						title={`${tool.label} (${tool.kbd})`}
						aria-label={tool.label}
					>
						<ToolIcon tool={tool} />
					</button>
				))}
			</div>
		</div>
	)
}
```

- [ ] **Step 2: Verify file was created correctly**

Run: `ls -la client/components/ToolRail.tsx`

- [ ] **Step 3: Commit**

```bash
git add client/components/ToolRail.tsx
git commit -m "feat: add ToolRail component for unified left panel"
```

---

## Task 2: Create PanelHeader component

**Files:**
- Create: `client/components/PanelHeader.tsx`

The header bar that replaces both the old `ChatHeader` (from ChatPanel.tsx:9-33) and `IrisMainMenu` (from App.tsx:336-360). Contains hamburger dropdown menu, "New Chat" title, and action buttons.

- [ ] **Step 1: Create PanelHeader component**

```tsx
// client/components/PanelHeader.tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { type TLShapeId, useEditor, useValue } from 'tldraw'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'

// NOTE: This hook is moved verbatim from App.tsx (lines 296-334).
// It uses useValue for reactive mandala tracking and useCallback for stable identity.
const ARROW_VISIBLE_OPACITY = 0.6

function useArrowsVisible(): [boolean, () => void] {
	const editor = useEditor()
	const mandala = useValue(
		'mandala',
		() =>
			editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as MandalaShape | undefined,
		[editor],
	)

	const visible = mandala?.props.arrowsVisible !== false

	const toggle = useCallback(() => {
		if (!mandala) return
		const next = !visible
		const mandalaId = mandala.id

		editor.updateShape({
			id: mandalaId,
			type: 'mandala',
			props: { arrowsVisible: next },
		})

		const arrowRecords = mandala.props.arrows ?? []
		for (const rec of arrowRecords) {
			const arrowId = `shape:${rec.arrowId}` as TLShapeId
			if (editor.getShape(arrowId)) {
				editor.updateShape({ id: arrowId, type: 'arrow', opacity: next ? ARROW_VISIBLE_OPACITY : 0 })
			}
		}
	}, [editor, mandala, visible])

	return [visible, toggle]
}

export function PanelHeader({ onOpenFLSettings }: { onOpenFLSettings: () => void }) {
	const editor = useEditor()
	const [menuOpen, setMenuOpen] = useState(false)
	const [arrowsVisible, toggleArrowsVisible] = useArrowsVisible()
	const menuRef = useRef<HTMLDivElement>(null)

	// Close menu on click outside
	useEffect(() => {
		if (!menuOpen) return
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false)
			}
		}
		document.addEventListener('mousedown', handler)
		return () => document.removeEventListener('mousedown', handler)
	}, [menuOpen])

	return (
		<div className="panel-header">
			{/* Hamburger menu */}
			<div className="panel-header-menu" ref={menuRef}>
				<button
					className="panel-header-btn"
					onClick={() => setMenuOpen((v) => !v)}
					aria-label="Menu"
					title="Menu"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
						<line x1="4" y1="6" x2="20" y2="6" />
						<line x1="4" y1="12" x2="20" y2="12" />
						<line x1="4" y1="18" x2="20" y2="18" />
					</svg>
				</button>
				{menuOpen && (
					<div className="panel-header-dropdown">
						<button
							className="panel-header-dropdown-item"
							onClick={() => { toggleArrowsVisible(); setMenuOpen(false) }}
						>
							<span className="panel-header-dropdown-check">{arrowsVisible ? '✓' : ''}</span>
							Show arrows
						</button>
						<button
							className="panel-header-dropdown-item"
							onClick={() => { onOpenFLSettings(); setMenuOpen(false) }}
						>
							<span className="panel-header-dropdown-check" />
							Privacy & Learning
						</button>
					</div>
				)}
			</div>

			<span className="panel-header-title">New Chat</span>

			{/* Action buttons */}
			<div className="panel-header-actions">
				<button
					className="panel-header-btn"
					onClick={() => editor.undo()}
					title="Undo"
					aria-label="Undo"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M3 7v6h6" /><path d="M3 13a9 9 0 0 1 15.36-6.36" />
					</svg>
				</button>
				<button
					className="panel-header-btn"
					onClick={() => editor.redo()}
					title="Redo"
					aria-label="Redo"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M21 7v6h-6" /><path d="M21 13a9 9 0 0 0-15.36-6.36" />
					</svg>
				</button>
				<button className="panel-header-btn" aria-label="New chat" title="New chat">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 20h9" />
						<path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z" />
					</svg>
				</button>
				<button className="panel-header-btn" aria-label="Chat history" title="Chat history">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
				</button>
			</div>
		</div>
	)
}
```

- [ ] **Step 2: Verify file was created correctly**

Run: `ls -la client/components/PanelHeader.tsx`

- [ ] **Step 3: Commit**

```bash
git add client/components/PanelHeader.tsx
git commit -m "feat: add PanelHeader component with hamburger menu and undo/redo"
```

---

## Task 3: Create LeftPanel component

**Files:**
- Create: `client/components/LeftPanel.tsx`

The main wrapper that composes PanelHeader + ChatPanel body + ToolRail. Owns the `panelOpen` collapsed/expanded state.

- [ ] **Step 1: Create LeftPanel component**

```tsx
// client/components/LeftPanel.tsx
import { useCallback, useEffect } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { FormEventHandler } from 'react'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { PanelHeader } from './PanelHeader'
import { ToolRail } from './ToolRail'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'
import { useVoice } from './VoiceControl'
import './LeftPanel.css'

function ChatWelcome() {
	return (
		<div className="chat-welcome-area">
			<div className="chat-welcome">
				<div className="chat-welcome-header">
					<div className="chat-welcome-icon">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
						</svg>
					</div>
					<span className="chat-welcome-title">Hello</span>
				</div>
				<div className="chat-welcome-desc">
					<p>Select shapes or type a prompt, Iris helps you</p>
					<ul>
						<li>Understand your mandala or get insight</li>
						<li>Generate notes or images</li>
						<li>Brainstorm and explore ideas</li>
					</ul>
				</div>
			</div>
		</div>
	)
}

export function LeftPanel({
	panelOpen,
	onTogglePanel,
	onOpenFLSettings,
	onMandalaToolSelect,
	inputRef,
}: {
	panelOpen: boolean
	onTogglePanel: () => void
	onOpenFLSettings: () => void
	onMandalaToolSelect: () => void
	inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
	const agent = useAgent()
	const { voiceState, isListening, toggleListening } = useVoice(agent)
	const historyItems = useValue('chatHistory', () => agent.chat.getHistory(), [agent])
	const hasMessages = historyItems.length > 0

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!inputRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			if (value === '') {
				agent.cancel()
				return
			}

			inputRef.current.value = ''

			agent.interrupt({
				input: {
					agentMessages: [value],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent, inputRef],
	)

	// Keyboard shortcut: Cmd+\ to toggle panel
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
				e.preventDefault()
				onTogglePanel()
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [onTogglePanel])

	return (
		<div className={`left-panel${panelOpen ? '' : ' left-panel--collapsed'}`}>
			{/* Chat section (collapsible) */}
			{panelOpen && (
				<div className="left-panel-chat tl-theme__dark">
					<PanelHeader onOpenFLSettings={onOpenFLSettings} />

					{/* Mobile-only: horizontal tool strip */}
					<div className="left-panel-tools-mobile">
						<ToolRail
							panelOpen={panelOpen}
							onTogglePanel={onTogglePanel}
							onMandalaToolSelect={onMandalaToolSelect}
						/>
					</div>

					{hasMessages ? (
						<ChatHistory agent={agent} />
					) : (
						<ChatWelcome />
					)}
					<div className="chat-input-container">
						<TodoList agent={agent} />
						<ChatInput
							handleSubmit={handleSubmit}
							inputRef={inputRef}
							voiceState={voiceState}
							isListening={isListening}
							onMicClick={toggleListening}
						/>
					</div>
				</div>
			)}

			{/* Tool rail (always visible, desktop only) */}
			<div className="left-panel-tools-desktop">
				<ToolRail
					panelOpen={panelOpen}
					onTogglePanel={onTogglePanel}
					onMandalaToolSelect={onMandalaToolSelect}
				/>
			</div>
		</div>
	)
}
```

- [ ] **Step 2: Verify file was created correctly**

Run: `ls -la client/components/LeftPanel.tsx`

- [ ] **Step 3: Commit**

```bash
git add client/components/LeftPanel.tsx
git commit -m "feat: add LeftPanel component composing header, chat, and tool rail"
```

---

## Task 4: Create LeftPanel.css styles

**Files:**
- Create: `client/components/LeftPanel.css`

All styles for the left panel, tool rail, panel header, and responsive layout.

- [ ] **Step 1: Create LeftPanel.css**

```css
/* client/components/LeftPanel.css */

/* ─── Left Panel Container ─── */

.left-panel {
	display: flex;
	flex-shrink: 0;
	height: 100%;
	transition: width 0.25s ease;
	width: 416px;
}

.left-panel--collapsed {
	width: auto;
}

/* ─── Chat Section ─── */

.left-panel-chat {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	height: 100%;
	background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
	border-radius: 12px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
	color: #e2e8f0;
	font-family: "Source Sans 3", sans-serif;
	font-size: 14px;
	line-height: 1.6;
	overflow: hidden;
}

/* ─── Tool Rail ─── */

.tool-rail {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 8px 4px;
	width: 44px;
	flex-shrink: 0;
}

.tool-rail-toggle {
	width: 30px;
	height: 30px;
	display: grid;
	place-items: center;
	border-radius: 8px;
	border: none;
	background: transparent;
	color: rgba(148, 163, 184, 0.6);
	font-size: 14px;
	cursor: pointer;
	transition: background 0.15s ease, color 0.15s ease;
}

.tool-rail-toggle:hover {
	background: rgba(255, 255, 255, 0.06);
	color: #ffffff;
}

.tool-rail-cluster {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 6px;
	background: linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.88));
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 10px;
}

.tool-rail-btn {
	width: 30px;
	height: 30px;
	display: grid;
	place-items: center;
	border-radius: 6px;
	border: none;
	background: transparent;
	color: rgba(148, 163, 184, 0.7);
	cursor: pointer;
	transition: background 0.15s ease, color 0.15s ease;
	font-size: 13px;
}

.tool-rail-btn:hover {
	background: rgba(255, 255, 255, 0.08);
	color: #ffffff;
}

.tool-rail-btn--active {
	background: rgba(59, 130, 246, 0.2);
	color: #60a5fa;
}

.tool-rail-btn svg {
	width: 16px;
	height: 16px;
}

.tool-rail-icon-text {
	font-size: 13px;
	font-weight: 600;
	line-height: 1;
}

/* Desktop: show vertical rail, hide mobile strip */
.left-panel-tools-desktop {
	display: flex;
}

.left-panel-tools-mobile {
	display: none;
}

/* ─── Panel Header ─── */

.panel-header {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-header-menu {
	position: relative;
}

.panel-header-title {
	flex: 1;
	font-size: 15px;
	font-weight: 600;
	color: #ffffff;
}

.panel-header-actions {
	display: flex;
	gap: 2px;
}

.panel-header-btn {
	width: 28px;
	height: 28px;
	display: grid;
	place-items: center;
	border-radius: 6px;
	border: none;
	background: transparent;
	color: rgba(148, 163, 184, 0.7);
	cursor: pointer;
	transition: background 0.15s ease, color 0.15s ease;
}

.panel-header-btn:hover {
	background: rgba(255, 255, 255, 0.06);
	color: #ffffff;
}

/* Hamburger dropdown */
.panel-header-dropdown {
	position: absolute;
	top: 100%;
	left: 0;
	margin-top: 4px;
	min-width: 180px;
	background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92));
	backdrop-filter: blur(24px);
	-webkit-backdrop-filter: blur(24px);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 8px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	padding: 4px;
	z-index: 200;
}

.panel-header-dropdown-item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 10px;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: #e2e8f0;
	font-family: "Source Sans 3", sans-serif;
	font-size: 13px;
	cursor: pointer;
	text-align: left;
	transition: background 0.1s ease;
}

.panel-header-dropdown-item:hover {
	background: rgba(255, 255, 255, 0.08);
}

.panel-header-dropdown-check {
	width: 16px;
	text-align: center;
	font-size: 12px;
	color: #60a5fa;
}

/* ─── Mobile Layout ─── */

@media (max-width: 768px) {
	.left-panel {
		flex-direction: column;
		width: 100% !important;
		height: 50%;
	}

	.left-panel--collapsed {
		height: auto;
	}

	/* Swap: hide desktop rail, show mobile strip */
	.left-panel-tools-desktop {
		display: none;
	}

	.left-panel-tools-mobile {
		display: block;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.left-panel-tools-mobile .tool-rail {
		flex-direction: row;
		width: 100%;
		height: auto;
		padding: 6px 12px;
		justify-content: flex-start;
	}

	.left-panel-tools-mobile .tool-rail-cluster {
		flex-direction: row;
		gap: 4px;
	}

	.left-panel-tools-mobile .tool-rail-toggle {
		display: none;
	}
}
```

- [ ] **Step 2: Verify file was created correctly**

Run: `ls -la client/components/LeftPanel.css`

- [ ] **Step 3: Commit**

```bash
git add client/components/LeftPanel.css
git commit -m "feat: add LeftPanel.css with desktop, mobile, and collapsed styles"
```

---

## Task 5: Modify ChatPanel to body-only

**Files:**
- Modify: `client/components/ChatPanel.tsx`

Remove `ChatHeader` and `ChatWelcome` (moved to LeftPanel). ChatPanel becomes a thin wrapper that just exports the submit handler logic, or is removed entirely since LeftPanel now owns that responsibility.

- [ ] **Step 1: Simplify ChatPanel.tsx**

Delete `client/components/ChatPanel.tsx` entirely. `LeftPanel.tsx` imports `ChatHistory`, `ChatInput`, `TodoList`, and `useVoice` directly from their own files — nothing is imported from ChatPanel. The only consumer was `App.tsx`, which will import `LeftPanel` instead.

Run: `rm client/components/ChatPanel.tsx`

- [ ] **Step 2: Commit**

```bash
git add client/components/ChatPanel.tsx
git commit -m "refactor: remove ChatPanel — logic moved to LeftPanel"
```

---

## Task 6: Rewire App.tsx layout

**Files:**
- Modify: `client/App.tsx`

This is the main integration task. Remove old toolbar/menu/chat-slot components and wire up the new `LeftPanel` + canvas layout.

- [ ] **Step 1: Remove old component definitions from App.tsx**

Delete these functions/components from `App.tsx`:
- `ChatToggleButton` (lines 196-209)
- `ToolbarWithStylePanel` (lines 211-258)
- `IrisMainMenu` (lines 336-360)
- `MenuPanelWithActions` (lines 362-394)
- `useArrowsVisible` hook (lines 298-334) — moved to PanelHeader

Remove unused imports that were only used by those components:
- `DefaultMainMenu`, `DefaultMainMenuContent`
- `DefaultToolbarContent`
- `MobileStylePanel`, `PORTRAIT_BREAKPOINT`
- `ToggleToolLockedButton`
- `TldrawUiButton`, `TldrawUiMenuCheckboxItem`, `TldrawUiMenuContextProvider`, `TldrawUiMenuGroup`, `TldrawUiMenuItem`, `TldrawUiMenuToolItem`, `TldrawUiOrientationProvider`, `TldrawUiToolbar`
- `useBreakpoint`, `usePassThroughWheelEvents`, `useReadonly`, `useTldrawUiComponents`, `useTranslation`

Keep: `useEditor`, `useValue`, `memo`, context hooks, etc.

- [ ] **Step 2: Update the tldraw components prop**

In the `components` object (around line 732), set the removed components to `null`:

```tsx
const components: TLComponents = useMemo(() => {
	return {
		StylePanel: PopoverOnlyStylePanel,
		Toolbar: null,
		MainMenu: null,
		MenuPanel: null,
		NavigationPanel: null,
		PageMenu: null,
		HelperButtons: () =>
			app && (
				<TldrawAgentAppContextProvider app={app}>
					<CustomHelperButtons />
				</TldrawAgentAppContextProvider>
			),
		Overlays: () => (
			<>
				<TldrawOverlays />
				{app && (
					<TldrawAgentAppContextProvider app={app}>
						<AgentViewportBoundsHighlights />
						<AllContextHighlights />
						<CellSuggestionOverlay />
						<EdgeTypePicker />
					</TldrawAgentAppContextProvider>
				)}
			</>
		),
	}
}, [app])
```

- [ ] **Step 3: Update the JSX layout**

Replace the current render (lines 779-827) with the new two-card layout:

```tsx
return (
	<AuthUserContext.Provider value={user}>
		{roomInfo?.isOwner && <ShareButton roomId={user.sub} roomSlug={user.room_slug} />}
		<button className="back-to-rooms" onClick={() => navigateTo('/rooms')}>← Rooms</button>
		{roomInfo && !roomInfo.isOwner && roomInfo.permission === 'view' && <div className="readonly-badge">View only</div>}
		<MandalaCoverContext.Provider value={{ onCoverSlideClick: handleCoverSlideClick }}>
			<FLSettingsContext.Provider value={flSettingsCtx}>
				<TldrawUiToastsProvider>
					<div className="iris-app">
						{/* Left panel: chat + tool rail, wrapped in ErrorBoundary */}
						<ErrorBoundary fallback={ChatPanelFallback}>
							{app && (
								<TldrawAgentAppContextProvider app={app}>
									<LeftPanel
										panelOpen={chatOpen}
										onTogglePanel={toggleChat}
										onOpenFLSettings={() => setShowFLSettings(true)}
										onMandalaToolSelect={() => {
											setShowTemplate(true)
											app.editor.setCurrentTool('select')
											app.editor.focus()
										}}
										inputRef={chatInputRef}
									/>
								</TldrawAgentAppContextProvider>
							)}
						</ErrorBoundary>

						{/* Canvas card */}
						<div className="iris-canvas-container">
							<Tldraw
								store={syncStore}
								options={options}
								shapeUtils={shapeUtils}
								tools={tools}
								overrides={overrides}
								components={components}
								textOptions={textOptions}
							>
								<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
								<FLHooksMount />
							</Tldraw>
						</div>
					</div>

					<TemplateChooser
						visible={showTemplate}
						onSelectTemplate={handleSelectTemplate}
						onRequestClose={() => setShowTemplate(false)}
					/>
					<FLSettingsPanel
						visible={showFLSettings}
						onRequestClose={() => setShowFLSettings(false)}
					/>
				</TldrawUiToastsProvider>
			</FLSettingsContext.Provider>
		</MandalaCoverContext.Provider>
	</AuthUserContext.Provider>
)
```

Note: `ChatPanelContext` is no longer needed since `LeftPanel` owns the panel state directly. Remove the context provider wrapper and the `ChatPanelContext` definition.

Update `handleCoverSlideClick` (around line 421) — replace the `toggleChat()` call with `setChatOpen(true)`, and update the dependency array:

```tsx
const handleCoverSlideClick = useCallback(
	(slideText: string) => {
		if (!app) return
		const agent = app.agents.getAgent()
		if (!agent) return
		agent.interrupt({
			input: {
				agentMessages: [slideText],
				bounds: agent.editor.getViewportPageBounds(),
				source: 'user',
				contextItems: agent.context.getItems(),
			},
		})
		setChatOpen(true)
		requestAnimationFrame(() => {
			chatInputRef.current?.focus()
		})
	},
	[app],
)
```

(`setChatOpen` is stable from `useState`, so it doesn't need to be in the dependency array.)

- [ ] **Step 4: Add LeftPanel import, remove old imports**

Add:
```tsx
import { LeftPanel } from './components/LeftPanel'
```

Remove:
```tsx
import { ChatPanel } from './components/ChatPanel'
```

- [ ] **Step 5: Verify the app compiles**

Run: `bun run dev` (check for compilation errors, then Ctrl+C)

- [ ] **Step 6: Commit**

```bash
git add client/App.tsx
git commit -m "feat: rewire App.tsx with LeftPanel layout, remove old toolbar/menu/chat-slot"
```

---

## Task 7: Update CSS — remove old styles, add new layout

**Files:**
- Modify: `client/index.css`

Remove the old layout styles and add the new `.iris-app` / `.iris-canvas-container` styles.

- [ ] **Step 1: Remove old layout CSS from index.css**

Remove these blocks from `client/index.css`:
- `.tldraw-agent-container` (lines 22-34) — replaced by `.iris-app`
- `.agent-chat-slot` and `.agent-chat-slot--open` (lines 36-57) — no longer used
- `.agent-chat-slot .chat-panel` (lines 59-61)
- Mobile media query for `.agent-chat-slot` (lines 63-85)
- `.tlui-main-toolbar__mobile-style-panel` (lines 87-89)
- `.tlui-main-toolbar.iris-main-toolbar--dock-bottom-left` (lines 178-188) — toolbar is gone
- `.tlui-menu-zone .iris-menu-actions` (lines 197-200) — menu bar is gone
- `.chat-header` and related styles (lines 317-356) — moved to LeftPanel.css
- `.chat-welcome-area` and related styles (lines 358-424) — moved to LeftPanel.css

- [ ] **Step 2: Add new layout styles to index.css**

Add at the top (after the existing `*` and `body` rules):

```css
/* ─── App Layout: two floating cards ─── */

.iris-app {
	position: fixed;
	inset: 0;
	display: flex;
	gap: 8px;
	padding: 8px;
	background: #0a0f1a;
	/* Mirror TLDraw radius tokens */
	--tl-radius-0: 2px;
	--tl-radius-1: 4px;
	--tl-radius-2: 6px;
	--tl-radius-3: 9px;
	--tl-radius-4: 11px;
	--iris-toolbar-radius: 8px;
}

.iris-canvas-container {
	flex: 1;
	min-width: 0;
	height: 100%;
	border-radius: 12px;
	overflow: hidden;
	border: 1px solid rgba(255, 255, 255, 0.08);
	box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.iris-canvas-container .tl-theme__light {
	--tl-color-background: #f4f6f8;
}

@media (max-width: 768px) {
	.iris-app {
		flex-direction: column;
	}
}
```

- [ ] **Step 3: Update `.chat-panel` and `.tldraw-canvas` styles**

The `.chat-panel` class is no longer used (LeftPanel uses `.left-panel-chat`). But `ChatInput`, `ChatHistory`, and other inner components still use their existing classes — those stay. Remove only the `.chat-panel` block (lines 237-249) and the `.chat-panel *` / `.chat-panel button` rules (lines 277-283).

Also update the font override selectors from `.tldraw-canvas` to `.iris-canvas-container`:
- `.tldraw-canvas` (line 202-207) → `.iris-canvas-container`
- `.tldraw-canvas .tl-theme__light` (line 209-213) → `.iris-canvas-container .tl-theme__light`
- `.tldraw-canvas .tl-theme__dark` (line 215-218) → `.iris-canvas-container .tl-theme__dark`

- [ ] **Step 4: Verify styles compile and no broken references**

Run: `bun run dev`

- [ ] **Step 5: Commit**

```bash
git add client/index.css
git commit -m "refactor: replace old layout CSS with iris-app two-card layout"
```

---

## Task 8: Smoke test and fix integration issues

**Files:**
- Possibly modify: any file from Tasks 1-7

- [ ] **Step 1: Run the dev server**

Run: `bun run dev`

Open in browser. Verify:
1. Left panel renders with header (hamburger, title, undo/redo, new-chat, history)
2. Chat history/welcome shows in the panel
3. Chat input works (type message, submit)
4. Tool rail appears to the right of chat with centered cluster
5. Clicking tools changes the active tool on the canvas
6. Clicking the chevron collapses the chat (tool rail stays)
7. `Cmd+\` toggles the panel
8. Hamburger menu opens dropdown with "Show arrows" and "Privacy & Learning"
9. Canvas renders correctly in its own card
10. Gap is visible between the two cards

- [ ] **Step 2: Test mobile layout**

Open browser devtools, switch to mobile viewport (< 768px). Verify:
1. Layout switches to vertical (canvas top, chat bottom)
2. Tool rail renders as horizontal row inside chat panel
3. All tools are accessible

- [ ] **Step 3: Fix any issues found**

Address compilation errors, layout bugs, or missing styles.

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: integration fixes for merged left panel"
```

---

## Task 9: Clean up unused code

**Files:**
- Modify: `client/App.tsx` (remove dead code)
- Possibly delete: `client/components/ChatPanel.tsx` (if not deleted in Task 5)

- [ ] **Step 1: Search for any remaining references to removed components**

Run: `grep -rn "ChatPanelContext\|ChatToggleButton\|ToolbarWithStylePanel\|MenuPanelWithActions\|IrisMainMenu\|agent-chat-slot\|iris-main-toolbar--dock-bottom-left" client/`

- [ ] **Step 2: Remove any remaining dead references**

Clean up any stale imports or references found.

- [ ] **Step 3: Run dev server one more time to verify**

Run: `bun run dev`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: remove dead code from old chat/toolbar/menu layout"
```
