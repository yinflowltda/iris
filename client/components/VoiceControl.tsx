import { useCallback, useEffect, useRef, useState } from 'react'
import type {
	ChatHistoryActionItem,
	ChatHistoryPromptItem,
} from '../../shared/types/ChatHistoryItem'
import type { VoiceState } from '../../shared/types/VoiceTypes'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { VoiceClient } from '../lib/voice-client'

export function useVoice(agent: TldrawAgent) {
	const clientRef = useRef<VoiceClient | null>(null)
	const [voiceState, setVoiceState] = useState<VoiceState>('idle')
	const [isListening, setIsListening] = useState(false)
	const [errorMsg, setErrorMsg] = useState<string | null>(null)

	useEffect(() => {
		const client = new VoiceClient()
		clientRef.current = client

		const unsubs = [
			client.on('status', (state) => {
				setVoiceState(state)
			}),
			client.on('connected', () => {
				setErrorMsg(null)
			}),
			client.on('disconnected', () => {
				setIsListening(false)
			}),
			client.on('transcript', ({ role, text }) => {
				if (role === 'user') {
					const promptItem: ChatHistoryPromptItem = {
						type: 'prompt',
						promptSource: 'user',
						agentFacingMessage: text,
						userFacingMessage: text,
						contextItems: [],
						selectedShapes: [],
					}
					agent.chat.push(promptItem)
				} else {
					const actionItem: ChatHistoryActionItem = {
						type: 'action',
						action: {
							_type: 'message',
							text,
							complete: true,
							time: 0,
						} as any,
						diff: { added: {}, updated: {}, removed: {} } as any,
						acceptance: 'accepted',
					}
					agent.chat.push(actionItem)
				}
			}),
			client.on('canvas.action', ({ instruction }) => {
				if (!instruction) return
				agent.interrupt({
					input: {
						agentMessages: [instruction],
						bounds: agent.editor.getViewportPageBounds(),
						source: 'user',
						contextItems: agent.context.getItems(),
					},
				})
			}),
			client.on('error', (msg) => {
				setErrorMsg(msg)
				setTimeout(() => setErrorMsg(null), 5000)
			}),
		]

		return () => {
			for (const unsub of unsubs) unsub()
			client.destroy()
			clientRef.current = null
		}
	}, [agent])

	const toggleListening = useCallback(async () => {
		const client = clientRef.current
		if (!client) return

		if (isListening) {
			client.stopListening()
			setIsListening(false)
		} else {
			try {
				await client.startListening()
				setIsListening(true)
			} catch {
				// error emitted via event
			}
		}
	}, [isListening])

	return { voiceState, isListening, errorMsg, toggleListening }
}

export function MicIcon({ state, isListening }: { state: VoiceState; isListening: boolean }) {
	if (state === 'speaking') {
		return (
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M3 10h2v4H3zm4-3h2v10H7zm4-4h2v18h-2zm4 4h2v10h-2zm4 3h2v4h-2z"
					fill="currentColor"
				/>
			</svg>
		)
	}

	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"
				fill={isListening ? 'currentColor' : 'none'}
				stroke="currentColor"
				strokeWidth="2"
			/>
			<path
				d="M19 10v2a7 7 0 0 1-14 0v-2"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<path d="M12 19v4m-4 0h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	)
}
