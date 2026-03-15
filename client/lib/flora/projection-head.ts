// ─── Projection Head: Linear(384→128) + ReLU + Linear(128→384) ──────────────
//
// A small trainable MLP that transforms note embeddings before comparing
// with cell anchors. Trained locally via margin-enhanced contrastive loss
// when users place notes into cells.

const INPUT_DIM = 384
const HIDDEN_DIM = 128

// ─── Math utilities ─────────────────────────────────────────────────────────

/** Matrix-vector multiply: y = W * x where W is (rows × cols), x is (cols). */
function matVec(W: Float32Array, x: Float32Array, rows: number, cols: number): Float32Array {
	const y = new Float32Array(rows)
	for (let i = 0; i < rows; i++) {
		let sum = 0
		const offset = i * cols
		for (let j = 0; j < cols; j++) {
			sum += W[offset + j] * x[j]
		}
		y[i] = sum
	}
	return y
}

/** Transpose matrix-vector multiply: y = W^T * x where W is (rows × cols), x is (rows). */
function matTVec(W: Float32Array, x: Float32Array, rows: number, cols: number): Float32Array {
	const y = new Float32Array(cols)
	for (let i = 0; i < rows; i++) {
		const offset = i * cols
		const xi = x[i]
		for (let j = 0; j < cols; j++) {
			y[j] += W[offset + j] * xi
		}
	}
	return y
}

/** L2 norm of a vector. */
function l2Norm(v: Float32Array): number {
	let sum = 0
	for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
	return Math.sqrt(sum)
}

/** L2-normalize a vector in place. Returns the original norm. */
function l2Normalize(v: Float32Array): number {
	const norm = l2Norm(v)
	if (norm > 1e-12) {
		for (let i = 0; i < v.length; i++) v[i] /= norm
	}
	return norm
}

/** Dot product of two vectors. */
export function dot(a: Float32Array, b: Float32Array): number {
	let sum = 0
	for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
	return sum
}

// ─── Xavier initialization ──────────────────────────────────────────────────

/** Xavier uniform initialization: U(-limit, limit) where limit = sqrt(6 / (fanIn + fanOut)). */
function xavierUniform(fanIn: number, fanOut: number): Float32Array {
	const limit = Math.sqrt(6 / (fanIn + fanOut))
	const w = new Float32Array(fanIn * fanOut)
	for (let i = 0; i < w.length; i++) {
		w[i] = (Math.random() * 2 - 1) * limit
	}
	return w
}

// ─── Serialization types ────────────────────────────────────────────────────

export interface ProjectionHeadWeights {
	w1: number[] // (HIDDEN_DIM × INPUT_DIM)
	b1: number[] // (HIDDEN_DIM)
	w2: number[] // (INPUT_DIM × HIDDEN_DIM)
	b2: number[] // (INPUT_DIM)
}

// ─── Projection Head class ──────────────────────────────────────────────────

export class ProjectionHead {
	w1: Float32Array // (HIDDEN_DIM × INPUT_DIM)
	b1: Float32Array // (HIDDEN_DIM)
	w2: Float32Array // (INPUT_DIM × HIDDEN_DIM)
	b2: Float32Array // (INPUT_DIM)

	// Accumulated gradients for batch update
	private _gradW1: Float32Array
	private _gradB1: Float32Array
	private _gradW2: Float32Array
	private _gradB2: Float32Array
	private _gradCount = 0

	// Cached forward pass values for backward
	private _lastInput: Float32Array | null = null
	private _lastHidden: Float32Array | null = null // pre-ReLU
	private _lastActivated: Float32Array | null = null // post-ReLU
	private _lastPreNorm: Float32Array | null = null // pre-normalization
	private _lastNorm = 0

	constructor() {
		this.w1 = xavierUniform(INPUT_DIM, HIDDEN_DIM)
		this.b1 = new Float32Array(HIDDEN_DIM)
		this.w2 = xavierUniform(HIDDEN_DIM, INPUT_DIM)
		this.b2 = new Float32Array(INPUT_DIM)

		this._gradW1 = new Float32Array(HIDDEN_DIM * INPUT_DIM)
		this._gradB1 = new Float32Array(HIDDEN_DIM)
		this._gradW2 = new Float32Array(INPUT_DIM * HIDDEN_DIM)
		this._gradB2 = new Float32Array(INPUT_DIM)
	}

	/** Forward pass: x → Linear(384→128) → ReLU → Linear(128→384) → L2-normalize. */
	forward(x: Float32Array): Float32Array {
		// Layer 1: h = W1 * x + b1
		const h = matVec(this.w1, x, HIDDEN_DIM, INPUT_DIM)
		for (let i = 0; i < HIDDEN_DIM; i++) h[i] += this.b1[i]

		// ReLU
		const r = new Float32Array(HIDDEN_DIM)
		for (let i = 0; i < HIDDEN_DIM; i++) r[i] = h[i] > 0 ? h[i] : 0

		// Layer 2: z = W2 * r + b2
		const z = matVec(this.w2, r, INPUT_DIM, HIDDEN_DIM)
		for (let i = 0; i < INPUT_DIM; i++) z[i] += this.b2[i]

		// L2-normalize
		const out = new Float32Array(z)
		const norm = l2Normalize(out)

		// Cache for backward
		this._lastInput = x
		this._lastHidden = h
		this._lastActivated = r
		this._lastPreNorm = z
		this._lastNorm = norm

		return out
	}

	/**
	 * Backward pass: accumulate gradients given dL/dy (gradient of loss w.r.t. normalized output).
	 * Must be called after forward().
	 */
	backward(gradOutput: Float32Array): void {
		const x = this._lastInput!
		const h = this._lastHidden!
		const r = this._lastActivated!
		const z = this._lastPreNorm!
		const norm = this._lastNorm

		// Backprop through L2 normalization:
		// y = z / ||z||, so dy/dz_i = (1/||z||) * (delta_ij - y_i * y_j) * gradOutput_j
		// Simplified: gradZ = (gradOutput - y * dot(gradOutput, y)) / ||z||
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

		// Backprop through Layer 2: z = W2 * r + b2
		// gradW2 += gradZ * r^T
		for (let i = 0; i < INPUT_DIM; i++) {
			const offset = i * HIDDEN_DIM
			const gz = gradZ[i]
			for (let j = 0; j < HIDDEN_DIM; j++) {
				this._gradW2[offset + j] += gz * r[j]
			}
			this._gradB2[i] += gz
		}

		// gradR = W2^T * gradZ
		const gradR = matTVec(this.w2, gradZ, INPUT_DIM, HIDDEN_DIM)

		// Backprop through ReLU
		const gradH = new Float32Array(HIDDEN_DIM)
		for (let i = 0; i < HIDDEN_DIM; i++) {
			gradH[i] = h[i] > 0 ? gradR[i] : 0
		}

		// Backprop through Layer 1: h = W1 * x + b1
		for (let i = 0; i < HIDDEN_DIM; i++) {
			const offset = i * INPUT_DIM
			const gh = gradH[i]
			for (let j = 0; j < INPUT_DIM; j++) {
				this._gradW1[offset + j] += gh * x[j]
			}
			this._gradB1[i] += gh
		}

		this._gradCount++
	}

	/** Apply accumulated gradients with SGD and optional weight decay. */
	step(learningRate: number, weightDecay = 0): void {
		if (this._gradCount === 0) return
		const scale = learningRate / this._gradCount

		this._applyGradient(this.w1, this._gradW1, scale, weightDecay)
		this._applyGradient(this.b1, this._gradB1, scale, 0)
		this._applyGradient(this.w2, this._gradW2, scale, weightDecay)
		this._applyGradient(this.b2, this._gradB2, scale, 0)

		this.zeroGrad()
	}

	/** Reset accumulated gradients. */
	zeroGrad(): void {
		this._gradW1.fill(0)
		this._gradB1.fill(0)
		this._gradW2.fill(0)
		this._gradB2.fill(0)
		this._gradCount = 0
	}

	/** Serialize weights for persistence. */
	serialize(): ProjectionHeadWeights {
		return {
			w1: Array.from(this.w1),
			b1: Array.from(this.b1),
			w2: Array.from(this.w2),
			b2: Array.from(this.b2),
		}
	}

	/** Deserialize weights from persistence. */
	static deserialize(data: ProjectionHeadWeights): ProjectionHead {
		const head = new ProjectionHead()
		head.w1 = new Float32Array(data.w1)
		head.b1 = new Float32Array(data.b1)
		head.w2 = new Float32Array(data.w2)
		head.b2 = new Float32Array(data.b2)
		return head
	}

	/** Number of trainable parameters. */
	get paramCount(): number {
		return this.w1.length + this.b1.length + this.w2.length + this.b2.length
	}

	private _applyGradient(
		param: Float32Array,
		grad: Float32Array,
		scale: number,
		weightDecay: number,
	): void {
		for (let i = 0; i < param.length; i++) {
			param[i] -= scale * grad[i] + weightDecay * param[i]
		}
	}
}
