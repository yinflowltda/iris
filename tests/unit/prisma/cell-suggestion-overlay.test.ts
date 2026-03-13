import { describe, expect, it } from 'vitest'
import {
	buildSuggestions,
	type CellSuggestion,
	extractDescriptorsFromMandala,
} from '../../../client/components/CellSuggestionOverlay'
import type { NoteClassificationEntry } from '../../../client/lib/prisma/note-classifier'

// ─── extractDescriptorsFromMandala ──────────────────────────────────────────

describe('extractDescriptorsFromMandala', () => {
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

	it('extracts descriptors from all cells', () => {
		const state = {
			'cell-a': { contentShapeIds: ['s1', 's2'] },
			'cell-b': { contentShapeIds: ['s3'] },
		}
		const editor = makeMockEditor({
			s1: { text: 'Note one' },
			s2: { text: 'Note two' },
			s3: { text: 'Note three' },
		})

		const result = extractDescriptorsFromMandala(editor, state)
		expect(result).toHaveLength(3)
		expect(result.map((d) => d.text)).toEqual(['Note one', 'Note two', 'Note three'])
	})

	it('skips missing shapes', () => {
		const state = {
			'cell-a': { contentShapeIds: ['exists', 'gone'] },
		}
		const editor = makeMockEditor({ exists: { text: 'here' } })
		const result = extractDescriptorsFromMandala(editor, state)
		expect(result).toHaveLength(1)
	})

	it('handles empty state', () => {
		const editor = makeMockEditor({})
		expect(extractDescriptorsFromMandala(editor, {})).toEqual([])
	})
})

// ─── buildSuggestions ───────────────────────────────────────────────────────

describe('buildSuggestions', () => {
	const treeDef = {
		root: {
			id: 'root',
			label: 'Root',
			children: [
				{ id: 'cell-a', label: 'Cell A' },
				{ id: 'cell-b', label: 'Cell B' },
				{ id: 'cell-c', label: 'Cell C' },
			],
		},
	}

	it('converts misplaced entries to suggestions with labels', () => {
		const misplaced: NoteClassificationEntry[] = [
			{
				shapeId: 's1',
				text: 'test note',
				currentCellId: 'cell-a',
				matches: [{ cellId: 'cell-b', label: 'Cell B', similarity: 0.85 }],
			},
		]

		const result = buildSuggestions(misplaced, treeDef)
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual<CellSuggestion>({
			shapeId: 's1',
			currentCellId: 'cell-a',
			currentLabel: 'Cell A',
			suggestedCellId: 'cell-b',
			suggestedLabel: 'Cell B',
			similarity: 0.85,
		})
	})

	it('filters out entries with null currentCellId', () => {
		const misplaced: NoteClassificationEntry[] = [
			{
				shapeId: 's1',
				text: 'floating',
				currentCellId: null,
				matches: [{ cellId: 'cell-a', label: 'Cell A', similarity: 0.9 }],
			},
		]
		expect(buildSuggestions(misplaced, treeDef)).toHaveLength(0)
	})

	it('filters out entries with no matches', () => {
		const misplaced: NoteClassificationEntry[] = [
			{
				shapeId: 's1',
				text: 'no match',
				currentCellId: 'cell-a',
				matches: [],
			},
		]
		expect(buildSuggestions(misplaced, treeDef)).toHaveLength(0)
	})

	it('filters out low-similarity matches', () => {
		const misplaced: NoteClassificationEntry[] = [
			{
				shapeId: 's1',
				text: 'low confidence',
				currentCellId: 'cell-a',
				matches: [{ cellId: 'cell-b', label: 'Cell B', similarity: 0.15 }],
			},
		]
		expect(buildSuggestions(misplaced, treeDef)).toHaveLength(0)
	})

	it('handles empty input', () => {
		expect(buildSuggestions([], treeDef)).toEqual([])
	})

	it('resolves nested tree labels', () => {
		const nestedTree = {
			root: {
				id: 'root',
				label: 'Root',
				children: [
					{
						id: 'group',
						label: 'Group',
						children: [{ id: 'deep-cell', label: 'Deep Cell' }],
					},
				],
			},
		}
		const misplaced: NoteClassificationEntry[] = [
			{
				shapeId: 's1',
				text: 'test',
				currentCellId: 'deep-cell',
				matches: [{ cellId: 'group', label: 'Group', similarity: 0.7 }],
			},
		]
		const result = buildSuggestions(misplaced, nestedTree)
		expect(result[0].currentLabel).toBe('Deep Cell')
	})
})
