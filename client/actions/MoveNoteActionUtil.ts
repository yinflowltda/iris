import { Box, type TLShapeId } from 'tldraw'
import type { MoveNoteAction } from '../../shared/schema/AgentActionSchemas'
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
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { findElementCell, validateElementExists } from './element-lookup-utils'
import { resolveMandalaId } from './mandala-action-utils'

const NOTE_BASE_SIZE = 200

export const MoveNoteActionUtil = registerActionUtil(
	class MoveNoteActionUtil extends AgentActionUtil<MoveNoteAction> {
		static override type = 'move_note' as const

		override getInfo(action: Streaming<MoveNoteAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<MoveNoteAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const mandalaId = resolveMandalaId(this.editor, helpers, action.mandalaId)
			if (!mandalaId) return null
			action.mandalaId = mandalaId

			const mandalaShapeId = `shape:${mandalaId}` as TLShapeId
			const mandala = this.editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return null

			// Validate source note exists
			const noteId = helpers.ensureShapeIdExists(action.noteId)
			if (!noteId) return null
			action.noteId = noteId

			const sourceShape = validateElementExists(this.editor, mandala, noteId)
			if (!sourceShape) return null

			// Validate target cell exists
			const framework = getFrameworkForMandala(this.editor, mandalaId)
			const isValid = framework.treeDefinition
				? isValidCellIdInTree(framework.treeDefinition, action.targetCellId)
				: isValidCellId(framework.definition, action.targetCellId)
			if (!isValid) return null

			// Don't move to the same cell
			const sourceCell = findElementCell(mandala.props.state, noteId)
			if (sourceCell === action.targetCellId) return null

			return action
		}

		override applyAction(action: Streaming<MoveNoteAction>) {
			if (!action.complete) return

			const { editor } = this
			const mandalaShapeId = `shape:${action.mandalaId}` as TLShapeId
			const mandala = editor.getShape(mandalaShapeId) as MandalaShape | undefined
			if (!mandala) return

			const noteId = action.noteId as SimpleShapeId
			const targetCellId = action.targetCellId
			const currentState: MandalaState = { ...mandala.props.state }

			// Find and remove from source cell
			const sourceCell = findElementCell(currentState, noteId)
			if (!sourceCell) return

			const sourceIds = currentState[sourceCell]?.contentShapeIds ?? []
			const filteredSourceIds = sourceIds.filter((id) => id !== noteId)
			currentState[sourceCell] = {
				status: filteredSourceIds.length > 0 ? 'filled' : 'empty',
				contentShapeIds: filteredSourceIds,
			}

			// Add to target cell
			const targetIds = currentState[targetCellId]?.contentShapeIds ?? []
			const newTargetIds = [...targetIds, noteId]
			currentState[targetCellId] = {
				status: 'filled',
				contentShapeIds: newTargetIds,
			}

			// Compute new position in target cell
			const outerRadius = computeMandalaOuterRadius(mandala.props.w, mandala.props.h)
			const localCenter = { x: mandala.props.w / 2, y: mandala.props.h / 2 }
			const framework = getFrameworkForMandala(this.editor, action.mandalaId as string)

			const bounds = framework.treeDefinition
				? getCellBoundsFromTree(framework.treeDefinition, localCenter, outerRadius, targetCellId)
				: getCellBounds(framework.definition, localCenter, outerRadius, targetCellId)
			if (!bounds) return

			const layout = computeCellContentLayout(bounds, newTargetIds.length)
			if (layout.length === 0) return

			// Reposition all notes in target cell (including the moved one)
			for (let i = 0; i < newTargetIds.length; i++) {
				const fullId = `shape:${newTargetIds[i]}` as TLShapeId
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

			// Reposition remaining notes in source cell
			if (filteredSourceIds.length > 0) {
				const sourceBounds = framework.treeDefinition
					? getCellBoundsFromTree(framework.treeDefinition, localCenter, outerRadius, sourceCell)
					: getCellBounds(framework.definition, localCenter, outerRadius, sourceCell)
				if (sourceBounds) {
					const sourceLayout = computeCellContentLayout(sourceBounds, filteredSourceIds.length)
					for (let i = 0; i < filteredSourceIds.length; i++) {
						const fullId = `shape:${filteredSourceIds[i]}` as TLShapeId
						const item = sourceLayout[i]
						if (!item || !editor.getShape(fullId)) continue
						editor.updateShape({
							id: fullId,
							type: 'note',
							x: item.center.x - item.diameter / 2,
							y: item.center.y - item.diameter / 2,
							props: { scale: item.diameter / NOTE_BASE_SIZE },
						})
					}
				}
			}

			// Update mandala state
			editor.updateShape({
				id: mandalaShapeId,
				type: 'mandala',
				props: { state: currentState },
			})

			// Zoom to the moved note in its new position
			const newLayout = layout[layout.length - 1]
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
