import { describe, expect, it } from 'vitest'
import { findNonOverlappingPosition } from '../../client/lib/mandala-placement'

describe('findNonOverlappingPosition', () => {
	it('centers in viewport when no existing mandalas', () => {
		const viewport = { x: 0, y: 0, w: 1200, h: 800 }
		const pos = findNonOverlappingPosition([], viewport, 600)
		expect(pos).toEqual({ x: 300, y: 100 })
	})

	it('places to the right of existing mandala with gap', () => {
		const viewport = { x: 0, y: 0, w: 1200, h: 800 }
		const existing = [{ x: 300, y: 100, w: 600, h: 600 }]
		const pos = findNonOverlappingPosition(existing, viewport, 600)
		expect(pos.x).toBe(300 + 600 + 80) // rightmost edge + gap
	})

	it('vertically centers new mandala relative to viewport', () => {
		const viewport = { x: 0, y: 0, w: 1200, h: 800 }
		const existing = [{ x: 300, y: 100, w: 600, h: 600 }]
		const pos = findNonOverlappingPosition(existing, viewport, 600)
		expect(pos.y).toBe(100) // viewport.y + viewport.h/2 - size/2
	})

	it('handles multiple existing mandalas — places after rightmost', () => {
		const viewport = { x: 0, y: 0, w: 2000, h: 800 }
		const existing = [
			{ x: 0, y: 100, w: 600, h: 600 },
			{ x: 700, y: 100, w: 600, h: 600 },
		]
		const pos = findNonOverlappingPosition(existing, viewport, 600)
		expect(pos.x).toBe(700 + 600 + 80) // right edge of rightmost + gap
	})

	it('handles different mandala sizes', () => {
		const viewport = { x: 0, y: 0, w: 2000, h: 800 }
		const existing = [{ x: 100, y: 50, w: 700, h: 700 }]
		const pos = findNonOverlappingPosition(existing, viewport, 600)
		expect(pos.x).toBe(100 + 700 + 80)
	})
})
