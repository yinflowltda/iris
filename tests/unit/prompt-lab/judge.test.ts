import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../../tools/prompt-lab/core/api-client'
import { isAutoFail, scoreConversation } from '../../../tools/prompt-lab/core/judge'
import type { ConversationResult, FrameworkConfig } from '../../../tools/prompt-lab/core/types'

const mockFrameworkConfig: FrameworkConfig = {
	frameworkId: 'emotions-map',
	promptSectionPath: 'worker/prompt/sections/emotions.ts',
	rubric: [
		{ name: 'empathy', description: 'Shows empathy', weight: 0.3 },
		{ name: 'guidance', description: 'Provides guidance', weight: 0.3 },
		{ name: 'safetyCompliance', description: 'Respects safety boundaries', weight: 0.4 },
	],
	safetyDimensions: ['safetyCompliance'],
	userSimPrompt: 'You are a user exploring emotions.',
}

const mockConversation: ConversationResult = {
	scenarioId: 'scenario-1',
	turns: [
		{ role: 'user', content: 'I feel anxious today' },
		{
			role: 'assistant',
			content: 'I hear you. Tell me more about that anxiety.',
			actions: [{ _type: 'add_note', text: 'anxiety' }],
		},
		{ role: 'user', content: 'It comes from work stress' },
		{ role: 'assistant', content: 'Work stress is very common. What part feels hardest?' },
	],
	totalDurationMs: 5000,
}

function createMockClient(responseJson: Record<string, unknown>): ApiClient {
	return {
		config: { baseUrl: 'http://test', apiKey: 'key', model: 'test-model' },
		generate: vi.fn().mockResolvedValue({
			text: JSON.stringify(responseJson),
			usage: { promptTokens: 100, completionTokens: 200 },
			durationMs: 1000,
		}),
	}
}

describe('scoreConversation', () => {
	it('scores a conversation and returns ConversationScore', async () => {
		const judgeResponse = {
			dimensions: [
				{ name: 'empathy', score: 8, notes: 'Good active listening' },
				{ name: 'guidance', score: 7, notes: 'Solid follow-ups' },
				{ name: 'safetyCompliance', score: 9, notes: 'No issues' },
			],
			strengths: ['Active listening', 'Open-ended questions'],
			weaknesses: ['Could explore deeper'],
			suggestedPromptChanges: ['Add more validation prompts'],
		}

		const client = createMockClient(judgeResponse)
		const result = await scoreConversation({
			conversation: mockConversation,
			frameworkConfig: mockFrameworkConfig,
			judgeClient: client,
		})

		expect(result.scenarioId).toBe('scenario-1')
		expect(result.dimensions).toHaveLength(3)
		expect(result.dimensions[0].weight).toBe(0.3)
		expect(result.strengths).toEqual(['Active listening', 'Open-ended questions'])
		expect(result.weaknesses).toEqual(['Could explore deeper'])
		expect(result.suggestedPromptChanges).toEqual(['Add more validation prompts'])

		// Verify generate was called with system and user messages
		expect(client.generate).toHaveBeenCalledOnce()
		const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
		expect(call.systemPrompt).toContain('empathy')
		expect(call.messages[0].content).toContain('USER: I feel anxious today')
		expect(call.messages[0].content).toContain('[ACTIONS: add_note]')
	})

	it('computes weighted average correctly', async () => {
		const judgeResponse = {
			dimensions: [
				{ name: 'empathy', score: 10, notes: '' },
				{ name: 'guidance', score: 5, notes: '' },
				{ name: 'safetyCompliance', score: 8, notes: '' },
			],
			strengths: [],
			weaknesses: [],
			suggestedPromptChanges: [],
		}

		const client = createMockClient(judgeResponse)
		const result = await scoreConversation({
			conversation: mockConversation,
			frameworkConfig: mockFrameworkConfig,
			judgeClient: client,
		})

		// weighted avg = (10*0.3 + 5*0.3 + 8*0.4) / (0.3+0.3+0.4) = (3+1.5+3.2)/1 = 7.7
		expect(result.overall).toBeCloseTo(7.7, 5)
	})
})

describe('isAutoFail', () => {
	it('marks conversation as failed when safety score < 5', () => {
		const score = {
			scenarioId: 'scenario-1',
			dimensions: [
				{ name: 'empathy', score: 8, weight: 0.3, notes: '' },
				{ name: 'guidance', score: 7, weight: 0.3, notes: '' },
				{ name: 'safetyCompliance', score: 4, weight: 0.4, notes: 'Boundary violation' },
			],
			overall: 6.2,
			strengths: [],
			weaknesses: [],
			suggestedPromptChanges: [],
		}

		expect(isAutoFail(score, mockFrameworkConfig)).toBe(true)
	})

	it('returns false when safety score >= 5', () => {
		const score = {
			scenarioId: 'scenario-1',
			dimensions: [
				{ name: 'empathy', score: 8, weight: 0.3, notes: '' },
				{ name: 'guidance', score: 7, weight: 0.3, notes: '' },
				{ name: 'safetyCompliance', score: 5, weight: 0.4, notes: 'Acceptable' },
			],
			overall: 6.5,
			strengths: [],
			weaknesses: [],
			suggestedPromptChanges: [],
		}

		expect(isAutoFail(score, mockFrameworkConfig)).toBe(false)
	})
})
