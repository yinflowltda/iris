import type { PointerEvent as ReactPointerEvent } from 'react'
import { type TLShapeId, useEditor } from 'tldraw'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'

/** Collect all note shape IDs from MandalaState */
function getAllNoteShapeIds(state: MandalaState): TLShapeId[] {
	const ids: TLShapeId[] = []
	for (const cell of Object.values(state)) {
		if (cell?.contentShapeIds) {
			for (const simpleId of cell.contentShapeIds) {
				ids.push(`shape:${simpleId}` as TLShapeId)
			}
		}
	}
	return ids
}

export function ViewTenseToggle({ shape }: { shape: MandalaShape }) {
	const editor = useEditor()
	const isPastPresent = shape.props.viewTense === 'past-present'
	const newTense = isPastPresent ? 'present-future' : 'past-present'

	const noteIds = getAllNoteShapeIds(shape.props.state)
	const hasAnyFlipContent = noteIds.some((noteId) => {
		const note = editor.getShape(noteId)
		if (!note) return false
		const meta = note.meta as Record<string, unknown>
		return meta.flipContent != null
	})

	if (!hasAnyFlipContent) return null

	function toggle(e: ReactPointerEvent) {
		e.stopPropagation()
		e.preventDefault()

		editor.run(() => {
			editor.updateShape({
				id: shape.id,
				type: 'mandala',
				props: { viewTense: newTense },
			})

			const ids = getAllNoteShapeIds(shape.props.state)
			for (const noteId of ids) {
				const note = editor.getShape(noteId)
				if (!note || note.type !== 'note') continue
				const meta = note.meta as Record<string, unknown>
				if (meta.flipContent == null) continue

				const em = (meta.elementMetadata ?? {}) as Record<string, unknown>
				const currentTense = (em.tense as string) ?? 'past-present'
				if (currentTense === newTense) continue

				editor.updateShape({
					id: noteId,
					type: 'note',
					props: { richText: meta.flipContent as any },
					meta: {
						...meta,
						flipContent: note.props.richText as any,
						flipTense: (em.tense as string) ?? 'past-present',
						elementMetadata: { ...em, tense: meta.flipTense as any },
					} as any,
				})
			}
		})
	}

	return (
		<div
			style={{
				position: 'absolute',
				bottom: 8,
				left: 8,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 2,
				pointerEvents: 'all',
			}}
		>
			<button
				type="button"
				onPointerDown={toggle}
				style={{
					width: 36,
					height: 36,
					borderRadius: '50%',
					background: isPastPresent ? 'rgba(255, 255, 255, 0.9)' : '#d1fae5',
					border: isPastPresent ? '1px solid #ccc' : '1px solid #10b981',
					cursor: 'pointer',
					fontSize: 18,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					backdropFilter: 'blur(4px)',
					userSelect: 'none',
				}}
				title={`Switch to ${newTense} view`}
			>
				↻
			</button>
			<span
				style={{
					fontSize: 9,
					fontFamily: 'system-ui, sans-serif',
					fontWeight: 600,
					color: isPastPresent ? '#555' : '#10b981',
					textTransform: 'uppercase',
					whiteSpace: 'nowrap',
					userSelect: 'none',
				}}
			>
				{isPastPresent ? 'Past-Present' : 'Present-Future'}
			</span>
		</div>
	)
}
