import type { TLShapeId } from 'tldraw'
import type { SendToBackAction } from '../../shared/schema/AgentActionSchemas'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const SendToBackActionUtil = registerActionUtil(
	class SendToBackActionUtil extends AgentActionUtil<SendToBackAction> {
		static override type = 'sendToBack' as const

		override getInfo(action: Streaming<SendToBackAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<SendToBackAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<SendToBackAction>) {
			if (!action.shapeIds) return
			this.editor.sendToBack(action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId))
		}
	},
)
