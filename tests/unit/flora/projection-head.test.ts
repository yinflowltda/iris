import { describe, expect, it } from 'vitest'
import { dot, ProjectionHead } from '../../../client/lib/flora/projection-head'

// ─── Helper ─────────────────────────────────────────────────────────────────

function randomNormalized(dim: number): Float32Array {
	const v = new Float32Array(dim)
	let sum = 0
	for (let i = 0; i < dim; i++) {
		v[i] = Math.random() * 2 - 1
		sum += v[i] * v[i]
	}
	const norm = Math.sqrt(sum)
	for (let i = 0; i < dim; i++) v[i] /= norm
	return v
}

function l2Norm(v: Float32Array): number {
	let sum = 0
	for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
	return Math.sqrt(sum)
}

// ─── ProjectionHead ─────────────────────────────────────────────────────────

describe('ProjectionHead', () => {
	it('has correct parameter count', () => {
		const head = new ProjectionHead()
		// w1: 384*128 + b1: 128 + w2: 128*384 + b2: 384
		expect(head.paramCount).toBe(384 * 128 + 128 + 128 * 384 + 384)
	})

	it('forward produces 384-dim output', () => {
		const head = new ProjectionHead()
		const input = randomNormalized(384)
		const output = head.forward(input)
		expect(output.length).toBe(384)
	})

	it('forward output is L2-normalized', () => {
		const head = new ProjectionHead()
		const input = randomNormalized(384)
		const output = head.forward(input)
		expect(l2Norm(output)).toBeCloseTo(1.0, 4)
	})

	it('different inputs produce different outputs', () => {
		const head = new ProjectionHead()
		const a = randomNormalized(384)
		const b = randomNormalized(384)
		const outA = head.forward(a)
		const outB = head.forward(b)
		const sim = dot(outA, outB)
		expect(sim).not.toBeCloseTo(1.0) // should differ
	})

	it('backward accumulates gradients without error', () => {
		const head = new ProjectionHead()
		const input = randomNormalized(384)
		head.forward(input)

		const gradOutput = randomNormalized(384)
		expect(() => head.backward(gradOutput)).not.toThrow()
	})

	it('step updates weights', () => {
		const head = new ProjectionHead()
		const w1Before = new Float32Array(head.w1)

		const input = randomNormalized(384)
		head.forward(input)
		head.backward(randomNormalized(384))
		head.step(0.01)

		let changed = false
		for (let i = 0; i < head.w1.length; i++) {
			if (head.w1[i] !== w1Before[i]) {
				changed = true
				break
			}
		}
		expect(changed).toBe(true)
	})

	it('zeroGrad resets accumulated gradients', () => {
		const head = new ProjectionHead()
		const input = randomNormalized(384)
		head.forward(input)
		head.backward(randomNormalized(384))

		const w1Snapshot = new Float32Array(head.w1)
		head.zeroGrad()
		head.step(0.01) // should be no-op
		expect(head.w1).toEqual(w1Snapshot)
	})

	it('training reduces loss on a simple task', () => {
		const head = new ProjectionHead()
		const input = randomNormalized(384)
		const target = randomNormalized(384)

		// Measure initial alignment
		const before = dot(head.forward(input), target)

		// Train: pull projected(input) toward target
		for (let step = 0; step < 50; step++) {
			head.zeroGrad()
			head.forward(input)
			// Gradient: maximize dot(projected, target) → minimize -dot → grad = -target
			const grad = new Float32Array(384)
			for (let i = 0; i < 384; i++) grad[i] = -target[i]
			head.backward(grad)
			head.step(0.01)
		}

		const after = dot(head.forward(input), target)
		expect(after).toBeGreaterThan(before)
	})

	it('serialize/deserialize preserves weights', () => {
		const head = new ProjectionHead()
		const input = randomNormalized(384)
		const outputBefore = head.forward(input)

		const serialized = head.serialize()
		const restored = ProjectionHead.deserialize(serialized)
		const outputAfter = restored.forward(input)

		for (let i = 0; i < 384; i++) {
			expect(outputAfter[i]).toBeCloseTo(outputBefore[i], 6)
		}
	})
})

// ─── dot ────────────────────────────────────────────────────────────────────

describe('dot', () => {
	it('computes dot product correctly', () => {
		const a = new Float32Array([1, 2, 3])
		const b = new Float32Array([4, 5, 6])
		expect(dot(a, b)).toBe(32) // 4 + 10 + 18
	})

	it('returns 1 for identical unit vectors', () => {
		const v = randomNormalized(384)
		expect(dot(v, v)).toBeCloseTo(1.0, 4)
	})
})
