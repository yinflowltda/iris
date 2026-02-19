import type { TLShapeId } from 'tldraw'
import type { DetectConflictAction } from '../../shared/schema/AgentActionSchemas'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { EMOTIONS_MAP } from '../lib/frameworks/emotions-map'
import { isValidCellId } from '../lib/mandala-geometry'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const DetectConflictActionUtil = registerActionUtil(
	class DetectConflictActionUtil extends AgentActionUtil<DetectConflictAction> {
		static override type = 'detect_conflict' as const

		override getInfo(action: Streaming<DetectConflictAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<DetectConflictAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = helpers.ensureShapeIdExists(action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			if (!action.cellIds || action.cellIds.length < 2) return null
			if (!action.cellIds.every((id) => isValidCellId(EMOTIONS_MAP, id))) return null

			return action
		}

		override applyAction(action: Streaming<DetectConflictAction>) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const currentState: MandalaState = { ...mandala.props.state }
			for (const id of action.cellIds) {
				const cellState = currentState[id]
				if (!cellState) continue

				currentState[id] = {
					...cellState,
					status: 'active',
				}
			}

			editor.updateShape({
				id: mandalaShapeId,
				type: 'mandala',
				props: { state: currentState },
			})
		}
	},
)
