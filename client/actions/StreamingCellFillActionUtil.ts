import { Box, type TLShapeId, toRichText } from 'tldraw'
import type { CellFillAction } from '../../shared/schema/AgentActionSchemas'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import { computeCellContentLayout } from '../lib/cell-layout'
import { getFrameworkForMandala } from '../lib/frameworks/framework-registry'
import {
	computeMandalaOuterRadius,
	getCellBounds,
	getCellBoundsFromTree,
	isValidCellId,
	isValidCellIdInTree,
} from '../lib/mandala-geometry'
import { NODULE_COLOR_SEQUENCE } from '../lib/nodule-color-palette'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

const NOTE_BASE_SIZE = 200

/**
 * Handles lightweight `cell_fill` events emitted by the server when parsing
 * the streaming `{ message, cells }` response format.
 *
 * Reuses the same note-creation logic as FillCellActionUtil:
 * positioning, coloring, state update, and camera zoom.
 *
 * Uses tree-based geometry (getCellBoundsFromTree / isValidCellIdInTree)
 * when a treeDefinition exists, falling back to legacy MapDefinition.
 */
export const StreamingCellFillActionUtil = registerActionUtil(
	class StreamingCellFillActionUtil extends AgentActionUtil<CellFillAction> {
		static override type = 'cell_fill' as const

		override getInfo(action: Streaming<CellFillAction>) {
			return {
				icon: 'pencil' as const,
				description: action.content ?? '',
			}
		}

		override sanitizeAction(action: Streaming<CellFillAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			// Find the mandala on the page (no mandalaId in the lightweight event)
			const mandalas = this.editor
				.getCurrentPageShapes()
				.filter((shape) => shape.type === 'mandala')
			if (mandalas.length === 0) return null

			const mandalaId = mandalas[0].id.slice(6) as SimpleShapeId
			const framework = getFrameworkForMandala(this.editor, mandalaId)

			if (!action.cellId) return null

			// Validate cellId against tree definition (preferred) or legacy definition
			const isValid = framework.treeDefinition
				? isValidCellIdInTree(framework.treeDefinition, action.cellId)
				: isValidCellId(framework.definition, action.cellId)

			if (!isValid) return null

			return action
		}

		override applyAction(action: Streaming<CellFillAction>) {
			if (!action.complete) return

			const { editor } = this

			// Find the mandala on the page
			const mandalas = editor
				.getCurrentPageShapes()
				.filter((shape) => shape.type === 'mandala')
			if (mandalas.length === 0) return

			const mandalaShapeId = mandalas[0].id as TLShapeId
			const mandalaSimpleId = mandalaShapeId.slice(6) as SimpleShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const cellId = action.cellId as string
			const outerRadius = computeMandalaOuterRadius(mandala.props.w, mandala.props.h)
			const localCenter = {
				x: mandala.props.w / 2,
				y: mandala.props.h / 2,
			}

			const framework = getFrameworkForMandala(this.editor, mandalaSimpleId)

			// Use tree-based bounds (preferred) or legacy bounds
			const bounds = framework.treeDefinition
				? getCellBoundsFromTree(framework.treeDefinition, localCenter, outerRadius, cellId)
				: getCellBounds(framework.definition, localCenter, outerRadius, cellId)
			if (!bounds) return

			const currentState: MandalaState = { ...mandala.props.state }
			const existingIds = currentState[cellId]?.contentShapeIds ?? []

			const nextIndex = existingIds.length
			const newSimpleId = `${mandalaSimpleId}-${cellId}-${nextIndex}` as SimpleShapeId
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

			// Reposition existing notes in this cell
			for (let i = 0; i < allSimpleIds.length - 1; i++) {
				const fullId = `shape:${allSimpleIds[i]}` as TLShapeId
				const item = layout[i]
				if (!item || !editor.getShape(fullId)) continue
				editor.updateShape({
					id: fullId,
					type: 'note',
					x: item.center.x - item.diameter / 2,
					y: item.center.y - item.diameter / 2,
					props: { scale: item.diameter / NOTE_BASE_SIZE },
				})
			}

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

			currentState[cellId] = {
				status: 'filled',
				contentShapeIds: allSimpleIds,
			}

			editor.updateShape({
				id: mandalaShapeId,
				type: 'mandala',
				props: { state: currentState },
			})

			// Zoom camera to the new note (guided tour effect)
			const notePageX = mandala.x + newLayout.center.x
			const notePageY = mandala.y + newLayout.center.y
			const zoomSize = newLayout.diameter * 1.2
			editor.zoomToBounds(
				Box.From({
					x: notePageX - zoomSize / 2,
					y: notePageY - zoomSize / 2,
					w: zoomSize,
					h: zoomSize,
				}),
				{ animation: { duration: 300 } },
			)
		}
	},
)
