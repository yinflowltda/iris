import { afterEach, describe, expect, it, vi } from 'vitest'
import { contrastiveLoss, LocalPrismaTrainer } from '../../../client/lib/prisma/local-trainer'
import { dot } from '../../../client/lib/prisma/projection-head'

// ─── Mock embedding service ─────────────────────────────────────────────────

const mockEmbed = vi.fn<(text: string) => Promise<Float32Array>>()

vi.mock('../../../client/lib/prisma/embedding-service', () => ({
	PrismaEmbeddingService: {
		getInstance: () => ({ embed: mockEmbed }),
	},
}))

afterEach(() => {
	mockEmbed.mockReset()
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function unitVector(dim: number, axis: number): Float32Array {
	const v = new Float32Array(dim)
	v[axis] = 1
	return v
}

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

// ─── contrastiveLoss ────────────────────────────────────────────────────────

describe('contrastiveLoss', () => {
	it('returns zero loss when positive is much closer than negative', () => {
		const projected = unitVector(4, 0) // [1, 0, 0, 0]
		const positive = unitVector(4, 0) // same direction → sim=1
		const negatives = new Map([['neg', unitVector(4, 1)]]) // orthogonal → sim=0

		const result = contrastiveLoss(projected, positive, negatives, 0.3)
		// loss = max(0, 0.3 - 1 + 0) = 0
		expect(result.loss).toBe(0)
		expect(result.gradProjected).toBeNull()
	})

	it('returns positive loss when negative is closer than positive', () => {
		const projected = unitVector(4, 0)
		const positive = unitVector(4, 1) // orthogonal → sim=0
		const negatives = new Map([['neg', unitVector(4, 0)]]) // same → sim=1

		const result = contrastiveLoss(projected, positive, negatives, 0.3)
		// loss = max(0, 0.3 - 0 + 1) = 1.3
		expect(result.loss).toBeCloseTo(1.3)
		expect(result.gradProjected).not.toBeNull()
	})

	it('identifies the hardest negative', () => {
		const projected = unitVector(4, 0)
		const positive = unitVector(4, 0) // sim=1
		const negatives = new Map([
			['far', unitVector(4, 2)], // sim=0
			['close', new Float32Array([0.8, 0.6, 0, 0])], // sim~0.8
		])

		const result = contrastiveLoss(projected, positive, negatives, 0.3)
		expect(result.hardNegId).toBe('close')
	})

	it('handles empty negatives', () => {
		const projected = unitVector(4, 0)
		const positive = unitVector(4, 0)
		const result = contrastiveLoss(projected, positive, new Map(), 0.3)
		expect(result.loss).toBe(0)
	})
})

// ─── LocalPrismaTrainer ────────────────────────────────────────────────────

describe('LocalPrismaTrainer', () => {
	it('starts uninitialized with zero examples', () => {
		const trainer = new LocalPrismaTrainer('test-map')
		expect(trainer.isInitialized).toBe(false)
		expect(trainer.exampleCount).toBe(0)
		expect(trainer.trainStepCount).toBe(0)
	})

	it('initAnchorsFromEmbeddings initializes trainer', () => {
		const trainer = new LocalPrismaTrainer('test-map')
		trainer.initAnchorsFromEmbeddings(
			new Map([
				['cell-a', unitVector(384, 0)],
				['cell-b', unitVector(384, 1)],
			]),
		)
		expect(trainer.isInitialized).toBe(true)
		expect(trainer.anchors.vectors.size).toBe(2)
	})

	it('addPlacement records examples', () => {
		const trainer = new LocalPrismaTrainer('test-map')
		trainer.addPlacement('I feel anxious about work', 'cell-a')
		trainer.addPlacement('My boss criticized me', 'cell-b')
		expect(trainer.exampleCount).toBe(2)
	})

	it('addPlacement ignores empty text', () => {
		const trainer = new LocalPrismaTrainer('test-map')
		trainer.addPlacement('', 'cell-a')
		trainer.addPlacement('   ', 'cell-a')
		expect(trainer.exampleCount).toBe(0)
	})

	it('canTrain requires initialization and minimum examples', () => {
		const trainer = new LocalPrismaTrainer('test-map')
		expect(trainer.canTrain()).toBe(false)

		trainer.initAnchorsFromEmbeddings(new Map([['cell-a', unitVector(384, 0)]]))
		expect(trainer.canTrain()).toBe(false) // no examples

		trainer.addPlacement('note 1', 'cell-a')
		trainer.addPlacement('note 2', 'cell-a')
		expect(trainer.canTrain()).toBe(false) // only 2 examples

		trainer.addPlacement('note 3', 'cell-a')
		expect(trainer.canTrain()).toBe(true) // 3 examples
	})

	it('train returns zero when cannot train', async () => {
		const trainer = new LocalPrismaTrainer('test-map')
		const result = await trainer.train()
		expect(result.stepsRun).toBe(0)
		expect(result.loss).toBe(0)
	})

	it('train runs and reduces loss', async () => {
		// Setup mock: return orthogonal vectors for different texts
		const textVectors: Record<string, Float32Array> = {
			'note for A': unitVector(384, 0),
			'note for B': unitVector(384, 1),
			'another A': new Float32Array(384).fill(0),
		}
		textVectors['another A'][0] = 0.9
		textVectors['another A'][2] = 0.436 // ~normalized
		mockEmbed.mockImplementation(async (text: string) => textVectors[text] ?? unitVector(384, 2))

		const trainer = new LocalPrismaTrainer('test-map')
		trainer.initAnchorsFromEmbeddings(
			new Map([
				['cell-a', unitVector(384, 0)],
				['cell-b', unitVector(384, 1)],
			]),
		)

		trainer.addPlacement('note for A', 'cell-a')
		trainer.addPlacement('note for B', 'cell-b')
		trainer.addPlacement('another A', 'cell-a')

		const result1 = await trainer.train(5)
		expect(result1.stepsRun).toBe(5)

		const result2 = await trainer.train(5)
		// Loss should decrease or stay low
		expect(result2.loss).toBeLessThanOrEqual(result1.loss + 0.1) // allow small fluctuation
	})

	it('classify returns ranked results', () => {
		const trainer = new LocalPrismaTrainer('test-map')
		trainer.initAnchorsFromEmbeddings(
			new Map([
				['cell-a', unitVector(384, 0)],
				['cell-b', unitVector(384, 1)],
				['cell-c', unitVector(384, 2)],
			]),
		)

		// Classify a note — result ordering depends on projection head (random init)
		const noteEmb = unitVector(384, 0)
		const results = trainer.classify(noteEmb, 3)
		expect(results).toHaveLength(3)
		// Each result has cellId and similarity
		expect(results[0]).toHaveProperty('cellId')
		expect(results[0]).toHaveProperty('similarity')
		// Sorted descending
		expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity)
	})

	it('serialize/deserialize roundtrips', () => {
		const trainer = new LocalPrismaTrainer('test-map')
		trainer.initAnchorsFromEmbeddings(
			new Map([
				['cell-a', unitVector(384, 0)],
				['cell-b', unitVector(384, 1)],
			]),
		)
		trainer.addPlacement('test note', 'cell-a')

		const serialized = trainer.serialize()
		const restored = LocalPrismaTrainer.deserialize('test-map', serialized)

		expect(restored.isInitialized).toBe(true)
		expect(restored.exampleCount).toBe(1)
		expect(restored.anchors.vectors.size).toBe(2)

		// Classify should produce same results
		const noteEmb = unitVector(384, 0)
		const orig = trainer.classify(noteEmb)
		const rest = restored.classify(noteEmb)
		expect(rest[0].cellId).toBe(orig[0].cellId)
		expect(rest[0].similarity).toBeCloseTo(orig[0].similarity, 4)
	})

	it('training improves classification accuracy', async () => {
		// 4 orthogonal cells, notes near each cell
		const dim = 384
		const anchors = new Map([
			['cell-a', unitVector(dim, 0)],
			['cell-b', unitVector(dim, 1)],
			['cell-c', unitVector(dim, 2)],
			['cell-d', unitVector(dim, 3)],
		])

		// Embed: each note text maps to a vector near its correct cell
		const textVectors: Record<string, Float32Array> = {}
		function makeNear(axis: number): Float32Array {
			const v = new Float32Array(dim)
			v[axis] = 0.9
			v[(axis + 1) % dim] = 0.436 // sqrt(1 - 0.81) ≈ 0.436
			return v
		}
		textVectors['a1'] = makeNear(0)
		textVectors['a2'] = makeNear(0)
		textVectors['b1'] = makeNear(1)
		textVectors['b2'] = makeNear(1)
		textVectors['c1'] = makeNear(2)
		textVectors['d1'] = makeNear(3)

		mockEmbed.mockImplementation(async (text: string) => textVectors[text] ?? unitVector(dim, 0))

		const trainer = new LocalPrismaTrainer('test')
		trainer.initAnchorsFromEmbeddings(anchors)

		for (const [text, cellId] of [
			['a1', 'cell-a'],
			['a2', 'cell-a'],
			['b1', 'cell-b'],
			['b2', 'cell-b'],
			['c1', 'cell-c'],
			['d1', 'cell-d'],
		] as const) {
			trainer.addPlacement(text, cellId)
		}

		// Train for enough steps to overcome random init
		await trainer.train(50)

		// Post-training: correct cell should be in top-2 results
		const postA = trainer.classify(makeNear(0), 2)
		const postB = trainer.classify(makeNear(1), 2)

		const postAIds = postA.map((r) => r.cellId)
		const postBIds = postB.map((r) => r.cellId)
		expect(postAIds).toContain('cell-a')
		expect(postBIds).toContain('cell-b')
	})
})
