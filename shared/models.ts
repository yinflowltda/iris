export type AgentModelName = keyof typeof AGENT_MODEL_DEFINITIONS
export type AgentModelProvider = 'workersai'

export interface AgentModelDefinition {
	name: AgentModelName
	id: string
	provider: AgentModelProvider
}

export const AGENT_MODEL_DEFINITIONS = {
	'@cf/openai/gpt-oss-120b': {
		name: '@cf/openai/gpt-oss-120b',
		id: '@cf/openai/gpt-oss-120b',
		provider: 'workersai',
	},

	'@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
		name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
		id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
		provider: 'workersai',
	},
} as const

export const DEFAULT_MODEL_NAME: AgentModelName = '@cf/openai/gpt-oss-120b'

/**
 * Check if a string is a valid AgentModelName.
 */
export function isValidModelName(value: string | undefined): value is AgentModelName {
	return !!value && value in AGENT_MODEL_DEFINITIONS
}

/**
 * Get the full information about a model from its name.
 * @param modelName - The name of the model.
 * @returns The full definition of the model.
 */
export function getAgentModelDefinition(modelName: AgentModelName): AgentModelDefinition {
	const definition = AGENT_MODEL_DEFINITIONS[modelName]
	if (!definition) {
		throw new Error(`Model ${modelName} not found`)
	}
	return definition
}
