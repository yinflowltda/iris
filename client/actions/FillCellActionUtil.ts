import { type TLShapeId, toRichText } from 'tldraw'
import type { FillCellAction } from '../../shared/schema/AgentActionSchemas'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { CellId, MandalaConfig, MandalaState } from '../../shared/types/MandalaTypes'
import { RING_IDS, SLICE_IDS } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { EMOTIONS_MAP_FRAMEWORK } from '../lib/frameworks/emotions-map'
import { getCellCenter } from '../lib/mandala-geometry'
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

			if (!action.cellId || !isValidCellId(action.cellId)) return null

			return action
		}

		override applyAction(action: Streaming<FillCellAction>) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const cellId = action.cellId as CellId
			const sliceIndex = SLICE_IDS.indexOf(cellId.split('-')[0] as any)
			const ringIndex = RING_IDS.indexOf(cellId.split('-')[1] as any)
			if (sliceIndex === -1 || ringIndex === -1) return

			const config: MandalaConfig = {
				center: {
					x: mandala.x + mandala.props.w / 2,
					y: mandala.y + mandala.props.h / 2,
				},
				radius: Math.min(mandala.props.w, mandala.props.h) / 2,
				slices: SLICE_IDS,
				rings: RING_IDS,
				startAngle: EMOTIONS_MAP_FRAMEWORK.startAngle,
			}

			const center = getCellCenter(config, sliceIndex, ringIndex)

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

function isValidCellId(cellId: string): boolean {
	const parts = cellId.split('-')
	if (parts.length !== 2) return false
	return SLICE_IDS.includes(parts[0] as any) && RING_IDS.includes(parts[1] as any)
}
