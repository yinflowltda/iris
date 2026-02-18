import { describe, expect, it } from 'vitest'
import { EMOTIONS_MAP_FRAMEWORK } from '../../client/lib/frameworks/emotions-map'
import { getAllCellIds } from '../../client/lib/mandala-geometry'
import type { CellStatus } from '../../shared/types/MandalaTypes'
import { RING_IDS, SLICE_IDS } from '../../shared/types/MandalaTypes'
import completeMandala from '../fixtures/complete-mandala.json'
import contradictingMandala from '../fixtures/contradicting-mandala.json'
import emptyMandala from '../fixtures/empty-mandala.json'
import halfFilledMandala from '../fixtures/half-filled-mandala.json'

// ─── Framework config structure ──────────────────────────────────────────────

describe('EMOTIONS_MAP_FRAMEWORK', () => {
	it('has id "emotions-map"', () => {
		expect(EMOTIONS_MAP_FRAMEWORK.id).toBe('emotions-map')
	})

	it('has 3 slices matching SLICE_IDS', () => {
		expect(EMOTIONS_MAP_FRAMEWORK.slices).toEqual(SLICE_IDS)
	})

	it('has 6 rings matching RING_IDS', () => {
		expect(EMOTIONS_MAP_FRAMEWORK.rings).toEqual(RING_IDS)
	})

	it('has startAngle 150', () => {
		expect(EMOTIONS_MAP_FRAMEWORK.startAngle).toBe(150)
	})

	it('has a non-empty name', () => {
		expect(EMOTIONS_MAP_FRAMEWORK.name.length).toBeGreaterThan(0)
	})

	it('has a non-empty description', () => {
		expect(EMOTIONS_MAP_FRAMEWORK.description.length).toBeGreaterThan(0)
	})
})

// ─── All 18 cells present ────────────────────────────────────────────────────

describe('EMOTIONS_MAP_FRAMEWORK.cells — completeness', () => {
	const allCellIds = getAllCellIds()

	it('contains exactly 18 cell definitions', () => {
		expect(Object.keys(EMOTIONS_MAP_FRAMEWORK.cells)).toHaveLength(18)
	})

	it('contains every expected cell ID', () => {
		for (const cellId of allCellIds) {
			expect(EMOTIONS_MAP_FRAMEWORK.cells[cellId]).toBeDefined()
		}
	})

	it('cell keys match getAllCellIds()', () => {
		const keys = Object.keys(EMOTIONS_MAP_FRAMEWORK.cells).sort()
		expect(keys).toEqual([...allCellIds].sort())
	})
})

// ─── Cell definition schema consistency ──────────────────────────────────────

describe('EMOTIONS_MAP_FRAMEWORK.cells — schema consistency', () => {
	const cells = Object.values(EMOTIONS_MAP_FRAMEWORK.cells)

	it.each(cells)('$cellId has correct sliceId and ringId in cellId', (cell) => {
		expect(cell.cellId).toBe(`${cell.sliceId}-${cell.ringId}`)
	})

	it.each(cells)('$cellId has a non-empty label', (cell) => {
		expect(cell.label.length).toBeGreaterThan(0)
	})

	it.each(cells)('$cellId has a non-empty question', (cell) => {
		expect(cell.question.length).toBeGreaterThan(0)
	})

	it.each(cells)('$cellId has a non-empty guidance', (cell) => {
		expect(cell.guidance.length).toBeGreaterThan(0)
	})

	it.each(cells)('$cellId has at least one example', (cell) => {
		expect(cell.examples.length).toBeGreaterThanOrEqual(1)
	})

	it.each(cells)('$cellId examples are all non-empty strings', (cell) => {
		for (const example of cell.examples) {
			expect(typeof example).toBe('string')
			expect(example.length).toBeGreaterThan(0)
		}
	})

	it.each(cells)('$cellId has sliceId in SLICE_IDS', (cell) => {
		expect(SLICE_IDS).toContain(cell.sliceId)
	})

	it.each(cells)('$cellId has ringId in RING_IDS', (cell) => {
		expect(RING_IDS).toContain(cell.ringId)
	})
})

// ─── Slice grouping ──────────────────────────────────────────────────────────

describe('EMOTIONS_MAP_FRAMEWORK.cells — slice grouping', () => {
	for (const sliceId of SLICE_IDS) {
		it(`has exactly 6 cells for slice "${sliceId}"`, () => {
			const sliceCells = Object.values(EMOTIONS_MAP_FRAMEWORK.cells).filter(
				(c) => c.sliceId === sliceId,
			)
			expect(sliceCells).toHaveLength(6)
		})
	}
})

// ─── Ring grouping ───────────────────────────────────────────────────────────

describe('EMOTIONS_MAP_FRAMEWORK.cells — ring grouping', () => {
	for (const ringId of RING_IDS) {
		it(`has exactly 3 cells for ring "${ringId}"`, () => {
			const ringCells = Object.values(EMOTIONS_MAP_FRAMEWORK.cells).filter(
				(c) => c.ringId === ringId,
			)
			expect(ringCells).toHaveLength(3)
		})
	}
})

// ─── Fixtures — type validation ──────────────────────────────────────────────

function assertValidMandalaState(state: Record<string, unknown>, label: string) {
	const allCellIds = getAllCellIds()

	it(`${label} has exactly 18 keys`, () => {
		expect(Object.keys(state)).toHaveLength(18)
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

	it('has exactly 9 filled cells', () => {
		const filled = Object.values(halfFilledMandala).filter((c) => c.status === 'filled')
		expect(filled).toHaveLength(9)
	})

	it('has exactly 9 empty cells', () => {
		const empty = Object.values(halfFilledMandala).filter((c) => c.status === 'empty')
		expect(empty).toHaveLength(9)
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

	it('all 18 cells are filled', () => {
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
