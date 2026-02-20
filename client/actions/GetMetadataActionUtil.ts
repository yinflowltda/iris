import type { TLShapeId } from 'tldraw'
import type { GetMetadataAction } from '../../shared/schema/AgentActionSchemas'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { findElementCell, validateElementExists } from './element-lookup-utils'
import { resolveMandalaId } from './mandala-action-utils'

export const GetMetadataActionUtil = registerActionUtil(
	class GetMetadataActionUtil extends AgentActionUtil<GetMetadataAction> {
		static override type = 'get_metadata' as const

		override getInfo(action: Streaming<GetMetadataAction>) {
			return {
				icon: 'search' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<GetMetadataAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = resolveMandalaId(this.editor, helpers, action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			if (!action.elementId) return null

			return action
		}

		override async applyAction(action: Streaming<GetMetadataAction>, helpers: AgentHelpers) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const elementShape = validateElementExists(editor, mandala, action.elementId)
			if (!elementShape) return

			const cellId = findElementCell(mandala.props.state, action.elementId)
			if (!cellId) return

			const shapeMeta = (elementShape.meta as Record<string, unknown>) ?? {}
			const elementMetadata = (shapeMeta.elementMetadata as Record<string, unknown>) ?? {}

			const util = editor.getShapeUtil(elementShape)
			const label = util.getText(elementShape) ?? ''

			const { agent } = helpers
			agent.schedule({
				data: [
					JSON.stringify({
						element_id: action.elementId,
						cell_id: cellId,
						label,
						metadata: elementMetadata,
					}),
				],
			})
		}
	},
)
