import type { Editor } from 'tldraw'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { BasePromptPart } from '../../shared/types/BasePromptPart'
import type { PromptPart } from '../../shared/types/PromptPart'
import type { AgentHelpers } from '../AgentHelpers'
import type { TldrawAgent } from '../agent/TldrawAgent'

// ============================================================================
// Registry
// ============================================================================

const registry = new Map<string, PromptPartUtilConstructor<BasePromptPart>>()

/**
 * Register a prompt part util class. Call this after defining each util class.
 */
export function registerPromptPartUtil<T extends PromptPartUtilConstructor<BasePromptPart>>(
	util: T,
): T {
	if (registry.has(util.type)) {
		throw new Error(`Prompt part util already registered: ${util.type}`)
	}
	registry.set(util.type, util)
	return util
}

/**
 * Get all registered prompt part util classes.
 */
export function getAllPromptPartUtils(): PromptPartUtilConstructor<PromptPart>[] {
	return Array.from(registry.values()) as PromptPartUtilConstructor<PromptPart>[]
}

/**
 * Get an object containing instantiated prompt part utils for an agent.
 */
export function getPromptPartUtilsRecord(agent: TldrawAgent) {
	const object = {} as Record<PromptPart['type'], PromptPartUtil<PromptPart>>
	for (const util of registry.values()) {
		object[util.type as PromptPart['type']] = new util(agent) as PromptPartUtil<PromptPart>
	}
	return object
}

// ============================================================================
// Base Class
// ============================================================================

export abstract class PromptPartUtil<T extends BasePromptPart = BasePromptPart> {
	static type: string

	agent: TldrawAgent
	editor: Editor

	constructor(agent: TldrawAgent) {
		this.agent = agent
		this.editor = agent?.editor
	}

	/**
	 * Get some data to add to the prompt.
	 * @returns The prompt part.
	 */
	abstract getPart(request: AgentRequest, helpers: AgentHelpers): Promise<T> | T
}

export interface PromptPartUtilConstructor<T extends BasePromptPart = BasePromptPart> {
	new (agent: TldrawAgent): PromptPartUtil<T>
	type: T['type']
}
