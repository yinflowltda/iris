import type { JsonObject, TLShapeId } from 'tldraw'
import type { SetNoteMetadataAction } from '../../shared/schema/AgentActionSchemas'
import type { NoteMetadata } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const SetNoteMetadataActionUtil = registerActionUtil(
	class SetNoteMetadataActionUtil extends AgentActionUtil<SetNoteMetadataAction> {
		static override type = 'set_note_metadata' as const

		override getInfo(action: Streaming<SetNoteMetadataAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<SetNoteMetadataAction>, _helpers: AgentHelpers) {
			if (!action.complete) return action
			if (!action.shapeId) return null
			if (!action.metadata || typeof action.metadata !== 'object') return null
			return action
		}

		override applyAction(action: Streaming<SetNoteMetadataAction>) {
			if (!action.complete) return

			const { editor } = this
			const shapeId = `shape:${action.shapeId}` as TLShapeId
			const shape = editor.getShape(shapeId)
			if (!shape || shape.type !== 'note') return

			const existingMeta = (shape.meta as Record<string, unknown>) ?? {}
			const existingNoteMetadata = (existingMeta.noteMetadata as NoteMetadata) ?? {}
			const merged = { ...existingNoteMetadata, ...action.metadata }

			editor.updateShape({
				id: shape.id,
				type: shape.type,
				meta: {
					...existingMeta,
					noteMetadata: merged as unknown,
				} as Partial<JsonObject>,
			})
		}
	},
)
