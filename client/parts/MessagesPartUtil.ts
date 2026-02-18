import type { MessagesPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const MessagesPartUtil = registerPromptPartUtil(
	class MessagesPartUtil extends PromptPartUtil<MessagesPart> {
		static override type = 'messages' as const

		override getPart(request: AgentRequest): MessagesPart {
			const { agentMessages, source } = request
			return {
				type: 'messages',
				agentMessages,
				requestSource: source,
			}
		}
	},
)
