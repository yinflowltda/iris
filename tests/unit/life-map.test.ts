import { describe, expect, it } from 'vitest'
import { computeCellContentLayout } from '../../client/lib/cell-layout'
import { LIFE_MAP } from '../../client/lib/frameworks/life-map'
import {
	computeMandalaOuterRadius,
	getAllCellIds,
	getCellAtPoint,
	getCellBounds,
	getCellCenter,
	isValidCellId,
	makeEmptyState,
} from '../../client/lib/mandala-geometry'

describe('Life Map definition', () => {
	it('has id "life-map"', () => {
		expect(LIFE_MAP.id).toBe('life-map')
	})

	it('has 6 slices', () => {
		expect(LIFE_MAP.slices).toHaveLength(6)
	})

	it('has 4 cells per slice (querer, ser, ter, saber)', () => {
		for (const slice of LIFE_MAP.slices) {
			expect(slice.cells).toHaveLength(4)
		}
	})

	it('has 25 total cells (1 center + 24 sector)', () => {
		const ids = getAllCellIds(LIFE_MAP)
		expect(ids).toHaveLength(25)
		expect(new Set(ids).size).toBe(25)
	})

	it('has a center cell named essencia', () => {
		expect(LIFE_MAP.center.id).toBe('essencia')
		expect(LIFE_MAP.center.radiusRatio).toBeGreaterThan(0)
		expect(LIFE_MAP.center.radiusRatio).toBeLessThan(1)
	})

	it('slices cover exactly 360 degrees', () => {
		let totalSweep = 0
		for (const slice of LIFE_MAP.slices) {
			let sweep = slice.endAngle - slice.startAngle
			if (sweep <= 0) sweep += 360
			totalSweep += sweep
		}
		expect(totalSweep).toBe(360)
	})

	it('all cell IDs follow the domain-ring pattern', () => {
		for (const slice of LIFE_MAP.slices) {
			for (const cell of slice.cells) {
				expect(cell.id).toMatch(new RegExp(`^${slice.id}-`))
			}
		}
	})

	it('every cell has question, guidance, and examples', () => {
		expect(LIFE_MAP.center.question).toBeTruthy()
		expect(LIFE_MAP.center.guidance).toBeTruthy()
		expect(LIFE_MAP.center.examples.length).toBeGreaterThan(0)

		for (const slice of LIFE_MAP.slices) {
			for (const cell of slice.cells) {
				expect(cell.question).toBeTruthy()
				expect(cell.guidance).toBeTruthy()
				expect(cell.examples.length).toBeGreaterThan(0)
			}
		}
	})

	it('no slice angles overlap', () => {
		const slices = LIFE_MAP.slices.map((s) => ({
			id: s.id,
			start: s.startAngle,
			end: s.endAngle,
		}))

		for (let i = 0; i < slices.length; i++) {
			const current = slices[i]
			const next = slices[(i + 1) % slices.length]
			const currentEnd = current.end % 360
			const nextStart = next.start % 360
			expect(currentEnd).toBe(nextStart)
		}
	})

	it('each ring covers the expected ratio range', () => {
		for (const slice of LIFE_MAP.slices) {
			const [querer, ser, ter, saber] = slice.cells
			expect(querer.id).toContain('querer')
			expect(querer.innerRatio).toBeCloseTo(0.1, 2)
			expect(querer.outerRatio).toBeCloseTo(0.325, 2)

			expect(ser.id).toContain('ser')
			expect(ser.innerRatio).toBeCloseTo(0.325, 2)
			expect(ser.outerRatio).toBeCloseTo(0.55, 2)

			expect(ter.id).toContain('ter')
			expect(ter.innerRatio).toBeCloseTo(0.55, 2)
			expect(ter.outerRatio).toBeCloseTo(0.775, 2)

			expect(saber.id).toContain('saber')
			expect(saber.innerRatio).toBeCloseTo(0.775, 2)
			expect(saber.outerRatio).toBeCloseTo(1.0, 2)
		}
	})

	it('has all 6 expected life domain slices', () => {
		const ids = LIFE_MAP.slices.map((s) => s.id)
		expect(ids).toEqual([
			'espiritual',
			'emocional',
			'fisico',
			'material',
			'profissional',
			'relacional',
		])
	})
})

describe('Life Map geometry functions', () => {
	const center = { x: 400, y: 400 }
	const outerRadius = computeMandalaOuterRadius(800, 800)

	it('isValidCellId accepts all Life Map cell IDs', () => {
		const ids = getAllCellIds(LIFE_MAP)
		for (const id of ids) {
			expect(isValidCellId(LIFE_MAP, id)).toBe(true)
		}
	})

	it('isValidCellId rejects invalid IDs', () => {
		expect(isValidCellId(LIFE_MAP, 'nonexistent')).toBe(false)
		expect(isValidCellId(LIFE_MAP, 'past-events')).toBe(false)
		expect(isValidCellId(LIFE_MAP, 'family-vision')).toBe(false)
	})

	it('getCellCenter returns a point for every cell', () => {
		const ids = getAllCellIds(LIFE_MAP)
		for (const id of ids) {
			const point = getCellCenter(LIFE_MAP, center, outerRadius, id)
			expect(point).not.toBeNull()
		}
	})

	it('getCellBounds returns bounds for every cell', () => {
		const ids = getAllCellIds(LIFE_MAP)
		for (const id of ids) {
			const bounds = getCellBounds(LIFE_MAP, center, outerRadius, id)
			expect(bounds).not.toBeNull()
		}
	})

	it('getCellAtPoint detects the center cell', () => {
		const cellId = getCellAtPoint(LIFE_MAP, center, outerRadius, center)
		expect(cellId).toBe('essencia')
	})

	it('makeEmptyState creates state for all cells', () => {
		const state = makeEmptyState(LIFE_MAP)
		const ids = getAllCellIds(LIFE_MAP)
		for (const id of ids) {
			expect(state[id]).toBeDefined()
			expect(state[id].status).toBe('empty')
			expect(state[id].contentShapeIds).toEqual([])
		}
	})
})

describe('Life Map cell layout', () => {
	const center = { x: 400, y: 400 }
	const outerRadius = computeMandalaOuterRadius(800, 800)

	it('computes layout for sector cells with 1 item', () => {
		const bounds = getCellBounds(LIFE_MAP, center, outerRadius, 'espiritual-saber')
		expect(bounds).not.toBeNull()
		const layout = computeCellContentLayout(bounds!, 1)
		expect(layout).toHaveLength(1)
		expect(layout[0].diameter).toBeGreaterThan(0)
	})

	it('computes layout for sector cells with 3 items', () => {
		const bounds = getCellBounds(LIFE_MAP, center, outerRadius, 'profissional-querer')
		expect(bounds).not.toBeNull()
		const layout = computeCellContentLayout(bounds!, 3)
		expect(layout).toHaveLength(3)
		for (const item of layout) {
			expect(item.diameter).toBeGreaterThan(0)
		}
	})

	it('computes layout for the center cell', () => {
		const bounds = getCellBounds(LIFE_MAP, center, outerRadius, 'essencia')
		expect(bounds).not.toBeNull()
		const layout = computeCellContentLayout(bounds!, 2)
		expect(layout).toHaveLength(2)
	})
})
