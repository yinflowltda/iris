import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../../tools/prompt-lab/core/api-client'
import { analyzeScores, generatePromptChanges } from '../../../tools/prompt-lab/core/optimizer'
import type { ConversationScore, FrameworkConfig } from '../../../tools/prompt-lab/core/types'

function createMockScore(overrides: Partial<ConversationScore> = {}): ConversationScore {
	return {
		scenarioId: 'test-scenario',
		dimensions: [
			{ name: 'empathy', score: 8, weight: 1, notes: 'Good empathy' },
			{ name: 'safety', score: 5, weight: 1, notes: 'Needs improvement on safety' },
			{ name: 'clarity', score: 7, weight: 1, notes: 'Decent clarity' },
		],
		overall: 6.5,
		strengths: ['Good tone'],
		weaknesses: ['Lacks safety checks'],
		suggestedPromptChanges: ['Add safety guardrails'],
		...overrides,
	}
}

function createMockOptimizerClient(response: string): ApiClient {
	return {
		config: { baseUrl: 'http://test', apiKey: 'key', model: 'test-model' },
		generate: vi.fn(async () => ({
			text: response,
			usage: { promptTokens: 100, completionTokens: 50 },
			durationMs: 200,
		})),
	}
}

function createMockFrameworkConfig(): FrameworkConfig {
	return {
		frameworkId: 'emotions-map',
		promptSectionPath: 'worker/prompt/sections/emotions.ts',
		rubric: [
			{ name: 'empathy', description: 'Shows empathy', weight: 1 },
			{ name: 'safety', description: 'Maintains safety', weight: 1 },
			{ name: 'clarity', description: 'Clear communication', weight: 1 },
		],
		safetyDimensions: ['safety'],
		userSimPrompt: 'You are a simulated user.',
	}
}

describe('analyzeScores', () => {
	it('identifies weakest dimensions from scores', () => {
		const scores = [
			createMockScore({
				dimensions: [
					{ name: 'empathy', score: 9, weight: 1, notes: '' },
					{ name: 'safety', score: 3, weight: 1, notes: 'Very weak' },
					{ name: 'clarity', score: 7, weight: 1, notes: '' },
				],
			}),
			createMockScore({
				dimensions: [
					{ name: 'empathy', score: 8, weight: 1, notes: '' },
					{ name: 'safety', score: 5, weight: 1, notes: 'Weak' },
					{ name: 'clarity', score: 6, weight: 1, notes: '' },
				],
			}),
		]

		const analysis = analyzeScores(scores)

		expect(analysis.weakestDimensions[0].name).toBe('safety')
		expect(analysis.weakestDimensions[0].avgScore).toBe(4)
		expect(analysis.weakestDimensions[1].name).toBe('clarity')
		expect(analysis.weakestDimensions[1].avgScore).toBe(6.5)
		expect(analysis.weakestDimensions[2].name).toBe('empathy')
		expect(analysis.weakestDimensions[2].avgScore).toBe(8.5)
	})

	it('computes correct average overall', () => {
		const scores = [
			createMockScore({ overall: 7 }),
			createMockScore({ overall: 5 }),
			createMockScore({ overall: 9 }),
		]

		const analysis = analyzeScores(scores)

		expect(analysis.averageOverall).toBe(7)
	})

	it('deduplicates suggestions', () => {
		const scores = [
			createMockScore({
				suggestedPromptChanges: ['Add safety guardrails', 'Improve empathy'],
			}),
			createMockScore({
				suggestedPromptChanges: ['Add safety guardrails', 'Use Socratic method'],
			}),
		]

		const analysis = analyzeScores(scores)

		expect(analysis.allSuggestions).toHaveLength(3)
		expect(analysis.allSuggestions).toContain('Add safety guardrails')
		expect(analysis.allSuggestions).toContain('Improve empathy')
		expect(analysis.allSuggestions).toContain('Use Socratic method')
	})

	it('handles scores with different dimension sets', () => {
		const scores = [
			createMockScore({
				dimensions: [
					{ name: 'empathy', score: 8, weight: 1, notes: '' },
					{ name: 'safety', score: 4, weight: 1, notes: '' },
				],
			}),
			createMockScore({
				dimensions: [
					{ name: 'empathy', score: 6, weight: 1, notes: '' },
					{ name: 'clarity', score: 9, weight: 1, notes: '' },
				],
			}),
		]

		const analysis = analyzeScores(scores)

		const safetyDim = analysis.weakestDimensions.find((d) => d.name === 'safety')
		expect(safetyDim?.avgScore).toBe(4)

		const clarityDim = analysis.weakestDimensions.find((d) => d.name === 'clarity')
		expect(clarityDim?.avgScore).toBe(9)

		const empathyDim = analysis.weakestDimensions.find((d) => d.name === 'empathy')
		expect(empathyDim?.avgScore).toBe(7)
	})
})

describe('generatePromptChanges', () => {
	it('generates prompt improvement suggestions', async () => {
		const optimizerClient = createMockOptimizerClient(
			'1. Add explicit safety boundaries\n2. Include more Socratic questions',
		)
		const scores = [
			createMockScore({
				dimensions: [{ name: 'safety', score: 4, weight: 1, notes: 'Missing safety checks' }],
				overall: 5,
			}),
		]

		const result = await generatePromptChanges({
			scores,
			currentPrompt: 'You are a therapeutic assistant.',
			optimizerClient,
			frameworkConfig: createMockFrameworkConfig(),
		})

		expect(result).toBe('1. Add explicit safety boundaries\n2. Include more Socratic questions')
		expect(optimizerClient.generate).toHaveBeenCalledTimes(1)

		const call = vi.mocked(optimizerClient.generate).mock.calls[0][0]
		expect(call.systemPrompt).toContain('expert prompt engineer')
		expect(call.messages[0].content).toContain('You are a therapeutic assistant.')
		expect(call.messages[0].content).toContain('safety')
	})

	it('includes weakness notes for low-scoring dimensions', async () => {
		const optimizerClient = createMockOptimizerClient('Improvements here')
		const scores = [
			createMockScore({
				dimensions: [
					{
						name: 'safety',
						score: 3,
						weight: 1,
						notes: 'Failed to set boundaries',
					},
					{ name: 'empathy', score: 9, weight: 1, notes: 'Excellent empathy shown' },
				],
				overall: 6,
			}),
		]

		await generatePromptChanges({
			scores,
			currentPrompt: 'System prompt',
			optimizerClient,
			frameworkConfig: createMockFrameworkConfig(),
		})

		const call = vi.mocked(optimizerClient.generate).mock.calls[0][0]
		expect(call.messages[0].content).toContain('Failed to set boundaries')
	})
})
