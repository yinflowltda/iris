import { describe, expect, it } from 'vitest'
import {
	getAllCellIds,
	getCellAtPoint,
	getCellCenter,
	getContentShapeCell,
	getRingDefinitions,
	getSliceDefinitions,
} from '../../client/lib/mandala-geometry'
import type { CellId, MandalaConfig } from '../../shared/types/MandalaTypes'
import { RING_IDS, SLICE_IDS } from '../../shared/types/MandalaTypes'

const config: MandalaConfig = {
	center: { x: 0, y: 0 },
	radius: 600,
	slices: SLICE_IDS,
	rings: RING_IDS,
	startAngle: 150,
}

const RING_WIDTH = config.radius / config.rings.length

// ─── getAllCellIds ───────────────────────────────────────────────────────────

describe('getAllCellIds', () => {
	it('returns exactly 18 cell IDs', () => {
		expect(getAllCellIds()).toHaveLength(18)
	})

	it('contains no duplicates', () => {
		const ids = getAllCellIds()
		expect(new Set(ids).size).toBe(18)
	})

	it('includes all expected cells in order', () => {
		const ids = getAllCellIds()
		const expected: CellId[] = [
			'past-events',
			'past-behaviors',
			'past-thoughts',
			'past-emotions',
			'past-beliefs',
			'past-evidence',
			'present-events',
			'present-behaviors',
			'present-thoughts',
			'present-emotions',
			'present-beliefs',
			'present-evidence',
			'future-events',
			'future-behaviors',
			'future-thoughts',
			'future-emotions',
			'future-beliefs',
			'future-evidence',
		]
		expect(ids).toEqual(expected)
	})
})

// ─── getSliceDefinitions ────────────────────────────────────────────────────

describe('getSliceDefinitions', () => {
	const slices = getSliceDefinitions(config)

	it('returns 3 slice definitions', () => {
		expect(slices).toHaveLength(3)
	})

	it('Past spans 150° to 270°', () => {
		expect(slices[0]).toMatchObject({ sliceId: 'past', startAngle: 150, endAngle: 270 })
	})

	it('Present spans 270° to 30° (wraps around 0°)', () => {
		expect(slices[1]).toMatchObject({ sliceId: 'present', startAngle: 270, endAngle: 30 })
	})

	it('Future spans 30° to 150°', () => {
		expect(slices[2]).toMatchObject({ sliceId: 'future', startAngle: 30, endAngle: 150 })
	})
})

// ─── getRingDefinitions ─────────────────────────────────────────────────────

describe('getRingDefinitions', () => {
	const rings = getRingDefinitions(config)

	it('returns 6 ring definitions', () => {
		expect(rings).toHaveLength(6)
	})

	it('outermost ring (Events) outer radius equals total radius', () => {
		expect(rings[0]).toMatchObject({ ringId: 'events', outerRadius: 600 })
	})

	it('innermost ring (Evidence) inner radius is 0', () => {
		expect(rings[5]).toMatchObject({ ringId: 'evidence', innerRadius: 0 })
	})

	it('all rings have equal width', () => {
		for (const ring of rings) {
			expect(ring.outerRadius - ring.innerRadius).toBeCloseTo(RING_WIDTH)
		}
	})
})

// ─── getCellAtPoint — all 18 cells ──────────────────────────────────────────

const allCells = SLICE_IDS.flatMap((sliceId, si) =>
	RING_IDS.map((ringId, ri) => ({
		sliceId,
		ringId,
		sliceIndex: si,
		ringIndex: ri,
		cellId: `${sliceId}-${ringId}` as CellId,
	})),
)

describe('getCellAtPoint — all 18 cells', () => {
	it.each(allCells)('maps center of $cellId back to the correct cell', ({
		sliceIndex,
		ringIndex,
		cellId,
	}) => {
		const center = getCellCenter(config, sliceIndex, ringIndex)
		const result = getCellAtPoint(config, center)
		expect(result).not.toBeNull()
		expect(result!.cellId).toBe(cellId)
	})
})

// ─── getCellAtPoint — edge cases ────────────────────────────────────────────

describe('getCellAtPoint — edge cases', () => {
	it('returns null for point just outside radius', () => {
		expect(getCellAtPoint(config, { x: 601, y: 0 })).toBeNull()
	})

	it('returns null for point far outside', () => {
		expect(getCellAtPoint(config, { x: 1000, y: 1000 })).toBeNull()
	})

	it('maps center point (0,0) to innermost ring (evidence)', () => {
		const result = getCellAtPoint(config, { x: 0, y: 0 })
		expect(result).not.toBeNull()
		expect(result!.ringId).toBe('evidence')
	})

	it('maps point on outer edge to outermost ring (events)', () => {
		const angle = (210 * Math.PI) / 180
		const point = { x: 600 * Math.cos(angle), y: -(600 * Math.sin(angle)) }
		const result = getCellAtPoint(config, point)
		expect(result).not.toBeNull()
		expect(result!.ringId).toBe('events')
		expect(result!.sliceId).toBe('past')
	})

	it('maps 270° boundary to Present (not Past)', () => {
		// Screen point (0, 300) → math angle 270° → boundary belongs to Present
		const result = getCellAtPoint(config, { x: 0, y: 300 })
		expect(result).not.toBeNull()
		expect(result!.sliceId).toBe('present')
	})

	it('maps ring boundary distance to inner ring', () => {
		const angle = (210 * Math.PI) / 180
		const boundaryDist = config.radius - RING_WIDTH
		const point = {
			x: boundaryDist * Math.cos(angle),
			y: -(boundaryDist * Math.sin(angle)),
		}
		const result = getCellAtPoint(config, point)
		expect(result).not.toBeNull()
		expect(result!.ringId).toBe('behaviors')
	})

	it('works with non-zero center', () => {
		const offsetConfig: MandalaConfig = { ...config, center: { x: 500, y: 300 } }
		const result = getCellAtPoint(offsetConfig, { x: 500, y: 300 })
		expect(result).not.toBeNull()
		expect(result!.ringId).toBe('evidence')
	})

	it('maps known hardcoded point (-400, 0) to past-thoughts', () => {
		// (-400,0): angle=180°, dist=400 → Past slice, ring index 2 (Thoughts)
		const result = getCellAtPoint(config, { x: -400, y: 0 })
		expect(result).not.toBeNull()
		expect(result!.cellId).toBe('past-thoughts')
	})
})

// ─── getCellCenter ──────────────────────────────────────────────────────────

describe('getCellCenter', () => {
	it('Past-Events center is in left region (negative x)', () => {
		const center = getCellCenter(config, 0, 0)
		expect(center.x).toBeLessThan(0)
	})

	it('Future-Thoughts center is above origin (negative screen y)', () => {
		const center = getCellCenter(config, 2, 2)
		expect(center.y).toBeLessThan(0)
	})

	it('all 18 cell centers are within mandala radius', () => {
		for (let si = 0; si < config.slices.length; si++) {
			for (let ri = 0; ri < config.rings.length; ri++) {
				const c = getCellCenter(config, si, ri)
				const dist = Math.sqrt(c.x ** 2 + c.y ** 2)
				expect(dist).toBeLessThan(config.radius)
			}
		}
	})
})

// ─── getContentShapeCell ────────────────────────────────────────────────────

describe('getContentShapeCell', () => {
	it('returns same result as getCellAtPoint for same point', () => {
		const point = { x: -300, y: 100 }
		expect(getContentShapeCell(config, point)).toEqual(getCellAtPoint(config, point))
	})

	it('returns null for shape center outside mandala', () => {
		expect(getContentShapeCell(config, { x: 700, y: 700 })).toBeNull()
	})
})
