import { type FormEventHandler, useCallback, useRef } from 'react'
import { useValue } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ChatInput } from './ChatInput'
import { ChatHistory } from './chat-history/ChatHistory'
import { TodoList } from './TodoList'
import { useVoice } from './VoiceControl'

function ChatHeader() {
	return (
		<div className="chat-header">
			<div className="chat-header-content">
				<span className="chat-header-title">New Chat</span>
				<div className="chat-header-actions">
					{/* Edit icon */}
					<button type="button" className="chat-header-action-btn" aria-label="New chat">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 20h9" />
							<path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z" />
						</svg>
					</button>
					{/* History icon */}
					<button type="button" className="chat-header-action-btn" aria-label="Chat history">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="12" cy="12" r="10" />
							<polyline points="12 6 12 12 16 14" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	)
}

function ChatWelcome() {
	return (
		<div className="chat-welcome-area">
			<div className="chat-welcome">
				<div className="chat-welcome-header">
					<div className="chat-welcome-icon">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
						</svg>
					</div>
					<span className="chat-welcome-title">Hello</span>
				</div>
				<div className="chat-welcome-desc">
					<p>Select shapes or type a prompt, Iris helps you</p>
					<ul>
						<li>Understand your mandala or get insight</li>
						<li>Generate notes or images</li>
						<li>Brainstorm and explore ideas</li>
					</ul>
				</div>
			</div>
		</div>
	)
}

export function ChatPanel() {
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const { voiceState, isListening, toggleListening } = useVoice(agent)

	const historyItems = useValue('chatHistory', () => agent.chat.getHistory(), [agent])
	const hasMessages = historyItems.length > 0

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!inputRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			if (value === '') {
				agent.cancel()
				return
			}

			inputRef.current.value = ''

			agent.interrupt({
				input: {
					agentMessages: [value],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent],
	)

	return (
		<div className="chat-panel tl-theme__dark">
			<ChatHeader />
			{hasMessages ? (
				<ChatHistory agent={agent} />
			) : (
				<ChatWelcome />
			)}
			<div className="chat-input-container">
				<TodoList agent={agent} />
				<ChatInput
					handleSubmit={handleSubmit}
					inputRef={inputRef}
					voiceState={voiceState}
					isListening={isListening}
					onMicClick={toggleListening}
				/>
			</div>
		</div>
	)
}
