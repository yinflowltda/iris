import type { TodoListPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { AgentHelpers } from '../AgentHelpers'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const TodoListPartUtil = registerPromptPartUtil(
	class TodoListPartUtil extends PromptPartUtil<TodoListPart> {
		static override type = 'todoList' as const

		override getPart(_request: AgentRequest, _helpers: AgentHelpers): TodoListPart {
			return {
				type: 'todoList',
				items: this.agent.todos.getTodos(),
			}
		}
	},
)
