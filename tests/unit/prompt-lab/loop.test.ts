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
	generateModifiedPrompt: vi.fn().mockResolvedValue({
		changes: 'No changes needed',
		modifiedPrompt: 'You are a helpful assistant (v2)',
	}),
}))

vi.mock('../../../tools/prompt-lab/core/test-run', () => ({
	generateRunId: vi.fn().mockReturnValue('test-run-id'),
	generateTestId: vi.fn().mockReturnValue('test-run-id/test-1/iter-1'),
	initRunDir: vi.fn().mockResolvedValue('/tmp/test-run'),
	saveTestCase: vi.fn().mockResolvedValue(undefined),
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
			initialPrompt: 'You are a helpful assistant',
			agentClient: makeStubClient(),
			userClient: makeStubClient(),
			judgeClient: makeStubClient(),
			optimizerClient: makeStubClient(),
			maxIterations: 2,
			persistResults: false,
		})

		expect(report.iterations).toHaveLength(2)
		expect(report.framework).toBe('emotions-map')
		expect(report.baselineAverage).toBe(9)
		expect(report.finalAverage).toBe(9)
		expect(report.startedAt).toBeDefined()
		expect(report.completedAt).toBeDefined()
		expect(report.runId).toBeDefined()
		expect(report.bestPrompt).toBeDefined()
	})

	it('calls onProgress callback after each iteration', async () => {
		const { runLoop } = await import('../../../tools/prompt-lab/core/loop')
		const onProgress = vi.fn()

		await runLoop({
			scenarios: [testScenario],
			frameworkConfig: testConfig,
			initialPrompt: 'You are a helpful assistant',
			agentClient: makeStubClient(),
			userClient: makeStubClient(),
			judgeClient: makeStubClient(),
			optimizerClient: makeStubClient(),
			maxIterations: 2,
			onProgress,
			persistResults: false,
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
			initialPrompt: 'You are a helpful assistant',
			agentClient: makeStubClient(),
			userClient: makeStubClient(),
			judgeClient: makeStubClient(),
			optimizerClient: makeStubClient(),
			maxIterations: 1,
			persistResults: false,
		})

		expect(report.baselineAverage).toBe(9)
		expect(report.finalAverage).toBe(9)
		expect(report.baselineAverage).toBe(report.iterations[0].averageOverall)
	})

	it('tracks best prompt and rolls back on regression', async () => {
		const { isAutoFail } = await import('../../../tools/prompt-lab/core/judge')
		const { analyzeScores, generateModifiedPrompt } = await import(
			'../../../tools/prompt-lab/core/optimizer'
		)

		// Iteration 1: score 9 (best), Iteration 2: score 7 (regressed), Iteration 3: score 8
		let callCount = 0
		vi.mocked(analyzeScores).mockImplementation(() => {
			callCount++
			if (callCount === 1) return { averageOverall: 9, weakestDimensions: [], allSuggestions: [] }
			if (callCount === 2) return { averageOverall: 7, weakestDimensions: [], allSuggestions: [] }
			return { averageOverall: 8, weakestDimensions: [], allSuggestions: [] }
		})
		vi.mocked(isAutoFail).mockReturnValue(false)
		vi.mocked(generateModifiedPrompt).mockResolvedValue({
			changes: 'Some changes',
			modifiedPrompt: 'Modified prompt',
		})

		const { runLoop } = await import('../../../tools/prompt-lab/core/loop')

		const report = await runLoop({
			scenarios: [testScenario],
			frameworkConfig: testConfig,
			initialPrompt: 'Original prompt',
			agentClient: makeStubClient(),
			userClient: makeStubClient(),
			judgeClient: makeStubClient(),
			optimizerClient: makeStubClient(),
			maxIterations: 3,
			persistResults: false,
		})

		// Iteration 2 should be rolled back since 7 < 9
		expect(report.iterations[1].rolledBack).toBe(true)
		expect(report.bestAverage).toBe(9)
	})

	it('marks iteration as rejected on safety auto-fail', async () => {
		const { isAutoFail } = await import('../../../tools/prompt-lab/core/judge')
		const { analyzeScores, generateModifiedPrompt } = await import(
			'../../../tools/prompt-lab/core/optimizer'
		)

		vi.mocked(analyzeScores).mockReturnValue({
			averageOverall: 8,
			weakestDimensions: [],
			allSuggestions: [],
		})
		vi.mocked(isAutoFail).mockReturnValue(true)
		vi.mocked(generateModifiedPrompt).mockResolvedValue({
			changes: 'Fix safety',
			modifiedPrompt: 'Safer prompt',
		})

		const { runLoop } = await import('../../../tools/prompt-lab/core/loop')

		const report = await runLoop({
			scenarios: [testScenario],
			frameworkConfig: testConfig,
			initialPrompt: 'Original prompt',
			agentClient: makeStubClient(),
			userClient: makeStubClient(),
			judgeClient: makeStubClient(),
			optimizerClient: makeStubClient(),
			maxIterations: 1,
			persistResults: false,
		})

		expect(report.iterations[0].accepted).toBe(false)
		expect(report.iterations[0].rejectionReason).toBe('Safety auto-fail detected')
	})
})
