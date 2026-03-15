// ─── FFA-LoRA Adapter ──────────────────────────────────────────────────────
//
// Frozen-random-A LoRA applied to the ProjectionHead.
// Only B matrices are trained (~9.2K params with rank=18).
// A matrices are deterministically generated from a shared seed so all
// FL clients produce compatible deltas.
//
// Modified forward pass:
//   h = (W1 + B1·A1)·x + b1  →  ReLU  →  (W2 + B2·A2)·r + b2  →  L2-norm

import type { ProjectionHead } from './projection-head'
import { dot } from './projection-head'

const INPUT_DIM = 384
const HIDDEN_DIM = 128
export const LORA_RANK = 18 // (128+384)×18 = 9216 ≈ 9.2K trainable B params

/** Shared seed for frozen A matrices — must be identical across all FL clients. */
export const FROZEN_SEED = 0x1215_f100

// ─── Deterministic PRNG ────────────────────────────────────────────────────

/** Mulberry32: fast 32-bit PRNG, fully deterministic given seed. */
function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Kaiming uniform initialization with seeded PRNG. */
function kaimingUniformSeeded(rows: number, cols: number, rng: () => number): Float32Array {
	const limit = Math.sqrt(6 / cols) // fanIn = cols
	const w = new Float32Array(rows * cols)
	for (let i = 0; i < w.length; i++) {
		w[i] = (rng() * 2 - 1) * limit
	}
	return w
}

// ─── Math utilities ────────────────────────────────────────────────────────

function matVec(W: Float32Array, x: Float32Array, rows: number, cols: number): Float32Array {
	const y = new Float32Array(rows)
	for (let i = 0; i < rows; i++) {
		let sum = 0
		const offset = i * cols
		for (let j = 0; j < cols; j++) sum += W[offset + j] * x[j]
		y[i] = sum
	}
	return y
}

function matTVec(W: Float32Array, x: Float32Array, rows: number, cols: number): Float32Array {
	const y = new Float32Array(cols)
	for (let i = 0; i < rows; i++) {
		const offset = i * cols
		const xi = x[i]
		for (let j = 0; j < cols; j++) y[j] += W[offset + j] * xi
	}
	return y
}

function l2NormOf(v: Float32Array): number {
	let sum = 0
	for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
	return Math.sqrt(sum)
}

function l2Normalize(v: Float32Array): number {
	const norm = l2NormOf(v)
	if (norm > 1e-12) {
		for (let i = 0; i < v.length; i++) v[i] /= norm
	}
	return norm
}

// ─── Serialization ─────────────────────────────────────────────────────────

export interface LoraWeights {
	b1: number[] // HIDDEN_DIM × LORA_RANK = 2304
	b2: number[] // INPUT_DIM × LORA_RANK  = 6912
}

// ─── LoRA Adapter ──────────────────────────────────────────────────────────

export class LoraAdapter {
	/** Frozen A matrices (identical across all clients via shared seed). */
	readonly a1: Float32Array // LORA_RANK × INPUT_DIM
	readonly a2: Float32Array // LORA_RANK × HIDDEN_DIM

	/** Trainable B matrices (initialized to zero = no initial adaptation). */
	b1: Float32Array // HIDDEN_DIM × LORA_RANK
	b2: Float32Array // INPUT_DIM × LORA_RANK

	private _gradB1: Float32Array
	private _gradB2: Float32Array
	private _gradCount = 0

	// Cached intermediates for backward
	private _lastA1x: Float32Array | null = null
	private _lastH: Float32Array | null = null // pre-ReLU
	private _lastR: Float32Array | null = null // post-ReLU
	private _lastA2r: Float32Array | null = null
	private _lastPreNorm: Float32Array | null = null
	private _lastNorm = 0

	/** Reference to the base projection head (weights are read-only in FL mode). */
	private _base: ProjectionHead

	constructor(base: ProjectionHead, seed = FROZEN_SEED) {
		this._base = base

		// Generate frozen A matrices deterministically
		const rng = mulberry32(seed)
		this.a1 = kaimingUniformSeeded(LORA_RANK, INPUT_DIM, rng)
		this.a2 = kaimingUniformSeeded(LORA_RANK, HIDDEN_DIM, rng)

		// B starts at zero (LoRA convention)
		this.b1 = new Float32Array(HIDDEN_DIM * LORA_RANK)
		this.b2 = new Float32Array(INPUT_DIM * LORA_RANK)

		this._gradB1 = new Float32Array(HIDDEN_DIM * LORA_RANK)
		this._gradB2 = new Float32Array(INPUT_DIM * LORA_RANK)
	}

	get base(): ProjectionHead {
		return this._base
	}

	/** Total trainable parameters (B1 + B2). */
	get paramCount(): number {
		return this.b1.length + this.b2.length
	}

	/**
	 * Forward pass with LoRA augmentation:
	 *   h = (W1 + B1·A1)·x + b1
	 *   r = ReLU(h)
	 *   z = (W2 + B2·A2)·r + b2
	 *   out = z / ||z||
	 */
	forward(x: Float32Array): Float32Array {
		const { w1, b1: baseBias1, w2, b2: baseBias2 } = this._base

		// Layer 1: h = W1·x + B1·(A1·x) + b1
		const a1x = matVec(this.a1, x, LORA_RANK, INPUT_DIM)
		const h = matVec(w1, x, HIDDEN_DIM, INPUT_DIM)
		const loraH = matVec(this.b1, a1x, HIDDEN_DIM, LORA_RANK)
		for (let i = 0; i < HIDDEN_DIM; i++) h[i] += loraH[i] + baseBias1[i]

		// ReLU
		const r = new Float32Array(HIDDEN_DIM)
		for (let i = 0; i < HIDDEN_DIM; i++) r[i] = h[i] > 0 ? h[i] : 0

		// Layer 2: z = W2·r + B2·(A2·r) + b2
		const a2r = matVec(this.a2, r, LORA_RANK, HIDDEN_DIM)
		const z = matVec(w2, r, INPUT_DIM, HIDDEN_DIM)
		const loraZ = matVec(this.b2, a2r, INPUT_DIM, LORA_RANK)
		for (let i = 0; i < INPUT_DIM; i++) z[i] += loraZ[i] + baseBias2[i]

		// L2-normalize
		const out = new Float32Array(z)
		const norm = l2Normalize(out)

		// Cache for backward
		this._lastA1x = a1x
		this._lastH = h
		this._lastR = r
		this._lastA2r = a2r
		this._lastPreNorm = z
		this._lastNorm = norm

		return out
	}

	/**
	 * Backward: accumulate gradients for B1 and B2 only.
	 * Base ProjectionHead weights are frozen during FL.
	 */
	backward(gradOutput: Float32Array): void {
		const h = this._lastH!
		const r = this._lastR!
		const z = this._lastPreNorm!
		const a1x = this._lastA1x!
		const a2r = this._lastA2r!
		const norm = this._lastNorm

		// Backprop through L2 normalization
		const y = new Float32Array(INPUT_DIM)
		if (norm > 1e-12) {
			for (let i = 0; i < INPUT_DIM; i++) y[i] = z[i] / norm
		}
		const dotGradY = dot(gradOutput, y)
		const gradZ = new Float32Array(INPUT_DIM)
		if (norm > 1e-12) {
			for (let i = 0; i < INPUT_DIM; i++) {
				gradZ[i] = (gradOutput[i] - y[i] * dotGradY) / norm
			}
		}

		// Gradient for B2: dB2[i,j] += gradZ[i] * a2r[j]
		for (let i = 0; i < INPUT_DIM; i++) {
			const offset = i * LORA_RANK
			const gz = gradZ[i]
			for (let j = 0; j < LORA_RANK; j++) {
				this._gradB2[offset + j] += gz * a2r[j]
			}
		}

		// Propagate through Layer 2 to get gradR
		// gradR = W2^T · gradZ + A2^T · (B2^T · gradZ)
		const { w2 } = this._base
		const gradR = matTVec(w2, gradZ, INPUT_DIM, HIDDEN_DIM)
		const b2TgradZ = matTVec(this.b2, gradZ, INPUT_DIM, LORA_RANK)
		const loraGradR = matTVec(this.a2, b2TgradZ, LORA_RANK, HIDDEN_DIM)
		for (let i = 0; i < HIDDEN_DIM; i++) gradR[i] += loraGradR[i]

		// Through ReLU
		const gradH = new Float32Array(HIDDEN_DIM)
		for (let i = 0; i < HIDDEN_DIM; i++) {
			gradH[i] = h[i] > 0 ? gradR[i] : 0
		}

		// Gradient for B1: dB1[i,j] += gradH[i] * a1x[j]
		for (let i = 0; i < HIDDEN_DIM; i++) {
			const offset = i * LORA_RANK
			const gh = gradH[i]
			for (let j = 0; j < LORA_RANK; j++) {
				this._gradB1[offset + j] += gh * a1x[j]
			}
		}

		this._gradCount++
	}

	/** SGD step on B matrices only. */
	step(learningRate: number, weightDecay = 0): void {
		if (this._gradCount === 0) return
		const scale = learningRate / this._gradCount

		for (let i = 0; i < this.b1.length; i++) {
			this.b1[i] -= scale * this._gradB1[i] + weightDecay * this.b1[i]
		}
		for (let i = 0; i < this.b2.length; i++) {
			this.b2[i] -= scale * this._gradB2[i] + weightDecay * this.b2[i]
		}

		this.zeroGrad()
	}

	/** Reset accumulated gradients. */
	zeroGrad(): void {
		this._gradB1.fill(0)
		this._gradB2.fill(0)
		this._gradCount = 0
	}

	/** Get all trainable B params as a flat vector (for delta computation / FL). */
	getTrainableParams(): Float32Array {
		const flat = new Float32Array(this.b1.length + this.b2.length)
		flat.set(this.b1, 0)
		flat.set(this.b2, this.b1.length)
		return flat
	}

	/** Set trainable B params from a flat vector. */
	setTrainableParams(flat: Float32Array): void {
		this.b1.set(flat.subarray(0, this.b1.length))
		this.b2.set(flat.subarray(this.b1.length))
	}

	/**
	 * Merge LoRA adaptation into base weights: W_new = W + B*A
	 * After merging, the base projection head contains the LoRA knowledge
	 * and the adapter can be safely discarded.
	 */
	mergeIntoBase(): void {
		const { w1, w2 } = this._base

		// W1_new = W1 + B1*A1  (HIDDEN_DIM×INPUT_DIM += HIDDEN_DIM×LORA_RANK * LORA_RANK×INPUT_DIM)
		for (let i = 0; i < HIDDEN_DIM; i++) {
			for (let j = 0; j < INPUT_DIM; j++) {
				let sum = 0
				for (let k = 0; k < LORA_RANK; k++) {
					sum += this.b1[i * LORA_RANK + k] * this.a1[k * INPUT_DIM + j]
				}
				w1[i * INPUT_DIM + j] += sum
			}
		}

		// W2_new = W2 + B2*A2  (INPUT_DIM×HIDDEN_DIM += INPUT_DIM×LORA_RANK * LORA_RANK×HIDDEN_DIM)
		for (let i = 0; i < INPUT_DIM; i++) {
			for (let j = 0; j < HIDDEN_DIM; j++) {
				let sum = 0
				for (let k = 0; k < LORA_RANK; k++) {
					sum += this.b2[i * LORA_RANK + k] * this.a2[k * HIDDEN_DIM + j]
				}
				w2[i * HIDDEN_DIM + j] += sum
			}
		}
	}

	/** Serialize B weights for persistence. */
	serialize(): LoraWeights {
		return {
			b1: Array.from(this.b1),
			b2: Array.from(this.b2),
		}
	}

	/** Load B weights from serialized form. */
	loadWeights(weights: LoraWeights): void {
		this.b1 = new Float32Array(weights.b1)
		this.b2 = new Float32Array(weights.b2)
	}
}
