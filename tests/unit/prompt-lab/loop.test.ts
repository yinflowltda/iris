import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../../tools/prompt-lab/core/api-client'
import type { FrameworkConfig, Scenario } from '../../../tools/prompt-lab/core/types'

vi.mock('../../../tools/prompt-lab/core/simulator', () => ({
	runConversation: vi.fn().mockResolvedValue({
		scenarioId: 'test-1',
		turns: [
			{ role: 'user', content: 'Hello' },
			{ role: 'assistant', content: 'Hi' },
		],
		totalDurationMs: 500,
	}),
}))

vi.mock('../../../tools/prompt-lab/core/judge', () => ({
	scoreConversation: vi.fn().mockResolvedValue({
		scenarioId: 'test-1',
		dimensions: [{ name: 'safetyCompliance', score: 9, weight: 3, notes: '' }],
		overall: 9,
		strengths: ['Safe'],
		weaknesses: [],
		suggestedPromptChanges: [],
	}),
	isAutoFail: vi.fn().mockReturnValue(false),
}))

vi.mock('../../../tools/prompt-lab/core/optimizer', () => ({
	analyzeScores: vi.fn().mockReturnValue({
		averageOverall: 9,
		weakestDimensions: [],
		allSuggestions: [],
	}),
	generatePromptChanges: vi.fn().mockResolvedValue('No changes needed'),
}))

function makeStubClient(): ApiClient {
	return {
		config: { baseUrl: 'http://test', apiKey: 'key', model: 'test-model' },
		generate: vi.fn().mockResolvedValue({
			text: 'stub',
			usage: { promptTokens: 10, completionTokens: 10 },
			durationMs: 100,
		}),
	}
}

const testScenario: Scenario = {
	id: 'test-1',
	name: 'Test Scenario',
	framework: 'emotions-map',
	category: 'therapeutic-journey',
	difficulty: 'easy',
	persona: {
		description: 'A test persona',
		language: 'en',
		emotionalState: 5,
		traits: ['calm'],
	},
	openingMessages: ['Hello'],
	userGoals: ['Test goal'],
	expectedBehaviors: ['Be helpful'],
	antiPatterns: ['Be rude'],
	maxTurns: 2,
}

const testConfig: FrameworkConfig = {
	frameworkId: 'emotions-map',
	promptSectionPath: 'test/path',
	rubric: [{ name: 'safetyCompliance', description: 'Safety', weight: 3 }],
	safetyDimensions: ['safetyCompliance'],
	userSimPrompt: 'You are a test user',
}

describe('runLoop', () => {
	it('runs iterations and produces a LabReport', async () => {
		const { runLoop } = await import('../../../tools/prompt-lab/core/loop')

		const report = await runLoop({
			scenarios: [testScenario],
			frameworkConfig: testConfig,
			buildSystemPromptFn: () => 'You are a helpful assistant',
			agentClient: makeStubClient(),
			userClient: makeStubClient(),
			judgeClient: makeStubClient(),
			optimizerClient: makeStubClient(),
			maxIterations: 2,
		})

		expect(report.iterations).toHaveLength(2)
		expect(report.framework).toBe('emotions-map')
		expect(report.baselineAverage).toBe(9)
		expect(report.finalAverage).toBe(9)
		expect(report.improvement).toBe(0)
		expect(report.startedAt).toBeDefined()
		expect(report.completedAt).toBeDefined()
	})

	it('calls onProgress callback after each iteration', async () => {
		const { runLoop } = await import('../../../tools/prompt-lab/core/loop')
		const onProgress = vi.fn()

		await runLoop({
			scenarios: [testScenario],
			frameworkConfig: testConfig,
			buildSystemPromptFn: () => 'You are a helpful assistant',
			agentClient: makeStubClient(),
			userClient: makeStubClient(),
			judgeClient: makeStubClient(),
			optimizerClient: makeStubClient(),
			maxIterations: 2,
			onProgress,
		})

		expect(onProgress).toHaveBeenCalledTimes(2)
		expect(onProgress).toHaveBeenCalledWith(1, 2, expect.objectContaining({ iteration: 1 }))
		expect(onProgress).toHaveBeenCalledWith(2, 2, expect.objectContaining({ iteration: 2 }))
	})

	it('sets baseline from first iteration', async () => {
		const { runLoop } = await import('../../../tools/prompt-lab/core/loop')

		const report = await runLoop({
			scenarios: [testScenario],
			frameworkConfig: testConfig,
			buildSystemPromptFn: () => 'You are a helpful assistant',
			agentClient: makeStubClient(),
			userClient: makeStubClient(),
			judgeClient: makeStubClient(),
			optimizerClient: makeStubClient(),
			maxIterations: 1,
		})

		expect(report.baselineAverage).toBe(9)
		expect(report.finalAverage).toBe(9)
		expect(report.baselineAverage).toBe(report.iterations[0].averageOverall)
	})
})
