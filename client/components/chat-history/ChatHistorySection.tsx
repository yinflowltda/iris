import { SmallSpinner } from '../../../shared/icons/SmallSpinner'
import type {
	ChatHistoryActionItem,
	ChatHistoryContinuationItem,
	ChatHistoryItem,
	ChatHistoryPromptItem,
} from '../../../shared/types/ChatHistoryItem'
import { useAgent } from '../../agent/TldrawAgentAppProvider'
import { ChatHistoryGroup, getActionHistoryGroups } from './ChatHistoryGroup'
import { ChatHistoryPrompt } from './ChatHistoryPrompt'

export interface ChatHistorySection {
	id: string
	prompt: ChatHistoryPromptItem
	items: (ChatHistoryActionItem | ChatHistoryContinuationItem)[]
}

export function ChatHistorySection({
	section,
	loading,
}: {
	section: ChatHistorySection
	loading: boolean
}) {
	const agent = useAgent()
	const actions = section.items.filter((item) => item.type === 'action')
	const groups = getActionHistoryGroups(actions, agent)
	return (
		<div className="chat-history-section">
			<ChatHistoryPrompt item={section.prompt} editor={agent.editor} />
			{groups.map((group) => {
				const first = group.items[0]
				const last = group.items.at(-1)
				const key = `${group.withDiff ? 'diff' : 'nodiff'}:${group.items.length}:${first?.acceptance ?? 'unknown'}:${first?.action.time ?? 0}:${last?.action.time ?? 0}`
				return <ChatHistoryGroup key={key} group={group} />
			})}
			{loading && <SmallSpinner />}
		</div>
	)
}

export function getAgentHistorySections(items: ChatHistoryItem[]): ChatHistorySection[] {
	const sections: ChatHistorySection[] = []

	for (const item of items) {
		if (item.type === 'prompt') {
			// Filter out 'self' prompts from the UI
			if (item.promptSource === 'self') continue
			sections.push({ id: `section-${sections.length}`, prompt: item, items: [] })
			continue
		}

		// Only add to the last section if one exists
		if (sections.length > 0) {
			sections[sections.length - 1].items.push(item)
		}
	}

	return sections
}
