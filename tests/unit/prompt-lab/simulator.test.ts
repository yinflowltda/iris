import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../../tools/prompt-lab/core/api-client'
import {
	buildUserSimPrompt,
	extractAgentMessage,
	runConversation,
} from '../../../tools/prompt-lab/core/simulator'
import type { Scenario } from '../../../tools/prompt-lab/core/types'

function createMockScenario(overrides: Partial<Scenario> = {}): Scenario {
	return {
		id: 'test-scenario-1',
		name: 'Test Scenario',
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
		maxTurns: 3,
		...overrides,
	}
}

function createMockClient(responses: string[]): ApiClient {
	let callIndex = 0
	return {
		config: { baseUrl: 'http://test', apiKey: 'key', model: 'test-model' },
		generate: vi.fn(async () => {
			const text = responses[callIndex] ?? responses[responses.length - 1]
			callIndex++
			return {
				text,
				usage: { promptTokens: 50, completionTokens: 25 },
				durationMs: 100,
			}
		}),
	}
}

describe('extractAgentMessage', () => {
	it('extracts message from valid JSON actions', () => {
		const text = '{"actions":[{"_type":"message","message":"Hello there"}]}'
		expect(extractAgentMessage(text)).toBe('Hello there')
	})

	it('returns null for non-JSON text', () => {
		expect(extractAgentMessage('Just plain text')).toBeNull()
	})

	it('returns null when no message action exists', () => {
		const text = '{"actions":[{"_type":"add_note","text":"A note"}]}'
		expect(extractAgentMessage(text)).toBeNull()
	})

	it('returns null for empty actions array', () => {
		const text = '{"actions":[]}'
		expect(extractAgentMessage(text)).toBeNull()
	})

	it('extracts first message action from multiple actions', () => {
		const text = JSON.stringify({
			actions: [
				{ _type: 'add_note', text: 'Note' },
				{ _type: 'message', message: 'Found it' },
			],
		})
		expect(extractAgentMessage(text)).toBe('Found it')
	})
})

describe('buildUserSimPrompt', () => {
	it('builds a prompt with persona details', () => {
		const scenario = createMockScenario()
		const prompt = buildUserSimPrompt(scenario)

		expect(prompt).toContain('simulated user')
		expect(prompt).toContain('A curious user exploring emotions')
		expect(prompt).toContain('Language: en')
		expect(prompt).toContain('Emotional state (1-10): 5')
		expect(prompt).toContain('curious, open')
		expect(prompt).toContain('Identify primary emotion')
		expect(prompt).toContain('I want to explore my feelings')
	})

	it('includes all user goals', () => {
		const scenario = createMockScenario({
			userGoals: ['Goal 1', 'Goal 2', 'Goal 3'],
		})
		const prompt = buildUserSimPrompt(scenario)

		expect(prompt).toContain('- Goal 1')
		expect(prompt).toContain('- Goal 2')
		expect(prompt).toContain('- Goal 3')
	})
})

describe('runConversation', () => {
	it('runs a multi-turn conversation with correct turn count', async () => {
		const scenario = createMockScenario({ maxTurns: 2 })
		const agentClient = createMockClient([
			'{"actions":[{"_type":"message","message":"How are you feeling?"}]}',
			'{"actions":[{"_type":"message","message":"Tell me more about that."}]}',
		])
		const userClient = createMockClient(['I feel a bit anxious today.'])

		const result = await runConversation({
			scenario,
			agentClient,
			userClient,
			systemPrompt: 'You are a therapeutic assistant.',
		})

		expect(result.scenarioId).toBe('test-scenario-1')
		// Opening message (user) + agent response + user sim + agent response
		expect(result.turns).toHaveLength(4)
		expect(result.turns[0].role).toBe('user')
		expect(result.turns[0].content).toBe('I want to explore my feelings')
		expect(result.turns[1].role).toBe('assistant')
		expect(result.turns[1].content).toBe('How are you feeling?')
		expect(result.turns[2].role).toBe('user')
		expect(result.turns[2].content).toBe('I feel a bit anxious today.')
		expect(result.turns[3].role).toBe('assistant')
		expect(result.turns[3].content).toBe('Tell me more about that.')
	})

	it('includes actions and latencyMs in assistant turns', async () => {
		const scenario = createMockScenario({ maxTurns: 1 })
		const agentClient = createMockClient([
			'{"actions":[{"_type":"message","message":"Hi"},{"_type":"add_note","text":"Note"}]}',
		])
		const userClient = createMockClient(['Ok'])

		const result = await runConversation({
			scenario,
			agentClient,
			userClient,
			systemPrompt: 'System',
		})

		const assistantTurn = result.turns.find((t) => t.role === 'assistant')
		expect(assistantTurn?.actions).toHaveLength(2)
		expect(assistantTurn?.latencyMs).toBeGreaterThanOrEqual(0)
	})

	it('falls back to raw text when agent response is not JSON', async () => {
		const scenario = createMockScenario({ maxTurns: 1 })
		const agentClient = createMockClient(['Just a plain text response'])
		const userClient = createMockClient(['Ok'])

		const result = await runConversation({
			scenario,
			agentClient,
			userClient,
			systemPrompt: 'System',
		})

		const assistantTurn = result.turns.find((t) => t.role === 'assistant')
		expect(assistantTurn?.content).toBe('Just a plain text response')
		expect(assistantTurn?.actions).toBeUndefined()
	})

	it('passes system prompt to agent client', async () => {
		const scenario = createMockScenario({ maxTurns: 1 })
		const agentClient = createMockClient(['{"actions":[{"_type":"message","message":"Hi"}]}'])
		const userClient = createMockClient(['Ok'])

		await runConversation({
			scenario,
			agentClient,
			userClient,
			systemPrompt: 'Custom system prompt',
		})

		expect(agentClient.generate).toHaveBeenCalledWith(
			expect.objectContaining({ systemPrompt: 'Custom system prompt' }),
		)
	})

	it('passes user sim prompt to user client', async () => {
		const scenario = createMockScenario({ maxTurns: 2 })
		const agentClient = createMockClient([
			'{"actions":[{"_type":"message","message":"Hi"}]}',
			'{"actions":[{"_type":"message","message":"Ok"}]}',
		])
		const userClient = createMockClient(['Response'])

		await runConversation({
			scenario,
			agentClient,
			userClient,
			systemPrompt: 'System',
		})

		expect(userClient.generate).toHaveBeenCalledWith(
			expect.objectContaining({
				systemPrompt: expect.stringContaining('simulated user'),
			}),
		)
	})

	it('defaults to 10 max turns when not specified', async () => {
		const scenario = createMockScenario({ maxTurns: undefined })
		const agentClient = createMockClient(['{"actions":[{"_type":"message","message":"Hi"}]}'])
		const userClient = createMockClient(['Response'])

		const result = await runConversation({
			scenario,
			agentClient,
			userClient,
			systemPrompt: 'System',
		})

		// 1 opening + 10 agent turns + 9 user sim turns = 20
		expect(result.turns).toHaveLength(20)
		expect(agentClient.generate).toHaveBeenCalledTimes(10)
		expect(userClient.generate).toHaveBeenCalledTimes(9)
	})

	it('tracks total duration', async () => {
		const scenario = createMockScenario({ maxTurns: 1 })
		const agentClient = createMockClient(['{"actions":[{"_type":"message","message":"Hi"}]}'])
		const userClient = createMockClient(['Ok'])

		const result = await runConversation({
			scenario,
			agentClient,
			userClient,
			systemPrompt: 'System',
		})

		expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
	})
})
