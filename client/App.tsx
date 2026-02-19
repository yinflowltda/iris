import { ReadonlySharedStyleMap } from '@tldraw/editor'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	createShapeId,
	DefaultColorStyle,
	DefaultColorThemePalette,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	DefaultStylePanel,
	DefaultToolbarContent,
	defaultShapeUtils,
	ErrorBoundary,
	MobileStylePanel,
	OverflowingToolbar,
	PORTRAIT_BREAKPOINT,
	react,
	type TLComponents,
	type TLUiOverrides,
	type TLUiStylePanelProps,
	Tldraw,
	TldrawOverlays,
	TldrawUiMenuItem,
	TldrawUiOrientationProvider,
	TldrawUiToastsProvider,
	TldrawUiToolbar,
	ToggleToolLockedButton,
	useBreakpoint,
	useEditor,
	usePassThroughWheelEvents,
	useReadonly,
	useTldrawUiComponents,
	useTools,
	useTranslation,
	useValue,
} from 'tldraw'
import type { MandalaState } from '../shared/types/MandalaTypes'
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
import { getAllCellIds, makeEmptyState } from './lib/mandala-geometry'
import { registerMandalaSnapEffect } from './lib/mandala-snap'
import { applyNodulePaletteToThemes } from './lib/nodule-color-palette'
import { CircularNoteShapeUtil } from './shapes/CircularNoteShapeUtil'
import { MandalaShapeTool } from './shapes/MandalaShapeTool'
import { type MandalaShape, MandalaShapeUtil } from './shapes/MandalaShapeUtil'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'

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

const ToolbarWithStylePanel = memo(function ToolbarWithStylePanel() {
	const editor = useEditor()
	const msg = useTranslation()
	const breakpoint = useBreakpoint()
	const isReadonlyMode = useReadonly()
	const tools = useTools()
	const activeToolId = useValue('current tool id', () => editor.getCurrentToolId(), [editor])

	const ref = useRef<HTMLDivElement>(null)
	usePassThroughWheelEvents(ref)

	const { ActionsMenu, QuickActions } = useTldrawUiComponents()

	const showQuickActions =
		editor.options.actionShortcutsLocation === 'menu'
			? false
			: editor.options.actionShortcutsLocation === 'toolbar'
				? true
				: breakpoint < PORTRAIT_BREAKPOINT.TABLET

	return (
		<TldrawUiOrientationProvider orientation="horizontal" tooltipSide="top">
			<div ref={ref} className="tlui-main-toolbar tlui-main-toolbar--horizontal">
				<div className="tlui-main-toolbar__inner">
					<div className="tlui-main-toolbar__left">
						{!isReadonlyMode && (
							<div className="tlui-main-toolbar__extras">
								{showQuickActions && (
									<TldrawUiToolbar
										orientation="horizontal"
										className="tlui-main-toolbar__extras__controls"
										label={msg('actions-menu.title')}
									>
										{QuickActions && <QuickActions />}
										{ActionsMenu && <ActionsMenu />}
									</TldrawUiToolbar>
								)}
								<ToggleToolLockedButton activeToolId={activeToolId} />
							</div>
						)}
						<OverflowingToolbar
							orientation="horizontal"
							sizingParentClassName="tlui-main-toolbar"
							minItems={4}
							maxItems={8}
							minSizePx={310}
							maxSizePx={470}
						>
							{tools.mandala && <TldrawUiMenuItem {...tools.mandala} isSelected={false} />}
							<DefaultToolbarContent />
						</OverflowingToolbar>
					</div>
					{!isReadonlyMode && (
						<div className="tlui-main-toolbar__tools tlui-main-toolbar__mobile-style-panel">
							<MobileStylePanel />
						</div>
					)}
				</div>
			</div>
		</TldrawUiOrientationProvider>
	)
})

const NOTE_HALF_SIZE = 100

function hasNoTextContent(richText: unknown): boolean {
	if (!richText || typeof richText !== 'object') return true
	const doc = richText as { content?: Array<{ content?: unknown[] }> }
	if (!doc.content) return true
	return doc.content.every((block) => !block.content || block.content.length === 0)
}

const TOTAL_CELLS = getAllCellIds(EMOTIONS_MAP).length

function countFilledCells(state: MandalaState): number {
	let count = 0
	for (const key of Object.keys(state)) {
		if (state[key]?.status === 'filled') count++
	}
	return count
}

function App() {
	const [app, setApp] = useState<TldrawAgentApp | null>(null)
	const [showTemplate, setShowTemplate] = useState(SHOW_TEMPLATE_CHOOSER)
	const [filledCells, setFilledCells] = useState(0)
	const handleUnmount = useCallback(() => {
		setApp(null)
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

			if (mandalaRef) {
				const m = app.editor.getShape(mandalaRef.id) as MandalaShape | undefined
				if (m) {
					setShowTemplate(false)
					setFilledCells(countFilledCells(m.props.state))
					return
				}
			}

			setFilledCells(0)
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

	const handleExport = useCallback(async () => {
		if (!app) return

		const editor = app.editor
		const mandala = editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as
			| MandalaShape
			| undefined
		if (!mandala) return

		try {
			const result = await editor.toImage([mandala], {
				format: 'png',
				background: true,
				padding: 32,
			})

			const url = URL.createObjectURL(result.blob)
			const a = document.createElement('a')
			a.href = url
			a.download = 'emotions-map.png'
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			URL.revokeObjectURL(url)
		} catch (e) {
			console.error('Export failed:', e)
		}
	}, [app])

	const components: TLComponents = useMemo(() => {
		return {
			StylePanel: PopoverOnlyStylePanel,
			Toolbar: ToolbarWithStylePanel,
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
		<TldrawUiToastsProvider>
			<div className="tldraw-agent-container">
				<div className="tldraw-canvas">
					<Tldraw
						persistenceKey="tldraw-agent-demo"
						shapeUtils={shapeUtils}
						tools={tools}
						overrides={overrides}
						components={components}
					>
						<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
					</Tldraw>
				</div>
				<div className="agent-chat-slot">
					<ErrorBoundary fallback={ChatPanelFallback}>
						{app && (
							<TldrawAgentAppContextProvider app={app}>
								<ChatPanel
									filledCells={filledCells}
									totalCells={TOTAL_CELLS}
									onExport={handleExport}
								/>
							</TldrawAgentAppContextProvider>
						)}
					</ErrorBoundary>
				</div>
				<TemplateChooser visible={showTemplate} onSelectTemplate={handleSelectTemplate} />
			</div>
		</TldrawUiToastsProvider>
	)
}

export default App
