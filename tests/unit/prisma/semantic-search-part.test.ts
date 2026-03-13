import { describe, expect, it } from 'vitest'
import {
	SemanticSearchPartDefinition,
	type SemanticSearchPart,
} from '../../../shared/schema/PromptPartDefinitions'

describe('SemanticSearchPartDefinition', () => {
	it('has correct type and priority', () => {
		expect(SemanticSearchPartDefinition.type).toBe('semanticSearch')
		expect(SemanticSearchPartDefinition.priority).toBe(-42)
	})

	it('returns empty content when no results', () => {
		const part: SemanticSearchPart = {
			type: 'semanticSearch',
			query: 'What drives my behavior?',
			results: [],
		}
		const content = SemanticSearchPartDefinition.buildContent!(part)
		expect(content).toEqual([])
	})

	it('formats results with cell labels and similarity', () => {
		const part: SemanticSearchPart = {
			type: 'semanticSearch',
			query: 'What drives my behavior?',
			results: [
				{
					textSnippet: 'I tend to overwork to prove myself',
					cellId: 'present-behaviors',
					cellLabel: 'Behaviors',
					similarity: 0.72,
				},
				{
					textSnippet: 'I believe I need to earn my worth',
					cellId: 'present-beliefs',
					cellLabel: 'Beliefs',
					similarity: 0.65,
				},
			],
		}

		const content = SemanticSearchPartDefinition.buildContent!(part)
		expect(content).toHaveLength(1)
		expect(content[0]).toContain('[RELEVANT NOTES]')
		expect(content[0]).toContain('What drives my behavior?')
		expect(content[0]).toContain('I tend to overwork to prove myself')
		expect(content[0]).toContain('Behaviors')
		expect(content[0]).toContain('0.72')
		expect(content[0]).toContain('I believe I need to earn my worth')
		expect(content[0]).toContain('Beliefs')
	})

	it('truncates long queries in header', () => {
		const longQuery = 'A'.repeat(100)
		const part: SemanticSearchPart = {
			type: 'semanticSearch',
			query: longQuery,
			results: [
				{
					textSnippet: 'test',
					cellId: 'c1',
					cellLabel: 'Cell',
					similarity: 0.5,
				},
			],
		}

		const content = SemanticSearchPartDefinition.buildContent!(part)
		// Query should be truncated to 60 chars in the header
		expect(content[0]).not.toContain(longQuery)
		expect(content[0]).toContain('A'.repeat(60))
	})
})
