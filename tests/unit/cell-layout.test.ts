import { describe, expect, it } from 'vitest'
import { computeCellContentLayout } from '../../client/lib/cell-layout'
import { EMOTIONS_MAP } from '../../client/lib/frameworks/emotions-map'
import type { CircleCellBounds, SectorCellBounds } from '../../client/lib/mandala-geometry'
import { getAllCellIds, getCellBounds, isPointInCell } from '../../client/lib/mandala-geometry'

const CENTER = { x: 0, y: 0 }
const OUTER_RADIUS = 600

const CIRCLE_BOUNDS: CircleCellBounds = {
	type: 'circle',
	center: { x: 0, y: 0 },
	radius: 120,
}

const SECTOR_BOUNDS: SectorCellBounds = {
	type: 'sector',
	center: { x: 0, y: 0 },
	innerRadius: 280,
	outerRadius: 600,
	startAngle: 150,
	endAngle: 270,
	midAngle: 210,
}

// ─── Circle cell layout ────────────────────────────────────────────────────

describe('computeCellContentLayout — circle cell', () => {
	it('returns empty array for 0 items', () => {
		expect(computeCellContentLayout(CIRCLE_BOUNDS, 0)).toEqual([])
	})

	it('returns single centered item for 1 item', () => {
		const layout = computeCellContentLayout(CIRCLE_BOUNDS, 1)
		expect(layout).toHaveLength(1)
		expect(layout[0].center.x).toBeCloseTo(0)
		expect(layout[0].center.y).toBeCloseTo(0)
		expect(layout[0].diameter).toBeGreaterThan(0)
	})

	it('returns correct count for 2 items', () => {
		const layout = computeCellContentLayout(CIRCLE_BOUNDS, 2)
		expect(layout).toHaveLength(2)
	})

	it('returns correct count for 3 items', () => {
		const layout = computeCellContentLayout(CIRCLE_BOUNDS, 3)
		expect(layout).toHaveLength(3)
	})

	it('items do not overlap', () => {
		for (let n = 2; n <= 4; n++) {
			const layout = computeCellContentLayout(CIRCLE_BOUNDS, n)
			for (let i = 0; i < layout.length; i++) {
				for (let j = i + 1; j < layout.length; j++) {
					const dx = layout[i].center.x - layout[j].center.x
					const dy = layout[i].center.y - layout[j].center.y
					const dist = Math.sqrt(dx * dx + dy * dy)
					const minDist = (layout[i].diameter + layout[j].diameter) / 2
					expect(dist).toBeGreaterThanOrEqual(minDist - 0.01)
				}
			}
		}
	})

	it('all items have positive diameter', () => {
		for (let n = 1; n <= 4; n++) {
			const layout = computeCellContentLayout(CIRCLE_BOUNDS, n)
			for (const item of layout) {
				expect(item.diameter).toBeGreaterThan(0)
			}
		}
	})
})

// ─── Sector cell layout ────────────────────────────────────────────────────

describe('computeCellContentLayout — sector cell', () => {
	it('returns empty array for 0 items', () => {
		expect(computeCellContentLayout(SECTOR_BOUNDS, 0)).toEqual([])
	})

	it('returns single item for 1 item', () => {
		const layout = computeCellContentLayout(SECTOR_BOUNDS, 1)
		expect(layout).toHaveLength(1)
		expect(layout[0].diameter).toBeGreaterThan(0)
	})

	it('returns correct count for 2-6 items', () => {
		for (let n = 2; n <= 6; n++) {
			const layout = computeCellContentLayout(SECTOR_BOUNDS, n)
			expect(layout).toHaveLength(n)
		}
	})

	it('items do not overlap', () => {
		for (let n = 1; n <= 6; n++) {
			const layout = computeCellContentLayout(SECTOR_BOUNDS, n)
			for (let i = 0; i < layout.length; i++) {
				for (let j = i + 1; j < layout.length; j++) {
					const dx = layout[i].center.x - layout[j].center.x
					const dy = layout[i].center.y - layout[j].center.y
					const dist = Math.sqrt(dx * dx + dy * dy)
					const minDist = (layout[i].diameter + layout[j].diameter) / 2
					expect(dist).toBeGreaterThanOrEqual(minDist - 0.01)
				}
			}
		}
	})

	it('all items have positive diameter', () => {
		for (let n = 1; n <= 6; n++) {
			const layout = computeCellContentLayout(SECTOR_BOUNDS, n)
			for (const item of layout) {
				expect(item.diameter).toBeGreaterThan(0)
			}
		}
	})

	it('diameter decreases as item count increases', () => {
		const d1 = computeCellContentLayout(SECTOR_BOUNDS, 1)[0].diameter
		const d3 = computeCellContentLayout(SECTOR_BOUNDS, 3)[0].diameter
		const d6 = computeCellContentLayout(SECTOR_BOUNDS, 6)[0].diameter
		expect(d1).toBeGreaterThan(d3)
		expect(d3).toBeGreaterThan(d6)
	})

	it('transition from 3 to 4 items does not drop diameter by more than 40%', () => {
		const d3 = computeCellContentLayout(SECTOR_BOUNDS, 3)[0].diameter
		const d4 = computeCellContentLayout(SECTOR_BOUNDS, 4)[0].diameter
		expect(d4 / d3).toBeGreaterThan(0.6)
	})

	it('picks optimal band count to maximize diameter', () => {
		const layout4 = computeCellContentLayout(SECTOR_BOUNDS, 4)
		const radialDepth = SECTOR_BOUNDS.outerRadius - SECTOR_BOUNDS.innerRadius
		expect(layout4[0].diameter).toBeGreaterThan(radialDepth * 0.3)
	})
})

// ─── Integration with real mandala cells ────────────────────────────────────

describe('computeCellContentLayout — emotions map cells', () => {
	it('all layout items fall inside their cell for 1-4 items', () => {
		for (const cellId of getAllCellIds(EMOTIONS_MAP)) {
			const bounds = getCellBounds(EMOTIONS_MAP, CENTER, OUTER_RADIUS, cellId)
			if (!bounds) continue

			for (let n = 1; n <= 4; n++) {
				const layout = computeCellContentLayout(bounds, n)
				for (const item of layout) {
					const inCell = isPointInCell(EMOTIONS_MAP, CENTER, OUTER_RADIUS, cellId, item.center)
					expect(inCell, `item center not in cell ${cellId} with ${n} items`).toBe(true)
				}
			}
		}
	})

	it('no overlaps across all cells for 1-4 items', () => {
		for (const cellId of getAllCellIds(EMOTIONS_MAP)) {
			const bounds = getCellBounds(EMOTIONS_MAP, CENTER, OUTER_RADIUS, cellId)
			if (!bounds) continue

			for (let n = 2; n <= 4; n++) {
				const layout = computeCellContentLayout(bounds, n)
				for (let i = 0; i < layout.length; i++) {
					for (let j = i + 1; j < layout.length; j++) {
						const dx = layout[i].center.x - layout[j].center.x
						const dy = layout[i].center.y - layout[j].center.y
						const dist = Math.sqrt(dx * dx + dy * dy)
						const minDist = (layout[i].diameter + layout[j].diameter) / 2
						expect(dist, `overlap in cell ${cellId} with ${n} items`).toBeGreaterThanOrEqual(
							minDist - 0.01,
						)
					}
				}
			}
		}
	})

	it('produces correct count for every cell', () => {
		for (const cellId of getAllCellIds(EMOTIONS_MAP)) {
			const bounds = getCellBounds(EMOTIONS_MAP, CENTER, OUTER_RADIUS, cellId)
			if (!bounds) continue

			for (let n = 1; n <= 6; n++) {
				const layout = computeCellContentLayout(bounds, n)
				expect(layout).toHaveLength(n)
			}
		}
	})
})
