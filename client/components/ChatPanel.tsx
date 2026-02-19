import { type FormEventHandler, useCallback, useRef } from 'react'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ChatInput } from './ChatInput'
import { ChatHistory } from './chat-history/ChatHistory'
import { ProgressIndicator } from './ProgressIndicator'
import { TodoList } from './TodoList'
import { useVoice } from './VoiceControl'

export function ChatPanel({
	filledCells,
	totalCells,
	onExport,
}: {
	filledCells: number
	totalCells: number
	onExport: () => void
}) {
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

	const handleNewChat = useCallback(() => {
		agent.reset()
	}, [agent])

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<ProgressIndicator filledCells={filledCells} totalCells={totalCells} onExport={onExport} />
				<button type="button" className="new-chat-button" onClick={handleNewChat}>
					+
				</button>
			</div>
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
