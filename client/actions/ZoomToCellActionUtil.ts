import { Box, type TLShapeId } from 'tldraw'
import type { ZoomToCellAction } from '../../shared/schema/AgentActionSchemas'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { EMOTIONS_MAP } from '../lib/frameworks/emotions-map'
import {
	computeMandalaOuterRadius,
	getCellBoundingBox,
	isValidCellId,
} from '../lib/mandala-geometry'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { resolveMandalaId } from './mandala-action-utils'

export const ZoomToCellActionUtil = registerActionUtil(
	class ZoomToCellActionUtil extends AgentActionUtil<ZoomToCellAction> {
		static override type = 'zoom_to_cell' as const

		override getInfo(action: Streaming<ZoomToCellAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<ZoomToCellAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = resolveMandalaId(this.editor, helpers, action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			if (!action.cellId || !isValidCellId(EMOTIONS_MAP, action.cellId)) return null

			return action
		}

		override applyAction(action: Streaming<ZoomToCellAction>) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const cellId = action.cellId as string
			const outerR = computeMandalaOuterRadius(mandala.props.w, mandala.props.h)
			const localCenter = { x: mandala.props.w / 2, y: mandala.props.h / 2 }
			const box = getCellBoundingBox(EMOTIONS_MAP, localCenter, outerR, cellId)
			if (!box) return

			const pageBox = Box.From({
				x: box.x + mandala.x,
				y: box.y + mandala.y,
				w: box.w,
				h: box.h,
			})

			const shrunk = Box.From({
				x: pageBox.x + pageBox.w * 0.125,
				y: pageBox.y + pageBox.h * 0.125,
				w: pageBox.w * 0.75,
				h: pageBox.h * 0.75,
			})

			editor.zoomToBounds(shrunk, { animation: { duration: 300 } })
		}
	},
)
