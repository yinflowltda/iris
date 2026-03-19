export type AgentModelProvider = 'workersai' | 'openai-compatible'

export interface AgentModelDefinition {
	name: string
	id: string
	provider: AgentModelProvider
	displayName?: string
}

export const WORKERSAI_MODEL_DEFINITIONS: Record<string, AgentModelDefinition> = {
	'@cf/openai/gpt-oss-120b': {
		name: '@cf/openai/gpt-oss-120b',
		id: '@cf/openai/gpt-oss-120b',
		provider: 'workersai',
	},
	'@cf/qwen/qwen3-30b-a3b-fp8': {
		name: '@cf/qwen/qwen3-30b-a3b-fp8',
		id: '@cf/qwen/qwen3-30b-a3b-fp8',
		provider: 'workersai',
	},
} as const

export const OPENAI_COMPATIBLE_MODEL_DEFINITIONS: Record<string, AgentModelDefinition> = {
	'claude-opus-4': {
		name: 'claude-opus-4',
		id: 'claude-opus-4',
		provider: 'openai-compatible',
	},
	'claude-sonnet-4': {
		name: 'claude-sonnet-4',
		id: 'claude-sonnet-4',
		provider: 'openai-compatible',
	},
} as const

/**
 * All model definitions. In production without an OpenAI-compatible endpoint,
 * the UI should filter to only workersai models. But the full registry lives here.
 */
export const AGENT_MODEL_DEFINITIONS: Record<string, AgentModelDefinition> = {
	...WORKERSAI_MODEL_DEFINITIONS,
	...OPENAI_COMPATIBLE_MODEL_DEFINITIONS,
}

export type AgentModelName = keyof typeof AGENT_MODEL_DEFINITIONS & string

export const DEFAULT_MODEL_NAME: AgentModelName = '@cf/openai/gpt-oss-120b'

export function isValidModelName(value: string | undefined): value is AgentModelName {
	return !!value && value in AGENT_MODEL_DEFINITIONS
}

export function getAgentModelDefinition(modelName: AgentModelName): AgentModelDefinition {
	const definition = AGENT_MODEL_DEFINITIONS[modelName]
	if (!definition) {
		throw new Error(`Model ${modelName} not found`)
	}
	return definition
}
