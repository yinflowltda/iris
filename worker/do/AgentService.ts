import { type LanguageModel, type ModelMessage, streamText } from 'ai'
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

type WorkersAIModelId = Parameters<ReturnType<typeof createWorkersAI>>[0]

export class AgentService {
	workersai: ReturnType<typeof createWorkersAI>

	constructor(env: Environment) {
		this.workersai = createWorkersAI({ binding: env.AI })
	}

	getModel(modelName: AgentModelName): LanguageModel {
		const modelDefinition = getAgentModelDefinition(modelName)
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

		for (const [index, modelName] of candidates.entries()) {
			try {
				yield* this.streamActionsWithModel(modelName, messages)
				return
			} catch (error: any) {
				lastError = error
				const canRetry = index < candidates.length - 1
				if (!canRetry || !isInferenceUpstreamError(error)) {
					console.error('streamActions error:', error)
					throw toReadableError(error)
				}

				const nextModel = candidates[index + 1]
				console.warn(
					`Upstream error on model ${modelName}. Retrying with fallback model ${nextModel}.`,
				)
			}
		}

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

		const { textStream } = streamText({
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
		for await (const text of textStream) {
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
	}
}

function getFallbackModels(preferred: AgentModelName): AgentModelName[] {
	const allModels = Object.keys(AGENT_MODEL_DEFINITIONS) as AgentModelName[]
	return allModels.filter((name) => name !== preferred)
}

function isInferenceUpstreamError(error: unknown): boolean {
	const text = getErrorText(error).toLowerCase()
	return text.includes('inferenceupstreamerror')
}

function toReadableError(error: unknown): Error {
	const text = getErrorText(error)
	if (text.trim().length > 0 && text !== 'Unknown stream error') {
		return new Error(text)
	}
	return new Error('Model provider error. Please try again.')
}

function getErrorText(error: unknown): string {
	if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
		return error.message
	}

	if (typeof error === 'string' && error.length > 0) {
		return error
	}

	try {
		return JSON.stringify(error) || 'Unknown stream error'
	} catch {
		return 'Unknown stream error'
	}
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
