import { useCallback, useEffect, useMemo, useState } from 'react'
import {
	DefaultColorThemePalette,
	DefaultSizeStyle,
	defaultShapeUtils,
	ErrorBoundary,
	react,
	type TLComponents,
	type TLUiOverrides,
	Tldraw,
	TldrawOverlays,
	TldrawUiToastsProvider,
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

const shapeUtils = [
	...defaultShapeUtils.map((shapeUtil) =>
		shapeUtil.type === 'note' ? CircularNoteShapeUtil : shapeUtil,
	),
	MandalaShapeUtil,
]
const tools = [MandalaShapeTool, TargetShapeTool, TargetAreaTool]
const overrides: TLUiOverrides = {
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
		return {
			...tools,
			'target-area': {
				id: 'target-area',
				label: 'Pick Area',
				kbd: 'c',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-area')
				},
			},
			'target-shape': {
				id: 'target-shape',
				label: 'Pick Shape',
				kbd: 's',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-shape')
				},
			},
		}
	},
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
	const [showTemplate, setShowTemplate] = useState(true)
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

		return () => {
			cleanupProgress()
			cleanupSnap()
		}
	}, [app])

	const handleSelectTemplate = useCallback(
		(frameworkId: string) => {
			if (!app || frameworkId !== 'emotions-map') return

			const editor = app.editor
			const viewport = editor.getViewportPageBounds()
			const size = 600

			editor.createShape({
				type: 'mandala',
				x: viewport.x + viewport.w / 2 - size / 2,
				y: viewport.y + viewport.h / 2 - size / 2,
				isLocked: true,
				props: { w: size, h: size, state: makeEmptyState(EMOTIONS_MAP) },
			})

			try {
				const agent = app.agents.getAgent()
				if (agent && agent.mode.getCurrentModeType() !== 'emotions-map') {
					agent.mode.setMode('emotions-map')
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
				<TemplateChooser visible={showTemplate} onSelectTemplate={handleSelectTemplate} />
			</div>
		</TldrawUiToastsProvider>
	)
}

export default App
