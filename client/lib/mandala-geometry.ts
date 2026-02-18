import {
	type CellId,
	type CellInfo,
	type MandalaConfig,
	type Point2d,
	RING_IDS,
	type RingDefinition,
	SLICE_IDS,
	type SliceDefinition,
} from '../../shared/types/MandalaTypes'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

function normalizeAngle(degrees: number): number {
	return ((degrees % 360) + 360) % 360
}

export function getAllCellIds(): CellId[] {
	const ids: CellId[] = []
	for (const slice of SLICE_IDS) {
		for (const ring of RING_IDS) {
			ids.push(`${slice}-${ring}`)
		}
	}
	return ids
}

export function getSliceDefinitions(config: MandalaConfig): SliceDefinition[] {
	const span = 360 / config.slices.length
	return config.slices.map((sliceId, sliceIndex) => ({
		sliceId,
		sliceIndex,
		startAngle: normalizeAngle(config.startAngle + sliceIndex * span),
		endAngle: normalizeAngle(config.startAngle + (sliceIndex + 1) * span),
	}))
}

export function getRingDefinitions(config: MandalaConfig): RingDefinition[] {
	const width = config.radius / config.rings.length
	return config.rings.map((ringId, ringIndex) => ({
		ringId,
		ringIndex,
		outerRadius: config.radius - ringIndex * width,
		innerRadius: config.radius - (ringIndex + 1) * width,
	}))
}

export function getCellAtPoint(config: MandalaConfig, point: Point2d): CellInfo | null {
	const dx = point.x - config.center.x
	const dy = config.center.y - point.y
	const distance = Math.sqrt(dx * dx + dy * dy)

	if (distance > config.radius) return null

	const angleDeg = normalizeAngle(Math.atan2(dy, dx) * RAD_TO_DEG)
	const sliceSpan = 360 / config.slices.length
	const sliceIndex = Math.floor(normalizeAngle(angleDeg - config.startAngle) / sliceSpan)

	if (sliceIndex >= config.slices.length) return null

	const ringWidth = config.radius / config.rings.length
	const ringIndex = Math.min(
		Math.floor((config.radius - distance) / ringWidth),
		config.rings.length - 1,
	)

	const sliceId = config.slices[sliceIndex]
	const ringId = config.rings[ringIndex]

	return {
		sliceIndex,
		ringIndex,
		sliceId,
		ringId,
		cellId: `${sliceId}-${ringId}`,
	}
}

export function getCellCenter(
	config: MandalaConfig,
	sliceIndex: number,
	ringIndex: number,
): Point2d {
	const sliceSpan = 360 / config.slices.length
	const midAngleRad = (config.startAngle + (sliceIndex + 0.5) * sliceSpan) * DEG_TO_RAD

	const ringWidth = config.radius / config.rings.length
	const midRadius = config.radius - (ringIndex + 0.5) * ringWidth

	return {
		x: config.center.x + midRadius * Math.cos(midAngleRad),
		y: config.center.y - midRadius * Math.sin(midAngleRad),
	}
}

export function getContentShapeCell(config: MandalaConfig, shapeCenter: Point2d): CellInfo | null {
	return getCellAtPoint(config, shapeCenter)
}
