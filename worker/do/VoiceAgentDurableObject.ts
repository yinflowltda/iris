import { DurableObject } from 'cloudflare:workers'
import type {
	VoiceClientMessage,
	VoiceMessage,
	VoiceServerMessage,
	VoiceState,
} from '../../shared/types/VoiceTypes'
import type { Environment } from '../environment'
import { VoiceService } from './VoiceService'

export class VoiceAgentDurableObject extends DurableObject<Environment> {
	private service: VoiceService
	private audioChunks: Uint8Array[] = []
	private conversationHistory: VoiceMessage[] = []
	private currentAbort: AbortController | null = null
	private state: VoiceState = 'idle'

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		this.service = new VoiceService(env)
	}

	override async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get('Upgrade')
		if (upgradeHeader !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 })
		}

		const pair = new WebSocketPair()
		const [client, server] = [pair[0], pair[1]]

		this.ctx.acceptWebSocket(server)

		return new Response(null, { status: 101, webSocket: client })
	}

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (message instanceof ArrayBuffer) {
			if (this.state === 'listening') {
				this.audioChunks.push(new Uint8Array(message))
			}
			return
		}

		try {
			const msg = JSON.parse(message) as VoiceClientMessage

			switch (msg.type) {
				case 'session.start':
					this.conversationHistory = []
					this.audioChunks = []
					this.sendToClient(ws, { type: 'status', state: 'idle' })
					break

				case 'audio.start':
					this.audioChunks = []
					this.updateState(ws, 'listening')
					break

				case 'audio.stop':
					await this.processAudio(ws)
					break

				case 'interrupt':
					this.handleInterrupt(ws)
					break

				case 'session.end':
					this.conversationHistory = []
					this.audioChunks = []
					this.currentAbort?.abort()
					this.currentAbort = null
					this.updateState(ws, 'idle')
					break
			}
		} catch (error: any) {
			console.error('WebSocket message error:', error)
			this.sendToClient(ws, {
				type: 'error',
				message: error?.message ?? 'Failed to process message',
			})
		}
	}

	override async webSocketClose(
		ws: WebSocket,
		code: number,
		_reason: string,
		_wasClean: boolean,
	): Promise<void> {
		this.currentAbort?.abort()
		this.currentAbort = null
		this.audioChunks = []
		ws.close(code, 'Durable Object is closing WebSocket')
	}

	override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		console.error('WebSocket error:', error)
		this.currentAbort?.abort()
		this.currentAbort = null
		ws.close(1011, 'WebSocket error')
	}

	private async processAudio(ws: WebSocket): Promise<void> {
		if (this.audioChunks.length === 0) {
			this.updateState(ws, 'idle')
			return
		}

		const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
		const merged = new Uint8Array(totalLength)
		let offset = 0
		for (const chunk of this.audioChunks) {
			merged.set(chunk, offset)
			offset += chunk.length
		}
		this.audioChunks = []

		this.currentAbort?.abort()
		const abort = new AbortController()
		this.currentAbort = abort

		try {
			this.updateState(ws, 'transcribing')

			const result = await this.service.process(merged, this.conversationHistory, abort.signal)

			if (abort.signal.aborted) return

			this.sendToClient(ws, { type: 'transcript', role: 'user', text: result.transcript })

			this.updateState(ws, 'speaking')
			this.sendToClient(ws, {
				type: 'transcript',
				role: 'assistant',
				text: result.responseText,
			})

			ws.send(result.audioResponse)

			this.conversationHistory.push(
				{ role: 'user', content: result.transcript },
				{ role: 'assistant', content: result.responseText },
			)

			if (this.conversationHistory.length > 20) {
				this.conversationHistory = this.conversationHistory.slice(-20)
			}

			this.updateState(ws, 'idle')
		} catch (error: any) {
			if (abort.signal.aborted) return
			console.error('Process audio error:', error)
			this.sendToClient(ws, {
				type: 'error',
				message: error?.message ?? 'Failed to process audio',
			})
			this.updateState(ws, 'idle')
		} finally {
			if (this.currentAbort === abort) {
				this.currentAbort = null
			}
		}
	}

	private handleInterrupt(ws: WebSocket): void {
		if (this.currentAbort) {
			this.currentAbort.abort()
			this.currentAbort = null
		}
		this.audioChunks = []
		this.updateState(ws, 'idle')
	}

	private updateState(ws: WebSocket, newState: VoiceState): void {
		this.state = newState
		this.sendToClient(ws, { type: 'status', state: newState })
	}

	private sendToClient(ws: WebSocket, message: VoiceServerMessage): void {
		try {
			ws.send(JSON.stringify(message))
		} catch {
			// WebSocket may be closed
		}
	}
}
