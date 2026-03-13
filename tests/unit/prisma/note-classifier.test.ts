import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	classifyNote,
	classifyNoteBatch,
	findCurrentCell,
	type EmbedFn,
	type NoteDescriptor,
} from '../../../client/lib/prisma/note-classifier'
import { clearAnchorCache } from '../../../client/lib/prisma/cell-anchors'
import type { TreeMapDefinition, MandalaState } from '../../../shared/types/MandalaTypes'

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

// ─── Synthetic tree with 4 orthogonal cells ─────────────────────────────────

/** 4 cells with orthogonal 4-dim anchor vectors for deterministic similarity. */
function makeTestTree(): TreeMapDefinition {
	return {
		id: 'test-tree',
		name: 'Test',
		description: 'Test tree',
		root: {
			id: 'root',
			label: 'Root',
			question: '',
			guidance: '',
			examples: [],
			children: [
				{ id: 'cell-a', label: 'Cell A', question: 'About A?', guidance: '', examples: [] },
				{ id: 'cell-b', label: 'Cell B', question: 'About B?', guidance: '', examples: [] },
				{ id: 'cell-c', label: 'Cell C', question: 'About C?', guidance: '', examples: [] },
				{ id: 'cell-d', label: 'Cell D', question: 'About D?', guidance: '', examples: [] },
			],
		},
	}
}

/** Orthogonal unit vectors for each cell anchor. */
const ANCHOR_VECTORS: Record<string, Float32Array> = {
	'Cell A. About A?': new Float32Array([1, 0, 0, 0]),
	'Cell B. About B?': new Float32Array([0, 1, 0, 0]),
	'Cell C. About C?': new Float32Array([0, 0, 1, 0]),
	'Cell D. About D?': new Float32Array([0, 0, 0, 1]),
}

/** Set up mockEmbed to return orthogonal vectors for anchors, or a custom vector for note text. */
function setupMockEmbed(noteVector: Float32Array) {
	mockEmbed.mockImplementation(async (text: string) => {
		return ANCHOR_VECTORS[text] ?? noteVector
	})
}

/** Wrap mockEmbed as EmbedFn (just returns the mock's result). */
const embedFn: EmbedFn = (text) => mockEmbed(text)

// ─── classifyNote ───────────────────────────────────────────────────────────

describe('classifyNote', () => {
	it('returns topK matches sorted by similarity', async () => {
		// Note vector close to cell-a
		setupMockEmbed(new Float32Array([0.9, 0.1, 0, 0]))
		const result = await classifyNote('test note', makeTestTree(), embedFn, 3)

		expect(result.text).toBe('test note')
		expect(result.matches).toHaveLength(3)
		expect(result.matches[0].cellId).toBe('cell-a')
		expect(result.matches[0].similarity).toBeGreaterThan(result.matches[1].similarity)
	})

	it('defaults to topK=3', async () => {
		setupMockEmbed(new Float32Array([1, 0, 0, 0]))
		const result = await classifyNote('test', makeTestTree(), embedFn)
		expect(result.matches).toHaveLength(3)
	})

	it('supports topK=1', async () => {
		setupMockEmbed(new Float32Array([0, 0, 0, 1]))
		const result = await classifyNote('test', makeTestTree(), embedFn, 1)
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0].cellId).toBe('cell-d')
	})

	it('reuses cached anchors on second call', async () => {
		setupMockEmbed(new Float32Array([1, 0, 0, 0]))
		const tree = makeTestTree()

		await classifyNote('first', tree, embedFn)
		const callsAfterFirst = mockEmbed.mock.calls.length

		await classifyNote('second', tree, embedFn)
		// Only 1 new call for the note text, no anchor re-generation
		expect(mockEmbed.mock.calls.length).toBe(callsAfterFirst + 1)
	})
})

// ─── classifyNoteBatch ──────────────────────────────────────────────────────

describe('classifyNoteBatch', () => {
	const state: MandalaState = {
		'cell-a': { status: 'active', contentShapeIds: ['shape-1' as any] },
		'cell-b': { status: 'active', contentShapeIds: ['shape-2' as any] },
	}

	it('classifies all notes', async () => {
		setupMockEmbed(new Float32Array([1, 0, 0, 0]))
		const notes: NoteDescriptor[] = [
			{ shapeId: 'shape-1', text: 'note about A' },
			{ shapeId: 'shape-2', text: 'note about B' },
		]

		const result = await classifyNoteBatch(notes, state, makeTestTree(), embedFn)
		expect(result.entries).toHaveLength(2)
		expect(result.skippedEmpty).toHaveLength(0)
	})

	it('skips empty text', async () => {
		setupMockEmbed(new Float32Array([1, 0, 0, 0]))
		const notes: NoteDescriptor[] = [
			{ shapeId: 'shape-1', text: 'real note' },
			{ shapeId: 'shape-empty', text: '' },
			{ shapeId: 'shape-whitespace', text: '   ' },
		]

		const result = await classifyNoteBatch(notes, state, makeTestTree(), embedFn)
		expect(result.entries).toHaveLength(1)
		expect(result.skippedEmpty).toEqual(['shape-empty', 'shape-whitespace'])
	})

	it('identifies misplaced notes', async () => {
		// Note in cell-a but vector points to cell-b
		setupMockEmbed(new Float32Array([0, 1, 0, 0]))
		const notes: NoteDescriptor[] = [{ shapeId: 'shape-1', text: 'misplaced note' }]

		const result = await classifyNoteBatch(notes, state, makeTestTree(), embedFn)
		expect(result.misplaced).toHaveLength(1)
		expect(result.misplaced[0].shapeId).toBe('shape-1')
		expect(result.misplaced[0].currentCellId).toBe('cell-a')
		expect(result.misplaced[0].matches[0].cellId).toBe('cell-b')
	})

	it('does not flag unplaced notes as misplaced', async () => {
		setupMockEmbed(new Float32Array([1, 0, 0, 0]))
		const notes: NoteDescriptor[] = [{ shapeId: 'shape-unplaced', text: 'floating note' }]

		const result = await classifyNoteBatch(notes, {}, makeTestTree(), embedFn)
		expect(result.entries).toHaveLength(1)
		expect(result.entries[0].currentCellId).toBeNull()
		expect(result.misplaced).toHaveLength(0)
	})

	it('handles empty input', async () => {
		const result = await classifyNoteBatch([], state, makeTestTree(), embedFn)
		expect(result.entries).toHaveLength(0)
		expect(result.misplaced).toHaveLength(0)
		expect(result.skippedEmpty).toHaveLength(0)
	})
})

// ─── findCurrentCell ────────────────────────────────────────────────────────

describe('findCurrentCell', () => {
	const state: MandalaState = {
		'cell-a': { status: 'active', contentShapeIds: ['shape-1' as any, 'shape-2' as any] },
		'cell-b': { status: 'active', contentShapeIds: ['shape-3' as any] },
	}

	it('finds known shape', () => {
		expect(findCurrentCell('shape-1', state)).toBe('cell-a')
		expect(findCurrentCell('shape-3', state)).toBe('cell-b')
	})

	it('returns null for unknown shape', () => {
		expect(findCurrentCell('shape-999', state)).toBeNull()
	})

	it('handles empty state', () => {
		expect(findCurrentCell('shape-1', {})).toBeNull()
	})
})
