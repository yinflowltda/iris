import type { ApiClient } from './api-client'
import type { ConversationResult, ConversationTurn, Scenario } from './types'

export interface SimulatorOptions {
	scenario: Scenario
	agentClient: ApiClient
	userClient: ApiClient
	systemPrompt: string
}

const DEFAULT_MAX_TURNS = 10

export function extractAgentMessage(text: string): string | null {
	try {
		const parsed = JSON.parse(text)
		if (parsed?.actions && Array.isArray(parsed.actions)) {
			const messageAction = parsed.actions.find(
				(a: Record<string, unknown>) => a._type === 'message',
			)
			if (messageAction?.message) {
				return messageAction.message as string
			}
		}
	} catch {
		// If not valid JSON, return null
	}
	return null
}

export function buildUserSimPrompt(scenario: Scenario): string {
	const { persona, userGoals, openingMessages } = scenario

	return [
		'You are a simulated user in a therapeutic conversation.',
		`Persona: ${persona.description}`,
		`Language: ${persona.language}`,
		`Emotional state (1-10): ${persona.emotionalState}`,
		`Traits: ${persona.traits.join(', ')}`,
		'',
		'Your goals in this conversation:',
		...userGoals.map((g) => `- ${g}`),
		'',
		'Context - your opening messages were:',
		...openingMessages.map((m) => `- "${m}"`),
		'',
		'Respond naturally as this persona would.',
		'Keep responses concise (1-3 sentences).',
		'Stay in character throughout the conversation.',
	].join('\n')
}

export async function runConversation(options: SimulatorOptions): Promise<ConversationResult> {
	const { scenario, agentClient, userClient, systemPrompt } = options
	const maxTurns = scenario.maxTurns ?? DEFAULT_MAX_TURNS
	const turns: ConversationTurn[] = []
	const startTime = Date.now()

	// Seed conversation with opening messages
	const conversationMessages: { role: 'user' | 'assistant'; content: string }[] = []

	for (const openingMessage of scenario.openingMessages) {
		turns.push({ role: 'user', content: openingMessage })
		conversationMessages.push({ role: 'user', content: openingMessage })
	}

	// Conversation loop
	for (let turn = 0; turn < maxTurns; turn++) {
		// Agent responds
		const agentStart = Date.now()
		const agentResponse = await agentClient.generate({
			systemPrompt,
			messages: [...conversationMessages],
		})
		const agentLatency = Date.now() - agentStart

		const agentMessage = extractAgentMessage(agentResponse.text)
		const agentContent = agentMessage ?? agentResponse.text

		let actions: Record<string, unknown>[] | undefined
		try {
			const parsed = JSON.parse(agentResponse.text)
			if (parsed?.actions) {
				actions = parsed.actions
			}
		} catch {
			// not JSON, no actions
		}

		turns.push({
			role: 'assistant',
			content: agentContent,
			actions,
			latencyMs: agentLatency,
		})
		conversationMessages.push({ role: 'assistant', content: agentContent })

		// Check if we've reached max turns (last turn is agent-only)
		if (turn >= maxTurns - 1) break

		// Simulated user responds
		const userSimPrompt = buildUserSimPrompt(scenario)
		const userResponse = await userClient.generate({
			systemPrompt: userSimPrompt,
			messages: [...conversationMessages],
		})

		turns.push({ role: 'user', content: userResponse.text })
		conversationMessages.push({ role: 'user', content: userResponse.text })
	}

	return {
		scenarioId: scenario.id,
		turns,
		totalDurationMs: Date.now() - startTime,
	}
}
