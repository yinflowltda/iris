import { Extension } from '@tiptap/core'
import { CharacterCount } from '@tiptap/extensions'
import { ReadonlySharedStyleMap } from '@tldraw/editor'
import {
	createContext,
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
	defaultShapeUtils,
	ErrorBoundary,
	react,
	type TLComponents,
	type TLUiOverrides,
	type TLUiStylePanelProps,
	tipTapDefaultExtensions,
	Tldraw,
	TldrawOverlays,
	TldrawUiMenuCheckboxItem,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	TldrawUiToastsProvider,
	useEditor,
	useValue,
} from 'tldraw'
import type { TldrawAgentApp } from './agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from './agent/TldrawAgentAppProvider'
import { LeftPanel } from './components/LeftPanel'
import { useArrowsVisible } from './components/PanelHeader'
import { ToolRail } from './components/ToolRail'
import { MandalaCoverContext } from './components/MandalaCoverContext'
import { ChatPanelFallback } from './components/ChatPanelFallback'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { AgentViewportBoundsHighlights } from './components/highlights/AgentViewportBoundsHighlights'
import { AllContextHighlights } from './components/highlights/ContextHighlights'
import { CellSuggestionOverlay } from './components/CellSuggestionOverlay'
import { EdgeTypePicker } from './components/EdgeTypePicker'
import { TemplateChooser } from './components/TemplateChooser'
import { setActiveMandalaId } from './lib/frameworks/active-framework'
import './lib/frameworks/emotions-map'
import './lib/frameworks/life-map'
import { getFramework } from './lib/frameworks/framework-registry'
import { makeEmptyState } from './lib/mandala-geometry'
import { findNonOverlappingPosition } from './lib/mandala-placement'
import { CkksService } from './lib/flora/ckks-service'
import { registerArrowBindingDetector } from './lib/mandala-arrow-binding'
import { registerMandalaSnapEffect } from './lib/mandala-snap'
import { applyNodulePaletteToThemes } from './lib/nodule-color-palette'
import { FLSettingsPanel } from './components/FLSettingsPanel'
import { useLocalTrainer } from './lib/flora/use-local-trainer'
import { useFLOrchestrator } from './lib/flora/use-fl-orchestrator'
import { CloudflareFLTransport } from './lib/flora/cloudflare-fl-transport'
import { CircularNoteShapeUtil } from './shapes/CircularNoteShapeUtil'
import { MandalaShapeTool } from './shapes/MandalaShapeTool'
import { type MandalaShape, MandalaShapeUtil } from './shapes/MandalaShapeUtil'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { MandalaIcon } from '../shared/icons/MandalaIcon'
import { NoteIcon } from '../shared/icons/NoteIcon'
import { TargetShapeTool } from './tools/TargetShapeTool'
import type { User } from '../shared/types/User'
import { useAuthSync } from './lib/use-auth-sync'
import { useRoom } from './lib/use-room'
import { RoomRegistry } from './components/RoomRegistry'
import { ShareButton } from './components/ShareButton'

// ─── Contexts ─────────────────────────────────────────────────────────────────
const FLSettingsContext = createContext<{ openFLSettings: () => void }>({
	openFLSettings: () => {},
})

const NavigationContext = createContext<{ navigateTo: (path: string) => void }>({
	navigateTo: () => {},
})

const AuthUserContext = createContext<User | null>(null)

export function useAuthUser(): User {
	const user = useContext(AuthUserContext)
	if (!user) throw new Error('useAuthUser must be used within AuthUserContext')
	return user
}

function useAuth() {
	const [user, setUser] = useState<User | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		fetch('/me', { credentials: 'include' })
			.then(async (res) => {
				if (res.status === 401 || res.status === 403) {
					// Access session expired — redirect to login
					window.location.reload()
					return
				}
				if (!res.ok) throw new Error(`/me failed: ${res.status}`)
				const data = await res.json()
				setUser(data as User)
			})
			.catch((err) => setError(err.message))
			.finally(() => setLoading(false))
	}, [])

	return { user, loading, error }
}

DefaultSizeStyle.setDefaultValue('s')
applyNodulePaletteToThemes(DefaultColorThemePalette.lightMode, DefaultColorThemePalette.darkMode)

const SHOW_TEMPLATE_CHOOSER = true

const MANDALA_TEMPLATE_DEFINITIONS = {
	'emotions-map': {
		mode: 'mandala',
		frameworkId: 'emotions-map',
	},
	'life-map': {
		mode: 'mandala',
		frameworkId: 'life-map',
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

function IrisMainMenu() {
	const [arrowsVisible, toggleArrowsVisible] = useArrowsVisible()
	const { openFLSettings } = useContext(FLSettingsContext)
	const { navigateTo } = useContext(NavigationContext)

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
				<TldrawUiMenuItem
					id="fl-settings"
					label="Privacy & Learning"
					readonlyOk
					onSelect={openFLSettings}
				/>
				<TldrawUiMenuItem
					id="rooms"
					label="← Rooms"
					readonlyOk
					onSelect={() => navigateTo('/rooms')}
				/>
			</TldrawUiMenuGroup>
			<DefaultMainMenuContent />
		</DefaultMainMenu>
	)
}

/**
 * Mounts FL training + orchestration hooks inside the Tldraw context.
 * Wires useLocalTrainer → useFLOrchestrator so training completions
 * automatically trigger FL round participation when consented.
 */
function FLHooksMount() {
	const editor = useEditor()
	const user = useAuthUser()
	const mandala = useValue(
		'fl-mandala',
		() =>
			editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as MandalaShape | undefined,
		[editor],
	)

	const mapId = mandala?.props.frameworkId ?? null

	const flConfig = useMemo(
		() => (mapId ? { transport: new CloudflareFLTransport(''), mapId, clientId: user.sub } : null),
		[mapId, user.sub],
	)

	const { onAfterTrain: flOnAfterTrain } = useFLOrchestrator(flConfig)
	const exampleCountRef = useRef(0)

	const trainerState = useLocalTrainer({
		onAfterTrain: (_result, adapter, preSnapshot) => {
			flOnAfterTrain(adapter, exampleCountRef.current, preSnapshot)
		},
	})
	exampleCountRef.current = trainerState.exampleCount

	return null
}

const NOTE_HALF_SIZE = 98

function hasNoTextContent(richText: unknown): boolean {
	if (!richText || typeof richText !== 'object') return true
	const doc = richText as { content?: Array<{ content?: unknown[] }> }
	if (!doc.content) return true
	return doc.content.every((block) => !block.content || block.content.length === 0)
}

function App() {
	const { user, loading, error: authError } = useAuth()
	const { route, roomInfo, sharedRooms, navigateTo } = useRoom(user?.sub ?? '')
	const syncRoomId = roomInfo?.ownerSub ?? ''
	const syncStore = useAuthSync(syncRoomId, shapeUtils)
	const [app, setApp] = useState<TldrawAgentApp | null>(null)
	const [showTemplate, setShowTemplate] = useState(SHOW_TEMPLATE_CHOOSER)
	const [showFLSettings, setShowFLSettings] = useState(false)
	const flSettingsCtx = useMemo(
		() => ({ openFLSettings: () => setShowFLSettings(true) }),
		[],
	)
	const navigationCtx = useMemo(
		() => ({ navigateTo }),
		[navigateTo],
	)
	const [chatOpen, setChatOpen] = useState(false)
	const toggleChat = useCallback(() => setChatOpen((v) => !v), [])
	const chatInputRef = useRef<HTMLTextAreaElement>(null)

	const handleCoverSlideClick = useCallback(
		(slideText: string) => {
			if (!app) return
			const agent = app.agents.getAgent()
			if (!agent) return

			// Send as a real user message so the agent processes and responds
			agent.interrupt({
				input: {
					agentMessages: [slideText],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})

			// Open chat sidebar
			setChatOpen(true)

			// Focus chat input (defer so sidebar renders)
			requestAnimationFrame(() => {
				chatInputRef.current?.focus()
			})
		},
		[app],
	)
	const handleUnmount = useCallback(() => {
		setApp(null)
	}, [])

	const options = useMemo(() => {
		return {
			// Keep "Actions" next to the hamburger menu (top-left).
			actionShortcutsLocation: 'menu' as const,
		}
	}, [])

	const textOptions = useMemo(() => {
		const MAX_LINE_BREAKS = 20

		const LineBreakLimit = Extension.create({
			name: 'lineBreakLimit',
			addKeyboardShortcuts() {
				const blockIfTooManyBreaks = (editor: any) => {
					const paragraphs = editor.state.doc.content.childCount
					return paragraphs >= MAX_LINE_BREAKS
				}
				return {
					Enter: ({ editor }) => blockIfTooManyBreaks(editor),
					'Shift-Enter': ({ editor }) => blockIfTooManyBreaks(editor),
				}
			},
		})

		return {
			tipTapConfig: {
				extensions: [
					...tipTapDefaultExtensions,
					CharacterCount.configure({ limit: 420 }),
					LineBreakLimit,
				],
			},
		}
	}, [])

	// Session resume + reactive progress tracking
	useEffect(() => {
		if (!app) return

		// Session resume: if mandala already exists, switch to mandala mode
		const existing = app.editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as
			| MandalaShape
			| undefined
		if (existing) {
			setActiveMandalaId(existing.id)
			setShowTemplate(false)
			try {
				const agent = app.agents.getAgent()
				if (agent && agent.mode.getCurrentModeType() !== 'mandala') {
					agent.mode.setMode('mandala')
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
		const cleanupArrowBinding = registerArrowBindingDetector(app.editor)

		const cleanupMandalaSelection = app.editor.sideEffects.registerBeforeChangeHandler(
			'instance_page_state',
			(_prev, next) => {
				const mandalaIds = new Set(
					app.editor
						.getCurrentPageShapes()
						.filter((s) => s.type === 'mandala')
						.map((s) => s.id),
				)
				if (mandalaIds.size === 0) return next
				const filtered = next.selectedShapeIds.filter((id) => !mandalaIds.has(id))
				// Only strip mandalas from selection when other shapes are also selected
				// (box-select scenario). Allow sole mandala selection for right-click context menu.
				if (filtered.length > 0 && filtered.length !== next.selectedShapeIds.length) {
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
				})
			},
		)

		// Expose services on window for browser testing
		const ckks = CkksService.getInstance()
		;(window as any).ckks = ckks

		return () => {
			cleanupProgress()
			cleanupSnap()
			cleanupArrowBinding()
			cleanupMandalaSelection()
			cleanupDoubleClickNote()
		}
	}, [app])

	const overrides: TLUiOverrides = useMemo(() => {
		return {
			actions: (editor, actions) => {
				const original = actions.duplicate
				if (!original) return actions

				const originalToggleLock = actions['toggle-lock']
				return {
					...actions,
					'toggle-lock': {
						...originalToggleLock,
						onSelect(source) {
							const selected = editor.getSelectedShapes()
							if (selected.length > 0 && selected.every((s) => s.type === 'mandala')) return
							originalToggleLock.onSelect?.(source)
						},
					},
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
				// Override the note tool icon with a circular note
				if (tools.note) {
					tools.note.icon = <NoteIcon />

				}
				const next = {
					...tools,
					mandala: {
						id: 'mandala',
						label: 'Mandala',
						kbd: 'm',
						icon: <MandalaIcon />,
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

			const framework = getFramework(template.frameworkId)
			const editor = app.editor
			const viewport = editor.getViewportPageBounds()
			const size = framework.visual.defaultSize

			const existingMandalas = editor
				.getCurrentPageShapes()
				.filter((s): s is MandalaShape => s.type === 'mandala')
				.map((s) => ({ x: s.x, y: s.y, w: s.props.w, h: s.props.h }))

			const position = findNonOverlappingPosition(
				existingMandalas,
				{ x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h },
				size,
			)

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
			Toolbar: null,
			MainMenu: IrisMainMenu,
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

	if (loading) return <div className="auth-loading">Loading...</div>
	if (authError || !user) return <div className="auth-error">Authentication required. Refreshing...</div>

	if (route === 'loading') return <div className="auth-loading">Loading...</div>

	if (route === 'registry') {
		return (
			<AuthUserContext.Provider value={user}>
				<RoomRegistry
					user={user}
					sharedRooms={sharedRooms}
					onEnterRoom={(slug) => navigateTo(`/r/${slug}`)}
				/>
			</AuthUserContext.Provider>
		)
	}

	return (
		<AuthUserContext.Provider value={user}>
			{roomInfo?.isOwner && <ShareButton roomId={user.sub} roomSlug={user.room_slug} />}
			{roomInfo && !roomInfo.isOwner && roomInfo.permission === 'view' && <div className="readonly-badge">View only</div>}
			<MandalaCoverContext.Provider value={{ onCoverSlideClick: handleCoverSlideClick }}>
			<FLSettingsContext.Provider value={flSettingsCtx}>
			<NavigationContext.Provider value={navigationCtx}>
					<TldrawUiToastsProvider>
						<div className="iris-app">
							{/* Left panel: chat only */}
							<ErrorBoundary fallback={ChatPanelFallback}>
								{app && (
									<TldrawAgentAppContextProvider app={app}>
										<LeftPanel
											panelOpen={chatOpen}
											onTogglePanel={toggleChat}
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

								{/* Tool bar — bottom center of canvas */}
								{app && (
									<TldrawAgentAppContextProvider app={app}>
										<div className="canvas-bottom-bar">
											<ToolRail
												panelOpen={chatOpen}
												onTogglePanel={toggleChat}
												onMandalaToolSelect={() => {
													setShowTemplate(true)
													app.editor.setCurrentTool('select')
													app.editor.focus()
												}}
											/>
										</div>
									</TldrawAgentAppContextProvider>
								)}
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
			</NavigationContext.Provider>
			</FLSettingsContext.Provider>
			</MandalaCoverContext.Provider>
		</AuthUserContext.Provider>
	)
}

export default App
