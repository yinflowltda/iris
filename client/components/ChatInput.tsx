import { type FormEventHandler, useState } from 'react'
import { type Editor, useValue } from 'tldraw'
import { AtIcon } from '../../shared/icons/AtIcon'
import { BrainIcon } from '../../shared/icons/BrainIcon'
import { ChevronDownIcon } from '../../shared/icons/ChevronDownIcon'
import { AGENT_MODEL_DEFINITIONS, type AgentModelName } from '../../shared/models'
import { getContextItemKey } from '../../shared/types/ContextItem'
import type { VoiceState } from '../../shared/types/VoiceTypes'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ContextItemTag } from './ContextItemTag'
import { SelectionTag } from './SelectionTag'
import { MicIcon } from './VoiceControl'

export function ChatInput({
	handleSubmit,
	inputRef,
	voiceState,
	isListening,
	onMicClick,
}: {
	handleSubmit: FormEventHandler<HTMLFormElement>
	inputRef: React.RefObject<HTMLTextAreaElement | null>
	voiceState: VoiceState
	isListening: boolean
	onMicClick: () => void
}) {
	const agent = useAgent()
	const { editor } = agent
	const [inputValue, setInputValue] = useState('')
	const isGenerating = useValue('isGenerating', () => agent.requests.isGenerating(), [agent])

	const isContextToolActive = useValue('isContextToolActive', () => {
		const tool = editor.getCurrentTool()
		return tool.id === 'target-shape' || tool.id === 'target-area'
	}, [editor])

	const selectedShapes = useValue('selectedShapes', () => editor.getSelectedShapes(), [editor])
	const contextItems = useValue('contextItems', () => agent.context.getItems(), [agent])
	const modelName = useValue('modelName', () => agent.modelName.getModelName(), [agent])

	const hasText = inputValue.trim() !== ''
	const showSendButton = hasText || isGenerating

	return (
		<div className="chat-input">
			<form
				onSubmit={(e) => {
					e.preventDefault()
					setInputValue('')
					handleSubmit(e)
				}}
			>
				<div className="prompt-tags">
					<div className={`chat-context-select ${isContextToolActive ? 'active' : ''}`}>
						<div className="chat-context-select-label">
							<AtIcon /> Add Context
						</div>
						<select
							id="chat-context-select"
							value=" "
							onChange={(e) => {
								const action = ADD_CONTEXT_ACTIONS.find((action) => action.name === e.target.value)
								if (action) action.onSelect(editor)
							}}
						>
							{ADD_CONTEXT_ACTIONS.map((action) => {
								return (
									<option key={action.name} value={action.name}>
										{action.name}
									</option>
								)
							})}
						</select>
					</div>
					{selectedShapes.length > 0 && <SelectionTag onClick={() => editor.selectNone()} />}
					{contextItems.map((item) => (
						<ContextItemTag
							editor={editor}
							onClick={() => agent.context.remove(item)}
							key={getContextItemKey(item)}
							item={item}
						/>
					))}
				</div>

				<textarea
					ref={inputRef}
					name="input"
					autoComplete="off"
					placeholder="Ask, learn, brainstorm, draw"
					value={inputValue}
					onInput={(e) => setInputValue(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							const form = e.currentTarget.closest('form')
							if (form) {
								const submitEvent = new Event('submit', {
									bubbles: true,
									cancelable: true,
								})
								form.dispatchEvent(submitEvent)
							}
						}
					}}
				/>
				<span className="chat-actions">
					<div className="chat-actions-left">
						<div className="chat-model-select">
							<div className="chat-model-select-label">
								<BrainIcon /> {modelName}
							</div>
							<select
								value={modelName}
								onChange={(e) => agent.modelName.setModelName(e.target.value as AgentModelName)}
							>
								{Object.values(AGENT_MODEL_DEFINITIONS).map((model) => (
									<option key={model.name} value={model.name}>
										{model.name}
									</option>
								))}
							</select>
							<ChevronDownIcon />
						</div>
					</div>
					{showSendButton ? (
						<button
							type="submit"
							className="chat-input-submit"
							disabled={!hasText && !isGenerating}
						>
							{isGenerating && !hasText ? '◼' : '⬆'}
						</button>
					) : (
						<button
							type="button"
							className={`chat-input-submit chat-input-mic ${isListening ? 'chat-input-mic--active' : ''} ${voiceState === 'transcribing' || voiceState === 'thinking' ? 'chat-input-mic--processing' : ''}`}
							onClick={onMicClick}
							aria-label={isListening ? 'Stop listening' : 'Start voice input'}
						>
							<MicIcon state={voiceState} isListening={isListening} />
						</button>
					)}
				</span>
			</form>
		</div>
	)
}

const ADD_CONTEXT_ACTIONS = [
	{
		name: 'Pick Shapes',
		onSelect: (editor: Editor) => {
			editor.setCurrentTool('target-shape')
			editor.focus()
		},
	},
	{
		name: 'Pick Area',
		onSelect: (editor: Editor) => {
			editor.setCurrentTool('target-area')
			editor.focus()
		},
	},
	{
		name: ' ',
		onSelect: (editor: Editor) => {
			const currentTool = editor.getCurrentTool()
			if (currentTool.id === 'target-area' || currentTool.id === 'target-shape') {
				editor.setCurrentTool('select')
			}
		},
	},
]
