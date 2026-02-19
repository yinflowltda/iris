import { type LanguageModel, type ModelMessage, streamText } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { type AgentModelName, getAgentModelDefinition } from '../../shared/models'
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
		const modelName = getModelName(prompt)
		const model = this.getModel(modelName)

		if (typeof model === 'string') {
			throw new Error('Model is a string, not a LanguageModel')
		}

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

		try {
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
		} catch (error: any) {
			console.error('streamActions error:', error)
			throw error
		}
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
