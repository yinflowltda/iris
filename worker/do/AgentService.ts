import { type LanguageModel, type ModelMessage, streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createWorkersAI } from 'workers-ai-provider'
import {
	AGENT_MODEL_DEFINITIONS,
	type AgentModelName,
	getAgentModelDefinition,
} from '../../shared/models'
import type { DebugPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentAction } from '../../shared/types/AgentAction'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'
import type { Streaming } from '../../shared/types/Streaming'
import type { Environment } from '../environment'
import { buildMessages } from '../prompt/buildMessages'
import { buildSystemPrompt } from '../prompt/buildSystemPrompt'
import { getModelName } from '../prompt/getModelName'
import { closeAndParseJson } from './closeAndParseJson'
import { MAX_SAME_MODEL_RETRIES, getErrorText, isInferenceUpstreamError } from './retryHelper'

type WorkersAIModelId = Parameters<ReturnType<typeof createWorkersAI>>[0]

export class AgentService {
	workersai: ReturnType<typeof createWorkersAI>
	private env: Environment

	constructor(env: Environment) {
		this.env = env
		this.workersai = createWorkersAI({ binding: env.AI })
	}

	getModel(modelName: AgentModelName): LanguageModel {
		const modelDefinition = getAgentModelDefinition(modelName)

		if (modelDefinition.provider === 'openai-compatible') {
			const baseURL = this.env.OPENAI_COMPATIBLE_BASE_URL
			if (!baseURL) {
				throw new Error(
					`OpenAI-compatible endpoint not configured. Set OPENAI_COMPATIBLE_BASE_URL to use ${modelName}.`,
				)
			}
			const provider = createOpenAI({
				baseURL,
				apiKey: this.env.OPENAI_COMPATIBLE_API_KEY || 'not-needed',
				compatibility: 'compatible',
			})
			return provider.chat(modelDefinition.id)
		}

		return this.workersai(modelDefinition.id as WorkersAIModelId)
	}

	async *stream(prompt: AgentPrompt): AsyncGenerator<Streaming<AgentAction>> {
		try {
			for await (const event of this.streamActions(prompt)) {
				yield event
			}
		} catch (error: any) {
			console.error('Stream error:', error)
			throw error
		}
	}

	private async *streamActions(prompt: AgentPrompt): AsyncGenerator<Streaming<AgentAction>> {
		const systemPrompt = buildSystemPrompt(prompt)

		const messages: ModelMessage[] = []

		messages.push({
			role: 'system',
			content: systemPrompt,
		})

		const promptMessages = buildMessages(prompt)
		messages.push(...promptMessages)

		const debugPart = prompt.debug as DebugPart | undefined
		if (debugPart) {
			if (debugPart.logSystemPrompt) {
				const promptWithoutSchema = buildSystemPrompt(prompt, { withSchema: false })
				console.log('[DEBUG] System Prompt (without schema):\n', promptWithoutSchema)
			}
			if (debugPart.logMessages) {
				console.log('[DEBUG] Messages:\n', JSON.stringify(promptMessages, null, 2))
			}
		}

		const preferredModel = getModelName(prompt)
		const fallbackModels = getFallbackModels(preferredModel)
		const candidates = [preferredModel, ...fallbackModels]

		let lastError: unknown = null

		for (const [modelIndex, modelName] of candidates.entries()) {
			const maxAttempts = modelIndex === 0 ? MAX_SAME_MODEL_RETRIES + 1 : 1

			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				try {
					yield* this.streamActionsWithModel(modelName, messages)
					return
				} catch (error: unknown) {
					lastError = error

					if (isInferenceUpstreamError(error)) {
						const nextModel = candidates[modelIndex + 1]
						if (nextModel) {
							console.warn(`Upstream error on model ${modelName}. Trying fallback ${nextModel}.`)
						}
						break
					}

					const hasMoreAttempts = attempt < maxAttempts - 1
					if (hasMoreAttempts) {
						console.warn(`Error on model ${modelName} (attempt ${attempt + 1}). Retrying same model.`)
						continue
					}

					const hasMoreModels = modelIndex < candidates.length - 1
					if (hasMoreModels) {
						console.warn(`All retries failed for ${modelName}. Trying fallback ${candidates[modelIndex + 1]}.`)
					}
				}
			}
		}

		console.error('streamActions error: all models and retries exhausted', lastError)
		throw toReadableError(lastError)
	}

	private async *streamActionsWithModel(
		modelName: AgentModelName,
		messages: ModelMessage[],
	): AsyncGenerator<Streaming<AgentAction>> {
		const model = this.getModel(modelName)

		if (typeof model === 'string') {
			throw new Error('Model is a string, not a LanguageModel')
		}

		const streamResult = streamText({
			model,
			messages,
			maxOutputTokens: 8192,
			temperature: 0,
			onAbort() {
				console.warn('Stream actions aborted')
			},
			onError: (e) => {
				console.error('Stream text error:', e)
				throw e
			},
		})

		let buffer = ''
		let lastActionIndex = -1
		let maybeIncompleteAction: AgentAction | null = null

		let startTime = Date.now()
		for await (const text of streamResult.textStream) {
			buffer += text

			const partialObject = tryParseStreamingJson(buffer)
			if (!partialObject) continue

			const actions = partialObject.actions
			if (!Array.isArray(actions)) continue
			if (actions.length === 0) continue

			const latestIndex = actions.length - 1

			// A new action was appended; finalize the previous one.
			if (latestIndex !== lastActionIndex) {
				if (maybeIncompleteAction) {
					yield {
						...maybeIncompleteAction,
						complete: true,
						time: Date.now() - startTime,
					}
					maybeIncompleteAction = null
				}

				lastActionIndex = latestIndex
				startTime = Date.now()
			}

			const latestAction = actions[latestIndex] as AgentAction | undefined
			if (!latestAction || !latestAction._type) continue

			maybeIncompleteAction = latestAction
			yield {
				...latestAction,
				complete: false,
				time: Date.now() - startTime,
			}
		}

		if (maybeIncompleteAction) {
			yield {
				...maybeIncompleteAction,
				complete: true,
				time: Date.now() - startTime,
			}
		}

		const reason = await streamResult.finishReason
		if (reason === 'length') {
			console.warn('Stream truncated due to maxOutputTokens limit')
			yield {
				_type: '_truncated',
				complete: true,
				time: Date.now() - startTime,
			} as any
		}
	}
}

function getFallbackModels(preferred: AgentModelName): AgentModelName[] {
	const preferredDef = AGENT_MODEL_DEFINITIONS[preferred]
	if (!preferredDef) return []
	const allModels = Object.keys(AGENT_MODEL_DEFINITIONS) as AgentModelName[]
	return allModels.filter(
		(name) => name !== preferred && AGENT_MODEL_DEFINITIONS[name]?.provider === preferredDef.provider,
	)
}

function toReadableError(error: unknown): Error {
	if (isInferenceUpstreamError(error)) {
		return new Error('AI models are temporarily unavailable. Please try again in a moment.')
	}
	const text = getErrorText(error)
	if (text.trim().length > 0 && text !== 'Unknown stream error') {
		return new Error(text)
	}
	return new Error('Model provider error. Please try again.')
}

function tryParseStreamingJson(buffer: string): any | null {
	let text = buffer.trimStart()

	// Strip code fences if the model uses them.
	if (text.startsWith('```')) {
		text = text.replace(/^```[a-zA-Z]*\n?/, '')
		text = text.replace(/```$/, '')
	}

	// Ignore any leading non-JSON text until the first object.
	const firstBrace = text.indexOf('{')
	if (firstBrace > 0) {
		text = text.slice(firstBrace)
	}

	if (!text.startsWith('{')) return null

	return closeAndParseJson(text)
}
