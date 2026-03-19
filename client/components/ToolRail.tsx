import { useValue } from 'tldraw'
import { useTldrawAgentApp } from '../agent/TldrawAgentAppProvider'
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
	const editor = useTldrawAgentApp().editor
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
