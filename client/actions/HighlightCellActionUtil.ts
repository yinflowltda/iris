import type { TLShapeId } from 'tldraw'
import type { HighlightCellAction } from '../../shared/schema/AgentActionSchemas'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { EMOTIONS_MAP } from '../lib/frameworks/emotions-map'
import { isValidCellId } from '../lib/mandala-geometry'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const HighlightCellActionUtil = registerActionUtil(
	class HighlightCellActionUtil extends AgentActionUtil<HighlightCellAction> {
		static override type = 'highlight_cell' as const

		override getInfo(action: Streaming<HighlightCellAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<HighlightCellAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = helpers.ensureShapeIdExists(action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			if (!action.cellId || !isValidCellId(EMOTIONS_MAP, action.cellId)) return null

			return action
		}

		override applyAction(action: Streaming<HighlightCellAction>) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const cellId = action.cellId as string
			const currentState: MandalaState = { ...mandala.props.state }
			const cellState = currentState[cellId]
			if (!cellState) return

			currentState[cellId] = {
				...cellState,
				status: cellState.status === 'filled' ? 'filled' : 'active',
			}

			editor.updateShape({
				id: mandalaShapeId,
				type: 'mandala',
				props: { state: currentState },
			})
		}
	},
)
