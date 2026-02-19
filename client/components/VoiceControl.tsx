import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceState } from '../../shared/types/VoiceTypes'
import { VoiceClient, type VoiceMode } from '../lib/voice-client'

interface VoiceTranscriptEntry {
	role: 'user' | 'assistant'
	text: string
	timestamp: number
}

export const VoiceControl = memo(function VoiceControl() {
	const clientRef = useRef<VoiceClient | null>(null)
	const [voiceState, setVoiceState] = useState<VoiceState>('idle')
	const [isConnected, setIsConnected] = useState(false)
	const [isListening, setIsListening] = useState(false)
	const [mode, setMode] = useState<VoiceMode>('toggle')
	const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>([])
	const [errorMsg, setErrorMsg] = useState<string | null>(null)
	const [showTranscript, setShowTranscript] = useState(false)
	const transcriptEndRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const client = new VoiceClient()
		clientRef.current = client

		const unsubs = [
			client.on('status', (state) => {
				setVoiceState(state)
			}),
			client.on('connected', () => {
				setIsConnected(true)
				setErrorMsg(null)
			}),
			client.on('disconnected', () => {
				setIsConnected(false)
				setIsListening(false)
			}),
			client.on('transcript', ({ role, text }) => {
				setTranscript((prev) => [...prev.slice(-49), { role, text, timestamp: Date.now() }])
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
	}, [])

	const transcriptLength = transcript.length
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll must fire when transcript changes
	useEffect(() => {
		transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [transcriptLength])

	const handleToggleClick = useCallback(async () => {
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

	const handlePushDown = useCallback(async () => {
		const client = clientRef.current
		if (!client) return
		try {
			await client.startListening()
			setIsListening(true)
		} catch {
			// error emitted via event
		}
	}, [])

	const handlePushUp = useCallback(() => {
		const client = clientRef.current
		if (!client) return
		client.stopListening()
		setIsListening(false)
	}, [])

	const toggleMode = useCallback(() => {
		setMode((prev) => (prev === 'push' ? 'toggle' : 'push'))
	}, [])

	const buttonClass = [
		'voice-button',
		`voice-button--${voiceState}`,
		isListening ? 'voice-button--active' : '',
		!isConnected && voiceState === 'idle' ? 'voice-button--disconnected' : '',
	]
		.filter(Boolean)
		.join(' ')

	const stateLabel = {
		idle: 'Voice',
		listening: 'Listening...',
		transcribing: 'Processing...',
		thinking: 'Thinking...',
		speaking: 'Speaking...',
	}[voiceState]

	return (
		<div className="voice-control">
			<div className="voice-control__top">
				{mode === 'toggle' ? (
					<button
						type="button"
						className={buttonClass}
						onClick={handleToggleClick}
						aria-label={isListening ? 'Stop listening' : 'Start listening'}
						title={stateLabel}
					>
						<MicIcon state={voiceState} isListening={isListening} />
					</button>
				) : (
					<button
						type="button"
						className={buttonClass}
						onPointerDown={handlePushDown}
						onPointerUp={handlePushUp}
						onPointerLeave={handlePushUp}
						aria-label="Hold to talk"
						title={stateLabel}
					>
						<MicIcon state={voiceState} isListening={isListening} />
					</button>
				)}

				<button
					type="button"
					className="voice-mode-toggle"
					onClick={toggleMode}
					title={mode === 'push' ? 'Push-to-Talk mode' : 'Toggle mode'}
					aria-label={`Switch to ${mode === 'push' ? 'toggle' : 'push-to-talk'} mode`}
				>
					{mode === 'push' ? 'PTT' : 'TOG'}
				</button>

				{transcript.length > 0 && (
					<button
						type="button"
						className="voice-transcript-toggle"
						onClick={() => setShowTranscript((s) => !s)}
						title={showTranscript ? 'Hide transcript' : 'Show transcript'}
						aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
					>
						<TranscriptIcon />
					</button>
				)}
			</div>

			{errorMsg && (
				<div className="voice-error" role="alert">
					{errorMsg}
				</div>
			)}

			{showTranscript && transcript.length > 0 && (
				<div className="voice-transcript">
					{transcript.map((entry) => (
						<div
							key={`${entry.timestamp}-${entry.role}`}
							className={`voice-transcript__entry voice-transcript__entry--${entry.role}`}
						>
							<span className="voice-transcript__role">
								{entry.role === 'user' ? 'You' : 'Iris'}
							</span>
							<span className="voice-transcript__text">{entry.text}</span>
						</div>
					))}
					<div ref={transcriptEndRef} />
				</div>
			)}
		</div>
	)
})

function MicIcon({ state, isListening }: { state: VoiceState; isListening: boolean }) {
	if (state === 'speaking') {
		return (
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M3 10h2v4H3zm4-3h2v10H7zm4-4h2v18h-2zm4 4h2v10h-2zm4 3h2v4h-2z"
					fill="currentColor"
				/>
			</svg>
		)
	}

	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function TranscriptIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}
