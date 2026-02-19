import { describe, expect, it } from 'vitest'
import { EMOTIONS_MAP } from '../../client/lib/frameworks/emotions-map'
import {
	getAllCellIds,
	getCellAtPoint,
	getCellCenter,
	isValidCellId,
	makeEmptyState,
} from '../../client/lib/mandala-geometry'

const CENTER = { x: 0, y: 0 }
const OUTER_RADIUS = 600

// ─── getAllCellIds ───────────────────────────────────────────────────────────

describe('getAllCellIds', () => {
	const ids = getAllCellIds(EMOTIONS_MAP)

	it('returns exactly 7 cell IDs', () => {
		expect(ids).toHaveLength(7)
	})

	it('contains no duplicates', () => {
		expect(new Set(ids).size).toBe(7)
	})

	it('includes center cell as first ID', () => {
		expect(ids[0]).toBe('evidence')
	})

	it('includes all expected cell IDs', () => {
		const expected = [
			'evidence',
			'past-events',
			'past-thoughts-emotions',
			'future-events',
			'future-beliefs',
			'present-behaviors',
			'present-beliefs',
		]
		expect(ids).toEqual(expected)
	})
})

// ─── isValidCellId ──────────────────────────────────────────────────────────

describe('isValidCellId', () => {
	it('accepts all 7 valid cell IDs', () => {
		for (const id of getAllCellIds(EMOTIONS_MAP)) {
			expect(isValidCellId(EMOTIONS_MAP, id)).toBe(true)
		}
	})

	it('rejects invalid cell IDs', () => {
		expect(isValidCellId(EMOTIONS_MAP, 'past-behaviors')).toBe(false)
		expect(isValidCellId(EMOTIONS_MAP, 'present-events')).toBe(false)
		expect(isValidCellId(EMOTIONS_MAP, 'nonsense')).toBe(false)
		expect(isValidCellId(EMOTIONS_MAP, '')).toBe(false)
	})

	it('accepts center cell ID', () => {
		expect(isValidCellId(EMOTIONS_MAP, 'evidence')).toBe(true)
	})
})

// ─── getCellAtPoint ─────────────────────────────────────────────────────────

describe('getCellAtPoint', () => {
	it('returns null for point outside radius', () => {
		expect(getCellAtPoint(EMOTIONS_MAP, CENTER, OUTER_RADIUS, { x: 601, y: 0 })).toBeNull()
	})

	it('returns center cell for point at origin', () => {
		expect(getCellAtPoint(EMOTIONS_MAP, CENTER, OUTER_RADIUS, { x: 0, y: 0 })).toBe('evidence')
	})

	it('returns center cell for point inside center radius', () => {
		expect(getCellAtPoint(EMOTIONS_MAP, CENTER, OUTER_RADIUS, { x: 50, y: 0 })).toBe('evidence')
	})

	it('maps point in past outer zone to past-events', () => {
		const angle = (210 * Math.PI) / 180
		const dist = 500
		const point = { x: dist * Math.cos(angle), y: -(dist * Math.sin(angle)) }
		expect(getCellAtPoint(EMOTIONS_MAP, CENTER, OUTER_RADIUS, point)).toBe('past-events')
	})

	it('maps point in past inner zone to past-thoughts-emotions', () => {
		const angle = (210 * Math.PI) / 180
		const dist = 200
		const point = { x: dist * Math.cos(angle), y: -(dist * Math.sin(angle)) }
		expect(getCellAtPoint(EMOTIONS_MAP, CENTER, OUTER_RADIUS, point)).toBe('past-thoughts-emotions')
	})

	it('maps point in present outer zone to present-behaviors', () => {
		const angle = (90 * Math.PI) / 180
		const dist = 500
		const point = { x: dist * Math.cos(angle), y: -(dist * Math.sin(angle)) }
		expect(getCellAtPoint(EMOTIONS_MAP, CENTER, OUTER_RADIUS, point)).toBe('present-behaviors')
	})

	it('maps point in future outer zone to future-events', () => {
		const angle = (330 * Math.PI) / 180
		const dist = 500
		const point = { x: dist * Math.cos(angle), y: -(dist * Math.sin(angle)) }
		expect(getCellAtPoint(EMOTIONS_MAP, CENTER, OUTER_RADIUS, point)).toBe('future-events')
	})

	it('maps all cell centers back to the correct cell', () => {
		for (const cellId of getAllCellIds(EMOTIONS_MAP)) {
			const center = getCellCenter(EMOTIONS_MAP, CENTER, OUTER_RADIUS, cellId)
			expect(center).not.toBeNull()
			const result = getCellAtPoint(EMOTIONS_MAP, CENTER, OUTER_RADIUS, center!)
			expect(result).toBe(cellId)
		}
	})

	it('works with non-zero center', () => {
		const offset = { x: 400, y: 300 }
		const result = getCellAtPoint(EMOTIONS_MAP, offset, OUTER_RADIUS, { x: 400, y: 300 })
		expect(result).toBe('evidence')
	})
})

// ─── getCellCenter ──────────────────────────────────────────────────────────

describe('getCellCenter', () => {
	it('returns mandala center for evidence cell', () => {
		const center = getCellCenter(EMOTIONS_MAP, CENTER, OUTER_RADIUS, 'evidence')
		expect(center).toEqual({ x: 0, y: 0 })
	})

	it('returns null for invalid cell ID', () => {
		expect(getCellCenter(EMOTIONS_MAP, CENTER, OUTER_RADIUS, 'invalid')).toBeNull()
	})

	it('past-events center is in the left region (negative x)', () => {
		const center = getCellCenter(EMOTIONS_MAP, CENTER, OUTER_RADIUS, 'past-events')
		expect(center).not.toBeNull()
		expect(center!.x).toBeLessThan(0)
	})

	it('present-behaviors center is in the upper region (negative y)', () => {
		const center = getCellCenter(EMOTIONS_MAP, CENTER, OUTER_RADIUS, 'present-behaviors')
		expect(center).not.toBeNull()
		expect(center!.y).toBeLessThan(0)
	})

	it('future-events center is in the right region (positive x)', () => {
		const center = getCellCenter(EMOTIONS_MAP, CENTER, OUTER_RADIUS, 'future-events')
		expect(center).not.toBeNull()
		expect(center!.x).toBeGreaterThan(0)
	})

	it('all cell centers are within outer radius', () => {
		for (const cellId of getAllCellIds(EMOTIONS_MAP)) {
			const c = getCellCenter(EMOTIONS_MAP, CENTER, OUTER_RADIUS, cellId)
			expect(c).not.toBeNull()
			const dist = Math.sqrt(c!.x ** 2 + c!.y ** 2)
			expect(dist).toBeLessThanOrEqual(OUTER_RADIUS)
		}
	})
})

// ─── makeEmptyState ─────────────────────────────────────────────────────────

describe('makeEmptyState', () => {
	const state = makeEmptyState(EMOTIONS_MAP)

	it('creates state with 7 keys', () => {
		expect(Object.keys(state)).toHaveLength(7)
	})

	it('all cells are empty', () => {
		for (const cell of Object.values(state)) {
			expect(cell.status).toBe('empty')
			expect(cell.contentShapeIds).toHaveLength(0)
		}
	})

	it('keys match getAllCellIds', () => {
		const keys = Object.keys(state).sort()
		const expected = getAllCellIds(EMOTIONS_MAP).sort()
		expect(keys).toEqual(expected)
	})
})
