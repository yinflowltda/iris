import { buildResponseSchema } from '../../shared/schema/buildResponseSchema'
import type { DebugPart, ModePart, SessionStatePart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'
import { getSystemPromptFlags, type SystemPromptFlags } from './getSystemPromptFlags'
import { buildEmotionsMapSection } from './sections/emotions-map-section'
import { buildIntroPromptSection } from './sections/intro-section'
import { buildLifeMapSection } from './sections/life-map-section'
import { buildRulesPromptSection } from './sections/rules-section'

const frameworkPromptBuilders: Record<
	string,
	(flags: SystemPromptFlags, sessionState?: SessionStatePart) => string
> = {
	'emotions-map': buildEmotionsMapSection,
	'life-map': buildLifeMapSection,
}

/** Frameworks that provide their own comprehensive instructions, replacing generic intro/rules */
const SELF_CONTAINED_FRAMEWORKS = new Set(['emotions-map'])

/**
 * Build the system prompt for the agent.
 *
 * This is the main instruction set that tells the AI how to behave.
 * The prompt is constructed from modular sections that adapt based on
 * what actions and parts are available.
 *
 * @param prompt - The prompt containing all parts including the mode part.
 * @param opts - Options for building the system prompt.
 * @param opts.withSchema - Whether to include the JSON schema in the system prompt. Defaults to true.
 * @returns The system prompt string.
 */
export function buildSystemPrompt(
	prompt: AgentPrompt,
	opts: { withSchema: boolean } = { withSchema: true },
): string {
	const { withSchema = true } = opts

	const modePart = prompt.mode
	if (!modePart) {
		throw new Error('A mode part is always required.')
	}

	const { actionTypes, partTypes } = modePart
	const flags = getSystemPromptFlags(actionTypes, partTypes)

	const frameworkId = modePart.frameworkId
	const isSelfContained = frameworkId ? SELF_CONTAINED_FRAMEWORKS.has(frameworkId) : false

	const lines: string[] = []

	if (isSelfContained) {
		// Self-contained frameworks provide their own role/rules/action instructions.
		// Only add minimal JSON response framing.
		lines.push(buildCompactIntro())
	} else {
		lines.push(buildIntroPromptSection(flags), buildRulesPromptSection(flags))
	}

	if (frameworkId && frameworkPromptBuilders[frameworkId]) {
		const sessionState = (prompt as Record<string, unknown>).sessionState as
			| SessionStatePart
			| undefined
		lines.push(frameworkPromptBuilders[frameworkId](flags, sessionState))
	}

	if (withSchema) {
		lines.push(buildSchemaPromptSection(modePart, isSelfContained))
	}

	const result = normalizeNewlines(lines.join('\n'))

	// Debug logging: print prompt size and slice info when logSystemPrompt is enabled
	const debugPart = (prompt as Record<string, unknown>).debug as DebugPart | undefined
	if (debugPart?.logSystemPrompt) {
		const sessionState = (prompt as Record<string, unknown>).sessionState as
			| SessionStatePart
			| undefined
		if (sessionState) {
			const fullLength = buildEmotionsMapSection(flags).length
			const scopedLength = buildEmotionsMapSection(flags, sessionState).length
			const reduction = Math.round((1 - scopedLength / fullLength) * 100)
			console.log(
				`[PROMPT SIZE] ${sessionState.mode} step ${sessionState.currentStep}: ${result.length} chars ` +
					`(framework: ${scopedLength} vs full: ${fullLength}, ${reduction}% reduction)`,
			)
		} else {
			console.log(`[PROMPT SIZE] full (no session state): ${result.length} chars`)
		}
	}

	return result
}

function buildCompactIntro(): string {
	return `You respond with structured JSON containing a list of actions. Each action must conform to the JSON schema provided below. Always return valid JSON, do not generate extra fields or omit required fields, and use meaningful \`intent\` descriptions for all actions.

**Important:** Your \`think\` events are not visible to the user. Every response MUST include a \`message\` action to communicate with the user. Never respond with only \`think\`, \`fill_cell\`, or other non-visible actions.`
}

function buildSchemaPromptSection(modePart: ModePart, stripDescriptions = false) {
	const schema = buildResponseSchema(modePart.actionTypes, modePart.modeType)

	const schemaJson = stripDescriptions
		? JSON.stringify(stripSchemaDescriptions(schema))
		: JSON.stringify(schema)

	return `## JSON schema

${stripDescriptions ? 'JSON schema for your response. Conform to this schema.' : 'This is the JSON schema for the events you can return. You must conform to this schema.'}

${schemaJson}
`
}

/**
 * Strip description fields from a JSON schema to reduce token count.
 * Used for frameworks that already provide detailed action instructions in prose.
 */
function stripSchemaDescriptions(obj: unknown): unknown {
	if (Array.isArray(obj)) {
		return obj.map(stripSchemaDescriptions)
	}
	if (obj && typeof obj === 'object') {
		return Object.fromEntries(
			Object.entries(obj as Record<string, unknown>)
				.filter(([key]) => key !== 'description')
				.map(([key, value]) => [key, stripSchemaDescriptions(value)]),
		)
	}
	return obj
}

function normalizeNewlines(text: string): string {
	return text.replace(/\n{3,}/g, '\n\n')
}
