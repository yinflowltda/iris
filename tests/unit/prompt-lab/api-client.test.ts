import { describe, expect, it, vi } from 'vitest'

vi.mock('@ai-sdk/openai', () => ({
	createOpenAI: vi.fn(() => ({
		chat: (modelId: string) => ({ modelId, provider: 'openai' }),
	})),
}))

vi.mock('ai', () => ({
	streamText: vi.fn(() => ({
		text: Promise.resolve('{"actions":[{"_type":"message","message":"Hello there"}]}'),
		usage: Promise.resolve({ promptTokens: 100, completionTokens: 50 }),
	})),
}))

import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { createApiClient } from '../../../tools/prompt-lab/core/api-client'
import type { ApiClientConfig } from '../../../tools/prompt-lab/core/types'

describe('api-client', () => {
	const config: ApiClientConfig = {
		baseUrl: 'https://api.test.com/v1',
		apiKey: 'test-key-123',
		model: 'gpt-4o-mini',
	}

	it('creates an ApiClient with the provided config', () => {
		const client = createApiClient(config)
		expect(client.config).toEqual(config)
		expect(typeof client.generate).toBe('function')
	})

	it('passes baseURL, apiKey, and compatibility to createOpenAI', () => {
		createApiClient(config)
		expect(createOpenAI).toHaveBeenCalledWith({
			baseURL: 'https://api.test.com/v1',
			apiKey: 'test-key-123',
			compatibility: 'compatible',
		})
	})

	it('calls streamText with correct parameters', async () => {
		const client = createApiClient(config)

		await client.generate({
			systemPrompt: 'You are helpful.',
			messages: [{ role: 'user', content: 'Hi' }],
			maxTokens: 500,
			temperature: 0.7,
		})

		expect(streamText).toHaveBeenCalledWith(
			expect.objectContaining({
				system: 'You are helpful.',
				messages: [{ role: 'user', content: 'Hi' }],
				maxTokens: 500,
				temperature: 0.7,
			}),
		)
	})

	it('returns text, usage, and durationMs from generate', async () => {
		const client = createApiClient(config)

		const result = await client.generate({
			systemPrompt: 'System prompt',
			messages: [{ role: 'user', content: 'Hello' }],
		})

		expect(result.text).toBe('{"actions":[{"_type":"message","message":"Hello there"}]}')
		expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
		expect(result.durationMs).toBeGreaterThanOrEqual(0)
	})

	it('handles multiple messages in conversation', async () => {
		const client = createApiClient(config)

		await client.generate({
			systemPrompt: 'System',
			messages: [
				{ role: 'user', content: 'First' },
				{ role: 'assistant', content: 'Response' },
				{ role: 'user', content: 'Second' },
			],
		})

		expect(streamText).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: [
					{ role: 'user', content: 'First' },
					{ role: 'assistant', content: 'Response' },
					{ role: 'user', content: 'Second' },
				],
			}),
		)
	})
})
