import { type TLShapeId, toRichText } from 'tldraw'
import type { CreateArrowAction } from '../../shared/schema/AgentActionSchemas'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { MandalaArrowRecord } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { findElementCell, validateElementExists } from './element-lookup-utils'
import { resolveMandalaId } from './mandala-action-utils'

const ARROW_OPACITY = 0.6

export const CreateArrowActionUtil = registerActionUtil(
	class CreateArrowActionUtil extends AgentActionUtil<CreateArrowAction> {
		static override type = 'create_arrow' as const

		override getInfo(action: Streaming<CreateArrowAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<CreateArrowAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = resolveMandalaId(this.editor, helpers, action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			if (!action.sourceElementId || !action.targetElementId) return null
			if (!action.color) return null

			return action
		}

		override applyAction(action: Streaming<CreateArrowAction>) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const sourceShape = validateElementExists(editor, mandala, action.sourceElementId)
			const targetShape = validateElementExists(editor, mandala, action.targetElementId)
			if (!sourceShape || !targetShape) return

			const existingArrows = mandala.props.arrows ?? []
			const duplicate = existingArrows.find(
				(a) =>
					a.sourceElementId === action.sourceElementId &&
					a.targetElementId === action.targetElementId &&
					a.color === action.color,
			)
			if (duplicate) return

			const sourceCellId = findElementCell(mandala.props.state, action.sourceElementId)
			const targetCellId = findElementCell(mandala.props.state, action.targetElementId)
			const arrowSimpleId =
				`${action.mandalaId}-arrow-${sourceCellId ?? 'x'}-${targetCellId ?? 'x'}-${existingArrows.length}` as SimpleShapeId
			const arrowShapeId = `shape:${arrowSimpleId}` as TLShapeId

			const sourceBounds = editor.getShapeGeometry(sourceShape.id).bounds
			const targetBounds = editor.getShapeGeometry(targetShape.id).bounds

			const sx = sourceShape.x + sourceBounds.w / 2
			const sy = sourceShape.y + sourceBounds.h / 2
			const tx = targetShape.x + targetBounds.w / 2
			const ty = targetShape.y + targetBounds.h / 2

			const minX = Math.min(sx, tx)
			const minY = Math.min(sy, ty)

			const arrowsVisible = mandala.props.arrowsVisible !== false
			editor.createShape({
				id: arrowShapeId,
				type: 'arrow',
				parentId: mandalaShapeId,
				x: minX,
				y: minY,
				opacity: arrowsVisible ? ARROW_OPACITY : 0,
				props: {
					color: 'grey' as any,
					dash: 'dashed' as any,
					size: 's' as any,
					arrowheadStart: 'none' as any,
					arrowheadEnd: 'arrow' as any,
					start: { x: sx - minX, y: sy - minY },
					end: { x: tx - minX, y: ty - minY },
					richText: toRichText(action.label ?? ''),
					font: 'draw' as any,
					fill: 'none' as any,
					kind: 'arc' as any,
					bend: 0,
					labelPosition: 0.5,
					scale: 0.5,
				},
			})

			editor.createBinding({
				type: 'arrow',
				fromId: arrowShapeId,
				toId: sourceShape.id,
				props: {
					normalizedAnchor: { x: 0.5, y: 0.5 },
					isExact: false,
					isPrecise: false,
					terminal: 'start',
				},
				meta: {},
			})

			editor.createBinding({
				type: 'arrow',
				fromId: arrowShapeId,
				toId: targetShape.id,
				props: {
					normalizedAnchor: { x: 0.5, y: 0.5 },
					isExact: false,
					isPrecise: false,
					terminal: 'end',
				},
				meta: {},
			})

			editor.bringToFront([arrowShapeId])

			const newRecord: MandalaArrowRecord = {
				arrowId: arrowSimpleId,
				sourceElementId: action.sourceElementId,
				targetElementId: action.targetElementId,
				color: action.color,
			}

			editor.updateShape({
				id: mandalaShapeId,
				type: 'mandala',
				props: {
					arrows: [...existingArrows, newRecord],
				},
			})
		}
	},
)
