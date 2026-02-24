import { describe, expect, it } from 'vitest'
import type { SunburstArc } from '../../client/lib/sunburst-layout'
import { computeZoomTargets, easeOutCubic } from '../../client/lib/sunburst-zoom'

const PI2 = 2 * Math.PI

function makeArc(overrides: Partial<SunburstArc> & { id: string }): SunburstArc {
	return {
		label: overrides.id,
		depth: 0,
		x0: 0,
		x1: PI2,
		y0: 0,
		y1: 1,
		transparent: false,
		parentId: null,
		hasChildren: false,
		...overrides,
	}
}

describe('computeZoomTargets', () => {
	it('returns empty map for unknown node', () => {
		const arcs = [makeArc({ id: 'root', x0: 0, x1: PI2, y0: 0, y1: 0.5 })]
		const result = computeZoomTargets(arcs, 'nonexistent')
		expect(result.size).toBe(0)
	})

	it('target node subtree fills 0 to 2*PI in x', () => {
		// Root spans full circle, child spans half
		const arcs = [
			makeArc({ id: 'root', x0: 0, x1: PI2, y0: 0, y1: 0.33, depth: 0 }),
			makeArc({
				id: 'child-a',
				x0: 0,
				x1: Math.PI,
				y0: 0.33,
				y1: 0.66,
				depth: 1,
				parentId: 'root',
			}),
			makeArc({
				id: 'child-b',
				x0: Math.PI,
				x1: PI2,
				y0: 0.33,
				y1: 0.66,
				depth: 1,
				parentId: 'root',
			}),
		]

		const targets = computeZoomTargets(arcs, 'child-a')
		const childA = targets.get('child-a')!

		// child-a should now span full circle
		expect(childA.x0).toBeCloseTo(0)
		expect(childA.x1).toBeCloseTo(PI2)
	})

	it('arcs outside target subtree are clamped to 0', () => {
		const arcs = [
			makeArc({ id: 'root', x0: 0, x1: PI2, y0: 0, y1: 0.33, depth: 0 }),
			makeArc({
				id: 'child-a',
				x0: 0,
				x1: Math.PI,
				y0: 0.33,
				y1: 0.66,
				depth: 1,
				parentId: 'root',
			}),
			makeArc({
				id: 'child-b',
				x0: Math.PI,
				x1: PI2,
				y0: 0.33,
				y1: 0.66,
				depth: 1,
				parentId: 'root',
			}),
		]

		const targets = computeZoomTargets(arcs, 'child-a')
		const childB = targets.get('child-b')!

		// child-b is entirely outside child-a's x range, so both should clamp to 2*PI
		expect(childB.x0).toBeCloseTo(PI2)
		expect(childB.x1).toBeCloseTo(PI2)
	})

	it('shifts y values so target y0 becomes 0', () => {
		const arcs = [
			makeArc({ id: 'root', x0: 0, x1: PI2, y0: 0, y1: 0.33, depth: 0 }),
			makeArc({
				id: 'child-a',
				x0: 0,
				x1: Math.PI,
				y0: 0.33,
				y1: 0.66,
				depth: 1,
				parentId: 'root',
			}),
		]

		const targets = computeZoomTargets(arcs, 'child-a')
		const childA = targets.get('child-a')!

		expect(childA.y0).toBeCloseTo(0)
		expect(childA.y1).toBeCloseTo(0.33)
	})

	it('root y values are clamped to 0 when shifted below zero', () => {
		const arcs = [
			makeArc({ id: 'root', x0: 0, x1: PI2, y0: 0, y1: 0.33, depth: 0 }),
			makeArc({
				id: 'child-a',
				x0: 0,
				x1: Math.PI,
				y0: 0.33,
				y1: 0.66,
				depth: 1,
				parentId: 'root',
			}),
		]

		const targets = computeZoomTargets(arcs, 'child-a')
		const root = targets.get('root')!

		// root y0=0 shifted by 0.33 becomes -0.33, clamped to 0
		expect(root.y0).toBe(0)
		expect(root.y1).toBe(0)
	})

	it('returns correct targets for all arcs', () => {
		const arcs = [
			makeArc({ id: 'root', x0: 0, x1: PI2, y0: 0, y1: 0.5 }),
			makeArc({ id: 'a', x0: 0, x1: Math.PI, y0: 0.5, y1: 1 }),
			makeArc({ id: 'b', x0: Math.PI, x1: PI2, y0: 0.5, y1: 1 }),
		]

		const targets = computeZoomTargets(arcs, 'a')
		expect(targets.size).toBe(3)
	})
})

describe('easeOutCubic', () => {
	it('returns 0 at t=0', () => {
		expect(easeOutCubic(0)).toBe(0)
	})

	it('returns 1 at t=1', () => {
		expect(easeOutCubic(1)).toBe(1)
	})

	it('returns value > t for t in (0,1) (decelerating)', () => {
		expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
	})
})
