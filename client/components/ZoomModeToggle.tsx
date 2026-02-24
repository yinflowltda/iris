import { useEditor } from 'tldraw'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'

export function ZoomModeToggle({ shape }: { shape: MandalaShape }) {
	const editor = useEditor()
	const isFocus = shape.props.zoomMode === 'focus'

	function toggle() {
		editor.updateShape({
			id: shape.id,
			type: 'mandala',
			props: {
				zoomMode: isFocus ? 'navigate' : 'focus',
				...(isFocus ? { zoomedNodeId: null } : {}),
			},
		})
	}

	return (
		<button
			type="button"
			onClick={toggle}
			style={{
				position: 'absolute',
				bottom: 8,
				right: 8,
				background: 'rgba(255, 255, 255, 0.9)',
				border: '1px solid #ccc',
				borderRadius: 6,
				padding: '4px 8px',
				cursor: 'pointer',
				fontSize: 12,
				fontFamily: 'system-ui, sans-serif',
				color: '#555',
				backdropFilter: 'blur(4px)',
				userSelect: 'none',
			}}
			title={
				isFocus
					? 'Focus mode (click to switch to Navigate)'
					: 'Navigate mode (click to switch to Focus)'
			}
		>
			{isFocus ? 'Focus' : 'Navigate'}
		</button>
	)
}
