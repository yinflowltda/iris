import { describe, expect, it } from 'vitest'
import type {
	ApiClientConfig,
	ConversationResult,
	ConversationScore,
	ConversationTurn,
	FrameworkConfig,
	IterationResult,
	LabReport,
	Scenario,
	ScoreDimension,
} from '../../../tools/prompt-lab/core/types'

describe('prompt-lab types', () => {
	it('creates a valid Scenario', () => {
		const scenario: Scenario = {
			id: 'test-1',
			name: 'Basic exploration',
			framework: 'emotions-map',
			category: 'therapeutic-journey',
			difficulty: 'easy',
			persona: {
				description: 'A curious user exploring emotions',
				language: 'en',
				emotionalState: 5,
				traits: ['curious', 'open'],
			},
			openingMessages: ['I want to explore my feelings'],
			userGoals: ['Identify primary emotion'],
			expectedBehaviors: ['Ask clarifying questions'],
			antiPatterns: ['Giving direct advice'],
		}
		expect(scenario.id).toBe('test-1')
		expect(scenario.persona.language).toBe('en')
		expect(scenario.category).toBe('therapeutic-journey')
		expect(scenario.maxTurns).toBeUndefined()
	})

	it('creates a Scenario with optional maxTurns', () => {
		const scenario: Scenario = {
			id: 'test-2',
			name: 'Short scenario',
			framework: 'emotions-map',
			category: 'edge-case',
			difficulty: 'hard',
			persona: {
				description: 'Difficult user',
				language: 'pt',
				emotionalState: 2,
				traits: ['resistant'],
			},
			openingMessages: ['Nao quero falar'],
			userGoals: ['Test resistance handling'],
			expectedBehaviors: ['Stay calm'],
			antiPatterns: ['Being pushy'],
			maxTurns: 5,
		}
		expect(scenario.maxTurns).toBe(5)
		expect(scenario.persona.language).toBe('pt')
	})

	it('creates valid ConversationTurn and ConversationResult', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: 'Hello, how are you feeling?',
			actions: [{ _type: 'message', message: 'Hello' }],
			latencyMs: 150,
		}
		const result: ConversationResult = {
			scenarioId: 'test-1',
			turns: [turn],
			totalDurationMs: 3000,
		}
		expect(result.turns).toHaveLength(1)
		expect(result.turns[0].role).toBe('assistant')
		expect(result.turns[0].latencyMs).toBe(150)
	})

	it('creates valid ScoreDimension and ConversationScore', () => {
		const dim: ScoreDimension = {
			name: 'empathy',
			score: 8,
			weight: 0.3,
			notes: 'Good emotional attunement',
		}
		const score: ConversationScore = {
			scenarioId: 'test-1',
			dimensions: [dim],
			overall: 8.0,
			strengths: ['Good listening'],
			weaknesses: ['Could be more specific'],
			suggestedPromptChanges: ['Add more empathy cues'],
		}
		expect(score.overall).toBe(8.0)
		expect(score.dimensions[0].weight).toBe(0.3)
		expect(score.latency).toBeUndefined()
	})

	it('creates valid FrameworkConfig', () => {
		const config: FrameworkConfig = {
			frameworkId: 'emotions-map',
			promptSectionPath: 'worker/prompt/sections/emotions.ts',
			rubric: [{ name: 'empathy', description: 'Emotional attunement', weight: 0.3 }],
			safetyDimensions: ['no-diagnosis', 'crisis-referral'],
			userSimPrompt: 'You are a simulated user...',
		}
		expect(config.rubric).toHaveLength(1)
		expect(config.safetyDimensions).toContain('no-diagnosis')
	})

	it('creates valid IterationResult and LabReport', () => {
		const iteration: IterationResult = {
			iteration: 1,
			scores: [],
			averageOverall: 7.5,
			weakestDimensions: [{ name: 'safety', avgScore: 6.0 }],
			promptChanges: 'Added safety guardrails',
			accepted: true,
		}
		const report: LabReport = {
			startedAt: '2026-01-01T00:00:00Z',
			completedAt: '2026-01-01T01:00:00Z',
			framework: 'emotions-map',
			iterations: [iteration],
			baselineAverage: 6.5,
			finalAverage: 7.5,
			improvement: 1.0,
		}
		expect(report.improvement).toBe(1.0)
		expect(report.iterations[0].accepted).toBe(true)
	})

	it('creates valid ApiClientConfig', () => {
		const config: ApiClientConfig = {
			baseUrl: 'https://api.example.com',
			apiKey: 'test-key',
			model: 'gpt-4o-mini',
		}
		expect(config.baseUrl).toBe('https://api.example.com')
		expect(config.model).toBe('gpt-4o-mini')
	})
})
