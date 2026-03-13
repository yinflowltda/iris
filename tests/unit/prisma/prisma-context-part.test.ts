import { describe, expect, it } from 'vitest'
import {
	type PrismaContextPart,
	PrismaContextPartDefinition,
} from '../../../shared/schema/PromptPartDefinitions'

// ─── buildContent ───────────────────────────────────────────────────────────

describe('PrismaContextPartDefinition.buildContent', () => {
	function makePart(overrides: Partial<PrismaContextPart> = {}): PrismaContextPart {
		return {
			type: 'prismaContext',
			totalNotes: 3,
			totalCells: 7,
			filledCellCount: 3,
			noteClassifications: [
				{
					textSnippet: 'Boss criticized me yesterday',
					currentCellId: 'past-events',
					currentCellLabel: 'Events',
					bestMatchCellId: 'past-events',
					bestMatchCellLabel: 'Events',
					similarity: 0.91,
					isMisplaced: false,
				},
				{
					textSnippet: 'I feel worthless',
					currentCellId: 'present-behaviors',
					currentCellLabel: 'Behaviors',
					bestMatchCellId: 'present-beliefs',
					bestMatchCellLabel: 'Beliefs',
					similarity: 0.87,
					isMisplaced: true,
				},
				{
					textSnippet: 'I want to speak up more',
					currentCellId: 'future-events',
					currentCellLabel: 'Events',
					bestMatchCellId: 'future-events',
					bestMatchCellLabel: 'Events',
					similarity: 0.82,
					isMisplaced: false,
				},
			],
			emptyCells: [
				{ cellId: 'evidence', cellLabel: 'Evidence' },
				{ cellId: 'past-thoughts-emotions', cellLabel: 'Thoughts & Emotions' },
				{ cellId: 'future-beliefs', cellLabel: 'Beliefs' },
				{ cellId: 'present-beliefs', cellLabel: 'Beliefs' },
			],
			...overrides,
		}
	}

	it('includes coverage summary', () => {
		const [content] = PrismaContextPartDefinition.buildContent!(makePart())
		expect(content).toContain('Cell coverage: 3/7 filled')
		expect(content).toContain('3 note(s) placed')
	})

	it('lists well-placed notes with checkmark', () => {
		const [content] = PrismaContextPartDefinition.buildContent!(makePart())
		expect(content).toContain('"Boss criticized me yesterday" → Events (match: 0.91 ✓)')
		expect(content).toContain('"I want to speak up more" → Events (match: 0.82 ✓)')
	})

	it('lists misplaced notes with best match', () => {
		const [content] = PrismaContextPartDefinition.buildContent!(makePart())
		expect(content).toContain('Possibly misplaced notes:')
		expect(content).toContain('"I feel worthless" → Behaviors (best match: Beliefs, 0.87)')
	})

	it('lists empty cells', () => {
		const [content] = PrismaContextPartDefinition.buildContent!(makePart())
		expect(content).toContain('Empty cells: Evidence, Thoughts & Emotions, Beliefs, Beliefs')
	})

	it('omits well-placed section when none are well-placed', () => {
		const part = makePart({
			noteClassifications: [
				{
					textSnippet: 'test',
					currentCellId: 'a',
					currentCellLabel: 'A',
					bestMatchCellId: 'b',
					bestMatchCellLabel: 'B',
					similarity: 0.9,
					isMisplaced: true,
				},
			],
		})
		const [content] = PrismaContextPartDefinition.buildContent!(part)
		expect(content).not.toContain('Well-placed')
		expect(content).toContain('Possibly misplaced')
	})

	it('omits misplaced section when all are well-placed', () => {
		const part = makePart({
			noteClassifications: [
				{
					textSnippet: 'test',
					currentCellId: 'a',
					currentCellLabel: 'A',
					bestMatchCellId: 'a',
					bestMatchCellLabel: 'A',
					similarity: 0.95,
					isMisplaced: false,
				},
			],
		})
		const [content] = PrismaContextPartDefinition.buildContent!(part)
		expect(content).toContain('Well-placed')
		expect(content).not.toContain('Possibly misplaced')
	})

	it('omits empty cells section when all cells are filled', () => {
		const part = makePart({ emptyCells: [] })
		const [content] = PrismaContextPartDefinition.buildContent!(part)
		expect(content).not.toContain('Empty cells')
	})

	it('returns single-element array', () => {
		const result = PrismaContextPartDefinition.buildContent!(makePart())
		expect(result).toHaveLength(1)
		expect(typeof result[0]).toBe('string')
	})

	it('has correct priority', () => {
		expect(PrismaContextPartDefinition.priority).toBe(-45)
	})
})
