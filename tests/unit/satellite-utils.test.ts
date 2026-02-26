import { describe, expect, it } from 'vitest'
import {
	computeSatellitePositions,
	computeSubSatellitePositions,
} from '../../client/shapes/satellite-utils'

describe('computeSatellitePositions', () => {
	it('returns empty array for 0 badges', () => {
		expect(computeSatellitePositions(0, 100, 12)).toEqual([])
	})

	it('places 1 badge at top (270 degrees = 12 o clock)', () => {
		const positions = computeSatellitePositions(1, 100, 12)
		expect(positions).toHaveLength(1)
		// At 270 deg (top): x ≈ center, y ≈ center - radius - offset
		expect(positions[0].x).toBeCloseTo(100, 0) // center
		expect(positions[0].y).toBeCloseTo(-12, 0) // top edge + offset
	})

	it('places 2 badges opposite each other', () => {
		const positions = computeSatellitePositions(2, 100, 12)
		expect(positions).toHaveLength(2)
		// First at top, second at bottom
		expect(positions[0].y).toBeLessThan(positions[1].y)
	})

	it('places 4 badges at compass points', () => {
		const positions = computeSatellitePositions(4, 100, 12)
		expect(positions).toHaveLength(4)
	})

	it('all positions are outside the circle radius', () => {
		const radius = 50
		const offset = 8
		const positions = computeSatellitePositions(3, radius, offset)
		const center = radius
		for (const pos of positions) {
			const dist = Math.sqrt((pos.x - center) ** 2 + (pos.y - center) ** 2)
			expect(dist).toBeGreaterThanOrEqual(radius)
		}
	})
})

describe('computeSubSatellitePositions', () => {
	it('returns positions in an arc around the parent', () => {
		const parent = { x: 100, y: 0 }
		const noteCenter = { x: 50, y: 50 }
		const positions = computeSubSatellitePositions(parent, noteCenter, 3, 24)
		expect(positions).toHaveLength(3)
	})

	it('spreads sub-satellites in an arc away from note center', () => {
		const parent = { x: 112, y: 50 } // right side
		const noteCenter = { x: 50, y: 50 }
		const positions = computeSubSatellitePositions(parent, noteCenter, 3, 24)
		// All sub-satellites should be further from center than parent
		const parentDist = Math.sqrt(
			(parent.x - noteCenter.x) ** 2 + (parent.y - noteCenter.y) ** 2,
		)
		for (const pos of positions) {
			const dist = Math.sqrt((pos.x - noteCenter.x) ** 2 + (pos.y - noteCenter.y) ** 2)
			expect(dist).toBeGreaterThan(parentDist)
		}
	})
})
