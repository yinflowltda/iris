import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { ApiClientConfig } from './types'

export interface GenerateInput {
	systemPrompt: string
	messages: { role: 'user' | 'assistant'; content: string }[]
	maxTokens?: number
	temperature?: number
}

export interface GenerateOutput {
	text: string
	usage: { promptTokens: number; completionTokens: number }
	durationMs: number
}

export interface ApiClient {
	generate(input: GenerateInput): Promise<GenerateOutput>
	config: ApiClientConfig
}

export function createApiClient(config: ApiClientConfig): ApiClient {
	const provider = createOpenAI({
		baseURL: config.baseUrl,
		apiKey: config.apiKey,
	})

	return {
		config,
		async generate(input: GenerateInput): Promise<GenerateOutput> {
			const start = Date.now()

			const result = await generateText({
				model: provider(config.model),
				system: input.systemPrompt,
				messages: input.messages.map((m) => ({
					role: m.role,
					content: m.content,
				})),
				maxTokens: input.maxTokens,
				temperature: input.temperature,
			})

			const durationMs = Date.now() - start

			return {
				text: result.text,
				usage: {
					promptTokens: result.usage.promptTokens,
					completionTokens: result.usage.completionTokens,
				},
				durationMs,
			}
		},
	}
}
