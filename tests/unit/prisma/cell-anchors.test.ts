import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMOTIONS_TREE } from '../../../client/lib/frameworks/emotions-map'
import { LIFE_TREE } from '../../../client/lib/frameworks/life-map'
import {
	type CellAnchors,
	clearAnchorCache,
	collectAnchorCells,
	composeAnchorText,
	composeAnchorTexts,
	cosineSimilarity,
	findNearestCell,
	generateCellAnchors,
	maxSimilarity,
} from '../../../client/lib/prisma/cell-anchors'
import type { TreeNodeDef } from '../../../shared/types/MandalaTypes'

// ─── Mock embedding service ─────────────────────────────────────────────────

const mockEmbed = vi.fn<(text: string) => Promise<Float32Array>>()

vi.mock('../../../client/lib/prisma/embedding-service', () => ({
	PrismaEmbeddingService: {
		getInstance: () => ({ embed: mockEmbed }),
	},
}))

afterEach(() => {
	clearAnchorCache()
	mockEmbed.mockReset()
})

// ─── composeAnchorText ───────────────────────────────────────────────────────

describe('composeAnchorText', () => {
	it('includes all fields', () => {
		const node: TreeNodeDef = {
			id: 'test',
			label: 'Test Label',
			question: 'What is this?',
			guidance: 'Be thoughtful.',
			examples: ['Example 1', 'Example 2'],
		}
		const text = composeAnchorText(node)
		expect(text).toBe('Test Label. What is this?. Be thoughtful.. Example 1. Example 2')
	})

	it('skips empty guidance and examples', () => {
		const node: TreeNodeDef = {
			id: 'test',
			label: 'Label',
			question: 'Question?',
			guidance: '',
			examples: [],
		}
		const text = composeAnchorText(node)
		expect(text).toBe('Label. Question?')
	})

	it('skips empty question', () => {
		const node: TreeNodeDef = {
			id: 'test',
			label: 'Label',
			question: '',
			guidance: '',
			examples: [],
		}
		expect(composeAnchorText(node)).toBe('Label')
	})
})

// ─── collectAnchorCells ──────────────────────────────────────────────────────

describe('collectAnchorCells', () => {
	it('collects 7 cells from Emotions Map', () => {
		const cells = collectAnchorCells(EMOTIONS_TREE.root)
		expect(cells).toHaveLength(7)
		const ids = cells.map((c) => c.id)
		expect(ids).toContain('evidence') // root
		expect(ids).toContain('present-beliefs')
		expect(ids).toContain('present-behaviors')
		expect(ids).toContain('future-beliefs')
		expect(ids).toContain('future-events')
		expect(ids).toContain('past-thoughts-emotions')
		expect(ids).toContain('past-events')
	})

	it('collects 25 cells from Life Map', () => {
		const cells = collectAnchorCells(LIFE_TREE.root)
		expect(cells).toHaveLength(25)
		const ids = cells.map((c) => c.id)
		// Root
		expect(ids).toContain('essencia')
		// Spot-check domain cells
		expect(ids).toContain('espiritual-querer')
		expect(ids).toContain('mental-ser')
		expect(ids).toContain('fisico-ter')
		expect(ids).toContain('pessoal-saber')
	})

	it('skips transparent group nodes', () => {
		const cells = collectAnchorCells(EMOTIONS_TREE.root)
		const ids = cells.map((c) => c.id)
		expect(ids).not.toContain('present')
		expect(ids).not.toContain('future')
		expect(ids).not.toContain('past')
	})

	it('skips temporal cells (empty question)', () => {
		const cells = collectAnchorCells(LIFE_TREE.root)
		const ids = cells.map((c) => c.id)
		expect(ids).not.toContain('flow')
		expect(ids).not.toContain('monday')
		expect(ids).not.toContain('flow-week1')
		expect(ids).not.toContain('flow-january')
	})
})

// ─── cosineSimilarity ────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
	it('returns 1.0 for identical vectors', () => {
		const v = new Float32Array([0.6, 0.8])
		expect(cosineSimilarity(v, v)).toBeCloseTo(1.0)
	})

	it('returns 0.0 for orthogonal vectors', () => {
		const a = new Float32Array([1, 0])
		const b = new Float32Array([0, 1])
		expect(cosineSimilarity(a, b)).toBeCloseTo(0.0)
	})

	it('returns -1.0 for opposite vectors', () => {
		const a = new Float32Array([1, 0])
		const b = new Float32Array([-1, 0])
		expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0)
	})
})

// ─── composeAnchorTexts ──────────────────────────────────────────────────────

describe('composeAnchorTexts', () => {
	it('returns full description + each example', () => {
		const node: TreeNodeDef = {
			id: 'test',
			label: 'Events',
			question: 'What happened?',
			guidance: 'Be specific.',
			examples: ['I lost my job', 'My parents divorced'],
		}
		const texts = composeAnchorTexts(node)
		expect(texts).toHaveLength(3)
		expect(texts[0]).toBe(
			'Events. What happened?. Be specific.. I lost my job. My parents divorced',
		)
		expect(texts[1]).toBe('I lost my job')
		expect(texts[2]).toBe('My parents divorced')
	})

	it('returns only description when no examples', () => {
		const node: TreeNodeDef = {
			id: 'test',
			label: 'Label',
			question: 'Q?',
			guidance: '',
			examples: [],
		}
		const texts = composeAnchorTexts(node)
		expect(texts).toHaveLength(1)
	})
})

// ─── maxSimilarity ──────────────────────────────────────────────────────────

describe('maxSimilarity', () => {
	it('returns highest similarity across multiple anchors', () => {
		const note = new Float32Array([1, 0])
		const anchors = [
			new Float32Array([0, 1]), // similarity 0
			new Float32Array([0.6, 0.8]), // similarity 0.6
			new Float32Array([1, 0]), // similarity 1
		]
		expect(maxSimilarity(note, anchors)).toBeCloseTo(1.0)
	})

	it('works with single anchor', () => {
		const note = new Float32Array([1, 0])
		const anchors = [new Float32Array([0.6, 0.8])]
		expect(maxSimilarity(note, anchors)).toBeCloseTo(0.6)
	})
})

// ─── findNearestCell ─────────────────────────────────────────────────────────

describe('findNearestCell', () => {
	function makeAnchors(): CellAnchors {
		const anchors: CellAnchors = new Map()
		anchors.set('a', {
			cellId: 'a',
			label: 'Cell A',
			embeddings: [new Float32Array([1, 0, 0])],
		})
		anchors.set('b', {
			cellId: 'b',
			label: 'Cell B',
			embeddings: [new Float32Array([0, 1, 0])],
		})
		anchors.set('c', {
			cellId: 'c',
			label: 'Cell C',
			embeddings: [new Float32Array([0.9, 0.1, 0])],
		})
		return anchors
	}

	it('returns the highest similarity match', () => {
		const note = new Float32Array([1, 0, 0])
		const results = findNearestCell(note, makeAnchors())
		expect(results).toHaveLength(1)
		expect(results[0].cellId).toBe('a')
		expect(results[0].similarity).toBeCloseTo(1.0)
	})

	it('returns topK results sorted descending', () => {
		const note = new Float32Array([1, 0, 0])
		const results = findNearestCell(note, makeAnchors(), 3)
		expect(results).toHaveLength(3)
		expect(results[0].cellId).toBe('a')
		expect(results[1].cellId).toBe('c')
		expect(results[2].cellId).toBe('b')
		expect(results[0].similarity).toBeGreaterThan(results[1].similarity)
		expect(results[1].similarity).toBeGreaterThan(results[2].similarity)
	})

	it('uses max similarity across multi-anchor cells', () => {
		const anchors: CellAnchors = new Map()
		anchors.set('a', {
			cellId: 'a',
			label: 'Cell A',
			embeddings: [
				new Float32Array([0, 1, 0]), // weak match
				new Float32Array([1, 0, 0]), // strong match
			],
		})
		anchors.set('b', {
			cellId: 'b',
			label: 'Cell B',
			embeddings: [new Float32Array([0.5, 0.5, 0])],
		})

		const note = new Float32Array([1, 0, 0])
		const results = findNearestCell(note, anchors, 2)
		expect(results[0].cellId).toBe('a')
		expect(results[0].similarity).toBeCloseTo(1.0)
	})

	it('handles empty anchors', () => {
		const note = new Float32Array([1, 0, 0])
		const results = findNearestCell(note, new Map())
		expect(results).toHaveLength(0)
	})
})

// ─── generateCellAnchors ────────────────────────────────────────────────────

describe('generateCellAnchors', () => {
	it('generates correct count for Emotions Map', async () => {
		let callCount = 0
		mockEmbed.mockImplementation(async () => {
			const v = new Float32Array(384)
			v[callCount % 384] = 1
			callCount++
			return v
		})

		const anchors = await generateCellAnchors(EMOTIONS_TREE)
		expect(anchors.size).toBe(7)
		// 7 cells × (1 description + 3 examples each) = 28 embed calls
		expect(mockEmbed).toHaveBeenCalledTimes(28)
		// Each cell should have 4 embeddings (1 description + 3 examples)
		for (const anchor of anchors.values()) {
			expect(anchor.embeddings).toHaveLength(4)
		}
	})

	it('caches by map ID', async () => {
		mockEmbed.mockResolvedValue(new Float32Array(384))

		const first = await generateCellAnchors(EMOTIONS_TREE)
		const second = await generateCellAnchors(EMOTIONS_TREE)
		expect(first).toBe(second) // same reference
		expect(mockEmbed).toHaveBeenCalledTimes(28) // only called once
	})

	it('cache is clearable', async () => {
		mockEmbed.mockResolvedValue(new Float32Array(384))

		await generateCellAnchors(EMOTIONS_TREE)
		clearAnchorCache()
		await generateCellAnchors(EMOTIONS_TREE)
		expect(mockEmbed).toHaveBeenCalledTimes(56) // called twice
	})
})
