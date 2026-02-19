import type { Editor, TLNoteShape, TLShapeId } from 'tldraw'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { MandalaState, Point2d } from '../../shared/types/MandalaTypes'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { animateNotesToLayout } from './animate-note-layout'
import type { LayoutItem } from './cell-layout'
import { computeCellContentLayout } from './cell-layout'
import { EMOTIONS_MAP } from './frameworks/emotions-map'
import { computeMandalaOuterRadius, getCellAtPoint, getCellBounds } from './mandala-geometry'

const NOTE_BASE_SIZE = 200
const SNAP_DEBOUNCE_MS = 150

export function registerMandalaSnapEffect(editor: Editor): () => void {
	let pendingShapeIds = new Set<TLShapeId>()
	let debounceTimer: ReturnType<typeof setTimeout> | null = null

	migrateExistingNodules(editor)

	function schedulSnap(shapeId: TLShapeId) {
		pendingShapeIds.add(shapeId)
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			const ids = pendingShapeIds
			pendingShapeIds = new Set()
			processPendingSnaps(editor, ids)
		}, SNAP_DEBOUNCE_MS)
	}

	const cleanupChange = editor.sideEffects.registerAfterChangeHandler(
		'shape',
		(prev, next, source) => {
			if (source !== 'user') return
			if (next.type !== 'note') return
			if (prev.x === next.x && prev.y === next.y) return
			schedulSnap(next.id)
		},
	)

	const cleanupCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source !== 'user') return
		if (shape.type !== 'note') return
		schedulSnap(shape.id)
	})

	return () => {
		cleanupChange()
		cleanupCreate()
		if (debounceTimer) clearTimeout(debounceTimer)
	}
}

/**
 * One-time migration: reparent existing nodules that are tracked in mandala
 * state but are still children of the page (pre-parentId sessions).
 */
function migrateExistingNodules(editor: Editor) {
	const mandala = editor.getCurrentPageShapes().find((s): s is MandalaShape => s.type === 'mandala')
	if (!mandala) return

	const shapesToReparent: TLShapeId[] = []
	for (const cellState of Object.values(mandala.props.state)) {
		for (const simpleId of cellState.contentShapeIds) {
			const fullId = `shape:${simpleId}` as TLShapeId
			const shape = editor.getShape(fullId)
			if (shape && shape.parentId !== mandala.id) {
				shapesToReparent.push(fullId)
			}
		}
	}

	if (shapesToReparent.length > 0) {
		editor.reparentShapes(shapesToReparent, mandala.id)
	}
}

function processPendingSnaps(editor: Editor, shapeIds: Set<TLShapeId>) {
	const mandala = editor.getCurrentPageShapes().find((s): s is MandalaShape => s.type === 'mandala')
	if (!mandala) return

	const outerRadius = computeMandalaOuterRadius(mandala.props.w, mandala.props.h)
	const pageCenter = {
		x: mandala.x + mandala.props.w / 2,
		y: mandala.y + mandala.props.h / 2,
	}
	const localCenter = {
		x: mandala.props.w / 2,
		y: mandala.props.h / 2,
	}

	let stateChanged = false
	const currentState: MandalaState = JSON.parse(JSON.stringify(mandala.props.state))
	const cellsToRelayout = new Set<string>()
	const shapesToReparentToMandala: TLShapeId[] = []
	const shapesToReparentToPage: TLShapeId[] = []

	for (const shapeId of shapeIds) {
		const shape = editor.getShape(shapeId) as TLNoteShape | undefined
		if (!shape || shape.type !== 'note') continue

		const simpleId = shapeId.replace('shape:', '') as SimpleShapeId

		const pageBounds = editor.getShapePageBounds(shape)
		if (!pageBounds) continue
		const dropPoint = { x: pageBounds.midX, y: pageBounds.midY }

		const targetCellId = getCellAtPoint(EMOTIONS_MAP, pageCenter, outerRadius, dropPoint)

		let sourceCellId: string | null = null
		for (const [cellId, cellState] of Object.entries(currentState)) {
			if (cellState.contentShapeIds.includes(simpleId)) {
				sourceCellId = cellId
				break
			}
		}

		if (targetCellId === sourceCellId) {
			if (targetCellId) cellsToRelayout.add(targetCellId)
			continue
		}

		if (sourceCellId && currentState[sourceCellId]) {
			currentState[sourceCellId] = {
				...currentState[sourceCellId],
				contentShapeIds: currentState[sourceCellId].contentShapeIds.filter((id) => id !== simpleId),
			}
			if (currentState[sourceCellId].contentShapeIds.length === 0) {
				currentState[sourceCellId] = { ...currentState[sourceCellId], status: 'empty' }
			}
			cellsToRelayout.add(sourceCellId)
			stateChanged = true
		}

		if (targetCellId && currentState[targetCellId]) {
			const existingIds = currentState[targetCellId].contentShapeIds
			const localDropPoint = { x: dropPoint.x - mandala.x, y: dropPoint.y - mandala.y }
			const bounds = getCellBounds(EMOTIONS_MAP, localCenter, outerRadius, targetCellId)
			const insertIdx = bounds
				? findClosestSlot(computeCellContentLayout(bounds, existingIds.length + 1), localDropPoint)
				: existingIds.length
			const orderedIds = [...existingIds]
			orderedIds.splice(insertIdx, 0, simpleId)

			currentState[targetCellId] = {
				...currentState[targetCellId],
				status: 'filled',
				contentShapeIds: orderedIds,
			}
			cellsToRelayout.add(targetCellId)
			stateChanged = true

			if (shape.parentId !== mandala.id) {
				shapesToReparentToMandala.push(shapeId)
			}
		} else if (!targetCellId && shape.parentId === mandala.id) {
			shapesToReparentToPage.push(shapeId)
		}
	}

	if (shapesToReparentToMandala.length > 0) {
		editor.reparentShapes(shapesToReparentToMandala, mandala.id)
	}
	if (shapesToReparentToPage.length > 0) {
		editor.reparentShapes(shapesToReparentToPage, editor.getCurrentPageId())
	}

	if (cellsToRelayout.size === 0 && !stateChanged) return

	for (const cellId of cellsToRelayout) {
		const cellState = currentState[cellId]
		if (!cellState || cellState.contentShapeIds.length === 0) continue

		const bounds = getCellBounds(EMOTIONS_MAP, localCenter, outerRadius, cellId)
		if (!bounds) continue

		const layout = computeCellContentLayout(bounds, cellState.contentShapeIds.length)
		const targets = cellState.contentShapeIds
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
	}

	if (stateChanged) {
		editor.updateShape({
			id: mandala.id,
			type: 'mandala',
			props: { state: currentState },
		})
	}
}

function findClosestSlot(layout: LayoutItem[], dropPoint: Point2d): number {
	let best = layout.length - 1
	let bestDist = Number.POSITIVE_INFINITY
	for (let i = 0; i < layout.length; i++) {
		const dx = layout[i].center.x - dropPoint.x
		const dy = layout[i].center.y - dropPoint.y
		const dist = dx * dx + dy * dy
		if (dist < bestDist) {
			bestDist = dist
			best = i
		}
	}
	return best
}
