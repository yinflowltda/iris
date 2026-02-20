import type { JsonObject, TLShapeId } from 'tldraw'
import type { SetMetadataAction } from '../../shared/schema/AgentActionSchemas'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import {
	findElementCell,
	mergeMetadata,
	validateElementExists,
	validateMetadataForCell,
} from './element-lookup-utils'
import { resolveMandalaId } from './mandala-action-utils'

export const SetMetadataActionUtil = registerActionUtil(
	class SetMetadataActionUtil extends AgentActionUtil<SetMetadataAction> {
		static override type = 'set_metadata' as const

		override getInfo(action: Streaming<SetMetadataAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<SetMetadataAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = resolveMandalaId(this.editor, helpers, action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			if (!action.elementId) return null
			if (!action.metadata || typeof action.metadata !== 'object') return null

			return action
		}

		override applyAction(action: Streaming<SetMetadataAction>) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const elementShape = validateElementExists(editor, mandala, action.elementId)
			if (!elementShape) return

			const cellId = findElementCell(mandala.props.state, action.elementId)
			if (!cellId) return

			const validated = validateMetadataForCell(cellId, action.metadata)
			if (Object.keys(validated).length === 0) return

			const existingMeta = (elementShape.meta as Record<string, unknown>) ?? {}
			const existingElementMetadata =
				(existingMeta.elementMetadata as Record<string, unknown>) ?? {}

			const merged = mergeMetadata(existingElementMetadata, validated)

			editor.updateShape({
				id: elementShape.id,
				type: elementShape.type,
				meta: {
					...existingMeta,
					elementMetadata: merged,
				} as Partial<JsonObject>,
			})
		}
	},
)
