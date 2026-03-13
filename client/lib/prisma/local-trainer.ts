// ─── Local Prisma Trainer ────────────────────────────────────────────────────
//
// Trains the projection head + cell anchors using user's note-to-cell placements.
// All training happens locally in the browser. No data leaves the device.

import type { TreeMapDefinition } from '../../../shared/types/MandalaTypes'
import { collectAnchorCells, composeAnchorText } from './cell-anchors'
import { EdgePredictor, type EdgePrediction, type EdgePredictorWeights } from './edge-predictor'
import { PrismaEmbeddingService } from './embedding-service'
import { LoraAdapter, type LoraWeights } from './lora-adapter'
import { dot, ProjectionHead } from './projection-head'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlacementExample {
	noteText: string
	cellId: string
	timestamp: number
}

export interface ArrowExample {
	srcNoteText: string
	tgtNoteText: string
	srcCellId: string
	tgtCellId: string
	edgeTypeId: string
	timestamp: number
}

export interface TrainableAnchors {
	/** Map from cellId to a single trainable 384-dim anchor vector. */
	vectors: Map<string, Float32Array>
}

export interface TrainerState {
	projectionWeights: ReturnType<ProjectionHead['serialize']>
	anchors: Record<string, number[]>
	examples: PlacementExample[]
	arrowExamples?: ArrowExample[]
	edgePredictorWeights?: EdgePredictorWeights
	loraWeights?: LoraWeights
	trainStepCount: number
}

export interface TrainStepResult {
	loss: number
	stepsRun: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MARGIN = 0.3
const LEARNING_RATE = 0.005
const ANCHOR_LR = 0.001
const WEIGHT_DECAY = 1e-4
const MIN_EXAMPLES_TO_TRAIN = 3
const DEFAULT_TRAIN_STEPS = 10
const IDB_STORE = 'prisma-trainer'

// ─── Contrastive loss ───────────────────────────────────────────────────────

/**
 * Margin-enhanced contrastive loss.
 *
 * loss = max(0, margin - sim(projected, positive) + max_neg(sim(projected, negative_i)))
 *
 * Returns: { loss, gradProjected, positiveGrad, hardNegId }
 */
export function contrastiveLoss(
	projected: Float32Array,
	positiveAnchor: Float32Array,
	negativeAnchors: Map<string, Float32Array>,
	margin: number,
): {
	loss: number
	gradProjected: Float32Array | null
	gradPositive: Float32Array | null
	hardNegId: string | null
	gradHardNeg: Float32Array | null
} {
	const posSim = dot(projected, positiveAnchor)

	// Find hardest negative (highest similarity among negatives)
	let maxNegSim = -Infinity
	let hardNegId: string | null = null
	let hardNegAnchor: Float32Array | null = null
	for (const [cellId, anchor] of negativeAnchors) {
		const sim = dot(projected, anchor)
		if (sim > maxNegSim) {
			maxNegSim = sim
			hardNegId = cellId
			hardNegAnchor = anchor
		}
	}

	if (hardNegAnchor === null) {
		return { loss: 0, gradProjected: null, gradPositive: null, hardNegId: null, gradHardNeg: null }
	}

	const loss = Math.max(0, margin - posSim + maxNegSim)

	if (loss === 0) {
		return { loss: 0, gradProjected: null, gradPositive: null, hardNegId, gradHardNeg: null }
	}

	// Gradients (for L2-normalized vectors, d(dot(a,b))/da = b)
	const dim = projected.length
	const gradProjected = new Float32Array(dim)
	for (let i = 0; i < dim; i++) {
		gradProjected[i] = -positiveAnchor[i] + hardNegAnchor[i]
	}

	const gradPositive = new Float32Array(dim)
	for (let i = 0; i < dim; i++) {
		gradPositive[i] = -projected[i]
	}

	const gradHardNeg = new Float32Array(dim)
	for (let i = 0; i < dim; i++) {
		gradHardNeg[i] = projected[i]
	}

	return { loss, gradProjected, gradPositive, hardNegId, gradHardNeg }
}

/** L2-normalize a vector in place. */
function l2Normalize(v: Float32Array): void {
	let sum = 0
	for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
	const norm = Math.sqrt(sum)
	if (norm > 1e-12) {
		for (let i = 0; i < v.length; i++) v[i] /= norm
	}
}

// ─── Local Trainer ──────────────────────────────────────────────────────────

export class LocalPrismaTrainer {
	private _head: ProjectionHead
	private _lora: LoraAdapter | null = null
	private _anchors: TrainableAnchors
	private _examples: PlacementExample[] = []
	private _arrowExamples: ArrowExample[] = []
	private _edgePredictor: EdgePredictor | null = null
	private _trainStepCount = 0
	private _mapId: string
	private _initialized = false

	constructor(mapId: string) {
		this._mapId = mapId
		this._head = new ProjectionHead()
		this._anchors = { vectors: new Map() }
	}

	get head(): ProjectionHead {
		return this._head
	}

	get lora(): LoraAdapter | null {
		return this._lora
	}

	get anchors(): TrainableAnchors {
		return this._anchors
	}

	get edgePredictor(): EdgePredictor | null {
		return this._edgePredictor
	}

	get exampleCount(): number {
		return this._examples.length
	}

	get arrowExampleCount(): number {
		return this._arrowExamples.length
	}

	get trainStepCount(): number {
		return this._trainStepCount
	}

	get isInitialized(): boolean {
		return this._initialized
	}

	/** Enable LoRA mode: freeze base projection head, train only LoRA B matrices. */
	enableLora(seed?: number): LoraAdapter {
		this._lora = new LoraAdapter(this._head, seed)
		return this._lora
	}

	/** Disable LoRA mode: return to training the full projection head. */
	disableLora(): void {
		this._lora = null
	}

	/**
	 * Initialize anchors from a tree definition's cold-start embeddings.
	 * Each cell gets a single anchor = mean of its multi-anchor embeddings.
	 */
	async initAnchorsFromTree(treeDef: TreeMapDefinition): Promise<void> {
		const service = PrismaEmbeddingService.getInstance()
		const cells = collectAnchorCells(treeDef.root)

		for (const cell of cells) {
			// Use the full description text as the initial anchor
			const text = composeAnchorText(cell)
			const embedding = await service.embed(text)
			this._anchors.vectors.set(cell.id, new Float32Array(embedding))
		}

		// Initialize edge predictor if the map has edge types
		if (treeDef.edgeTypes && treeDef.edgeTypes.length > 0) {
			this._edgePredictor = new EdgePredictor(treeDef.edgeTypes)
		}

		this._initialized = true
	}

	/**
	 * Initialize anchors from pre-computed embeddings (for testing or when embeddings are available).
	 */
	initAnchorsFromEmbeddings(anchors: Map<string, Float32Array>): void {
		for (const [cellId, embedding] of anchors) {
			this._anchors.vectors.set(cellId, new Float32Array(embedding))
		}
		this._initialized = true
	}

	/** Record a note placement as a training example. */
	addPlacement(noteText: string, cellId: string): void {
		if (!noteText.trim()) return
		this._examples.push({
			noteText: noteText.trim(),
			cellId,
			timestamp: Date.now(),
		})
	}

	/** Record an arrow creation as a training example for the edge predictor. */
	addArrow(
		srcNoteText: string,
		tgtNoteText: string,
		srcCellId: string,
		tgtCellId: string,
		edgeTypeId: string,
	): void {
		if (!srcNoteText.trim() || !tgtNoteText.trim()) return
		this._arrowExamples.push({
			srcNoteText: srcNoteText.trim(),
			tgtNoteText: tgtNoteText.trim(),
			srcCellId,
			tgtCellId,
			edgeTypeId,
			timestamp: Date.now(),
		})
	}

	/**
	 * Predict edge types for a pair of notes.
	 * Returns empty if edge predictor not initialized or cell pair has no valid edges.
	 */
	async predictEdge(
		srcNoteText: string,
		tgtNoteText: string,
		srcCellId: string,
		tgtCellId: string,
		topK = 3,
	): Promise<EdgePrediction[]> {
		if (!this._edgePredictor) return []
		const service = PrismaEmbeddingService.getInstance()
		const srcEmb = await service.embed(srcNoteText)
		const tgtEmb = await service.embed(tgtNoteText)
		return this._edgePredictor.predict(srcEmb, tgtEmb, srcCellId, tgtCellId, topK)
	}

	/** Check if we have enough examples to train. */
	canTrain(): boolean {
		return (
			this._initialized &&
			(this._examples.length >= MIN_EXAMPLES_TO_TRAIN ||
				this._arrowExamples.length >= MIN_EXAMPLES_TO_TRAIN)
		)
	}

	/**
	 * Run training steps over accumulated placement examples.
	 * Returns average loss over the training steps.
	 */
	async train(steps = DEFAULT_TRAIN_STEPS): Promise<TrainStepResult> {
		if (!this.canTrain()) {
			return { loss: 0, stepsRun: 0 }
		}

		const service = PrismaEmbeddingService.getInstance()
		let totalLoss = 0
		let stepsRun = 0

		// Pre-embed all unique note texts
		const textToEmbedding = new Map<string, Float32Array>()
		for (const ex of this._examples) {
			if (!textToEmbedding.has(ex.noteText)) {
				textToEmbedding.set(ex.noteText, await service.embed(ex.noteText))
			}
		}

		// Decide whether to use LoRA or base projection head
		const useLora = this._lora !== null

		for (let step = 0; step < steps; step++) {
			// Shuffle examples for each step
			const shuffled = [...this._examples].sort(() => Math.random() - 0.5)

			let stepLoss = 0
			if (useLora) {
				this._lora!.zeroGrad()
			} else {
				this._head.zeroGrad()
			}

			for (const example of shuffled) {
				const noteEmbedding = textToEmbedding.get(example.noteText)!
				const positiveAnchor = this._anchors.vectors.get(example.cellId)
				if (!positiveAnchor) continue

				// Forward through projection head (or LoRA-augmented head)
				const projected = useLora
					? this._lora!.forward(noteEmbedding)
					: this._head.forward(noteEmbedding)

				// Collect negative anchors
				const negatives = new Map<string, Float32Array>()
				for (const [cellId, anchor] of this._anchors.vectors) {
					if (cellId !== example.cellId) negatives.set(cellId, anchor)
				}

				// Compute contrastive loss
				const result = contrastiveLoss(projected, positiveAnchor, negatives, MARGIN)
				stepLoss += result.loss

				if (result.gradProjected) {
					// Backprop (LoRA only updates B matrices; base head updates all)
					if (useLora) {
						this._lora!.backward(result.gradProjected)
					} else {
						this._head.backward(result.gradProjected)
					}

					// Update positive anchor
					if (result.gradPositive) {
						for (let i = 0; i < positiveAnchor.length; i++) {
							positiveAnchor[i] -= ANCHOR_LR * result.gradPositive[i]
						}
						l2Normalize(positiveAnchor)
					}

					// Update hardest negative anchor
					if (result.hardNegId && result.gradHardNeg) {
						const negAnchor = this._anchors.vectors.get(result.hardNegId)
						if (negAnchor) {
							for (let i = 0; i < negAnchor.length; i++) {
								negAnchor[i] -= ANCHOR_LR * result.gradHardNeg[i]
							}
							l2Normalize(negAnchor)
						}
					}
				}
			}

			// Apply accumulated gradients
			if (useLora) {
				this._lora!.step(LEARNING_RATE, WEIGHT_DECAY)
			} else {
				this._head.step(LEARNING_RATE, WEIGHT_DECAY)
			}

			totalLoss += stepLoss / shuffled.length
			stepsRun++
			this._trainStepCount++
		}

		// Also train edge predictor if we have arrow examples
		if (this._edgePredictor && this._arrowExamples.length >= MIN_EXAMPLES_TO_TRAIN) {
			const arrowTextToEmb = new Map<string, Float32Array>()
			for (const ex of this._arrowExamples) {
				if (!arrowTextToEmb.has(ex.srcNoteText)) {
					arrowTextToEmb.set(ex.srcNoteText, await service.embed(ex.srcNoteText))
				}
				if (!arrowTextToEmb.has(ex.tgtNoteText)) {
					arrowTextToEmb.set(ex.tgtNoteText, await service.embed(ex.tgtNoteText))
				}
			}

			const edgeExamples = this._arrowExamples.map((ex) => ({
				srcEmbedding: arrowTextToEmb.get(ex.srcNoteText)!,
				tgtEmbedding: arrowTextToEmb.get(ex.tgtNoteText)!,
				srcCellId: ex.srcCellId,
				tgtCellId: ex.tgtCellId,
				edgeTypeId: ex.edgeTypeId,
			}))

			for (let step = 0; step < steps; step++) {
				this._edgePredictor.train(edgeExamples, LEARNING_RATE)
			}
		}

		return { loss: totalLoss / stepsRun, stepsRun }
	}

	/**
	 * Classify a note using the trained projection head + anchors.
	 * Returns sorted results by similarity (highest first).
	 */
	classify(noteEmbedding: Float32Array, topK = 3): { cellId: string; similarity: number }[] {
		const projected = this._lora
			? this._lora.forward(noteEmbedding)
			: this._head.forward(noteEmbedding)
		const results: { cellId: string; similarity: number }[] = []

		for (const [cellId, anchor] of this._anchors.vectors) {
			results.push({ cellId, similarity: dot(projected, anchor) })
		}

		results.sort((a, b) => b.similarity - a.similarity)
		return results.slice(0, topK)
	}

	/** Serialize trainer state for IndexedDB persistence. */
	serialize(): TrainerState {
		const anchors: Record<string, number[]> = {}
		for (const [cellId, vec] of this._anchors.vectors) {
			anchors[cellId] = Array.from(vec)
		}
		return {
			projectionWeights: this._head.serialize(),
			anchors,
			examples: this._examples,
			arrowExamples: this._arrowExamples,
			edgePredictorWeights: this._edgePredictor?.serialize(),
			loraWeights: this._lora?.serialize(),
			trainStepCount: this._trainStepCount,
		}
	}

	/** Restore trainer state from persistence. */
	static deserialize(
		mapId: string,
		data: TrainerState,
		treeDef?: TreeMapDefinition,
	): LocalPrismaTrainer {
		const trainer = new LocalPrismaTrainer(mapId)
		trainer._head = ProjectionHead.deserialize(data.projectionWeights)
		for (const [cellId, arr] of Object.entries(data.anchors)) {
			trainer._anchors.vectors.set(cellId, new Float32Array(arr))
		}
		trainer._examples = data.examples
		trainer._arrowExamples = data.arrowExamples ?? []
		trainer._trainStepCount = data.trainStepCount
		trainer._initialized = true

		// Restore LoRA weights if present
		if (data.loraWeights) {
			const lora = trainer.enableLora()
			lora.loadWeights(data.loraWeights)
		}

		// Restore edge predictor if we have weights and edge types
		const edgeTypes = treeDef?.edgeTypes
		if (data.edgePredictorWeights && edgeTypes && edgeTypes.length > 0) {
			trainer._edgePredictor = EdgePredictor.deserialize(data.edgePredictorWeights, edgeTypes)
		} else if (edgeTypes && edgeTypes.length > 0) {
			trainer._edgePredictor = new EdgePredictor(edgeTypes)
		}

		return trainer
	}

	// ─── IndexedDB persistence ────────────────────────────────────────────────

	/** Save trainer state to IndexedDB. */
	async save(): Promise<void> {
		const db = await openDB()
		return new Promise((resolve, reject) => {
			const tx = db.transaction(IDB_STORE, 'readwrite')
			tx.objectStore(IDB_STORE).put(this.serialize(), this._mapId)
			tx.oncomplete = () => {
				db.close()
				resolve()
			}
			tx.onerror = () => {
				db.close()
				reject(tx.error)
			}
		})
	}

	/** Load trainer state from IndexedDB. Returns null if not found. */
	static async load(mapId: string): Promise<LocalPrismaTrainer | null> {
		const db = await openDB()
		return new Promise((resolve, reject) => {
			const tx = db.transaction(IDB_STORE, 'readonly')
			const req = tx.objectStore(IDB_STORE).get(mapId)
			req.onsuccess = () => {
				db.close()
				if (req.result) {
					resolve(LocalPrismaTrainer.deserialize(mapId, req.result))
				} else {
					resolve(null)
				}
			}
			req.onerror = () => {
				db.close()
				reject(req.error)
			}
		})
	}
}

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('prisma', 1)
		req.onupgradeneeded = () => {
			const db = req.result
			if (!db.objectStoreNames.contains(IDB_STORE)) {
				db.createObjectStore(IDB_STORE)
			}
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}
