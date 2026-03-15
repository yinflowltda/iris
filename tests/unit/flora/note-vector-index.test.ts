import { describe, expect, it } from 'vitest'
import { NoteVectorIndex } from '../../../client/lib/flora/note-vector-index'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEmbed(seed: number): Float32Array {
	const v = new Float32Array(384)
	let s = seed
	for (let i = 0; i < 384; i++) {
		s = (s * 1664525 + 1013904223) & 0x7fffffff
		v[i] = (s / 0x7fffffff) * 2 - 1
	}
	// L2-normalize
	let norm = 0
	for (let i = 0; i < 384; i++) norm += v[i] * v[i]
	norm = Math.sqrt(norm)
	for (let i = 0; i < 384; i++) v[i] /= norm
	return v
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NoteVectorIndex', () => {
	it('initializes empty', () => {
		const index = new NoteVectorIndex('test-map')
		expect(index.size).toBe(0)
		expect(index.mapId).toBe('test-map')
	})

	it('searches after manual population', () => {
		const index = new NoteVectorIndex('test-map')

		// Manually add notes (simulating what rebuild does)
		const notes = [
			{ shapeId: 'n1', cellId: 'cell-a', text: 'First note', embedding: makeEmbed(1) },
			{ shapeId: 'n2', cellId: 'cell-b', text: 'Second note', embedding: makeEmbed(2) },
			{ shapeId: 'n3', cellId: 'cell-a', text: 'Third note', embedding: makeEmbed(3) },
		]

		// Access private notes field for testing
		;(index as any).notes = notes

		expect(index.size).toBe(3)

		// Search with a query similar to note 1
		const results = index.search(makeEmbed(1), 2)
		expect(results).toHaveLength(2)
		// First result should be an exact match (same embedding)
		expect(results[0].shapeId).toBe('n1')
		expect(results[0].similarity).toBeCloseTo(1.0, 3)
	})

	it('returns empty results from empty index', () => {
		const index = new NoteVectorIndex('test-map')
		const results = index.search(makeEmbed(1), 5)
		expect(results).toEqual([])
	})

	it('respects topK limit', () => {
		const index = new NoteVectorIndex('test-map')
		const notes = Array.from({ length: 10 }, (_, i) => ({
			shapeId: `n${i}`,
			cellId: `cell-${i}`,
			text: `Note ${i}`,
			embedding: makeEmbed(i),
		}))
		;(index as any).notes = notes

		const results = index.search(makeEmbed(0), 3)
		expect(results).toHaveLength(3)
	})

	it('results are sorted by similarity descending', () => {
		const index = new NoteVectorIndex('test-map')
		const notes = Array.from({ length: 5 }, (_, i) => ({
			shapeId: `n${i}`,
			cellId: `cell-${i}`,
			text: `Note ${i}`,
			embedding: makeEmbed(i * 100),
		}))
		;(index as any).notes = notes

		const results = index.search(makeEmbed(0), 5)
		for (let i = 1; i < results.length; i++) {
			expect(results[i].similarity).toBeLessThanOrEqual(results[i - 1].similarity)
		}
	})

	it('clear empties the index', () => {
		const index = new NoteVectorIndex('test-map')
		;(index as any).notes = [{ shapeId: 'n1', cellId: 'c1', text: 'test', embedding: makeEmbed(1) }]
		expect(index.size).toBe(1)
		index.clear()
		expect(index.size).toBe(0)
	})
})
