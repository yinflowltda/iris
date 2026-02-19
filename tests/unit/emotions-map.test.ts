import { describe, expect, it } from 'vitest'
import { EMOTIONS_MAP } from '../../client/lib/frameworks/emotions-map'
import { getAllCellIds } from '../../client/lib/mandala-geometry'
import type { CellStatus } from '../../shared/types/MandalaTypes'
import completeMandala from '../fixtures/complete-mandala.json'
import contradictingMandala from '../fixtures/contradicting-mandala.json'
import emptyMandala from '../fixtures/empty-mandala.json'
import halfFilledMandala from '../fixtures/half-filled-mandala.json'

// ─── MapDefinition structure ─────────────────────────────────────────────────

describe('EMOTIONS_MAP', () => {
	it('has id "emotions-map"', () => {
		expect(EMOTIONS_MAP.id).toBe('emotions-map')
	})

	it('has 3 slices', () => {
		expect(EMOTIONS_MAP.slices).toHaveLength(3)
	})

	it('has a center cell', () => {
		expect(EMOTIONS_MAP.center).toBeDefined()
		expect(EMOTIONS_MAP.center.id).toBe('evidence')
	})

	it('has a non-empty name', () => {
		expect(EMOTIONS_MAP.name.length).toBeGreaterThan(0)
	})

	it('has a non-empty description', () => {
		expect(EMOTIONS_MAP.description.length).toBeGreaterThan(0)
	})

	it('slices are past, future, present (spatial order)', () => {
		const sliceIds = EMOTIONS_MAP.slices.map((s) => s.id)
		expect(sliceIds).toEqual(['past', 'future', 'present'])
	})

	it('slices cover 360 degrees', () => {
		let total = 0
		for (const slice of EMOTIONS_MAP.slices) {
			let sweep = slice.endAngle - slice.startAngle
			if (sweep <= 0) sweep += 360
			total += sweep
		}
		expect(total).toBe(360)
	})
})

// ─── All 7 cells present ─────────────────────────────────────────────────────

describe('EMOTIONS_MAP cells — completeness', () => {
	const allCellIds = getAllCellIds(EMOTIONS_MAP)

	it('has exactly 7 cells total', () => {
		expect(allCellIds).toHaveLength(7)
	})

	it('includes center cell', () => {
		expect(allCellIds).toContain('evidence')
	})

	it('each slice has exactly 2 cells', () => {
		for (const slice of EMOTIONS_MAP.slices) {
			expect(slice.cells).toHaveLength(2)
		}
	})
})

// ─── Cell definition schema consistency ──────────────────────────────────────

describe('EMOTIONS_MAP cells — schema consistency', () => {
	const allCells = [EMOTIONS_MAP.center, ...EMOTIONS_MAP.slices.flatMap((s) => s.cells)]

	it.each(allCells)('$id has a non-empty label', (cell) => {
		expect(cell.label.length).toBeGreaterThan(0)
	})

	it.each(allCells)('$id has a non-empty question', (cell) => {
		expect(cell.question.length).toBeGreaterThan(0)
	})

	it.each(allCells)('$id has a non-empty guidance', (cell) => {
		expect(cell.guidance.length).toBeGreaterThan(0)
	})

	it.each(allCells)('$id has at least one example', (cell) => {
		expect(cell.examples.length).toBeGreaterThanOrEqual(1)
	})

	it.each(allCells)('$id examples are all non-empty strings', (cell) => {
		for (const example of cell.examples) {
			expect(typeof example).toBe('string')
			expect(example.length).toBeGreaterThan(0)
		}
	})
})

// ─── Radial ratio validation ─────────────────────────────────────────────────

describe('EMOTIONS_MAP — radial ratios', () => {
	it('center radiusRatio is between 0 and 1', () => {
		expect(EMOTIONS_MAP.center.radiusRatio).toBeGreaterThan(0)
		expect(EMOTIONS_MAP.center.radiusRatio).toBeLessThan(1)
	})

	it('all cell ratios are between 0 and 1', () => {
		for (const slice of EMOTIONS_MAP.slices) {
			for (const cell of slice.cells) {
				expect(cell.innerRatio).toBeGreaterThanOrEqual(0)
				expect(cell.innerRatio).toBeLessThanOrEqual(1)
				expect(cell.outerRatio).toBeGreaterThan(0)
				expect(cell.outerRatio).toBeLessThanOrEqual(1)
				expect(cell.outerRatio).toBeGreaterThan(cell.innerRatio)
			}
		}
	})

	it('innermost cell innerRatio matches center radiusRatio', () => {
		for (const slice of EMOTIONS_MAP.slices) {
			const innermost = slice.cells[slice.cells.length - 1]
			expect(innermost.innerRatio).toBeCloseTo(EMOTIONS_MAP.center.radiusRatio)
		}
	})
})

// ─── Fixtures — type validation ──────────────────────────────────────────────

function assertValidMandalaState(state: Record<string, unknown>, label: string) {
	const allCellIds = getAllCellIds(EMOTIONS_MAP)

	it(`${label} has exactly 7 keys`, () => {
		expect(Object.keys(state)).toHaveLength(7)
	})

	it(`${label} keys match all cell IDs`, () => {
		const keys = Object.keys(state).sort()
		expect(keys).toEqual([...allCellIds].sort())
	})

	it(`${label} every cell has a valid status`, () => {
		const validStatuses: CellStatus[] = ['empty', 'active', 'filled']
		for (const cellId of allCellIds) {
			const cell = state[cellId] as { status: string; contentShapeIds: string[] }
			expect(validStatuses).toContain(cell.status)
		}
	})

	it(`${label} every cell has a contentShapeIds array`, () => {
		for (const cellId of allCellIds) {
			const cell = state[cellId] as { status: string; contentShapeIds: string[] }
			expect(Array.isArray(cell.contentShapeIds)).toBe(true)
		}
	})
}

describe('Fixture: empty-mandala.json', () => {
	assertValidMandalaState(emptyMandala, 'empty-mandala')

	it('all cells have status "empty"', () => {
		for (const cell of Object.values(emptyMandala)) {
			expect(cell.status).toBe('empty')
		}
	})

	it('all cells have empty contentShapeIds', () => {
		for (const cell of Object.values(emptyMandala)) {
			expect(cell.contentShapeIds).toHaveLength(0)
		}
	})
})

describe('Fixture: half-filled-mandala.json', () => {
	assertValidMandalaState(halfFilledMandala, 'half-filled-mandala')

	it('has exactly 3 filled cells', () => {
		const filled = Object.values(halfFilledMandala).filter((c) => c.status === 'filled')
		expect(filled).toHaveLength(3)
	})

	it('has exactly 4 empty cells', () => {
		const empty = Object.values(halfFilledMandala).filter((c) => c.status === 'empty')
		expect(empty).toHaveLength(4)
	})

	it('filled cells have non-empty contentShapeIds', () => {
		for (const cell of Object.values(halfFilledMandala)) {
			if (cell.status === 'filled') {
				expect(cell.contentShapeIds.length).toBeGreaterThan(0)
			}
		}
	})
})

describe('Fixture: complete-mandala.json', () => {
	assertValidMandalaState(completeMandala, 'complete-mandala')

	it('all 7 cells are filled', () => {
		for (const cell of Object.values(completeMandala)) {
			expect(cell.status).toBe('filled')
		}
	})

	it('all cells have at least one contentShapeId', () => {
		for (const cell of Object.values(completeMandala)) {
			expect(cell.contentShapeIds.length).toBeGreaterThan(0)
		}
	})

	it('all contentShapeIds are unique across the mandala', () => {
		const allIds = Object.values(completeMandala).flatMap((c) => c.contentShapeIds)
		expect(new Set(allIds).size).toBe(allIds.length)
	})
})

describe('Fixture: contradicting-mandala.json', () => {
	assertValidMandalaState(contradictingMandala, 'contradicting-mandala')

	it('has cells with multiple contentShapeIds (contradicting content)', () => {
		const multiContent = Object.values(contradictingMandala).filter(
			(c) => c.contentShapeIds.length > 1,
		)
		expect(multiContent.length).toBeGreaterThan(0)
	})

	it('has a mix of filled, active, and empty statuses', () => {
		const statuses = new Set(Object.values(contradictingMandala).map((c) => c.status))
		expect(statuses.size).toBeGreaterThanOrEqual(2)
	})

	it('has some cells with "active" status', () => {
		const active = Object.values(contradictingMandala).filter((c) => c.status === 'active')
		expect(active.length).toBeGreaterThan(0)
	})
})
