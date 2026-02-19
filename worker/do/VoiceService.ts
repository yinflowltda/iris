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

	get ttsEnabled(): boolean {
		return this.env.TTS_ENABLED === 'true'
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
		const thinkResult = await this.think(updatedHistory, signal)
		const audioResponse = this.ttsEnabled ? await this.synthesize(thinkResult.responseText) : null

		return {
			transcript,
			responseText: thinkResult.responseText,
			audioResponse,
			canvasInstruction: thinkResult.canvasInstruction,
		}
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

	async think(
		history: VoiceMessage[],
		signal: AbortSignal,
	): Promise<{ responseText: string; canvasInstruction: string | null }> {
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
			const instructions: string[] = []
			for (const tc of toolCalls) {
				if (tc.toolName === 'delegateToCanvasAgent') {
					const instruction = (tc as any).input?.instruction ?? (tc as any).args?.instruction ?? ''
					if (instruction) instructions.push(instruction)
				}
			}

			const canvasInstruction = instructions.join('. ') || null
			const responseText = result.text || "I'll do that for you."

			return { responseText, canvasInstruction }
		}

		return {
			responseText: result.text || "I'm sorry, I didn't catch that.",
			canvasInstruction: null,
		}
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
}
