import { type FormEventHandler, useEffect, useRef, useState } from 'react'
import { useValue } from 'tldraw'
import { BrainIcon } from '../../shared/icons/BrainIcon'
import { ChevronDownIcon } from '../../shared/icons/ChevronDownIcon'
import {
	AGENT_MODEL_DEFINITIONS,
	type AgentModelDefinition,
	type AgentModelName,
} from '../../shared/models'
import { getContextItemKey } from '../../shared/types/ContextItem'
import type { VoiceState } from '../../shared/types/VoiceTypes'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ContextItemTag } from './ContextItemTag'
import { SelectionTag } from './SelectionTag'
import { MicIcon } from './VoiceControl'

function useAvailableModels(): AgentModelDefinition[] {
	const [models, setModels] = useState(() => Object.values(AGENT_MODEL_DEFINITIONS))

	useEffect(() => {
		fetch('/models')
			.then((res) => res.json())
			.then((data: unknown) => {
				if (Array.isArray(data) && data.length > 0) {
					setModels(data)
				}
			})
			.catch(() => {
				// Fall back to all models on error
			})
	}, [])

	return models
}

function AttachmentIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
			<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
		</svg>
	)
}

function SourcesIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="12" cy="12" r="10" />
			<path d="m4.93 4.93 4.24 4.24" />
			<path d="m14.83 9.17 4.24-4.24" />
			<path d="m14.83 14.83 4.24 4.24" />
			<path d="m9.17 14.83-4.24 4.24" />
			<circle cx="12" cy="12" r="4" />
		</svg>
	)
}

function ArrowUpIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
			<path d="m5 12 7-7 7 7" />
			<path d="M12 19V5" />
		</svg>
	)
}

function StopIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<rect x="4" y="4" width="16" height="16" rx="2" />
		</svg>
	)
}

function QuickActionPills() {
	return (
		<div className="chat-quick-actions">
			<button type="button" className="chat-quick-action-pill">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
					<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
				</svg>
				<span>Draw</span>
			</button>
			<button type="button" className="chat-quick-action-pill">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
					<path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
				</svg>
				<span>Brainstorm</span>
			</button>
			<button type="button" className="chat-quick-action-pill">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
					<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
				</svg>
				<span>Explore</span>
			</button>
			<button type="button" className="chat-quick-action-pill chat-quick-action-pill--icon-only" aria-label="More actions">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
					<path d="m18 15-6-6-6 6" />
				</svg>
			</button>
		</div>
	)
}

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

	const selectedShapes = useValue('selectedShapes', () => editor.getSelectedShapes(), [editor])
	const contextItems = useValue('contextItems', () => agent.context.getItems(), [agent])
	const modelName = useValue('modelName', () => agent.modelName.getModelName(), [agent])
	const availableModels = useAvailableModels()

	const hasText = inputValue.trim() !== ''
	const showSendButton = hasText || isGenerating
	const hasContextTags = selectedShapes.length > 0 || contextItems.length > 0

	return (
		<div className="chat-input">
			<form
				onSubmit={(e) => {
					e.preventDefault()
					setInputValue('')
					handleSubmit(e)
				}}
			>
				{/* Context tags */}
				{hasContextTags && (
					<div className="prompt-tags">
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
				)}

				{/* Quick action pills */}
				<QuickActionPills />

				{/* Input box */}
				<div className="chat-input-box">
					<div className="chat-input-box-border" />
					<div className="chat-input-box-inner">
						{/* Text area */}
						<div className="chat-input-textarea-wrap">
							<textarea
								ref={inputRef}
								name="input"
								autoComplete="off"
								placeholder="Select shapes or ask Iris anything"
								value={inputValue}
								onInput={(e) => setInputValue(e.currentTarget.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault()
										const form = e.currentTarget.closest('form')
										if (form) {
											form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
										}
									}
								}}
							/>
						</div>

						{/* Bottom controls */}
						<div className="chat-input-controls">
							<div className="chat-input-controls-left">
								{/* Attachment button */}
								<button type="button" className="chat-input-icon-btn" aria-label="Attach file">
									<AttachmentIcon />
								</button>
								{/* Sources button */}
								<button type="button" className="chat-input-sources-btn">
									<SourcesIcon />
									<span>All sources</span>
								</button>
							</div>
							<div className="chat-input-controls-right">
								{/* Model selector */}
								<div className="chat-model-select">
									<div className="chat-model-select-label">
										<BrainIcon /> {modelName}
									</div>
									<select
										value={modelName}
										onChange={(e) => agent.modelName.setModelName(e.target.value as AgentModelName)}
									>
										{availableModels.map((model) => (
											<option key={model.name} value={model.name}>
												{model.name}
											</option>
										))}
									</select>
									<ChevronDownIcon />
								</div>
								{/* Submit / Mic / Stop button */}
								{showSendButton ? (
									<button
										type="submit"
										className="chat-input-submit-btn"
										disabled={!hasText && !isGenerating}
										aria-label={isGenerating && !hasText ? 'Stop generating' : 'Send message'}
									>
										{isGenerating && !hasText ? <StopIcon /> : <ArrowUpIcon />}
									</button>
								) : (
									<button
										type="button"
										className={`chat-input-icon-btn chat-input-mic-btn ${isListening ? 'chat-input-mic-btn--active' : ''} ${voiceState === 'transcribing' || voiceState === 'thinking' ? 'chat-input-mic-btn--processing' : ''}`}
										onClick={onMicClick}
										aria-label={isListening ? 'Stop listening' : 'Start voice input'}
									>
										<MicIcon state={voiceState} isListening={isListening} />
									</button>
								)}
							</div>
						</div>
					</div>
				</div>
			</form>
		</div>
	)
}
