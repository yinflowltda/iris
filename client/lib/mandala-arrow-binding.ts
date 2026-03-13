// ─── Mandala Arrow Binding Detector ─────────────────────────────────────────
//
// Detects when a user draws a TLDraw arrow connecting two notes within a
// mandala, then triggers an edge-type picker so the arrow can be recorded
// as a typed relationship in the knowledge graph.

import {
	getArrowBindings,
	type Editor,
	type TLArrowShape,
	type TLBinding,
	type TLShapeId,
} from 'tldraw'
import type {
	EdgeTypeDef,
	MandalaArrowRecord,
	MandalaArrowColor,
} from '../../shared/types/MandalaTypes'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { getFramework } from './frameworks/framework-registry'
import { emitArrowCreated } from './prisma/placement-events'

// ─── Pending Arrow State ────────────────────────────────────────────────────

export interface PendingArrow {
	arrowId: TLShapeId
	mandalaId: TLShapeId
	sourceShapeId: TLShapeId
	targetShapeId: TLShapeId
	sourceCellId: string
	targetCellId: string
	/** Valid edge types for this source→target cell pair. */
	validEdgeTypes: EdgeTypeDef[]
	/** Page-space position for the picker popup. */
	pickerPosition: { x: number; y: number }
}

type PendingArrowListener = (pending: PendingArrow | null) => void

let pendingArrow: PendingArrow | null = null
const pendingListeners = new Set<PendingArrowListener>()

function notifyListeners() {
	for (const listener of pendingListeners) {
		listener(pendingArrow)
	}
}

/** Subscribe to pending arrow changes. Returns unsubscribe. */
export function onPendingArrowChange(listener: PendingArrowListener): () => void {
	pendingListeners.add(listener)
	return () => pendingListeners.delete(listener)
}

/** Get the current pending arrow (if any). */
export function getPendingArrow(): PendingArrow | null {
	return pendingArrow
}

// ─── Arrow Finalization ─────────────────────────────────────────────────────

/** Called when user picks an edge type from the picker. */
export function finalizeArrow(editor: Editor, edgeType: EdgeTypeDef): void {
	if (!pendingArrow) return

	const { arrowId, mandalaId, sourceShapeId, targetShapeId, sourceCellId, targetCellId } =
		pendingArrow
	const mandala = editor.getShape(mandalaId) as MandalaShape | undefined
	if (!mandala) {
		cancelArrow(editor)
		return
	}

	// Strip the 'shape:' prefix for SimpleShapeId
	const simpleSourceId = sourceShapeId.replace('shape:', '') as SimpleShapeId
	const simpleTargetId = targetShapeId.replace('shape:', '') as SimpleShapeId
	const simpleArrowId = arrowId.replace('shape:', '') as SimpleShapeId

	// Check for duplicate
	const existingArrows = mandala.props.arrows ?? []
	const duplicate = existingArrows.find(
		(a) =>
			a.sourceElementId === simpleSourceId &&
			a.targetElementId === simpleTargetId &&
			a.edgeTypeId === edgeType.id,
	)
	if (duplicate) {
		cancelArrow(editor)
		return
	}

	// Style the arrow with edge type color — only update color and opacity
	const color = edgeType.color ?? 'black'
	editor.updateShape({
		id: arrowId,
		type: 'arrow',
		opacity: 0.6,
		props: {
			color: color === 'red' ? 'red' : color === 'green' ? 'green' : ('grey' as any),
			dash: 'dashed' as any,
		},
	})

	// Record in mandala state
	const newRecord: MandalaArrowRecord = {
		arrowId: simpleArrowId,
		sourceElementId: simpleSourceId,
		targetElementId: simpleTargetId,
		color: color as MandalaArrowColor,
		edgeTypeId: edgeType.id,
	}

	editor.updateShape({
		id: mandalaId,
		type: 'mandala',
		props: {
			arrows: [...existingArrows, newRecord],
		},
	})

	// Emit training event
	const srcShape = editor.getShape(sourceShapeId)
	const tgtShape = editor.getShape(targetShapeId)
	if (srcShape && tgtShape) {
		const srcUtil = editor.getShapeUtil(srcShape)
		const tgtUtil = editor.getShapeUtil(tgtShape)
		const srcText = (srcUtil as any).getText?.(srcShape) ?? ''
		const tgtText = (tgtUtil as any).getText?.(tgtShape) ?? ''
		if (srcText.trim() && tgtText.trim()) {
			emitArrowCreated({
				srcNoteText: srcText,
				tgtNoteText: tgtText,
				srcCellId: sourceCellId,
				tgtCellId: targetCellId,
				edgeTypeId: edgeType.id,
				mapId: mandala.props.frameworkId,
			})
		}
	}

	pendingArrow = null
	notifyListeners()
}

/** Called when user cancels the picker — delete the arrow. */
export function cancelArrow(editor: Editor): void {
	if (pendingArrow) {
		editor.deleteShape(pendingArrow.arrowId)
	}
	pendingArrow = null
	notifyListeners()
}

// ─── Binding Detection ──────────────────────────────────────────────────────

/** Find which cell a note shape belongs to in a mandala's state. */
function findNoteCell(
	state: Record<string, { contentShapeIds?: string[] }>,
	shapeId: TLShapeId,
): string | null {
	const simpleId = shapeId.replace('shape:', '')
	for (const [cellId, cellState] of Object.entries(state)) {
		if (cellState?.contentShapeIds?.includes(simpleId)) {
			return cellId
		}
	}
	return null
}

/** Find the mandala that contains a given note shape. */
function findParentMandala(editor: Editor, noteShapeId: TLShapeId): MandalaShape | null {
	const shape = editor.getShape(noteShapeId)
	if (!shape) return null

	// Walk up the parent chain to find a mandala
	let parentId = shape.parentId
	while (parentId) {
		const parent = editor.getShape(parentId as TLShapeId)
		if (!parent) break
		if (parent.type === 'mandala') return parent as MandalaShape
		parentId = parent.parentId
	}

	// Fallback: check all mandalas for this note in their state
	const mandalas = editor
		.getCurrentPageShapes()
		.filter((s) => s.type === 'mandala') as MandalaShape[]
	for (const mandala of mandalas) {
		const cellId = findNoteCell(mandala.props.state, noteShapeId)
		if (cellId) return mandala
	}

	return null
}

/** Get valid edge types for a source→target cell pair. */
function getValidEdgeTypes(
	edgeTypes: EdgeTypeDef[],
	sourceCellId: string,
	targetCellId: string,
): EdgeTypeDef[] {
	return edgeTypes.filter((et) => {
		const fromMatch = et.fromCells.includes(sourceCellId)
		const toMatch = et.toCells.includes(targetCellId)
		if (fromMatch && toMatch) return true
		// Also check reverse direction for bidirectional edges
		if (et.bidirectional) {
			return et.fromCells.includes(targetCellId) && et.toCells.includes(sourceCellId)
		}
		return false
	})
}

/**
 * Register a side-effect handler that detects user-drawn arrows between
 * mandala notes and triggers the edge-type picker.
 *
 * Returns a cleanup function.
 */
export function registerArrowBindingDetector(editor: Editor): () => void {
	const cleanup = editor.sideEffects.registerAfterCreateHandler(
		'binding',
		(binding: TLBinding, source: string) => {
			if (source !== 'user') return // Only react to user-drawn arrows
			if (binding.type !== 'arrow') return
			if (pendingArrow) return // Already showing picker

			const arrowShape = editor.getShape(binding.fromId) as TLArrowShape | undefined
			if (!arrowShape || arrowShape.type !== 'arrow') return

			// Check if both ends are connected
			const bindings = getArrowBindings(editor, arrowShape)
			if (!bindings.start || !bindings.end) return

			const startShape = editor.getShape(bindings.start.toId)
			const endShape = editor.getShape(bindings.end.toId)
			if (!startShape || !endShape) return

			// Both connected shapes must be notes
			if (startShape.type !== 'note' || endShape.type !== 'note') return

			// Find mandala for source note
			const mandala = findParentMandala(editor, startShape.id)
			if (!mandala) return

			// Verify both notes are in the same mandala
			const sourceCellId = findNoteCell(mandala.props.state, startShape.id)
			const targetCellId = findNoteCell(mandala.props.state, endShape.id)
			if (!sourceCellId || !targetCellId) return

			// Get the framework's edge types
			const framework = getFramework(mandala.props.frameworkId)
			const treeDef = framework.treeDefinition
			if (!treeDef?.edgeTypes || treeDef.edgeTypes.length === 0) return

			// Filter to valid types for this cell pair
			const validTypes = getValidEdgeTypes(treeDef.edgeTypes, sourceCellId, targetCellId)
			if (validTypes.length === 0) {
				// No valid edge types for this pair — just let the arrow exist as-is
				return
			}

			// Calculate picker position at the arrow midpoint (page space)
			const arrowBounds = editor.getShapePageBounds(arrowShape.id)
			if (!arrowBounds) return

			const pickerPosition = {
				x: arrowBounds.x + arrowBounds.w / 2,
				y: arrowBounds.y + arrowBounds.h / 2,
			}

			// Schedule after current transaction completes
			const arrowId = arrowShape.id
			const mandalaShapeId = mandala.id
			const sourceId = startShape.id
			const targetId = endShape.id

			queueMicrotask(() => {
				pendingArrow = {
					arrowId,
					mandalaId: mandalaShapeId,
					sourceShapeId: sourceId,
					targetShapeId: targetId,
					sourceCellId,
					targetCellId,
					validEdgeTypes: validTypes,
					pickerPosition,
				}
				notifyListeners()
			})
		},
	)

	return cleanup
}
