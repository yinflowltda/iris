import { MockLanguageModelV3 } from 'ai/test'

interface MockResponse {
	actions: Array<Record<string, unknown>>
}

const DEFAULT_RESPONSE: MockResponse = {
	actions: [
		{
			_type: 'message',
			message: 'Hello! I am the mock AI provider. How can I help you today?',
		},
	],
}

const PATTERN_RESPONSES: Array<{ pattern: RegExp; response: MockResponse }> = [
	{
		pattern: /emotions?.map/i,
		response: {
			actions: [
				{
					_type: 'message',
					message:
						"Welcome to the Emotions Map! Let's explore your emotions together. What situation would you like to work through?",
				},
			],
		},
	},
	{
		pattern: /i don'?t know|not sure|stuck/i,
		response: {
			actions: [
				{
					_type: 'message',
					message:
						"That's completely okay. Based on what we've discussed, you might consider: 1) A recent work situation, 2) A relationship dynamic, 3) A personal goal. Do any of these resonate?",
				},
			],
		},
	},
	{
		pattern: /fill.*cell|place.*in/i,
		response: {
			actions: [
				{
					_type: 'message',
					message: 'That makes sense. Let me capture that for you.',
				},
				{
					_type: 'fill_cell',
					mandalaId: 'shape:mandala',
					cellId: 'present-events',
					content: 'Mock content',
				},
			],
		},
	},
]

export function getResponseForInput(input: string): MockResponse {
	for (const { pattern, response } of PATTERN_RESPONSES) {
		if (pattern.test(input)) {
			return response
		}
	}
	return DEFAULT_RESPONSE
}

export function createMockModel(input?: string): MockLanguageModelV3 {
	const response = getResponseForInput(input ?? '')
	const jsonText = JSON.stringify(response.actions)

	return new MockLanguageModelV3({
		provider: 'mock',
		modelId: 'mock-model',
		doGenerate: {
			content: [{ type: 'text', text: jsonText }],
			finishReason: { unified: 'stop', raw: 'stop' },
			usage: {
				inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
				outputTokens: { total: 50, text: 50, reasoning: undefined },
			},
			warnings: [],
		},
	})
}
