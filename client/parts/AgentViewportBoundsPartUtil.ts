import type { AgentViewportBoundsPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { AgentHelpers } from '../AgentHelpers'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const AgentViewportBoundsPartUtil = registerPromptPartUtil(
	class AgentViewportBoundsPartUtil extends PromptPartUtil<AgentViewportBoundsPart> {
		static override type = 'agentViewportBounds' as const

		override getPart(request: AgentRequest, helpers: AgentHelpers): AgentViewportBoundsPart {
			const offsetAgentBounds = helpers.applyOffsetToBox(request.bounds)

			return {
				type: 'agentViewportBounds',
				agentBounds: helpers.roundBox(offsetAgentBounds),
			}
		}
	},
)
