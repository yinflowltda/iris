import type {
	MandalaState,
	MapDefinition,
	Point2d,
	TreeMapDefinition,
} from '../../shared/types/MandalaTypes'
import { computeSunburstLayout, getAllTreeNodeIds } from './sunburst-layout'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

export interface CircleCellBounds {
	type: 'circle'
	center: Point2d
	radius: number
}

export interface SectorCellBounds {
	type: 'sector'
	/** Mandala center — origin of the polar coordinate system */
	center: Point2d
	innerRadius: number
	outerRadius: number
	startAngle: number
	endAngle: number
	midAngle: number
}

export type CellBounds = CircleCellBounds | SectorCellBounds

function normalizeAngle(degrees: number): number {
	return ((degrees % 360) + 360) % 360
}

function isAngleInRange(angle: number, start: number, end: number): boolean {
	const a = normalizeAngle(angle)
	const s = normalizeAngle(start)
	const e = normalizeAngle(end)
	if (s < e) return a >= s && a < e
	return a >= s || a < e
}

export function getAllCellIds(map: MapDefinition): string[] {
	const ids: string[] = [map.center.id]
	for (const slice of map.slices) {
		for (const cell of slice.cells) {
			ids.push(cell.id)
		}
	}
	return ids
}

export function isValidCellId(map: MapDefinition, cellId: string): boolean {
	if (cellId === map.center.id) return true
	return map.slices.some((s) => s.cells.some((c) => c.id === cellId))
}

export function getCellAtPoint(
	map: MapDefinition,
	center: Point2d,
	outerRadius: number,
	point: Point2d,
): string | null {
	const dx = point.x - center.x
	const dy = center.y - point.y
	const distance = Math.sqrt(dx * dx + dy * dy)

	if (distance > outerRadius) return null

	const ratio = distance / outerRadius

	if (ratio <= map.center.radiusRatio) return map.center.id

	const angleDeg = normalizeAngle(Math.atan2(dy, dx) * RAD_TO_DEG)

	for (const slice of map.slices) {
		if (isAngleInRange(angleDeg, slice.startAngle, slice.endAngle)) {
			for (const cell of slice.cells) {
				if (ratio >= cell.innerRatio && ratio <= cell.outerRatio) {
					return cell.id
				}
			}
			return null
		}
	}

	return null
}

export function getCellCenter(
	map: MapDefinition,
	center: Point2d,
	outerRadius: number,
	cellId: string,
): Point2d | null {
	if (cellId === map.center.id) return { ...center }

	for (const slice of map.slices) {
		for (const cell of slice.cells) {
			if (cell.id === cellId) {
				const midRatio = (cell.innerRatio + cell.outerRatio) / 2
				const midRadius = midRatio * outerRadius

				let sweep = slice.endAngle - slice.startAngle
				if (sweep <= 0) sweep += 360
				const midAngleRad = (slice.startAngle + sweep / 2) * DEG_TO_RAD

				return {
					x: center.x + midRadius * Math.cos(midAngleRad),
					y: center.y - midRadius * Math.sin(midAngleRad),
				}
			}
		}
	}

	return null
}

export function makeEmptyState(map: MapDefinition): MandalaState {
	const state: MandalaState = {}
	for (const id of getAllCellIds(map)) {
		state[id] = { status: 'empty', contentShapeIds: [] }
	}
	return state
}

export function computeMandalaOuterRadius(w: number, h: number): number {
	const size = Math.min(w, h)
	const labelPadding = Math.max(20, size * 0.05)
	return (size - labelPadding * 2) / 2
}

export function getCellBounds(
	map: MapDefinition,
	center: Point2d,
	outerRadius: number,
	cellId: string,
): CellBounds | null {
	if (cellId === map.center.id) {
		return {
			type: 'circle',
			center: { ...center },
			radius: map.center.radiusRatio * outerRadius,
		}
	}

	for (const slice of map.slices) {
		for (const cell of slice.cells) {
			if (cell.id === cellId) {
				let sweep = slice.endAngle - slice.startAngle
				if (sweep <= 0) sweep += 360
				const midAngle = normalizeAngle(slice.startAngle + sweep / 2)

				return {
					type: 'sector',
					center: { ...center },
					innerRadius: cell.innerRatio * outerRadius,
					outerRadius: cell.outerRatio * outerRadius,
					startAngle: slice.startAngle,
					endAngle: slice.endAngle,
					midAngle,
				}
			}
		}
	}

	return null
}

export function isPointInCell(
	map: MapDefinition,
	center: Point2d,
	outerRadius: number,
	cellId: string,
	point: Point2d,
): boolean {
	return getCellAtPoint(map, center, outerRadius, point) === cellId
}

export function getCellBoundingBox(
	map: MapDefinition,
	center: Point2d,
	outerRadius: number,
	cellId: string,
): { x: number; y: number; w: number; h: number } | null {
	const bounds = getCellBounds(map, center, outerRadius, cellId)
	if (!bounds) return null

	if (bounds.type === 'circle') {
		return {
			x: bounds.center.x - bounds.radius,
			y: bounds.center.y - bounds.radius,
			w: bounds.radius * 2,
			h: bounds.radius * 2,
		}
	}

	const { center: c, innerRadius, outerRadius: outerR, startAngle, endAngle } = bounds

	let sweep = endAngle - startAngle
	if (sweep <= 0) sweep += 360
	const startRad = startAngle * DEG_TO_RAD
	const endRad = (startAngle + sweep) * DEG_TO_RAD

	const points: Point2d[] = [
		{ x: c.x + outerR * Math.cos(startRad), y: c.y - outerR * Math.sin(startRad) },
		{ x: c.x + outerR * Math.cos(endRad), y: c.y - outerR * Math.sin(endRad) },
	]

	if (innerRadius > 0) {
		points.push(
			{ x: c.x + innerRadius * Math.cos(startRad), y: c.y - innerRadius * Math.sin(startRad) },
			{ x: c.x + innerRadius * Math.cos(endRad), y: c.y - innerRadius * Math.sin(endRad) },
		)
	} else {
		points.push({ ...c })
	}

	for (const cardinal of [0, 90, 180, 270]) {
		if (isAngleInRange(cardinal, startAngle, endAngle)) {
			const rad = cardinal * DEG_TO_RAD
			points.push({ x: c.x + outerR * Math.cos(rad), y: c.y - outerR * Math.sin(rad) })
		}
	}

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const p of points) {
		if (p.x < minX) minX = p.x
		if (p.y < minY) minY = p.y
		if (p.x > maxX) maxX = p.x
		if (p.y > maxY) maxY = p.y
	}

	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// ─── Tree-based geometry functions ──────────────────────────────────────────

export function getAllCellIdsFromTree(treeDef: TreeMapDefinition): string[] {
	return getAllTreeNodeIds(treeDef)
}

export function isValidCellIdInTree(treeDef: TreeMapDefinition, cellId: string): boolean {
	return getAllTreeNodeIds(treeDef).includes(cellId)
}

export function makeEmptyStateFromTree(treeDef: TreeMapDefinition): MandalaState {
	const state: MandalaState = {}
	for (const id of getAllTreeNodeIds(treeDef)) {
		state[id] = { status: 'empty', contentShapeIds: [] }
	}
	return state
}

/**
 * Convert d3 sunburst angle (0 = 12 o'clock, clockwise, radians)
 * to CellBounds convention (0 = 3 o'clock / right, counterclockwise, degrees).
 *
 * d3 angle:  0 = top, clockwise
 * CellBounds: 0 = right, counterclockwise
 *
 * conversion: cellBoundsDeg = 90 - d3Rad * (180/PI)
 * then normalize to [0, 360).
 */
function d3AngleToCellBoundsDeg(d3Radians: number): number {
	return normalizeAngle(90 - d3Radians * RAD_TO_DEG)
}

export function getCellAtPointFromTree(
	treeDef: TreeMapDefinition,
	center: Point2d,
	outerRadius: number,
	point: Point2d,
): string | null {
	const dx = point.x - center.x
	const dy = point.y - center.y
	const distance = Math.sqrt(dx * dx + dy * dy)

	if (distance > outerRadius) return null

	const arcs = computeSunburstLayout(treeDef)
	const ratio = distance / outerRadius

	// Check root first
	const rootArc = arcs.find((a) => a.depth === 0)
	if (rootArc && ratio <= rootArc.y1) return rootArc.id

	// d3 convention: 0 = 12 o'clock (top), clockwise
	// atan2(dx, -dy) gives angle from top, clockwise
	let angle = Math.atan2(dx, -dy)
	if (angle < 0) angle += 2 * Math.PI

	for (const arc of arcs) {
		if (arc.transparent || arc.depth === 0) continue
		if (ratio >= arc.y0 && ratio <= arc.y1) {
			// Handle angle wrapping: check if angle is in [x0, x1]
			if (isD3AngleInRange(angle, arc.x0, arc.x1)) {
				return arc.id
			}
		}
	}

	return null
}

function isD3AngleInRange(angle: number, x0: number, x1: number): boolean {
	const TWO_PI = 2 * Math.PI
	// Normalize all to [0, 2*PI)
	const a = ((angle % TWO_PI) + TWO_PI) % TWO_PI
	const s = ((x0 % TWO_PI) + TWO_PI) % TWO_PI
	const e = ((x1 % TWO_PI) + TWO_PI) % TWO_PI

	if (s < e) return a >= s && a < e
	// wrap-around case
	return a >= s || a < e
}

export function getCellBoundsFromTree(
	treeDef: TreeMapDefinition,
	center: Point2d,
	outerRadius: number,
	cellId: string,
): CellBounds | null {
	const arcs = computeSunburstLayout(treeDef)
	const arc = arcs.find((a) => a.id === cellId)
	if (!arc) return null

	if (arc.depth === 0) {
		return {
			type: 'circle',
			center: { ...center },
			radius: arc.y1 * outerRadius,
		}
	}

	// Convert d3 angles (0=top, clockwise, radians) to CellBounds (0=right, CCW, degrees)
	const startAngleDeg = d3AngleToCellBoundsDeg(arc.x0)
	const endAngleDeg = d3AngleToCellBoundsDeg(arc.x1)

	// d3 goes clockwise, CellBounds goes counterclockwise,
	// so x0 (d3 start) maps to end in CellBounds, and x1 maps to start
	const midD3 = (arc.x0 + arc.x1) / 2
	const midAngleDeg = d3AngleToCellBoundsDeg(midD3)

	return {
		type: 'sector',
		center: { ...center },
		innerRadius: arc.y0 * outerRadius,
		outerRadius: arc.y1 * outerRadius,
		startAngle: endAngleDeg,
		endAngle: startAngleDeg,
		midAngle: midAngleDeg,
	}
}

export function getCellBoundsFromArcs(
	arcs: Array<{ id: string; x0: number; x1: number; y0: number; y1: number }>,
	center: Point2d,
	outerRadius: number,
	cellId: string,
): CellBounds | null {
	const arc = arcs.find((a) => a.id === cellId)
	if (!arc) return null

	// Always return sector bounds — even for cells starting from center (y0=0).
	// The sector/ring layout places notes within the radial band, which is
	// correct for zoomed cells where the center is occupied by the root label
	// and sibling arcs occupy adjacent bands.
	const startAngleDeg = d3AngleToCellBoundsDeg(arc.x0)
	const endAngleDeg = d3AngleToCellBoundsDeg(arc.x1)
	const midD3 = (arc.x0 + arc.x1) / 2
	const midAngleDeg = d3AngleToCellBoundsDeg(midD3)

	return {
		type: 'sector',
		center: { ...center },
		innerRadius: arc.y0 * outerRadius,
		outerRadius: arc.y1 * outerRadius,
		startAngle: endAngleDeg,
		endAngle: startAngleDeg,
		midAngle: midAngleDeg,
	}
}

export function getCellBoundingBoxFromTree(
	treeDef: TreeMapDefinition,
	center: Point2d,
	outerRadius: number,
	cellId: string,
): { x: number; y: number; w: number; h: number } | null {
	const bounds = getCellBoundsFromTree(treeDef, center, outerRadius, cellId)
	if (!bounds) return null

	if (bounds.type === 'circle') {
		return {
			x: bounds.center.x - bounds.radius,
			y: bounds.center.y - bounds.radius,
			w: bounds.radius * 2,
			h: bounds.radius * 2,
		}
	}

	const { center: c, innerRadius, outerRadius: outerR, startAngle, endAngle } = bounds

	let sweep = endAngle - startAngle
	if (sweep <= 0) sweep += 360
	const startRad = startAngle * DEG_TO_RAD
	const endRad = (startAngle + sweep) * DEG_TO_RAD

	const points: Point2d[] = [
		{ x: c.x + outerR * Math.cos(startRad), y: c.y - outerR * Math.sin(startRad) },
		{ x: c.x + outerR * Math.cos(endRad), y: c.y - outerR * Math.sin(endRad) },
	]

	if (innerRadius > 0) {
		points.push(
			{ x: c.x + innerRadius * Math.cos(startRad), y: c.y - innerRadius * Math.sin(startRad) },
			{ x: c.x + innerRadius * Math.cos(endRad), y: c.y - innerRadius * Math.sin(endRad) },
		)
	} else {
		points.push({ ...c })
	}

	for (const cardinal of [0, 90, 180, 270]) {
		if (isAngleInRange(cardinal, startAngle, endAngle)) {
			const rad = cardinal * DEG_TO_RAD
			points.push({ x: c.x + outerR * Math.cos(rad), y: c.y - outerR * Math.sin(rad) })
		}
	}

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const p of points) {
		if (p.x < minX) minX = p.x
		if (p.y < minY) minY = p.y
		if (p.x > maxX) maxX = p.x
		if (p.y > maxY) maxY = p.y
	}

	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
