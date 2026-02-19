import type { MandalaState, MapDefinition, Point2d } from '../../shared/types/MandalaTypes'

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
