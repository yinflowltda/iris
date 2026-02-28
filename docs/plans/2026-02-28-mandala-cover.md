# Mandala Cover System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an initial-state cover overlay to mandalas that shows a rotating text carousel of primary questions. Clicking a slide sends it as an agent message to chat.

**Architecture:** New `cover` prop on mandala shape controls an opaque overlay rendered inside `MandalaInteractive`. A `MandalaCoverContext` in App.tsx wires the overlay's click handler to the chat system (agent message injection, sidebar open, input focus). Per-framework carousel content is defined in the framework registry.

**Tech Stack:** React, TLDraw shape system, CSS transitions

---

### Task 1: Add CoverContent type and extend FrameworkEntry

**Files:**
- Modify: `shared/types/MandalaTypes.ts`
- Modify: `client/lib/frameworks/framework-registry.ts`

**Step 1: Add cover types to MandalaTypes.ts**

Add at the end of the file (before closing), after the `NoteMetadata` interface:

```typescript
// ─── Cover system (initial state overlay) ────────────────────────────────────

export interface CoverContent {
	type: 'text-carousel'
	slides: string[]
	intervalMs: number
}

export interface CoverConfig {
	active: boolean
	content: CoverContent
}
```

**Step 2: Extend FrameworkEntry with initialCover**

In `client/lib/frameworks/framework-registry.ts`, add to the `FrameworkEntry` interface (line ~22-27):

```typescript
export interface FrameworkEntry {
	definition: MapDefinition
	treeDefinition?: TreeMapDefinition
	visual: FrameworkVisualConfig
	template: FrameworkTemplateConfig
	initialCover?: CoverContent  // ← add this
}
```

Add the import for `CoverContent` from `MandalaTypes.ts`.

**Step 3: Commit**

```bash
git add shared/types/MandalaTypes.ts client/lib/frameworks/framework-registry.ts
git commit -m "feat: add CoverContent type and extend FrameworkEntry"
```

---

### Task 2: Add cover prop to MandalaShapeUtil

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx` (lines 38-47 for type, lines 216-238 for props/defaults)

**Step 1: Add cover to MandalaShapeProps type**

In `MandalaShapeProps` (line ~38-47), add:

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
	cover: CoverConfig | null  // ← add this
}
```

Import `CoverConfig` from `MandalaTypes.ts`.

**Step 2: Add cover to static props validators**

In the `props` record (line ~216-225), add:

```typescript
cover: T.jsonValue as any,
```

**Step 3: Add cover to getDefaultProps**

In `getDefaultProps()` (line ~227-238), add `cover: null` to the return object.

**Step 4: Commit**

```bash
git add client/shapes/MandalaShapeUtil.tsx
git commit -m "feat: add cover prop to MandalaShapeUtil"
```

---

### Task 3: Add emotions map initial cover content

**Files:**
- Modify: `client/lib/frameworks/emotions-map.ts` (registration call, line ~270-288)

**Step 1: Add initialCover to emotions map registration**

In the `registerFramework()` call, add the `initialCover` field:

```typescript
registerFramework({
	definition: EMOTIONS_MAP,
	treeDefinition: EMOTIONS_TREE,
	visual: { /* existing */ },
	template: { /* existing */ },
	initialCover: {
		type: 'text-carousel',
		slides: [
			'How do I resolve these emotions?',
			'What\u2019s really behind this feeling?',
			'How can I stop ruminating about this?',
			'Why is this concerning me so much?',
			'What am I not seeing about this situation?',
		],
		intervalMs: 5000,
	},
})
```

**Step 2: Commit**

```bash
git add client/lib/frameworks/emotions-map.ts
git commit -m "feat: add initial cover content to emotions map framework"
```

---

### Task 4: Create MandalaCoverContext for chat integration

**Files:**
- Create: `client/components/MandalaCoverContext.tsx`
- Modify: `client/App.tsx`

**Step 1: Create MandalaCoverContext**

Create `client/components/MandalaCoverContext.tsx`:

```typescript
import { createContext, useContext } from 'react'

export interface MandalaCoverActions {
	onCoverSlideClick: (slideText: string) => void
}

export const MandalaCoverContext = createContext<MandalaCoverActions>({
	onCoverSlideClick: () => {},
})

export function useMandalaCoverActions(): MandalaCoverActions {
	return useContext(MandalaCoverContext)
}
```

**Step 2: Wire context in App.tsx**

In App.tsx, the handler needs to:
1. Push an agent message to chat history
2. Open the chat sidebar
3. Focus the chat input

The challenge: `ChatPanelContext` already wraps `<Tldraw>`, so shapes can access it. But `useAgent()` requires `TldrawAgentAppContext` which shapes don't have. The solution: provide the wired action via `MandalaCoverContext`.

In App.tsx, inside the `App` component (where `app`, `chatOpen`, `toggleChat` state are available):

```typescript
import { MandalaCoverContext } from './components/MandalaCoverContext'

// Inside App component, after app state is set:
const chatInputRef = useRef<HTMLTextAreaElement>(null)

const handleCoverSlideClick = useCallback(
	(slideText: string) => {
		if (!app) return
		const agent = app.agents.getAgent()
		if (!agent) return

		// 1. Push agent message to chat
		agent.chat.push({
			type: 'action',
			action: {
				_type: 'message',
				text: slideText,
			},
			diff: { added: {}, removed: {}, updated: {} },
			acceptance: 'accepted',
		})

		// 2. Open chat sidebar
		if (!chatOpen) {
			toggleChat()
		}

		// 3. Focus chat input (defer to next tick so sidebar renders)
		requestAnimationFrame(() => {
			chatInputRef.current?.focus()
		})
	},
	[app, chatOpen, toggleChat],
)
```

Wrap the existing JSX tree with `MandalaCoverContext.Provider`:

```tsx
<MandalaCoverContext.Provider value={{ onCoverSlideClick: handleCoverSlideClick }}>
	<ChatPanelContext.Provider value={{ chatOpen, toggleChat }}>
		{/* existing tree */}
	</ChatPanelContext.Provider>
</MandalaCoverContext.Provider>
```

Pass `chatInputRef` down to `ChatPanel` so it can be assigned to the textarea. Currently `ChatPanel` creates its own `inputRef` (line 10 of ChatPanel.tsx). Change it to accept an optional forwarded ref, OR expose a `focusChatInput` callback from ChatPanel. The simplest approach: pass the ref as a prop.

**Step 3: Update ChatPanel to accept inputRef from parent**

In `client/components/ChatPanel.tsx`, change:

```typescript
// Before:
export function ChatPanel() {
	const inputRef = useRef<HTMLTextAreaElement>(null)

// After:
export function ChatPanel({ inputRef }: { inputRef?: React.RefObject<HTMLTextAreaElement | null> }) {
	const localRef = useRef<HTMLTextAreaElement>(null)
	const effectiveRef = inputRef ?? localRef
```

Then use `effectiveRef` everywhere `inputRef` was used.

In App.tsx, pass the ref:

```tsx
<ChatPanel inputRef={chatInputRef} />
```

**Step 4: Commit**

```bash
git add client/components/MandalaCoverContext.tsx client/App.tsx client/components/ChatPanel.tsx
git commit -m "feat: add MandalaCoverContext for cover-to-chat integration"
```

---

### Task 5: Create MandalaCover and TextCarousel components

**Files:**
- Create: `client/components/MandalaCover.tsx`

**Step 1: Create the component file**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoverContent } from '../../shared/types/MandalaTypes'
import { useMandalaCoverActions } from './MandalaCoverContext'

interface MandalaCoverProps {
	content: CoverContent
	w: number
	h: number
	onDismiss: () => void
}

export function MandalaCover({ content, w, h, onDismiss }: MandalaCoverProps) {
	const { onCoverSlideClick } = useMandalaCoverActions()
	const [fadingOut, setFadingOut] = useState(false)
	const currentSlideRef = useRef(0)

	const handleClick = useCallback(() => {
		const slideText = content.slides[currentSlideRef.current]
		onCoverSlideClick(slideText)
		setFadingOut(true)
	}, [content.slides, onCoverSlideClick])

	const handleFadeOutEnd = useCallback(() => {
		if (fadingOut) {
			onDismiss()
		}
	}, [fadingOut, onDismiss])

	return (
		<div
			className={`mandala-cover${fadingOut ? ' mandala-cover--fading' : ''}`}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: w,
				height: h,
				borderRadius: '50%',
				pointerEvents: 'all',
			}}
			onTransitionEnd={handleFadeOutEnd}
			onPointerDown={(e) => {
				e.stopPropagation()
				handleClick()
			}}
		>
			<TextCarousel
				slides={content.slides}
				intervalMs={content.intervalMs}
				onSlideChange={(index) => {
					currentSlideRef.current = index
				}}
			/>
		</div>
	)
}

interface TextCarouselProps {
	slides: string[]
	intervalMs: number
	onSlideChange: (index: number) => void
}

function TextCarousel({ slides, intervalMs, onSlideChange }: TextCarouselProps) {
	const [currentIndex, setCurrentIndex] = useState(0)
	const [visible, setVisible] = useState(true)

	useEffect(() => {
		const fadeOutDuration = 500

		const timer = setInterval(() => {
			// Fade out
			setVisible(false)

			// After fade out, switch slide and fade in
			setTimeout(() => {
				setCurrentIndex((prev) => {
					const next = (prev + 1) % slides.length
					onSlideChange(next)
					return next
				})
				setVisible(true)
			}, fadeOutDuration)
		}, intervalMs)

		return () => clearInterval(timer)
	}, [slides.length, intervalMs, onSlideChange])

	return (
		<div className="text-carousel">
			<p
				className="text-carousel__slide"
				style={{
					opacity: visible ? 1 : 0,
					transition: 'opacity 500ms ease-in-out',
				}}
			>
				{slides[currentIndex]}
			</p>
		</div>
	)
}
```

**Step 2: Add CSS**

Find where mandala-related CSS lives (likely `client/styles/` or alongside shape files) and add:

```css
.mandala-cover {
	display: flex;
	align-items: center;
	justify-content: center;
	background: #1a1a2e;
	opacity: 1;
	transition: opacity 500ms ease-out;
	cursor: pointer;
	z-index: 10;
}

.mandala-cover--fading {
	opacity: 0;
}

.text-carousel {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
	padding: 15%;
}

.text-carousel__slide {
	color: white;
	font-size: 1.8em;
	font-weight: 300;
	text-align: center;
	line-height: 1.4;
	user-select: none;
}
```

Note: the background color `#1a1a2e` is a placeholder — adjust to match the design system. The `borderRadius: '50%'` on the cover ensures it matches the circular mandala shape.

**Step 3: Commit**

```bash
git add client/components/MandalaCover.tsx <css-file>
git commit -m "feat: create MandalaCover and TextCarousel components"
```

---

### Task 6: Render MandalaCover in MandalaInteractive

**Files:**
- Modify: `client/shapes/MandalaShapeUtil.tsx` (MandalaInteractive component, lines 196-209)

**Step 1: Add MandalaCover to MandalaInteractive JSX**

Import `MandalaCover` and add it to the render:

```typescript
import { MandalaCover } from '../components/MandalaCover'
```

In `MandalaInteractive`, add a dismiss handler and render the cover:

```typescript
const handleCoverDismiss = useCallback(() => {
	editor.updateShape<MandalaShape>({
		id: shape.id,
		type: 'mandala',
		props: {
			cover: { ...shape.props.cover!, active: false },
		},
	})
}, [editor, shape.id, shape.props.cover])

return (
	<div style={{ position: 'relative', width: shape.props.w, height: shape.props.h }}>
		<SunburstSvg
			w={shape.props.w}
			h={shape.props.h}
			frameworkId={shape.props.frameworkId}
			mandalaState={shape.props.state}
			hoveredCell={hoveredCell}
			zoomedNodeId={shape.props.zoomedNodeId}
			onZoomComplete={handleZoomComplete}
		/>
		<ZoomModeToggle shape={shape} />
		{shape.props.cover?.active && shape.props.cover.content && (
			<MandalaCover
				content={shape.props.cover.content}
				w={shape.props.w}
				h={shape.props.h}
				onDismiss={handleCoverDismiss}
			/>
		)}
	</div>
)
```

**Step 2: Commit**

```bash
git add client/shapes/MandalaShapeUtil.tsx
git commit -m "feat: render MandalaCover inside MandalaInteractive"
```

---

### Task 7: Set initial cover on mandala creation

**Files:**
- Modify: `client/App.tsx` (handleSelectTemplate, line ~537-542)

**Step 1: Set cover prop during shape creation**

In `handleSelectTemplate`, update the `createShape` call to include the cover:

```typescript
editor.createShape({
	type: 'mandala',
	x: position.x,
	y: position.y,
	props: {
		frameworkId: template.frameworkId,
		w: size,
		h: size,
		state: makeEmptyState(framework.definition),
		cover: framework.initialCover
			? { active: true, content: framework.initialCover }
			: null,
	},
})
```

**Step 2: Commit**

```bash
git add client/App.tsx
git commit -m "feat: set initial cover on mandala creation from framework config"
```

---

### Task 8: Manual integration test

**No files changed — verification only.**

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Verify the full flow**

1. Create a new emotions map mandala from the template chooser
2. Verify the opaque circular cover appears over the mandala
3. Verify text carousel cycles through 5 questions every 5 seconds with fade transitions
4. Click on a slide — verify:
   - The clicked question text appears as an agent message in chat
   - Chat sidebar opens
   - Chat input is focused
   - Cover fades out over ~500ms
5. Verify the mandala is fully interactive after cover dismisses (zoom, hover, notes)
6. Create another mandala — verify it also starts with the cover

**Step 3: Final commit if any adjustments needed**
