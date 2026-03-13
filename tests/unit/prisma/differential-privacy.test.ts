import { describe, expect, it, beforeEach } from 'vitest'
import {
	clipL2,
	addGaussianNoise,
	clipAndNoise,
	computeSigma,
	l2Norm,
	gaussianRandom,
	_resetSpare,
} from '../../../client/lib/prisma/differential-privacy'

describe('differential-privacy', () => {
	beforeEach(() => {
		_resetSpare()
	})

	// ─── L2 Norm ──────────────────────────────────────────────────────────────

	describe('l2Norm', () => {
		it('computes correct norm for simple vector', () => {
			const v = new Float32Array([3, 4])
			expect(l2Norm(v)).toBeCloseTo(5, 5)
		})

		it('returns 0 for zero vector', () => {
			const v = new Float32Array([0, 0, 0])
			expect(l2Norm(v)).toBe(0)
		})

		it('handles single element', () => {
			const v = new Float32Array([-7])
			expect(l2Norm(v)).toBeCloseTo(7, 5)
		})
	})

	// ─── Clip L2 ──────────────────────────────────────────────────────────────

	describe('clipL2', () => {
		it('clips vector exceeding maxNorm', () => {
			const v = new Float32Array([6, 8]) // norm = 10
			const clipped = clipL2(v, 5)
			expect(l2Norm(clipped)).toBeCloseTo(5, 4)
		})

		it('preserves direction when clipping', () => {
			const v = new Float32Array([6, 8]) // norm = 10
			const clipped = clipL2(v, 5)
			// Direction should be preserved: ratio of components unchanged
			expect(clipped[0] / clipped[1]).toBeCloseTo(6 / 8, 4)
		})

		it('returns same vector when norm ≤ maxNorm', () => {
			const v = new Float32Array([1, 2]) // norm ≈ 2.236
			const clipped = clipL2(v, 5)
			expect(clipped).toBe(v) // same reference
		})

		it('clips to exactly maxNorm', () => {
			const v = new Float32Array([100, 200, 300])
			const clipped = clipL2(v, 1.0)
			expect(l2Norm(clipped)).toBeCloseTo(1.0, 4)
		})

		it('handles zero vector', () => {
			const v = new Float32Array([0, 0])
			const clipped = clipL2(v, 1.0)
			expect(l2Norm(clipped)).toBe(0)
		})
	})

	// ─── Gaussian Noise ───────────────────────────────────────────────────────

	describe('addGaussianNoise', () => {
		it('produces output of same length', () => {
			const v = new Float32Array(100)
			const noised = addGaussianNoise(v, 1.0)
			expect(noised.length).toBe(100)
		})

		it('with sigma=0 returns identical values', () => {
			const v = new Float32Array([1, 2, 3])
			const noised = addGaussianNoise(v, 0)
			expect(Array.from(noised)).toEqual([1, 2, 3])
		})

		it('noise has approximately correct variance (statistical)', () => {
			const n = 50000
			const v = new Float32Array(n).fill(0)
			const sigma = 2.0
			const noised = addGaussianNoise(v, sigma)

			// Compute sample mean and variance
			let sum = 0
			for (let i = 0; i < n; i++) sum += noised[i]
			const mean = sum / n

			let varSum = 0
			for (let i = 0; i < n; i++) varSum += (noised[i] - mean) ** 2
			const variance = varSum / (n - 1)

			// Expected variance = sigma^2 = 4.0
			// With 50k samples, should be within ~5% of expected
			expect(mean).toBeCloseTo(0, 1) // mean ≈ 0
			expect(variance).toBeCloseTo(sigma * sigma, 0) // variance ≈ 4.0
		})
	})

	// ─── Gaussian Random ──────────────────────────────────────────────────────

	describe('gaussianRandom', () => {
		it('produces values with mean ≈ 0 and std ≈ 1', () => {
			const n = 10000
			const samples = Array.from({ length: n }, () => gaussianRandom())

			const mean = samples.reduce((a, b) => a + b, 0) / n
			const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)

			expect(mean).toBeCloseTo(0, 1)
			expect(Math.sqrt(variance)).toBeCloseTo(1, 1)
		})

		it('uses spare value on second call (Box-Muller)', () => {
			// Box-Muller generates pairs; second call should return the spare
			const a = gaussianRandom()
			const b = gaussianRandom()
			expect(typeof a).toBe('number')
			expect(typeof b).toBe('number')
			expect(a).not.toBe(b)
		})
	})

	// ─── clipAndNoise ─────────────────────────────────────────────────────────

	describe('clipAndNoise', () => {
		it('clips first, then adds noise', () => {
			const v = new Float32Array([60, 80]) // norm = 100
			const result = clipAndNoise(v, 1.0, 0) // clip to 1, no noise

			// Should be clipped to norm 1, no noise
			expect(l2Norm(result)).toBeCloseTo(1.0, 4)
		})

		it('result has noise even when already within norm', () => {
			const v = new Float32Array([0.1, 0.1]) // small norm
			const result = clipAndNoise(v, 10.0, 5.0)

			// With sigma=5, result should differ significantly from input
			const diff0 = Math.abs(result[0] - v[0])
			const diff1 = Math.abs(result[1] - v[1])
			// Very unlikely both diffs are < 0.01 with sigma=5
			expect(diff0 + diff1).toBeGreaterThan(0.01)
		})
	})

	// ─── computeSigma ─────────────────────────────────────────────────────────

	describe('computeSigma', () => {
		it('computes correct sigma for Gaussian mechanism', () => {
			// σ = C · √(2 ln(1.25/δ)) / ε
			const C = 1.0
			const eps = 1.0
			const delta = 1e-5

			const sigma = computeSigma(C, eps, delta)
			const expected = C * Math.sqrt(2 * Math.log(1.25 / delta)) / eps

			expect(sigma).toBeCloseTo(expected, 10)
		})

		it('scales linearly with maxNorm', () => {
			const s1 = computeSigma(1.0, 1.0, 1e-5)
			const s2 = computeSigma(2.0, 1.0, 1e-5)
			expect(s2).toBeCloseTo(2 * s1, 10)
		})

		it('scales inversely with epsilon', () => {
			const s1 = computeSigma(1.0, 1.0, 1e-5)
			const s2 = computeSigma(1.0, 2.0, 1e-5)
			expect(s2).toBeCloseTo(s1 / 2, 10)
		})
	})
})
