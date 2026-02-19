import type { Editor } from 'tldraw'
import type { ChatHistoryPromptItem } from '../../../shared/types/ChatHistoryItem'
import { getContextItemKey } from '../../../shared/types/ContextItem'
import { ContextItemTag } from '../ContextItemTag'
import { SelectionTag } from '../SelectionTag'

export function ChatHistoryPrompt({
	item,
	editor,
}: {
	item: ChatHistoryPromptItem
	editor: Editor
}) {
	const { contextItems, agentFacingMessage, userFacingMessage, selectedShapes, promptSource } = item

	const showTags = selectedShapes.length > 0 || contextItems.length > 0

	// Display the user-facing message if available, otherwise fall back to the agent-facing message
	const displayMessage = userFacingMessage ?? agentFacingMessage

	// Get the CSS class modifier based on the prompt source
	const sourceClass = `chat-history-prompt-${promptSource}`

	return (
		<div className="chat-history-prompt-container">
			<div className={`chat-history-prompt ${sourceClass}`}>
				{showTags && (
					<div className="prompt-tags">
						{selectedShapes.length > 0 && <SelectionTag />}
						{contextItems.map((contextItem) => (
							<ContextItemTag
								editor={editor}
								key={getContextItemKey(contextItem)}
								item={contextItem}
							/>
						))}
					</div>
				)}
				<span className="chat-history-prompt-content">{displayMessage}</span>
			</div>
		</div>
	)
}
