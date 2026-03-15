import { describe, expect, it } from 'vitest'
import { EdgePredictor, type EdgeTrainingExample } from '../../../client/lib/flora/edge-predictor'
import type { EdgeTypeDef } from '../../../shared/types/MandalaTypes'

// ─── Test edge types ────────────────────────────────────────────────────────

const EDGE_TYPES: EdgeTypeDef[] = [
	{
		id: 'triggers',
		label: 'triggers',
		fromCells: ['events'],
		toCells: ['thoughts'],
		empiricalBasis: 'CBT',
		color: 'black',
	},
	{
		id: 'shapes',
		label: 'shapes',
		fromCells: ['thoughts'],
		toCells: ['beliefs'],
		empiricalBasis: 'CBT',
		color: 'black',
	},
	{
		id: 'supports',
		label: 'supports',
		fromCells: ['evidence'],
		toCells: ['beliefs'],
		empiricalBasis: 'CBT',
		color: 'green',
	},
	{
		id: 'contradicts',
		label: 'contradicts',
		fromCells: ['evidence'],
		toCells: ['beliefs'],
		empiricalBasis: 'CBT',
		color: 'red',
	},
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomEmbed(seed: number): Float32Array {
	const v = new Float32Array(384)
	let s = seed
	for (let i = 0; i < 384; i++) {
		s = (s * 1664525 + 1013904223) & 0x7fffffff
		v[i] = (s / 0x7fffffff) * 2 - 1
	}
	return v
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EdgePredictor', () => {
	it('initializes with correct param count', () => {
		const predictor = new EdgePredictor(EDGE_TYPES)
		expect(predictor.paramCount).toBe(4 * 384) // 4 edge types × 384 dims
	})

	it('returns empty predictions for invalid cell pair', () => {
		const predictor = new EdgePredictor(EDGE_TYPES)
		const src = randomEmbed(1)
		const tgt = randomEmbed(2)
		// No edge type connects events → events
		const preds = predictor.predict(src, tgt, 'events', 'events')
		expect(preds).toEqual([])
	})

	it('returns only schema-valid edge types', () => {
		const predictor = new EdgePredictor(EDGE_TYPES)
		const src = randomEmbed(1)
		const tgt = randomEmbed(2)
		// evidence → beliefs: supports + contradicts are valid
		const preds = predictor.predict(src, tgt, 'evidence', 'beliefs')
		expect(preds).toHaveLength(2)
		const ids = preds.map((p) => p.edgeTypeId)
		expect(ids).toContain('supports')
		expect(ids).toContain('contradicts')
	})

	it('probabilities sum to 1', () => {
		const predictor = new EdgePredictor(EDGE_TYPES)
		const src = randomEmbed(1)
		const tgt = randomEmbed(2)
		const preds = predictor.predict(src, tgt, 'evidence', 'beliefs')
		const total = preds.reduce((sum, p) => sum + p.probability, 0)
		expect(total).toBeCloseTo(1.0, 5)
	})

	it('returns single prediction when only one edge type is valid', () => {
		const predictor = new EdgePredictor(EDGE_TYPES)
		const src = randomEmbed(1)
		const tgt = randomEmbed(2)
		// events → thoughts: only triggers is valid
		const preds = predictor.predict(src, tgt, 'events', 'thoughts')
		expect(preds).toHaveLength(1)
		expect(preds[0].edgeTypeId).toBe('triggers')
		expect(preds[0].probability).toBeCloseTo(1.0, 5)
	})

	it('training reduces loss', () => {
		const predictor = new EdgePredictor(EDGE_TYPES)

		// Create training examples: evidence → beliefs with type "supports"
		const examples: EdgeTrainingExample[] = Array.from({ length: 20 }, (_, i) => ({
			srcEmbedding: randomEmbed(100 + i),
			tgtEmbedding: randomEmbed(200 + i),
			srcCellId: 'evidence',
			tgtCellId: 'beliefs',
			edgeTypeId: 'supports',
		}))

		const loss1 = predictor.train(examples, 0.05)

		// Train a few more rounds
		let loss = loss1
		for (let r = 0; r < 10; r++) {
			loss = predictor.train(examples, 0.05)
		}

		expect(loss).toBeLessThan(loss1)
	})

	it('training biases predictions toward trained edge type', () => {
		const predictor = new EdgePredictor(EDGE_TYPES)

		// Train on "supports" examples from evidence → beliefs
		const supportEmbeds = Array.from({ length: 30 }, (_, i) => ({
			srcEmbedding: randomEmbed(300 + i),
			tgtEmbedding: randomEmbed(400 + i),
			srcCellId: 'evidence',
			tgtCellId: 'beliefs',
			edgeTypeId: 'supports',
		}))

		for (let r = 0; r < 30; r++) {
			predictor.train(supportEmbeds, 0.05)
		}

		// Predict on similar inputs — should favor "supports"
		const preds = predictor.predict(randomEmbed(350), randomEmbed(450), 'evidence', 'beliefs')
		expect(preds[0].edgeTypeId).toBe('supports')
		expect(preds[0].probability).toBeGreaterThan(0.5)
	})

	it('serializes and deserializes weights', () => {
		const predictor = new EdgePredictor(EDGE_TYPES)

		// Train to get non-random weights
		const examples: EdgeTrainingExample[] = Array.from({ length: 10 }, (_, i) => ({
			srcEmbedding: randomEmbed(500 + i),
			tgtEmbedding: randomEmbed(600 + i),
			srcCellId: 'evidence',
			tgtCellId: 'beliefs',
			edgeTypeId: 'contradicts',
		}))
		predictor.train(examples, 0.01)

		// Serialize → deserialize
		const data = predictor.serialize()
		const restored = EdgePredictor.deserialize(data, EDGE_TYPES)

		// Predictions should match
		const src = randomEmbed(700)
		const tgt = randomEmbed(800)
		const orig = predictor.predict(src, tgt, 'evidence', 'beliefs')
		const rest = restored.predict(src, tgt, 'evidence', 'beliefs')

		expect(rest).toHaveLength(orig.length)
		for (let i = 0; i < orig.length; i++) {
			expect(rest[i].edgeTypeId).toBe(orig[i].edgeTypeId)
			expect(rest[i].probability).toBeCloseTo(orig[i].probability, 5)
		}
	})

	it('handles empty edge types gracefully', () => {
		const predictor = new EdgePredictor([])
		expect(predictor.paramCount).toBe(0)
		const preds = predictor.predict(randomEmbed(1), randomEmbed(2), 'a', 'b')
		expect(preds).toEqual([])
	})

	it('handles deserialization with new edge types', () => {
		// Predictor saved with fewer edge types, restored with more
		const oldPredictor = new EdgePredictor(EDGE_TYPES.slice(0, 2))
		const data = oldPredictor.serialize()
		const newPredictor = EdgePredictor.deserialize(data, EDGE_TYPES)
		// Should have all 4 edge types with fresh weights for new ones
		expect(newPredictor.paramCount).toBe(4 * 384)
	})
})
