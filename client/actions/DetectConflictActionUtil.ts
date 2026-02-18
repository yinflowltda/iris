import type { TLShapeId } from 'tldraw'
import type { DetectConflictAction } from '../../shared/schema/AgentActionSchemas'
import type { CellId, MandalaState } from '../../shared/types/MandalaTypes'
import { RING_IDS, SLICE_IDS } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
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
			if (!action.cellIds.every(isValidCellId)) return null

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
				const cellId = id as CellId
				const cellState = currentState[cellId]
				if (!cellState) continue

				currentState[cellId] = {
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

function isValidCellId(cellId: string): boolean {
	const parts = cellId.split('-')
	if (parts.length !== 2) return false
	return SLICE_IDS.includes(parts[0] as any) && RING_IDS.includes(parts[1] as any)
}
