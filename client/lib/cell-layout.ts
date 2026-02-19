import type { Point2d } from '../../shared/types/MandalaTypes'
import type { CellBounds, CircleCellBounds, SectorCellBounds } from './mandala-geometry'

const DEG_TO_RAD = Math.PI / 180

export interface LayoutItem {
	center: Point2d
	diameter: number
}

// Cell boundaries (mandala lines) already provide visual separation,
// so edge padding can be minimal. Inter-item gap only prevents overlap.
const EDGE_PAD = 14
const ITEM_GAP = 2

export function computeCellContentLayout(bounds: CellBounds, itemCount: number): LayoutItem[] {
	if (itemCount <= 0) return []

	if (bounds.type === 'circle') {
		return layoutCircleCell(bounds, itemCount)
	}

	return layoutSectorCell(bounds, itemCount)
}

function layoutCircleCell(bounds: CircleCellBounds, itemCount: number): LayoutItem[] {
	const usableRadius = bounds.radius - EDGE_PAD
	if (usableRadius <= 0) return []

	if (itemCount === 1) {
		return [
			{
				center: { ...bounds.center },
				diameter: usableRadius * 2 * 0.95,
			},
		]
	}

	const inscribedHalf = usableRadius / Math.SQRT2
	const cols = Math.ceil(Math.sqrt(itemCount))
	const rows = Math.ceil(itemCount / cols)

	const cellW = (inscribedHalf * 2 - ITEM_GAP * (cols - 1)) / cols
	const cellH = (inscribedHalf * 2 - ITEM_GAP * (rows - 1)) / rows
	const diameter = Math.max(Math.min(cellW, cellH), 1)

	const gridW = cols * diameter + (cols - 1) * ITEM_GAP
	const gridH = rows * diameter + (rows - 1) * ITEM_GAP
	const startX = bounds.center.x - gridW / 2
	const startY = bounds.center.y - gridH / 2

	const items: LayoutItem[] = []
	for (let i = 0; i < itemCount; i++) {
		const col = i % cols
		const row = Math.floor(i / cols)
		items.push({
			center: {
				x: startX + col * (diameter + ITEM_GAP) + diameter / 2,
				y: startY + row * (diameter + ITEM_GAP) + diameter / 2,
			},
			diameter,
		})
	}

	return items
}

function layoutSectorCell(bounds: SectorCellBounds, itemCount: number): LayoutItem[] {
	let sweep = bounds.endAngle - bounds.startAngle
	if (sweep <= 0) sweep += 360
	const sweepRad = sweep * DEG_TO_RAD

	const maxBands = Math.min(3, itemCount)
	let bestItems: LayoutItem[] = []
	let bestMinDiameter = 0

	for (let bandCount = 1; bandCount <= maxBands; bandCount++) {
		const result = tryBandLayout(bounds, itemCount, bandCount, sweepRad)
		if (result.minDiameter > bestMinDiameter) {
			bestMinDiameter = result.minDiameter
			bestItems = result.items
		}
	}

	return bestItems
}

function tryBandLayout(
	bounds: SectorCellBounds,
	itemCount: number,
	bandCount: number,
	sweepRad: number,
): { items: LayoutItem[]; minDiameter: number } {
	const { innerRadius, outerRadius, startAngle, center } = bounds
	const radialDepth = outerRadius - innerRadius

	const availableRadial = radialDepth - 2 * EDGE_PAD - Math.max(0, bandCount - 1) * ITEM_GAP
	if (availableRadial <= 0) return { items: [], minDiameter: 0 }
	const bandHeight = availableRadial / bandCount

	const itemsPerBand = distributeItemsAcrossBands(itemCount, bandCount)

	let minDiameter = Number.POSITIVE_INFINITY
	const items: LayoutItem[] = []

	for (let b = 0; b < bandCount; b++) {
		const n = itemsPerBand[b]
		if (n === 0) continue

		const bandCenterR = innerRadius + EDGE_PAD + bandHeight / 2 + b * (bandHeight + ITEM_GAP)

		const edgeAngularPad = EDGE_PAD / bandCenterR
		const effectiveSweepRad = sweepRad - 2 * edgeAngularPad
		if (effectiveSweepRad <= 0) return { items: [], minDiameter: 0 }

		const slotAngleRad = effectiveSweepRad / n

		// For multiple items, use chord distance (actual Euclidean distance
		// between adjacent centers) to size items without overlap.
		const angularLimit =
			n > 1
				? 2 * bandCenterR * Math.sin(slotAngleRad / 2) - ITEM_GAP
				: bandCenterR * effectiveSweepRad

		const diameter = Math.max(Math.min(bandHeight, angularLimit), 1)
		minDiameter = Math.min(minDiameter, diameter)

		const firstSlotStartRad = startAngle * DEG_TO_RAD + edgeAngularPad

		for (let i = 0; i < n; i++) {
			const angleRad = firstSlotStartRad + (i + 0.5) * slotAngleRad
			items.push({
				center: {
					x: center.x + bandCenterR * Math.cos(angleRad),
					y: center.y - bandCenterR * Math.sin(angleRad),
				},
				diameter,
			})
		}
	}

	return { items, minDiameter }
}

function distributeItemsAcrossBands(itemCount: number, bandCount: number): number[] {
	const base = Math.floor(itemCount / bandCount)
	const remainder = itemCount % bandCount
	const result: number[] = []
	for (let i = 0; i < bandCount; i++) {
		result.push(base + (i >= bandCount - remainder ? 1 : 0))
	}
	return result
}
