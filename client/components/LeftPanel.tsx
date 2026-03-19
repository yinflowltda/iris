// client/components/LeftPanel.tsx
import { useCallback, useEffect } from 'react'
import { useValue } from 'tldraw'
import type { FormEventHandler } from 'react'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { PanelHeader } from './PanelHeader'
import { ToolRail } from './ToolRail'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'
import { useVoice } from './VoiceControl'
import './LeftPanel.css'

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

export function LeftPanel({
	panelOpen,
	onTogglePanel,
	onOpenFLSettings,
	onMandalaToolSelect,
	inputRef,
}: {
	panelOpen: boolean
	onTogglePanel: () => void
	onOpenFLSettings: () => void
	onMandalaToolSelect: () => void
	inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
	const agent = useAgent()
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
		[agent, inputRef],
	)

	// Keyboard shortcut: Cmd+\ to toggle panel
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
				e.preventDefault()
				onTogglePanel()
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [onTogglePanel])

	return (
		<div className={`left-panel${panelOpen ? '' : ' left-panel--collapsed'}`}>
			{/* Chat section (collapsible) */}
			{panelOpen && (
				<div className="left-panel-chat tl-theme__dark">
					<PanelHeader onOpenFLSettings={onOpenFLSettings} />

					{/* Mobile-only: horizontal tool strip */}
					<div className="left-panel-tools-mobile">
						<ToolRail
							panelOpen={panelOpen}
							onTogglePanel={onTogglePanel}
							onMandalaToolSelect={onMandalaToolSelect}
						/>
					</div>

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
			)}

			{/* Tool rail (always visible, desktop only) */}
			<div className="left-panel-tools-desktop">
				<ToolRail
					panelOpen={panelOpen}
					onTogglePanel={onTogglePanel}
					onMandalaToolSelect={onMandalaToolSelect}
				/>
			</div>
		</div>
	)
}
