// client/components/PanelHeader.tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { type TLShapeId, useValue } from 'tldraw'
import { useTldrawAgentApp } from '../agent/TldrawAgentAppProvider'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'

// NOTE: This hook is moved verbatim from App.tsx (lines 296-334).
// It uses useValue for reactive mandala tracking and useCallback for stable identity.
const ARROW_VISIBLE_OPACITY = 0.6

function useArrowsVisible(): [boolean, () => void] {
	const editor = useTldrawAgentApp().editor
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
	const editor = useTldrawAgentApp().editor
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
