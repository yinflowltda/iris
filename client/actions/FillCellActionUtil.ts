import { type TLShapeId, toRichText } from 'tldraw'
import type { FillCellAction } from '../../shared/schema/AgentActionSchemas'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { EMOTIONS_MAP } from '../lib/frameworks/emotions-map'
import { getCellCenter, isValidCellId } from '../lib/mandala-geometry'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const FillCellActionUtil = registerActionUtil(
	class FillCellActionUtil extends AgentActionUtil<FillCellAction> {
		static override type = 'fill_cell' as const

		override getInfo(action: Streaming<FillCellAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<FillCellAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = helpers.ensureShapeIdExists(action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			if (!action.cellId || !isValidCellId(EMOTIONS_MAP, action.cellId)) return null

			return action
		}

		override applyAction(action: Streaming<FillCellAction>) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const cellId = action.cellId as string
			const radius = Math.min(mandala.props.w, mandala.props.h) / 2
			const shapeCenter = {
				x: mandala.x + mandala.props.w / 2,
				y: mandala.y + mandala.props.h / 2,
			}

			const center = getCellCenter(EMOTIONS_MAP, shapeCenter, radius, cellId)
			if (!center) return

			const contentShapeId = `shape:${action.mandalaId}-${cellId}` as TLShapeId
			const existingShape = editor.getShape(contentShapeId)

			if (existingShape) {
				editor.updateShape({
					id: contentShapeId,
					type: 'text',
					props: { richText: toRichText(action.content) },
				})
			} else {
				editor.createShape({
					id: contentShapeId,
					type: 'text',
					x: center.x - 40,
					y: center.y - 10,
					props: {
						richText: toRichText(action.content),
						color: 'black',
						size: 's',
						font: 'draw',
						scale: 1,
						textAlign: 'middle' as any,
						autoSize: true,
						w: 80,
					},
				})
			}

			const currentState: MandalaState = { ...mandala.props.state }
			const simpleContentId = `${action.mandalaId}-${cellId}` as SimpleShapeId
			currentState[cellId] = {
				status: 'filled',
				contentShapeIds: [
					...(currentState[cellId]?.contentShapeIds ?? []).filter((id) => id !== simpleContentId),
					simpleContentId,
				],
			}

			editor.updateShape({
				id: mandalaShapeId,
				type: 'mandala',
				props: { state: currentState },
			})
		}
	},
)
