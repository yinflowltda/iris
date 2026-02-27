import type { SessionStatePart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { getActiveMandala } from '../lib/frameworks/active-framework'
import { inferSessionState } from '../lib/frameworks/session-state'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const SessionStatePartUtil = registerPromptPartUtil(
	class SessionStatePartUtil extends PromptPartUtil<SessionStatePart> {
		static override type = 'sessionState' as const

		override getPart(_request: AgentRequest): SessionStatePart {
			const mandala = getActiveMandala(this.agent.editor)
			if (!mandala) return null as unknown as SessionStatePart

			// Only emit session state for emotions-map framework
			if (mandala.props.frameworkId !== 'emotions-map') return null as unknown as SessionStatePart

			return inferSessionState(mandala.props.state)
		}
	},
)
