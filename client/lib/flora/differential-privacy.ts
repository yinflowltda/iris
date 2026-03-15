// ─── Differential Privacy: Gradient Clipping + Noise ────────────────────────
//
// Protects weight deltas before encryption by:
// 1. Clipping the L2 norm to a bound C (limits any single user's influence)
// 2. Adding calibrated Gaussian noise (provides (ε,δ)-DP guarantees)
//
// Pure TypeScript, no external dependencies.

/**
 * Clip a vector so its L2 norm is at most `maxNorm`.
 * If the norm is already ≤ maxNorm, returns the vector unchanged.
 */
export function clipL2(values: Float32Array, maxNorm: number): Float32Array {
	const norm = l2Norm(values)
	if (norm <= maxNorm) return values
	const scale = maxNorm / norm
	const clipped = new Float32Array(values.length)
	for (let i = 0; i < values.length; i++) {
		clipped[i] = values[i] * scale
	}
	return clipped
}

/**
 * Add Gaussian noise with standard deviation `sigma` to each element.
 * Uses the Box-Muller transform for normal random generation.
 */
export function addGaussianNoise(values: Float32Array, sigma: number): Float32Array {
	const noised = new Float32Array(values.length)
	for (let i = 0; i < values.length; i++) {
		noised[i] = values[i] + gaussianRandom() * sigma
	}
	return noised
}

/**
 * Full DP pipeline: clip L2 norm to C, then add Gaussian noise with σ.
 *
 * Standard Gaussian mechanism: for a function with L2 sensitivity C,
 * adding N(0, σ²) noise per dimension achieves (ε, δ)-DP when
 * σ ≥ C · √(2 ln(1.25/δ)) / ε.
 */
export function clipAndNoise(
	delta: Float32Array,
	maxNorm: number,
	sigma: number,
): Float32Array {
	const clipped = clipL2(delta, maxNorm)
	return addGaussianNoise(clipped, sigma)
}

/**
 * Compute the minimum σ for the Gaussian mechanism to achieve (ε, δ)-DP
 * given L2 sensitivity C.
 *
 * σ = C · √(2 ln(1.25/δ)) / ε
 */
export function computeSigma(maxNorm: number, epsilon: number, delta: number): number {
	return (maxNorm * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Compute the L2 norm of a vector. */
export function l2Norm(values: Float32Array): number {
	let sum = 0
	for (let i = 0; i < values.length; i++) {
		sum += values[i] * values[i]
	}
	return Math.sqrt(sum)
}

/**
 * Generate a single Gaussian random number N(0, 1) using Box-Muller transform.
 * Uses crypto.getRandomValues for uniform random source when available,
 * falling back to Math.random.
 */
let _spare: number | null = null

export function gaussianRandom(): number {
	if (_spare !== null) {
		const val = _spare
		_spare = null
		return val
	}

	let u: number, v: number, s: number
	do {
		u = uniformRandom() * 2 - 1
		v = uniformRandom() * 2 - 1
		s = u * u + v * v
	} while (s >= 1 || s === 0)

	const mul = Math.sqrt((-2 * Math.log(s)) / s)
	_spare = v * mul
	return u * mul
}

/** Reset Box-Muller spare — only for tests. */
export function _resetSpare(): void {
	_spare = null
}

function uniformRandom(): number {
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		const buf = new Uint32Array(1)
		crypto.getRandomValues(buf)
		return buf[0] / 0xffffffff
	}
	return Math.random()
}
