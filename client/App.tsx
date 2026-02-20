import { ReadonlySharedStyleMap } from '@tldraw/editor'
import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import {
	createShapeId,
	DefaultColorStyle,
	DefaultColorThemePalette,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultMainMenu,
	DefaultMainMenuContent,
	DefaultSizeStyle,
	DefaultStylePanel,
	DefaultToolbarContent,
	defaultShapeUtils,
	ErrorBoundary,
	MobileStylePanel,
	PORTRAIT_BREAKPOINT,
	react,
	type TLComponents,
	type TLShapeId,
	type TLUiOverrides,
	type TLUiStylePanelProps,
	Tldraw,
	TldrawOverlays,
	TldrawUiButton,
	TldrawUiMenuCheckboxItem,
	TldrawUiMenuContextProvider,
	TldrawUiMenuGroup,
	TldrawUiMenuToolItem,
	TldrawUiOrientationProvider,
	TldrawUiToastsProvider,
	TldrawUiToolbar,
	ToggleToolLockedButton,
	useBreakpoint,
	useEditor,
	usePassThroughWheelEvents,
	useReadonly,
	useTldrawUiComponents,
	useTranslation,
	useValue,
} from 'tldraw'
import type { TldrawAgentApp } from './agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from './agent/TldrawAgentAppProvider'
import { ChatPanel } from './components/ChatPanel'
import { ChatPanelFallback } from './components/ChatPanelFallback'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { AgentViewportBoundsHighlights } from './components/highlights/AgentViewportBoundsHighlights'
import { AllContextHighlights } from './components/highlights/ContextHighlights'
import { TemplateChooser } from './components/TemplateChooser'
import { EMOTIONS_MAP } from './lib/frameworks/emotions-map'
import { makeEmptyState } from './lib/mandala-geometry'
import { registerMandalaSnapEffect } from './lib/mandala-snap'
import { applyNodulePaletteToThemes } from './lib/nodule-color-palette'
import { CircularNoteShapeUtil } from './shapes/CircularNoteShapeUtil'
import { MandalaShapeTool } from './shapes/MandalaShapeTool'
import { type MandalaShape, MandalaShapeUtil } from './shapes/MandalaShapeUtil'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'

const ChatPanelContext = createContext<{ chatOpen: boolean; toggleChat: () => void }>({
	chatOpen: false,
	toggleChat: () => {},
})

DefaultSizeStyle.setDefaultValue('s')
applyNodulePaletteToThemes(DefaultColorThemePalette.lightMode, DefaultColorThemePalette.darkMode)

/**
 * Iris UI defaults: keep TLDraw UI minimal.
 * Flip these to `true` if we want to expose the full TLDraw UI again.
 */
const SHOW_FULL_TLDRAW_TOOLS = false
const SHOW_TEMPLATE_CHOOSER = false

const MANDALA_TEMPLATE_DEFINITIONS = {
	'emotions-map': {
		mode: 'emotions-map',
		framework: EMOTIONS_MAP,
		size: 600,
	},
} as const

const shapeUtils = [
	...defaultShapeUtils.map((shapeUtil) =>
		shapeUtil.type === 'note' ? CircularNoteShapeUtil : shapeUtil,
	),
	MandalaShapeUtil,
]
const tools = [MandalaShapeTool, TargetShapeTool, TargetAreaTool]

const baseStyleProps = [
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
] as const

function useStylesWithDefaults(): ReadonlySharedStyleMap {
	const editor = useEditor()
	return useValue('styles-with-defaults', () => {
		const sharedStyles = editor.getSharedStyles()
		const entries = [...sharedStyles] as Array<[any, any]>

		for (const style of baseStyleProps) {
			if (!sharedStyles.get(style)) {
				entries.push([style, { type: 'shared', value: editor.getStyleForNextShape(style) }])
			}
		}

		return new ReadonlySharedStyleMap(entries)
	}, [editor])
}

function PopoverOnlyStylePanel(props: TLUiStylePanelProps) {
	const styles = useStylesWithDefaults()
	if (!props.isMobile) return null
	return <DefaultStylePanel {...props} styles={styles} />
}

function ChatToggleButton() {
	const { chatOpen, toggleChat } = useContext(ChatPanelContext)
	return (
		<TldrawUiButton type="tool" isActive={chatOpen} onClick={toggleChat} title="Toggle chat">
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
				<path
					d="M9 2C5.134 2 2 4.91 2 8.5c0 1.48.528 2.845 1.41 3.94L2.5 15l3.02-1.04A7.13 7.13 0 0 0 9 15c3.866 0 7-2.91 7-6.5S12.866 2 9 2Z"
					fill="currentColor"
					fillOpacity="0.9"
				/>
			</svg>
		</TldrawUiButton>
	)
}

const ToolbarWithStylePanel = memo(function ToolbarWithStylePanel() {
	const editor = useEditor()
	const msg = useTranslation()
	const breakpoint = useBreakpoint()
	const isReadonlyMode = useReadonly()
	const activeToolId = useValue('current tool id', () => editor.getCurrentToolId(), [editor])

	const ref = useRef<HTMLDivElement>(null)
	usePassThroughWheelEvents(ref)

	return (
		<TldrawUiOrientationProvider orientation="vertical" tooltipSide="right">
			<div
				ref={ref}
				className={[
					'tlui-main-toolbar',
					'tlui-main-toolbar--vertical',
					'iris-main-toolbar--dock-bottom-left',
				].join(' ')}
			>
				<div className="tlui-main-toolbar__inner">
					<div className="tlui-main-toolbar__left">
						{!isReadonlyMode && (
							<div className="tlui-main-toolbar__extras">
								<ToggleToolLockedButton activeToolId={activeToolId} />
							</div>
						)}
						<TldrawUiToolbar
							orientation="vertical"
							className="tlui-main-toolbar__tools"
							label={msg('navigation-zone.title')}
						>
							<TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
								<DefaultToolbarContent />
								<TldrawUiMenuToolItem toolId="mandala" isSelected={activeToolId === 'mandala'} />
								<ChatToggleButton />
							</TldrawUiMenuContextProvider>
						</TldrawUiToolbar>
					</div>
					{breakpoint < PORTRAIT_BREAKPOINT.TABLET_SM && !isReadonlyMode && (
						<div className="tlui-main-toolbar__tools tlui-main-toolbar__mobile-style-panel">
							<MobileStylePanel />
						</div>
					)}
				</div>
			</div>
		</TldrawUiOrientationProvider>
	)
})

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
				editor.updateShape({
					id: arrowId,
					type: 'arrow',
					opacity: next ? ARROW_VISIBLE_OPACITY : 0,
				})
			}
		}
	}, [editor, mandala, visible])

	return [visible, toggle]
}

function IrisMainMenu() {
	const [arrowsVisible, toggleArrowsVisible] = useArrowsVisible()

	return (
		<DefaultMainMenu>
			<TldrawUiMenuGroup id="iris-mandala">
				<TldrawUiMenuCheckboxItem
					id="toggle-arrows"
					label="Show arrows"
					checked={arrowsVisible}
					onSelect={toggleArrowsVisible}
					readonlyOk
				/>
			</TldrawUiMenuGroup>
			<DefaultMainMenuContent />
		</DefaultMainMenu>
	)
}

const MenuPanelWithActions = memo(function MenuPanelWithActions() {
	const editor = useEditor()
	const msg = useTranslation()
	const isReadonlyMode = useReadonly()
	const ref = useRef<HTMLElement>(null)
	usePassThroughWheelEvents(ref)

	const { MainMenu, PageMenu, QuickActions, ActionsMenu } = useTldrawUiComponents()
	const isSinglePageMode = useValue('isSinglePageMode', () => editor.options.maxPages <= 1, [
		editor,
	])

	if (!MainMenu && !PageMenu && !QuickActions && !ActionsMenu) return null

	return (
		<nav ref={ref} className="tlui-menu-zone">
			<div className="tlui-row">
				{MainMenu && <MainMenu />}
				{!isReadonlyMode && (QuickActions || ActionsMenu) && (
					<TldrawUiToolbar
						orientation="horizontal"
						className="tlui-main-toolbar__extras__controls iris-menu-actions"
						label={msg('actions-menu.title')}
					>
						{QuickActions && <QuickActions />}
						{ActionsMenu && <ActionsMenu />}
					</TldrawUiToolbar>
				)}
				{PageMenu && !isSinglePageMode && <PageMenu />}
			</div>
		</nav>
	)
})

const NOTE_HALF_SIZE = 100

function hasNoTextContent(richText: unknown): boolean {
	if (!richText || typeof richText !== 'object') return true
	const doc = richText as { content?: Array<{ content?: unknown[] }> }
	if (!doc.content) return true
	return doc.content.every((block) => !block.content || block.content.length === 0)
}

function App() {
	const [app, setApp] = useState<TldrawAgentApp | null>(null)
	const [showTemplate, setShowTemplate] = useState(SHOW_TEMPLATE_CHOOSER)
	const [chatOpen, setChatOpen] = useState(false)
	const toggleChat = useCallback(() => setChatOpen((v) => !v), [])
	const handleUnmount = useCallback(() => {
		setApp(null)
	}, [])

	const options = useMemo(() => {
		return {
			// Keep "Actions" next to the hamburger menu (top-left).
			actionShortcutsLocation: 'menu' as const,
		}
	}, [])

	// Session resume + reactive progress tracking
	useEffect(() => {
		if (!app) return

		// Session resume: if mandala already exists, switch to emotions-map mode
		const existing = app.editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as
			| MandalaShape
			| undefined
		if (existing) {
			setShowTemplate(false)
			try {
				const agent = app.agents.getAgent()
				if (agent && agent.mode.getCurrentModeType() !== 'emotions-map') {
					agent.mode.setMode('emotions-map')
				}
			} catch {
				// mode switch may fail if already in that mode
			}
		}

		// Reactive tracking: re-runs when shapes change on the page
		const cleanupProgress = react('mandala-progress', () => {
			const shapes = app.editor.getCurrentPageShapes()
			const mandalaRef = shapes.find((s) => s.type === 'mandala')
			if (mandalaRef) setShowTemplate(false)
		})

		const cleanupSnap = registerMandalaSnapEffect(app.editor)

		const cleanupMandalaSelection = app.editor.sideEffects.registerBeforeChangeHandler(
			'instance_page_state',
			(_prev, next) => {
				const mandala = app.editor.getCurrentPageShapes().find((s) => s.type === 'mandala')
				if (!mandala) return next
				if (next.selectedShapeIds.includes(mandala.id)) {
					const filtered = next.selectedShapeIds.filter((id) => id !== mandala.id)
					return { ...next, selectedShapeIds: filtered }
				}
				return next
			},
		)

		const cleanupDoubleClickNote = app.editor.sideEffects.registerAfterCreateHandler(
			'shape',
			(shape) => {
				if (shape.type !== 'text') return
				if (app.editor.getCurrentToolId() !== 'select') return

				const textProps = shape.props as { richText?: unknown }
				if (!hasNoTextContent(textProps.richText)) return

				queueMicrotask(() => {
					if (!app.editor.getShape(shape.id)) return
					const noteId = createShapeId()
					app.editor.deleteShape(shape.id)
					app.editor.createShape({
						id: noteId,
						type: 'note',
						x: shape.x - NOTE_HALF_SIZE,
						y: shape.y - NOTE_HALF_SIZE,
					})
					app.editor.setSelectedShapes([noteId])
					app.editor.setEditingShape(noteId)
				})
			},
		)

		return () => {
			cleanupProgress()
			cleanupSnap()
			cleanupMandalaSelection()
			cleanupDoubleClickNote()
		}
	}, [app])

	const overrides: TLUiOverrides = useMemo(() => {
		return {
			actions: (editor, actions) => {
				const original = actions.duplicate
				if (!original) return actions

				return {
					...actions,
					duplicate: {
						...original,
						onSelect(source) {
							const mandala = editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as
								| MandalaShape
								| undefined
							if (!mandala) return original.onSelect?.(source)

							const selectedIds = editor.getSelectedShapeIds()
							const allContentIds = new Set(
								Object.values(mandala.props.state).flatMap((cell) => cell.contentShapeIds),
							)

							const hasMandalaNodule = selectedIds.some((id) =>
								allContentIds.has(id.replace('shape:', '') as any),
							)

							if (!hasMandalaNodule) return original.onSelect?.(source)

							editor.markHistoryStoppingPoint('duplicate shapes')
							editor.duplicateShapes(selectedIds, { x: 0, y: 0 })
						},
					},
				}
			},
			tools: (editor, tools) => {
				const next = {
					...tools,
					mandala: {
						id: 'mandala',
						label: 'Mandala',
						kbd: 'm',
						icon: 'tool-media',
						onSelect() {
							setShowTemplate(true)
							editor.setCurrentTool('select')
							editor.focus()
						},
					},
					'target-area': {
						id: 'target-area',
						label: 'Pick Area',
						kbd: 'c',
						icon: 'tool-screenshot',
						onSelect() {
							editor.setCurrentTool('target-area')
						},
					},
					'target-shape': {
						id: 'target-shape',
						label: 'Pick Shape',
						kbd: 's',
						icon: 'tool-pointer',
						onSelect() {
							editor.setCurrentTool('target-shape')
						},
					},
				}

				if (SHOW_FULL_TLDRAW_TOOLS) return next

				// Keep only the minimal set of tools we want exposed in the UI.
				const allowedToolIds = new Set([
					'select',
					'hand',
					'arrow',
					'text',
					'note',
					'mandala',
					'target-shape',
					'target-area',
				])

				return Object.fromEntries(
					Object.entries(next).filter(([id]) => allowedToolIds.has(id)),
				) as typeof next
			},
		}
	}, [])

	const handleSelectTemplate = useCallback(
		(templateId: string) => {
			if (!app) return
			const template =
				templateId in MANDALA_TEMPLATE_DEFINITIONS
					? MANDALA_TEMPLATE_DEFINITIONS[templateId as keyof typeof MANDALA_TEMPLATE_DEFINITIONS]
					: null
			if (!template) return

			const editor = app.editor
			const viewport = editor.getViewportPageBounds()
			const size = template.size

			editor.createShape({
				type: 'mandala',
				x: viewport.x + viewport.w / 2 - size / 2,
				y: viewport.y + viewport.h / 2 - size / 2,
				props: { w: size, h: size, state: makeEmptyState(template.framework) },
			})

			try {
				const agent = app.agents.getAgent()
				if (agent && agent.mode.getCurrentModeType() !== template.mode) {
					agent.mode.setMode(template.mode)
				}
			} catch {
				// ignore
			}

			setShowTemplate(false)
		},
		[app],
	)

	const components: TLComponents = useMemo(() => {
		return {
			StylePanel: PopoverOnlyStylePanel,
			Toolbar: ToolbarWithStylePanel,
			MainMenu: IrisMainMenu,
			MenuPanel: SHOW_FULL_TLDRAW_TOOLS ? undefined : MenuPanelWithActions,
			NavigationPanel: SHOW_FULL_TLDRAW_TOOLS ? undefined : null,
			PageMenu: SHOW_FULL_TLDRAW_TOOLS ? undefined : null,
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
						</TldrawAgentAppContextProvider>
					)}
				</>
			),
		}
	}, [app])

	return (
		<ChatPanelContext.Provider value={{ chatOpen, toggleChat }}>
			<TldrawUiToastsProvider>
				<div className="tldraw-agent-container">
					<div className="tldraw-canvas">
						<Tldraw
							persistenceKey="tldraw-agent-demo"
							options={options}
							shapeUtils={shapeUtils}
							tools={tools}
							overrides={overrides}
							components={components}
						>
							<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
						</Tldraw>
					</div>
					<div className={`agent-chat-slot${chatOpen ? ' agent-chat-slot--open' : ''}`}>
						<ErrorBoundary fallback={ChatPanelFallback}>
							{app && (
								<TldrawAgentAppContextProvider app={app}>
									<ChatPanel />
								</TldrawAgentAppContextProvider>
							)}
						</ErrorBoundary>
					</div>
					<TemplateChooser
						visible={showTemplate}
						onSelectTemplate={handleSelectTemplate}
						onRequestClose={() => setShowTemplate(false)}
					/>
				</div>
			</TldrawUiToastsProvider>
		</ChatPanelContext.Provider>
	)
}

export default App
