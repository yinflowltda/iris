import { generateText, stepCountIs, tool } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'
import type { VoiceMessage, VoiceProcessResult } from '../../shared/types/VoiceTypes'
import type { Environment } from '../environment'
import { VOICE_SYSTEM_PROMPT } from '../prompt/voice-system-prompt'

const VOICE_LLM_MODEL = '@cf/meta/llama-3.1-8b-instruct'
const STT_MODEL = '@cf/deepgram/nova-3'
const TTS_MODEL = '@cf/deepgram/aura-2-en'

interface DeepgramResult {
	results?: {
		channels?: Array<{
			alternatives?: Array<{
				transcript?: string
			}>
		}>
	}
}

export class VoiceService {
	private workersai: ReturnType<typeof createWorkersAI>

	constructor(private env: Environment) {
		this.workersai = createWorkersAI({ binding: env.AI })
	}

	async process(
		audio: Uint8Array,
		history: VoiceMessage[],
		signal: AbortSignal,
	): Promise<VoiceProcessResult> {
		const transcript = await this.transcribe(audio)
		if (!transcript.trim()) {
			throw new Error('Could not transcribe audio. Please try again.')
		}

		const updatedHistory: VoiceMessage[] = [...history, { role: 'user', content: transcript }]
		const responseText = await this.think(updatedHistory, signal)
		const audioResponse = await this.synthesize(responseText)

		return { transcript, responseText, audioResponse }
	}

	async transcribe(audio: Uint8Array): Promise<string> {
		let result: any
		let attempts = 0
		const maxAttempts = 2

		while (attempts < maxAttempts) {
			attempts++
			const bodyStream = new ReadableStream({
				start(controller) {
					controller.enqueue(audio)
					controller.close()
				},
			})

			try {
				const rawResp = await this.env.AI.run(
					STT_MODEL as any,
					{
						audio: {
							body: bodyStream,
							contentType: 'audio/webm',
						},
						detect_language: true,
						punctuate: true,
						smart_format: true,
					} as any,
					{ returnRawResponse: true } as any,
				)

				if (rawResp instanceof Response) {
					result = await rawResp.json()
				} else {
					result = rawResp
				}
				break
			} catch (sttErr: any) {
				if (attempts >= maxAttempts) throw sttErr
			}
		}

		const deepgramResult = result as DeepgramResult
		const alt = deepgramResult?.results?.channels?.[0]?.alternatives?.[0]
		return alt?.transcript ?? ''
	}

	async think(history: VoiceMessage[], signal: AbortSignal): Promise<string> {
		const model = this.workersai(VOICE_LLM_MODEL as any)

		const messages = history.map((m) => ({
			role: m.role as 'user' | 'assistant',
			content: m.content,
		}))

		const result = await generateText({
			model,
			system: VOICE_SYSTEM_PROMPT,
			messages,
			tools: {
				delegateToCanvasAgent: tool({
					description:
						'Send canvas operations to the canvas agent. Use for creating shapes, filling cells, highlighting areas, or any visual manipulation on the mandala.',
					inputSchema: z.object({
						instruction: z.string().describe('The instruction to send to the canvas agent'),
					}),
				}),
			},
			stopWhen: stepCountIs(3),
			abortSignal: signal,
			temperature: 0.7,
			maxOutputTokens: 512,
		})

		const toolCalls = result.steps.flatMap((s) => s.toolCalls)
		if (toolCalls.length > 0) {
			const canvasResults: string[] = []
			for (const tc of toolCalls) {
				if (tc.toolName === 'delegateToCanvasAgent') {
					const canvasResult = await this.delegateToCanvas(
						(tc as any).input?.instruction ?? (tc as any).args?.instruction ?? '',
					)
					canvasResults.push(canvasResult)
				}
			}

			const followUp = await generateText({
				model,
				system: VOICE_SYSTEM_PROMPT,
				messages: [
					...messages,
					{
						role: 'assistant' as const,
						content: `I performed canvas actions. Results: ${canvasResults.join('; ')}`,
					},
					{
						role: 'user' as const,
						content: 'Summarize what you just did in one brief spoken sentence for the user.',
					},
				],
				temperature: 0.7,
				maxOutputTokens: 128,
				abortSignal: signal,
			})

			return followUp.text || 'Done.'
		}

		return result.text || "I'm sorry, I didn't catch that."
	}

	async synthesize(text: string): Promise<ArrayBuffer> {
		const result = await this.env.AI.run(
			TTS_MODEL as any,
			{
				text,
				speaker: 'asteria',
				encoding: 'mp3',
			} as any,
		)

		if (result instanceof ReadableStream) {
			const reader = (result as ReadableStream<Uint8Array>).getReader()
			const chunks: Uint8Array[] = []
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				if (value) chunks.push(value)
			}
			const total = chunks.reduce((sum, c) => sum + c.length, 0)
			const merged = new Uint8Array(total)
			let offset = 0
			for (const chunk of chunks) {
				merged.set(chunk, offset)
				offset += chunk.length
			}
			return merged.buffer as ArrayBuffer
		}

		if (result instanceof ArrayBuffer) return result
		if (result instanceof Uint8Array) return result.buffer as ArrayBuffer

		throw new Error('Unexpected TTS response format')
	}

	async delegateToCanvas(instruction: string): Promise<string> {
		try {
			const id = this.env.AGENT_DURABLE_OBJECT.idFromName('anonymous')
			const stub = this.env.AGENT_DURABLE_OBJECT.get(id)

			const minimalPrompt = {
				mode: {
					type: 'mode',
					modeType: 'emotions-map',
					actionTypes: [
						'message',
						'think',
						'create',
						'delete',
						'update',
						'move',
						'fill_cell',
						'highlight_cell',
						'detect_conflict',
					],
					partTypes: ['messages', 'mode'],
				},
				messages: {
					type: 'messages',
					messages: [
						{
							role: 'user',
							content: instruction,
						},
					],
				},
			}

			const response = await stub.fetch('https://internal/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(minimalPrompt),
			})

			const text = await response.text()
			const lines = text.split('\n\n').filter((l) => l.startsWith('data: '))
			const actions: string[] = []

			for (const line of lines) {
				try {
					const data = JSON.parse(line.replace('data: ', ''))
					if (data.error) return `Error: ${data.error}`
					if (data._type === 'message' && data.message) {
						actions.push(data.message)
					} else if (data._type && data.complete) {
						actions.push(`${data._type} action completed`)
					}
				} catch {
					// skip unparseable lines
				}
			}

			return actions.length > 0 ? actions.join('. ') : 'Canvas action completed.'
		} catch (error: any) {
			console.error('Canvas delegation error:', error)
			return `Canvas action failed: ${error?.message ?? 'unknown error'}`
		}
	}
}
