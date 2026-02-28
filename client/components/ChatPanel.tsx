import { type FormEventHandler, useCallback, useRef } from 'react'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ChatInput } from './ChatInput'
import { ChatHistory } from './chat-history/ChatHistory'
import { TodoList } from './TodoList'
import { useVoice } from './VoiceControl'

export function ChatPanel({ inputRef }: { inputRef?: React.RefObject<HTMLTextAreaElement | null> }) {
	const agent = useAgent()
	const localRef = useRef<HTMLTextAreaElement>(null)
	const effectiveRef = inputRef ?? localRef
	const { voiceState, isListening, toggleListening } = useVoice(agent)

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!effectiveRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			if (value === '') {
				agent.cancel()
				return
			}

			effectiveRef.current.value = ''

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
					inputRef={effectiveRef}
					voiceState={voiceState}
					isListening={isListening}
					onMicClick={toggleListening}
				/>
			</div>
		</div>
	)
}
