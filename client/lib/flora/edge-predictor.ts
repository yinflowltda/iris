// ─── Edge Predictor: Schema-Constrained Bilinear Scoring ────────────────────
//
// Predicts which edge type should connect two notes using per-edge-type
// diagonal bilinear scoring:
//   score(src, tgt, k) = dot(d_k ⊙ src, tgt)
//
// Schema-constrained: only scores edge types where source cell is in
// fromCells and target cell is in toCells.
//
// 384 params per edge type (~3.5K for 9 types). Trained locally from
// user-created arrows via cross-entropy loss.

import type { EdgeTypeDef } from '../../../shared/types/MandalaTypes'

const EMBED_DIM = 384

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EdgePrediction {
	edgeTypeId: string
	label: string
	score: number
	probability: number
}

export interface EdgePredictorWeights {
	/** Map from edgeTypeId → diagonal vector as number[] */
	diagonals: Record<string, number[]>
}

export interface EdgeTrainingExample {
	srcEmbedding: Float32Array
	tgtEmbedding: Float32Array
	srcCellId: string
	tgtCellId: string
	edgeTypeId: string
}

// ─── Math helpers ───────────────────────────────────────────────────────────

function softmax(scores: number[]): number[] {
	const max = Math.max(...scores)
	const exps = scores.map((s) => Math.exp(s - max))
	const sum = exps.reduce((a, b) => a + b, 0)
	return exps.map((e) => e / sum)
}

// ─── Edge Predictor ─────────────────────────────────────────────────────────

export class EdgePredictor {
	/** Per-edge-type diagonal vectors: edgeTypeId → Float32Array(EMBED_DIM) */
	private diagonals: Map<string, Float32Array>
	private edgeTypes: EdgeTypeDef[]

	// Accumulated gradients for batch update
	private _gradDiags: Map<string, Float32Array>
	private _gradCount = 0

	constructor(edgeTypes: EdgeTypeDef[]) {
		this.edgeTypes = edgeTypes
		this.diagonals = new Map()
		this._gradDiags = new Map()

		for (const et of edgeTypes) {
			// Initialize diagonal to small random values (Xavier-like for rank-1)
			const d = new Float32Array(EMBED_DIM)
			const limit = Math.sqrt(2 / EMBED_DIM)
			for (let i = 0; i < EMBED_DIM; i++) {
				d[i] = (Math.random() * 2 - 1) * limit
			}
			this.diagonals.set(et.id, d)
			this._gradDiags.set(et.id, new Float32Array(EMBED_DIM))
		}
	}

	/** Number of trainable parameters. */
	get paramCount(): number {
		return this.diagonals.size * EMBED_DIM
	}

	/**
	 * Predict edge types for a pair of notes.
	 * Only considers edge types valid for the given cell pair.
	 */
	predict(
		srcEmbedding: Float32Array,
		tgtEmbedding: Float32Array,
		srcCellId: string,
		tgtCellId: string,
		topK = 3,
	): EdgePrediction[] {
		const validEdges = this.getValidEdgeTypes(srcCellId, tgtCellId)
		if (validEdges.length === 0) return []

		const scores = validEdges.map((et) => ({
			et,
			score: this.bilinearScore(srcEmbedding, tgtEmbedding, et.id),
		}))

		const rawScores = scores.map((s) => s.score)
		const probs = softmax(rawScores)

		return scores
			.map((s, i) => ({
				edgeTypeId: s.et.id,
				label: s.et.label,
				score: s.score,
				probability: probs[i],
			}))
			.sort((a, b) => b.probability - a.probability)
			.slice(0, topK)
	}

	/**
	 * Train on a batch of examples using cross-entropy loss.
	 * Returns the average loss.
	 */
	train(examples: EdgeTrainingExample[], learningRate = 0.01): number {
		if (examples.length === 0) return 0

		let totalLoss = 0

		for (const ex of examples) {
			const validEdges = this.getValidEdgeTypes(ex.srcCellId, ex.tgtCellId)
			if (validEdges.length < 2) continue // Need at least 2 options to learn

			const trueIdx = validEdges.findIndex((e) => e.id === ex.edgeTypeId)
			if (trueIdx === -1) continue // True label not in valid set

			// Forward: compute scores and softmax
			const scores = validEdges.map((et) =>
				this.bilinearScore(ex.srcEmbedding, ex.tgtEmbedding, et.id),
			)
			const probs = softmax(scores)

			// Loss: -log(prob of true class)
			totalLoss += -Math.log(Math.max(probs[trueIdx], 1e-10))

			// Backward: gradient of cross-entropy w.r.t. scores
			// dL/ds_k = prob_k - (k == trueIdx ? 1 : 0)
			for (let k = 0; k < validEdges.length; k++) {
				const gradScore = probs[k] - (k === trueIdx ? 1 : 0)
				const etId = validEdges[k].id

				// dScore/dDiag_i = src_i * tgt_i
				// dL/dDiag_i = gradScore * src_i * tgt_i
				const gradDiag = this._gradDiags.get(etId)!
				for (let i = 0; i < EMBED_DIM; i++) {
					gradDiag[i] += gradScore * ex.srcEmbedding[i] * ex.tgtEmbedding[i]
				}
			}

			this._gradCount++
		}

		// Apply gradients
		if (this._gradCount > 0) {
			const scale = learningRate / this._gradCount
			for (const [etId, diag] of this.diagonals) {
				const grad = this._gradDiags.get(etId)!
				for (let i = 0; i < EMBED_DIM; i++) {
					diag[i] -= scale * grad[i]
				}
				grad.fill(0)
			}
			this._gradCount = 0
		}

		return totalLoss / examples.length
	}

	/** Serialize weights for IndexedDB persistence. */
	serialize(): EdgePredictorWeights {
		const diagonals: Record<string, number[]> = {}
		for (const [id, d] of this.diagonals) {
			diagonals[id] = Array.from(d)
		}
		return { diagonals }
	}

	/** Deserialize weights, matching against current edge types. */
	static deserialize(data: EdgePredictorWeights, edgeTypes: EdgeTypeDef[]): EdgePredictor {
		const predictor = new EdgePredictor(edgeTypes)
		for (const et of edgeTypes) {
			if (data.diagonals[et.id]) {
				predictor.diagonals.set(et.id, new Float32Array(data.diagonals[et.id]))
			}
		}
		return predictor
	}

	// ─── Private ──────────────────────────────────────────────────────────────

	/** Compute bilinear score: dot(diag ⊙ src, tgt) */
	private bilinearScore(src: Float32Array, tgt: Float32Array, edgeTypeId: string): number {
		const diag = this.diagonals.get(edgeTypeId)
		if (!diag) return -Infinity

		let sum = 0
		for (let i = 0; i < EMBED_DIM; i++) {
			sum += diag[i] * src[i] * tgt[i]
		}
		return sum
	}

	/** Get edge types valid for a given cell pair. */
	private getValidEdgeTypes(srcCellId: string, tgtCellId: string): EdgeTypeDef[] {
		return this.edgeTypes.filter(
			(et) => et.fromCells.includes(srcCellId) && et.toCells.includes(tgtCellId),
		)
	}
}
