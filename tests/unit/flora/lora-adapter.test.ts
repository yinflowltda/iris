import { describe, it, expect, beforeEach } from 'vitest'
import { LoraAdapter, LORA_RANK, FROZEN_SEED, type LoraWeights } from '../../../client/lib/flora/lora-adapter'
import { ProjectionHead, dot } from '../../../client/lib/flora/projection-head'

const INPUT_DIM = 384
const HIDDEN_DIM = 128

describe('LoraAdapter', () => {
	let base: ProjectionHead
	let adapter: LoraAdapter

	beforeEach(() => {
		base = new ProjectionHead()
		adapter = new LoraAdapter(base)
	})

	// ─── Initialization ──────────────────────────────────────────────────

	it('should have correct param count (9216)', () => {
		expect(adapter.paramCount).toBe((HIDDEN_DIM + INPUT_DIM) * LORA_RANK)
		expect(adapter.paramCount).toBe(9216)
	})

	it('should initialize B matrices to zero', () => {
		const params = adapter.getTrainableParams()
		for (let i = 0; i < params.length; i++) {
			expect(params[i]).toBe(0)
		}
	})

	it('should initialize A matrices deterministically from seed', () => {
		const adapter2 = new LoraAdapter(base, FROZEN_SEED)
		// Same seed → same A matrices
		expect(adapter.a1).toEqual(adapter2.a1)
		expect(adapter.a2).toEqual(adapter2.a2)
	})

	it('should produce different A matrices with different seeds', () => {
		const adapter2 = new LoraAdapter(base, 0xdead_beef)
		// Different A values (check first element)
		expect(adapter.a1[0]).not.toBe(adapter2.a1[0])
	})

	it('should have correct A matrix dimensions', () => {
		expect(adapter.a1.length).toBe(LORA_RANK * INPUT_DIM)
		expect(adapter.a2.length).toBe(LORA_RANK * HIDDEN_DIM)
	})

	// ─── Forward pass ────────────────────────────────────────────────────

	it('should produce same output as base when B is zero', () => {
		const x = randomVec(INPUT_DIM)
		const baseOut = base.forward(x)
		const loraOut = adapter.forward(x)

		// With B=0, LoRA contribution is zero → output should match base
		for (let i = 0; i < INPUT_DIM; i++) {
			expect(loraOut[i]).toBeCloseTo(baseOut[i], 5)
		}
	})

	it('should produce L2-normalized output', () => {
		// Set some non-zero B values so output differs from base
		adapter.b1[0] = 0.1
		adapter.b2[0] = 0.1

		const x = randomVec(INPUT_DIM)
		const out = adapter.forward(x)

		let normSq = 0
		for (let i = 0; i < out.length; i++) normSq += out[i] * out[i]
		expect(Math.sqrt(normSq)).toBeCloseTo(1.0, 5)
	})

	it('should produce different output after B is modified', () => {
		const x = randomVec(INPUT_DIM)
		const outBefore = adapter.forward(new Float32Array(x))

		// Perturb B
		for (let i = 0; i < adapter.b1.length; i++) adapter.b1[i] = 0.01
		for (let i = 0; i < adapter.b2.length; i++) adapter.b2[i] = 0.01

		const outAfter = adapter.forward(x)

		// Should differ from the zero-B output
		let diff = 0
		for (let i = 0; i < INPUT_DIM; i++) diff += Math.abs(outAfter[i] - outBefore[i])
		expect(diff).toBeGreaterThan(0.01)
	})

	// ─── Backward + step ─────────────────────────────────────────────────

	it('should accumulate gradients and update B via step()', () => {
		const x = randomVec(INPUT_DIM)
		adapter.forward(x)

		const gradOutput = randomVec(INPUT_DIM)
		adapter.backward(gradOutput)
		adapter.step(0.01)

		// After step, B should no longer be zero
		const params = adapter.getTrainableParams()
		let nonZero = 0
		for (let i = 0; i < params.length; i++) {
			if (Math.abs(params[i]) > 1e-10) nonZero++
		}
		expect(nonZero).toBeGreaterThan(0)
	})

	it('should reduce contrastive loss over training steps', () => {
		// Two distinct inputs and "anchors"
		const x1 = randomVec(INPUT_DIM)
		const x2 = randomVec(INPUT_DIM)
		const anchor1 = l2Norm(randomVec(INPUT_DIM))
		const anchor2 = l2Norm(randomVec(INPUT_DIM))

		function computeLoss() {
			const p1 = adapter.forward(x1)
			const p2 = adapter.forward(x2)
			const sim1 = dot(p1, anchor1)
			const sim2 = dot(p2, anchor2)
			// Simple loss: we want p1 close to anchor1, p2 close to anchor2
			return -sim1 - sim2
		}

		const lossStart = computeLoss()

		// Train for 50 steps pushing p1→anchor1, p2→anchor2
		for (let step = 0; step < 50; step++) {
			adapter.zeroGrad()

			// Forward + backward for x1→anchor1
			const p1 = adapter.forward(x1)
			const grad1 = new Float32Array(INPUT_DIM)
			for (let i = 0; i < INPUT_DIM; i++) grad1[i] = -anchor1[i]
			adapter.backward(grad1)

			// Forward + backward for x2→anchor2
			const p2 = adapter.forward(x2)
			const grad2 = new Float32Array(INPUT_DIM)
			for (let i = 0; i < INPUT_DIM; i++) grad2[i] = -anchor2[i]
			adapter.backward(grad2)

			adapter.step(0.01)
		}

		const lossEnd = computeLoss()
		expect(lossEnd).toBeLessThan(lossStart)
	})

	// ─── Param get/set ───────────────────────────────────────────────────

	it('should round-trip params via get/set', () => {
		// Set some values
		for (let i = 0; i < adapter.b1.length; i++) adapter.b1[i] = Math.random() * 0.1
		for (let i = 0; i < adapter.b2.length; i++) adapter.b2[i] = Math.random() * 0.1

		const flat = adapter.getTrainableParams()
		expect(flat.length).toBe(9216)

		// Create fresh adapter and set params
		const adapter2 = new LoraAdapter(base)
		adapter2.setTrainableParams(flat)

		expect(adapter2.b1).toEqual(adapter.b1)
		expect(adapter2.b2).toEqual(adapter.b2)
	})

	// ─── Serialization ───────────────────────────────────────────────────

	it('should serialize and load weights', () => {
		for (let i = 0; i < adapter.b1.length; i++) adapter.b1[i] = 0.05
		for (let i = 0; i < adapter.b2.length; i++) adapter.b2[i] = -0.03

		const serialized = adapter.serialize()
		expect(serialized.b1.length).toBe(HIDDEN_DIM * LORA_RANK)
		expect(serialized.b2.length).toBe(INPUT_DIM * LORA_RANK)

		const adapter2 = new LoraAdapter(base)
		adapter2.loadWeights(serialized)

		expect(adapter2.b1).toEqual(adapter.b1)
		expect(adapter2.b2).toEqual(adapter.b2)
	})

	// ─── Weight decay ────────────────────────────────────────────────────

	it('should apply weight decay during step', () => {
		// Set non-zero B
		for (let i = 0; i < adapter.b1.length; i++) adapter.b1[i] = 1.0

		const x = randomVec(INPUT_DIM)
		adapter.forward(x)
		adapter.backward(new Float32Array(INPUT_DIM)) // zero grad → only weight decay applies
		adapter.step(0.01, 0.1)

		// Weight decay should shrink B values toward zero
		for (let i = 0; i < adapter.b1.length; i++) {
			expect(Math.abs(adapter.b1[i])).toBeLessThan(1.0)
		}
	})

	// ─── zeroGrad ────────────────────────────────────────────────────────

	it('should reset gradients on zeroGrad', () => {
		const x = randomVec(INPUT_DIM)
		adapter.forward(x)
		adapter.backward(randomVec(INPUT_DIM))

		// Step should have effect
		const before = adapter.getTrainableParams()
		adapter.zeroGrad()
		adapter.step(0.01) // should be no-op (gradCount reset to 0)

		const after = adapter.getTrainableParams()
		expect(after).toEqual(before)
	})

	// ─── Delta computation for FL ────────────────────────────────────────

	it('should compute correct delta between snapshots', () => {
		const before = adapter.getTrainableParams()

		// Simulate training (manually set B)
		for (let i = 0; i < adapter.b1.length; i++) adapter.b1[i] = 0.1
		for (let i = 0; i < adapter.b2.length; i++) adapter.b2[i] = -0.05

		const after = adapter.getTrainableParams()
		const delta = new Float32Array(after.length)
		for (let i = 0; i < delta.length; i++) delta[i] = after[i] - before[i]

		// First 2304 elements should be ~0.1, rest ~-0.05
		for (let i = 0; i < HIDDEN_DIM * LORA_RANK; i++) {
			expect(delta[i]).toBeCloseTo(0.1, 5)
		}
		for (let i = HIDDEN_DIM * LORA_RANK; i < delta.length; i++) {
			expect(delta[i]).toBeCloseTo(-0.05, 5)
		}
	})

	// ─── Base reference ──────────────────────────────────────────────────

	it('should expose the base projection head', () => {
		expect(adapter.base).toBe(base)
	})
})

// ─── Helpers ───────────────────────────────────────────────────────────────

function randomVec(dim: number): Float32Array {
	const v = new Float32Array(dim)
	for (let i = 0; i < dim; i++) v[i] = Math.random() * 2 - 1
	return v
}

function l2Norm(v: Float32Array): Float32Array {
	let sum = 0
	for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
	const norm = Math.sqrt(sum)
	const out = new Float32Array(v.length)
	if (norm > 1e-12) {
		for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
	}
	return out
}
