import { type TLShapeId } from 'tldraw'
import type { FlipNoteAction } from '../../shared/schema/AgentActionSchemas'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { validateElementExists } from './element-lookup-utils'
import { resolveMandalaId } from './mandala-action-utils'

export const FlipNoteActionUtil = registerActionUtil(
	class FlipNoteActionUtil extends AgentActionUtil<FlipNoteAction> {
		static override type = 'flip_note' as const

		override getInfo(action: Streaming<FlipNoteAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<FlipNoteAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = resolveMandalaId(this.editor, helpers, action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			const mandalaShapeId = `shape:${mandalaId}` as TLShapeId
			const mandala = this.editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return null

			// Validate note exists
			const noteId = helpers.ensureShapeIdExists(action.noteId)
			if (!noteId) return null
			action.noteId = noteId

			const sourceShape = validateElementExists(this.editor, mandala, noteId)
			if (!sourceShape) return null

			return action
		}

		override applyAction(action: Streaming<FlipNoteAction>) {
			if (!action.complete) return

			const noteShapeId = `shape:${action.noteId}` as TLShapeId
			const shape = this.editor.getShape(noteShapeId)
			if (!shape) return

			const meta = shape.meta as Record<string, unknown>
			const elementMetadata = (meta.elementMetadata ?? {}) as Record<string, unknown>
			const currentTense = (elementMetadata.tense as string) ?? 'past-present'
			const oppositeTense = currentTense === 'past-present' ? 'present-future' : 'past-present'

			this.editor.updateShape({
				id: noteShapeId,
				type: 'note',
				meta: {
					...meta,
					flipContent: action.content,
					flipTense: oppositeTense,
					elementMetadata: {
						...elementMetadata,
						tense: currentTense, // ensure tense is set
					},
				},
			})
		}
	},
)
