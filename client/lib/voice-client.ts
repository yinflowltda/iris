import type {
	VoiceClientMessage,
	VoiceServerMessage,
	VoiceState,
} from '../../shared/types/VoiceTypes'

export type VoiceMode = 'push' | 'toggle'

export interface VoiceClientEvents {
	status: VoiceState
	transcript: { role: 'user' | 'assistant'; text: string }
	'canvas.action': { instruction: string; result: string }
	error: string
	connected: undefined
	disconnected: undefined
}

type VoiceEventCallback<K extends keyof VoiceClientEvents> = (data: VoiceClientEvents[K]) => void

export class VoiceClient {
	private ws: WebSocket | null = null
	private mediaStream: MediaStream | null = null
	private mediaRecorder: MediaRecorder | null = null
	private audioContext: AudioContext | null = null
	private currentSource: AudioBufferSourceNode | null = null
	private listeners = new Map<string, Set<(...args: any[]) => void>>()

	private _state: VoiceState = 'idle'
	private _isConnected = false
	private _isListening = false
	private reconnectAttempts = 0
	private maxReconnectAttempts = 5
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null

	get state(): VoiceState {
		return this._state
	}

	get isConnected(): boolean {
		return this._isConnected
	}

	get isListening(): boolean {
		return this._isListening
	}

	on<K extends keyof VoiceClientEvents>(event: K, callback: VoiceEventCallback<K>): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set())
		}
		const set = this.listeners.get(event)!
		set.add(callback)
		return () => set.delete(callback)
	}

	private emit<K extends keyof VoiceClientEvents>(event: K, data: VoiceClientEvents[K]): void {
		const set = this.listeners.get(event)
		if (set) {
			for (const cb of set) cb(data)
		}
	}

	async connect(): Promise<void> {
		if (this.ws?.readyState === WebSocket.OPEN) return

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		const url = `${protocol}//${window.location.host}/voice`

		return new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(url)
			ws.binaryType = 'arraybuffer'

			ws.onopen = () => {
				this.ws = ws
				this._isConnected = true
				this.reconnectAttempts = 0
				this.send({ type: 'session.start' })
				this.emit('connected', undefined)
				resolve()
			}

			ws.onmessage = (event) => {
				if (event.data instanceof ArrayBuffer) {
					this.handleAudioResponse(event.data)
					return
				}
				try {
					const msg = JSON.parse(event.data) as VoiceServerMessage
					this.handleServerMessage(msg)
				} catch {
					// ignore unparseable messages
				}
			}

			ws.onclose = () => {
				this._isConnected = false
				this._isListening = false
				this.emit('disconnected', undefined)
				this.scheduleReconnect()
			}

			ws.onerror = () => {
				if (!this._isConnected) {
					reject(new Error('WebSocket connection failed'))
				}
			}
		})
	}

	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		this.reconnectAttempts = this.maxReconnectAttempts

		if (this.ws) {
			this.send({ type: 'session.end' })
			this.ws.close(1000)
			this.ws = null
		}

		this.stopMediaStream()
		this.stopPlayback()
		this._isConnected = false
		this._isListening = false
		this._state = 'idle'
	}

	async startListening(): Promise<void> {
		if (this._isListening) return
		if (!this._isConnected) await this.connect()

		if (this._state === 'speaking') {
			this.interrupt()
		}

		try {
			if (!this.mediaStream) {
				this.mediaStream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
					},
				})
			}

			const mimeType = this.getSupportedMimeType()
			this.mediaRecorder = new MediaRecorder(this.mediaStream, {
				mimeType,
				audioBitsPerSecond: 64000,
			})

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
					event.data.arrayBuffer().then((buffer) => {
						this.ws?.send(buffer)
					})
				}
			}

			this.mediaRecorder.start(250)
			this._isListening = true
			this.send({ type: 'audio.start' })
		} catch (error: any) {
			const msg =
				error?.name === 'NotAllowedError'
					? 'Microphone permission denied. Please allow access in your browser settings.'
					: (error?.message ?? 'Failed to start microphone')
			this.emit('error', msg)
			throw new Error(msg)
		}
	}

	stopListening(): void {
		if (!this._isListening) return

		if (this.mediaRecorder?.state === 'recording') {
			this.mediaRecorder.stop()
		}
		this.mediaRecorder = null
		this._isListening = false
		this.send({ type: 'audio.stop' })
	}

	interrupt(): void {
		this.stopPlayback()
		this.send({ type: 'interrupt' })
	}

	private handleServerMessage(msg: VoiceServerMessage): void {
		switch (msg.type) {
			case 'status':
				this._state = msg.state
				this.emit('status', msg.state)
				break
			case 'transcript':
				this.emit('transcript', { role: msg.role, text: msg.text })
				break
			case 'canvas.action':
				this.emit('canvas.action', {
					instruction: msg.instruction,
					result: msg.result,
				})
				break
			case 'error':
				this.emit('error', msg.message)
				break
		}
	}

	private async handleAudioResponse(data: ArrayBuffer): Promise<void> {
		try {
			if (!this.audioContext) {
				this.audioContext = new AudioContext()
			}

			if (this.audioContext.state === 'suspended') {
				await this.audioContext.resume()
			}

			this.stopPlayback()

			const audioBuffer = await this.audioContext.decodeAudioData(data.slice(0))
			const source = this.audioContext.createBufferSource()
			source.buffer = audioBuffer
			source.connect(this.audioContext.destination)
			this.currentSource = source

			source.onended = () => {
				if (this.currentSource === source) {
					this.currentSource = null
				}
			}

			source.start()
		} catch (error) {
			console.error('Audio playback error:', error)
		}
	}

	private stopPlayback(): void {
		if (this.currentSource) {
			try {
				this.currentSource.stop()
			} catch {
				// may already be stopped
			}
			this.currentSource = null
		}
	}

	private stopMediaStream(): void {
		if (this.mediaRecorder?.state === 'recording') {
			this.mediaRecorder.stop()
		}
		this.mediaRecorder = null

		if (this.mediaStream) {
			for (const track of this.mediaStream.getTracks()) {
				track.stop()
			}
			this.mediaStream = null
		}
	}

	private send(msg: VoiceClientMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg))
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) return

		const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
		this.reconnectAttempts++

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			this.connect().catch(() => {
				// reconnect will schedule another attempt
			})
		}, delay)
	}

	private getSupportedMimeType(): string {
		const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
		for (const mime of preferred) {
			if (MediaRecorder.isTypeSupported(mime)) return mime
		}
		return ''
	}

	destroy(): void {
		this.disconnect()
		this.listeners.clear()
		if (this.audioContext) {
			this.audioContext.close()
			this.audioContext = null
		}
	}
}
