import { type FormEventHandler, useCallback, useRef } from 'react'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ChatInput } from './ChatInput'
import { ChatHistory } from './chat-history/ChatHistory'
import { TodoList } from './TodoList'
import { useVoice } from './VoiceControl'

export function ChatPanel() {
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const { voiceState, isListening, errorMsg, toggleListening } = useVoice(agent)

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
		<div className="chat-panel tl-theme__light">
			<ChatHistory agent={agent} />
			<div className="chat-input-container">
				<TodoList agent={agent} />
				<ChatInput
					handleSubmit={handleSubmit}
					inputRef={inputRef}
					voiceState={voiceState}
					isListening={isListening}
					onMicClick={toggleListening}
				/>
				{errorMsg && (
					<div className="voice-error" role="alert">
						{errorMsg}
					</div>
				)}
			</div>
		</div>
	)
}
