import type { Editor, TLNoteShape, TLShapeId } from 'tldraw'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type {
	MandalaState,
	MapDefinition,
	Point2d,
	TreeMapDefinition,
} from '../../shared/types/MandalaTypes'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { animateNotesToLayout } from './animate-note-layout'
import type { LayoutItem } from './cell-layout'
import { computeCellContentLayout } from './cell-layout'
import { getFramework } from './frameworks/framework-registry'
import {
	computeMandalaOuterRadius,
	getCellAtPoint,
	getCellAtPointFromTree,
	getCellBounds,
	getCellBoundsFromArcs,
	getCellBoundsFromTree,
} from './mandala-geometry'
import { computeSunburstLayout, isNodeInSubtree } from './sunburst-layout'
import type { ArcAnimationState } from './sunburst-zoom'

const NOTE_BASE_SIZE = 200
const CREATE_DEBOUNCE_MS = 150

// IDs of notes currently being repositioned by zoom — prevents snap from fighting
const zoomAnimatingIds = new Set<TLShapeId>()

export function registerMandalaSnapEffect(editor: Editor): () => void {
	const recentlySnapped = new Set<TLShapeId>()
	let createDebounceTimer: ReturnType<typeof setTimeout> | null = null
	let pendingCreateIds = new Set<TLShapeId>()

	migrateExistingNodules(editor)

	// --- Drag detection via tool-state transition (primary) ---
	let prevPath = ''
	function onTick() {
		const currentPath = editor.getPath()
		if (prevPath.includes('translat') && !currentPath.includes('translat')) {
			const noteIds = editor
				.getSelectedShapes()
				.filter((s) => s.type === 'note')
				.map((s) => s.id)
			if (noteIds.length > 0) {
				processPendingSnaps(editor, new Set(noteIds), recentlySnapped)
			}
		}
		prevPath = currentPath
	}
	editor.on('tick', onTick)

	// --- Fallback: afterChangeHandler for position changes not caught by tick ---
	const cleanupChange = editor.sideEffects.registerAfterChangeHandler(
		'shape',
		(prev, next, source) => {
			if (source !== 'user') return
			if (next.type !== 'note') return
			if (prev.x === next.x && prev.y === next.y) return
			if (recentlySnapped.has(next.id)) return
			if (zoomAnimatingIds.has(next.id)) return

			pendingCreateIds.add(next.id)
			if (createDebounceTimer) clearTimeout(createDebounceTimer)
			createDebounceTimer = setTimeout(() => {
				const ids = pendingCreateIds
				pendingCreateIds = new Set()
				processPendingSnaps(editor, ids, recentlySnapped)
			}, CREATE_DEBOUNCE_MS)
		},
	)

	// --- Create/duplicate detection ---
	const cleanupCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		if (source !== 'user') return
		if (shape.type !== 'note') return
		if (recentlySnapped.has(shape.id)) return

		pendingCreateIds.add(shape.id)
		if (createDebounceTimer) clearTimeout(createDebounceTimer)
		createDebounceTimer = setTimeout(() => {
			const ids = pendingCreateIds
			pendingCreateIds = new Set()
			processPendingSnaps(editor, ids, recentlySnapped)
		}, CREATE_DEBOUNCE_MS)
	})

	return () => {
		editor.off('tick', onTick)
		cleanupChange()
		cleanupCreate()
		if (createDebounceTimer) clearTimeout(createDebounceTimer)
	}
}

/**
 * One-time migration: reparent existing nodules that are tracked in mandala
 * state but are still children of the page (pre-parentId sessions).
 */
function migrateExistingNodules(editor: Editor) {
	const mandalas = editor
		.getCurrentPageShapes()
		.filter((s): s is MandalaShape => s.type === 'mandala')

	for (const mandala of mandalas) {
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
}

function findClosestMandala(editor: Editor, point: { x: number; y: number }): MandalaShape | null {
	const mandalas = editor
		.getCurrentPageShapes()
		.filter((s): s is MandalaShape => s.type === 'mandala')
	if (mandalas.length === 0) return null
	if (mandalas.length === 1) return mandalas[0]

	let best: MandalaShape | null = null
	let bestDist = Number.POSITIVE_INFINITY
	for (const m of mandalas) {
		const cx = m.x + m.props.w / 2
		const cy = m.y + m.props.h / 2
		const dx = point.x - cx
		const dy = point.y - cy
		const dist = dx * dx + dy * dy
		if (dist < bestDist) {
			bestDist = dist
			best = m
		}
	}
	return best
}

function processPendingSnaps(
	editor: Editor,
	shapeIds: Set<TLShapeId>,
	recentlySnapped: Set<TLShapeId>,
) {
	const mandalas = editor
		.getCurrentPageShapes()
		.filter((s): s is MandalaShape => s.type === 'mandala')
	if (mandalas.length === 0) return

	// Process each note against the closest mandala
	for (const mandala of mandalas) {
		const { definition: map, treeDefinition: treeDef } = getFramework(mandala.props.frameworkId)
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

			// Only process this note if this mandala is the closest one
			const closest = findClosestMandala(editor, {
				x: pageBounds.midX,
				y: pageBounds.midY,
			})
			if (!closest || closest.id !== mandala.id) continue

			const hit = treeDef
				? getBestCellHitForPageBoundsTree(treeDef, pageBounds, pageCenter, outerRadius)
				: getBestCellHitForPageBounds(map, pageBounds, pageCenter, outerRadius)
			const targetCellId = hit?.cellId ?? null
			const hitPoint = hit?.point ?? { x: pageBounds.midX, y: pageBounds.midY }

			let sourceCellId: string | null = null
			for (const [cellId, cellState] of Object.entries(currentState)) {
				if (cellState.contentShapeIds.includes(simpleId)) {
					sourceCellId = cellId
					break
				}
			}

			if (targetCellId === sourceCellId) {
				if (!targetCellId) continue

				if (!currentState[targetCellId]) {
					currentState[targetCellId] = { status: 'empty', contentShapeIds: [] }
				}
				const existingIds = currentState[targetCellId].contentShapeIds
				if (existingIds.length === 0) continue

				const localDropPoint = { x: hitPoint.x - mandala.x, y: hitPoint.y - mandala.y }
				const bounds = treeDef
					? getCellBoundsFromTree(treeDef, localCenter, outerRadius, targetCellId)
					: getCellBounds(map, localCenter, outerRadius, targetCellId)
				if (!bounds) {
					cellsToRelayout.add(targetCellId)
					continue
				}

				const slotIdx = findClosestSlot(
					computeCellContentLayout(bounds, existingIds.length),
					localDropPoint,
				)
				const reordered = existingIds.filter((id) => id !== simpleId)
				reordered.splice(slotIdx, 0, simpleId)

				const changed =
					reordered.length === existingIds.length &&
					reordered.some((id, i) => id !== existingIds[i])

				if (changed) {
					currentState[targetCellId] = {
						...currentState[targetCellId],
						status: 'filled',
						contentShapeIds: reordered,
					}
					stateChanged = true
				}

				cellsToRelayout.add(targetCellId)
				continue
			}

			if (sourceCellId && currentState[sourceCellId]) {
				currentState[sourceCellId] = {
					...currentState[sourceCellId],
					contentShapeIds: currentState[sourceCellId].contentShapeIds.filter(
						(id) => id !== simpleId,
					),
				}
				if (currentState[sourceCellId].contentShapeIds.length === 0) {
					currentState[sourceCellId] = { ...currentState[sourceCellId], status: 'empty' }
				}
				cellsToRelayout.add(sourceCellId)
				stateChanged = true
			}

			if (targetCellId) {
				if (!currentState[targetCellId]) {
					currentState[targetCellId] = { status: 'empty', contentShapeIds: [] }
				}
				const existingIds = currentState[targetCellId].contentShapeIds
				const localDropPoint = { x: hitPoint.x - mandala.x, y: hitPoint.y - mandala.y }
				const bounds = treeDef
					? getCellBoundsFromTree(treeDef, localCenter, outerRadius, targetCellId)
					: getCellBounds(map, localCenter, outerRadius, targetCellId)
				const insertIdx = bounds
					? findClosestSlot(
							computeCellContentLayout(bounds, existingIds.length + 1),
							localDropPoint,
						)
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

		if (cellsToRelayout.size === 0 && !stateChanged) continue

		for (const cellId of cellsToRelayout) {
			const cellState = currentState[cellId]
			if (!cellState || cellState.contentShapeIds.length === 0) continue

			const bounds = treeDef
				? getCellBoundsFromTree(treeDef, localCenter, outerRadius, cellId)
				: getCellBounds(map, localCenter, outerRadius, cellId)
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

			for (const t of targets) recentlySnapped.add(t.id)
		}

		if (stateChanged) {
			editor.updateShape({
				id: mandala.id,
				type: 'mandala',
				props: { state: currentState },
			})
		}
	}

	if (recentlySnapped.size > 0) {
		setTimeout(() => {
			for (const id of shapeIds) recentlySnapped.delete(id)
		}, 400)
	}
}

function getBestCellHitForPageBounds(
	map: MapDefinition,
	pageBounds: {
		minX: number
		minY: number
		maxX: number
		maxY: number
		midX: number
		midY: number
		width: number
		height: number
	},
	pageCenter: Point2d,
	outerRadius: number,
): { cellId: string; point: Point2d } | null {
	const boundsCenter = { x: pageBounds.midX, y: pageBounds.midY }
	const centerHit = getCellAtPoint(map, pageCenter, outerRadius, boundsCenter)
	if (centerHit) return { cellId: centerHit, point: boundsCenter }

	// Notes are circular; sampling along the circle at multiple radii is much more reliable
	// for small cells (e.g. evidence + inner ring) than a coarse bounding-box grid.
	const r = Math.max(1, Math.min(pageBounds.width, pageBounds.height) / 2)
	const radii = [r * 0.25, r * 0.55, r * 0.85]
	const steps = 24

	const samplePoints: Point2d[] = [
		boundsCenter,
		{ x: pageBounds.minX, y: pageBounds.minY },
		{ x: pageBounds.maxX, y: pageBounds.minY },
		{ x: pageBounds.minX, y: pageBounds.maxY },
		{ x: pageBounds.maxX, y: pageBounds.maxY },
		{ x: pageBounds.midX, y: pageBounds.minY },
		{ x: pageBounds.midX, y: pageBounds.maxY },
		{ x: pageBounds.minX, y: pageBounds.midY },
		{ x: pageBounds.maxX, y: pageBounds.midY },
	]

	for (const rr of radii) {
		for (let i = 0; i < steps; i++) {
			const a = (i / steps) * Math.PI * 2
			samplePoints.push({
				x: boundsCenter.x + rr * Math.cos(a),
				y: boundsCenter.y + rr * Math.sin(a),
			})
		}
	}

	const buckets = new Map<string, Point2d[]>()
	for (const point of samplePoints) {
		const cellId = getCellAtPoint(map, pageCenter, outerRadius, point)
		if (!cellId) continue
		const arr = buckets.get(cellId) ?? []
		arr.push(point)
		buckets.set(cellId, arr)
	}

	if (buckets.size === 0) return null

	let bestCellId: string | null = null
	let bestCount = -1
	let bestDist = Number.POSITIVE_INFINITY
	let bestPoint: Point2d = boundsCenter

	for (const [cellId, points] of buckets.entries()) {
		const count = points.length
		let minDist = Number.POSITIVE_INFINITY
		let nearest = points[0]
		for (const p of points) {
			const dx = p.x - boundsCenter.x
			const dy = p.y - boundsCenter.y
			const d = dx * dx + dy * dy
			if (d < minDist) {
				minDist = d
				nearest = p
			}
		}

		if (count > bestCount || (count === bestCount && minDist < bestDist)) {
			bestCellId = cellId
			bestCount = count
			bestDist = minDist
			bestPoint = nearest
		}
	}

	return bestCellId ? { cellId: bestCellId, point: bestPoint } : null
}

function getBestCellHitForPageBoundsTree(
	treeDef: TreeMapDefinition,
	pageBounds: {
		minX: number
		minY: number
		maxX: number
		maxY: number
		midX: number
		midY: number
		width: number
		height: number
	},
	pageCenter: Point2d,
	outerRadius: number,
): { cellId: string; point: Point2d } | null {
	const boundsCenter = { x: pageBounds.midX, y: pageBounds.midY }
	const centerHit = getCellAtPointFromTree(treeDef, pageCenter, outerRadius, boundsCenter)
	if (centerHit) return { cellId: centerHit, point: boundsCenter }

	const r = Math.max(1, Math.min(pageBounds.width, pageBounds.height) / 2)
	const radii = [r * 0.25, r * 0.55, r * 0.85]
	const steps = 24

	const samplePoints: Point2d[] = [
		boundsCenter,
		{ x: pageBounds.minX, y: pageBounds.minY },
		{ x: pageBounds.maxX, y: pageBounds.minY },
		{ x: pageBounds.minX, y: pageBounds.maxY },
		{ x: pageBounds.maxX, y: pageBounds.maxY },
		{ x: pageBounds.midX, y: pageBounds.minY },
		{ x: pageBounds.midX, y: pageBounds.maxY },
		{ x: pageBounds.minX, y: pageBounds.midY },
		{ x: pageBounds.maxX, y: pageBounds.midY },
	]

	for (const rr of radii) {
		for (let i = 0; i < steps; i++) {
			const a = (i / steps) * Math.PI * 2
			samplePoints.push({
				x: boundsCenter.x + rr * Math.cos(a),
				y: boundsCenter.y + rr * Math.sin(a),
			})
		}
	}

	const buckets = new Map<string, Point2d[]>()
	for (const point of samplePoints) {
		const cellId = getCellAtPointFromTree(treeDef, pageCenter, outerRadius, point)
		if (!cellId) continue
		const arr = buckets.get(cellId) ?? []
		arr.push(point)
		buckets.set(cellId, arr)
	}

	if (buckets.size === 0) return null

	let bestCellId: string | null = null
	let bestCount = -1
	let bestDist = Number.POSITIVE_INFINITY
	let bestPoint: Point2d = boundsCenter

	for (const [cellId, points] of buckets.entries()) {
		const count = points.length
		let minDist = Number.POSITIVE_INFINITY
		let nearest = points[0]
		for (const p of points) {
			const dx = p.x - boundsCenter.x
			const dy = p.y - boundsCenter.y
			const d = dx * dx + dy * dy
			if (d < minDist) {
				minDist = d
				nearest = p
			}
		}

		if (count > bestCount || (count === bestCount && minDist < bestDist)) {
			bestCellId = cellId
			bestCount = count
			bestDist = minDist
			bestPoint = nearest
		}
	}

	return bestCellId ? { cellId: bestCellId, point: bestPoint } : null
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

/**
 * Reposition notes to match zoomed (or base) cell geometry after focus zoom.
 * When zoomedArcs is provided, uses those arc values; otherwise falls back to base layout.
 */
export function repositionNotesForZoom(
	editor: Editor,
	mandala: MandalaShape,
	zoomedArcs: Map<string, ArcAnimationState> | null,
): void {
	const { treeDefinition: treeDef } = getFramework(mandala.props.frameworkId)
	if (!treeDef) return

	const outerRadius = computeMandalaOuterRadius(mandala.props.w, mandala.props.h)
	const localCenter = { x: mandala.props.w / 2, y: mandala.props.h / 2 }
	const mandalaState = mandala.props.state
	const zoomedNodeId = mandala.props.zoomedNodeId

	// Build arc array from zoom targets or base layout
	const baseArcs = computeSunburstLayout(treeDef)
	const arcArray = zoomedArcs
		? baseArcs.map((arc) => {
				const zoomed = zoomedArcs.get(arc.id)
				return zoomed ? { ...arc, ...zoomed } : arc
			})
		: baseArcs

	const targets: Array<{ id: TLShapeId; x: number; y: number; scale: number }> = []

	for (const [cellId, cellState] of Object.entries(mandalaState)) {
		if (!cellState.contentShapeIds || cellState.contentShapeIds.length === 0) continue

		// When zoomed, only reposition notes in the subtree
		if (zoomedNodeId && !isNodeInSubtree(treeDef.root, zoomedNodeId, cellId)) continue

		const bounds = getCellBoundsFromArcs(arcArray, localCenter, outerRadius, cellId)
		if (!bounds) continue

		// Skip collapsed cells
		if (bounds.type === 'sector' && bounds.innerRadius >= bounds.outerRadius) continue

		const layout = computeCellContentLayout(bounds, cellState.contentShapeIds.length)

		for (let i = 0; i < cellState.contentShapeIds.length; i++) {
			const simpleId = cellState.contentShapeIds[i]
			const fullId = `shape:${simpleId}` as TLShapeId
			const item = layout[i]
			if (!item || !editor.getShape(fullId)) continue
			targets.push({
				id: fullId,
				x: item.center.x - item.diameter / 2,
				y: item.center.y - item.diameter / 2,
				scale: item.diameter / NOTE_BASE_SIZE,
			})
		}
	}

	if (targets.length > 0) {
		// Mark these notes as zoom-animating so the snap system doesn't interfere
		for (const t of targets) zoomAnimatingIds.add(t.id)
		animateNotesToLayout(editor, targets, { durationMs: 300 })
		// Clear after animation + buffer
		setTimeout(() => {
			for (const t of targets) zoomAnimatingIds.delete(t.id)
		}, 500)
	}
}
