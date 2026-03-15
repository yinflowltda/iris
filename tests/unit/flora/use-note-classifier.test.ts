import type { TLShapeId } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import {
	extractNoteDescriptors,
	getTreeDefFromMandala,
} from '../../../client/lib/flora/use-note-classifier'
import type { MandalaState } from '../../../shared/types/MandalaTypes'

// ─── Mock embedding service (required by transitive import) ─────────────────

vi.mock('../../../client/lib/flora/embedding-service', () => ({
	FloraEmbeddingService: {
		getInstance: () => ({ embed: vi.fn() }),
	},
}))

// ─── Mock framework registry ───────────────────────────────────────────────

const mockTreeDef = {
	id: 'test-tree',
	name: 'Test',
	description: 'Test tree',
	root: { id: 'root', label: 'Root', question: '', guidance: '', examples: [] },
}

vi.mock('../../../client/lib/frameworks/framework-registry', () => ({
	getFramework: (id: string) => {
		if (id === 'has-tree') return { treeDefinition: mockTreeDef }
		if (id === 'no-tree') return { treeDefinition: undefined }
		throw new Error(`Unknown framework: ${id}`)
	},
}))

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMockEditor(shapes: Record<string, { text: string }>) {
	return {
		getShape: (id: string) => {
			const rawId = id.replace('shape:', '')
			if (shapes[rawId]) return { id, type: 'note', props: {} }
			return undefined
		},
		getShapeUtil: () => ({
			getText: (shape: { id: string }) => {
				const rawId = shape.id.replace('shape:', '')
				return shapes[rawId]?.text ?? ''
			},
		}),
	} as any
}

function makeMandalaEditor(frameworkId: string, state: MandalaState) {
	return {
		getShape: (id: string) => {
			if (id.includes('mandala')) {
				return { type: 'mandala', props: { frameworkId, state } }
			}
			return undefined
		},
	} as any
}

// ─── extractNoteDescriptors ─────────────────────────────────────────────────

describe('extractNoteDescriptors', () => {
	it('extracts descriptors from all cells', () => {
		const state: MandalaState = {
			'cell-a': { status: 'active', contentShapeIds: ['s1' as any, 's2' as any] },
			'cell-b': { status: 'active', contentShapeIds: ['s3' as any] },
		}
		const editor = makeMockEditor({
			s1: { text: 'Note one' },
			s2: { text: 'Note two' },
			s3: { text: 'Note three' },
		})

		const result = extractNoteDescriptors(editor, state)
		expect(result).toHaveLength(3)
		expect(result.map((d) => d.text)).toEqual(['Note one', 'Note two', 'Note three'])
		expect(result.map((d) => d.shapeId)).toEqual(['s1', 's2', 's3'])
	})

	it('skips shapes that no longer exist in editor', () => {
		const state: MandalaState = {
			'cell-a': { status: 'active', contentShapeIds: ['exists' as any, 'deleted' as any] },
		}
		const editor = makeMockEditor({ exists: { text: 'Still here' } })

		const result = extractNoteDescriptors(editor, state)
		expect(result).toHaveLength(1)
		expect(result[0].shapeId).toBe('exists')
	})

	it('handles empty state', () => {
		const editor = makeMockEditor({})
		expect(extractNoteDescriptors(editor, {})).toEqual([])
	})

	it('returns empty text for shapes with no text', () => {
		const state: MandalaState = {
			'cell-a': { status: 'active', contentShapeIds: ['s1' as any] },
		}
		const editor = {
			getShape: (id: string) => ({ id, type: 'note', props: {} }),
			getShapeUtil: () => ({ getText: () => undefined }),
		} as any

		const result = extractNoteDescriptors(editor, state)
		expect(result).toHaveLength(1)
		expect(result[0].text).toBe('')
	})
})

// ─── getTreeDefFromMandala ──────────────────────────────────────────────────

describe('getTreeDefFromMandala', () => {
	it('returns treeDefinition for framework with one', () => {
		const editor = makeMandalaEditor('has-tree', {})
		const result = getTreeDefFromMandala(editor, 'shape:mandala-1' as TLShapeId)
		expect(result).toBe(mockTreeDef)
	})

	it('returns null for framework without treeDefinition', () => {
		const editor = makeMandalaEditor('no-tree', {})
		const result = getTreeDefFromMandala(editor, 'shape:mandala-1' as TLShapeId)
		expect(result).toBeNull()
	})

	it('returns null for non-existent shape', () => {
		const editor = { getShape: () => undefined } as any
		const result = getTreeDefFromMandala(editor, 'shape:missing' as TLShapeId)
		expect(result).toBeNull()
	})
})
