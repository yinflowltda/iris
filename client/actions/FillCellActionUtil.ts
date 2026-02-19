import { type TLShapeId, toRichText } from 'tldraw'
import type { FillCellAction } from '../../shared/schema/AgentActionSchemas'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { animateNotesToLayout } from '../lib/animate-note-layout'
import { computeCellContentLayout } from '../lib/cell-layout'
import { EMOTIONS_MAP } from '../lib/frameworks/emotions-map'
import { computeMandalaOuterRadius, getCellBounds, isValidCellId } from '../lib/mandala-geometry'
import { NODULE_COLOR_SEQUENCE } from '../lib/nodule-color-palette'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { resolveMandalaId } from './mandala-action-utils'

const NOTE_BASE_SIZE = 200

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

			const mandalaId = resolveMandalaId(this.editor, helpers, action.mandalaId)
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
			const outerRadius = computeMandalaOuterRadius(mandala.props.w, mandala.props.h)
			const localCenter = {
				x: mandala.props.w / 2,
				y: mandala.props.h / 2,
			}

			const bounds = getCellBounds(EMOTIONS_MAP, localCenter, outerRadius, cellId)
			if (!bounds) return

			const currentState: MandalaState = { ...mandala.props.state }
			const existingIds = currentState[cellId]?.contentShapeIds ?? []

			const nextIndex = existingIds.length
			const newSimpleId = `${action.mandalaId}-${cellId}-${nextIndex}` as SimpleShapeId
			const newShapeId = `shape:${newSimpleId}` as TLShapeId

			const allSimpleIds = [...existingIds, newSimpleId]
			const layout = computeCellContentLayout(bounds, allSimpleIds.length)
			if (layout.length === 0) return

			const totalExistingNodules = Object.values(currentState).reduce((acc, cellState) => {
				return acc + (cellState?.contentShapeIds?.length ?? 0)
			}, 0)
			const nodulePaletteEntry =
				NODULE_COLOR_SEQUENCE[totalExistingNodules % NODULE_COLOR_SEQUENCE.length]

			const newLayout = layout[layout.length - 1]
			const scale = newLayout.diameter / NOTE_BASE_SIZE

			editor.createShape({
				id: newShapeId,
				type: 'note',
				parentId: mandalaShapeId,
				x: newLayout.center.x - newLayout.diameter / 2,
				y: newLayout.center.y - newLayout.diameter / 2,
				props: {
					richText: toRichText(action.content),
					color: nodulePaletteEntry.style,
					size: 's',
					font: 'draw',
					scale,
					align: 'middle',
					verticalAlign: 'middle',
					labelColor: nodulePaletteEntry.labelColor,
					fontSizeAdjustment: 0,
					growY: 0,
					url: '',
				},
			})

			const targets = allSimpleIds
				.map((simpleId, i) => {
					const fullId = `shape:${simpleId}` as TLShapeId
					const item = layout[i]
					if (!item || !editor.getShape(fullId)) return null
					return {
						id: fullId,
						x: item.center.x - item.diameter / 2,
						y: item.center.y - item.diameter / 2,
						scale: item.diameter / NOTE_BASE_SIZE,
					}
				})
				.filter(Boolean) as Array<{ id: TLShapeId; x: number; y: number; scale: number }>

			animateNotesToLayout(editor, targets, { durationMs: 300 })

			currentState[cellId] = {
				status: 'filled',
				contentShapeIds: allSimpleIds,
			}

			editor.updateShape({
				id: mandalaShapeId,
				type: 'mandala',
				props: { state: currentState },
			})
		}
	},
)
