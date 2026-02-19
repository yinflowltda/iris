export type VoiceClientMessage =
	| { type: 'session.start' }
	| { type: 'audio.start' }
	| { type: 'audio.stop' }
	| { type: 'interrupt' }
	| { type: 'session.end' }

export type VoiceServerMessage =
	| { type: 'status'; state: VoiceState }
	| { type: 'transcript'; role: 'user' | 'assistant'; text: string }
	| { type: 'canvas.action'; instruction: string; result: string }
	| { type: 'error'; message: string }

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

export interface VoiceMessage {
	role: 'user' | 'assistant'
	content: string
}

export interface VoiceProcessResult {
	transcript: string
	responseText: string
	audioResponse: ArrayBuffer
}
