import { memo, useCallback, useEffect, useState } from 'react'
import { useEditor } from 'tldraw'
import type { EdgeTypeDef } from '../../shared/types/MandalaTypes'
import {
	cancelArrow,
	finalizeArrow,
	onPendingArrowChange,
	type PendingArrow,
} from '../lib/mandala-arrow-binding'

// ─── Edge Type Button ───────────────────────────────────────────────────────

function EdgeTypeButton({
	edgeType,
	onSelect,
}: {
	edgeType: EdgeTypeDef
	onSelect: (et: EdgeTypeDef) => void
}) {
	const dotColor =
		edgeType.color === 'red' ? '#ef4444' : edgeType.color === 'green' ? '#22c55e' : '#6b7280'

	return (
		<button
			type="button"
			className="edge-type-option"
			onPointerDown={(e) => {
				e.stopPropagation()
				e.preventDefault()
				onSelect(edgeType)
			}}
			title={edgeType.suggestWhen ?? edgeType.empiricalBasis}
		>
			<span className="edge-type-dot" style={{ background: dotColor }} />
			<span className="edge-type-label">{edgeType.label}</span>
		</button>
	)
}

// ─── Edge Type Picker Overlay ───────────────────────────────────────────────

export const EdgeTypePicker = memo(function EdgeTypePicker() {
	const editor = useEditor()
	const [pending, setPending] = useState<PendingArrow | null>(null)

	useEffect(() => {
		return onPendingArrowChange(setPending)
	}, [])

	const handleSelect = useCallback(
		(edgeType: EdgeTypeDef) => {
			finalizeArrow(editor, edgeType)
		},
		[editor],
	)

	const handleCancel = useCallback(() => {
		cancelArrow(editor)
	}, [editor])

	// Close on Escape
	useEffect(() => {
		if (!pending) return
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.stopPropagation()
				cancelArrow(editor)
			}
		}
		window.addEventListener('keydown', onKeyDown, { capture: true })
		return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
	}, [pending, editor])

	if (!pending) return null

	return (
		<>
			{/* Backdrop to capture clicks outside */}
			<div
				className="edge-type-backdrop"
				onPointerDown={(e) => {
					e.stopPropagation()
					handleCancel()
				}}
			/>
			{/* Picker popup positioned at arrow midpoint */}
			<div
				className="edge-type-picker"
				style={{
					position: 'absolute',
					left: pending.pickerPosition.x,
					top: pending.pickerPosition.y,
					transform: 'translate(-50%, -100%) scale(var(--tl-scale))',
					transformOrigin: 'bottom center',
				}}
			>
				<div className="edge-type-header">Connection type</div>
				<div className="edge-type-list">
					{pending.validEdgeTypes.map((et) => (
						<EdgeTypeButton key={et.id} edgeType={et} onSelect={handleSelect} />
					))}
				</div>
			</div>
		</>
	)
})
