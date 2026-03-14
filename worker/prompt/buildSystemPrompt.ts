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
const SELF_CONTAINED_FRAMEWORKS = new Set(['emotions-map', 'life-map'])

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

	const useStreamingCells = actionTypes.includes('cell_fill')

	if (useStreamingCells) {
		lines.push(buildStreamingCellsIntro())
	} else if (isSelfContained) {
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
		if (useStreamingCells) {
			lines.push(buildStreamingCellsSchemaSection(modePart))
		} else {
			lines.push(buildSchemaPromptSection(modePart, isSelfContained))
		}
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

function buildStreamingCellsIntro(): string {
	return `You respond with structured JSON containing up to three fields: "message" (your response to the user), "cells" (a mapping of cell IDs to arrays of short content labels), and "actions" (a list of structured actions for non-cell operations).

**Important:** Every response MUST include a "message" field to communicate with the user. The "cells" field contains the mandala content you want to create. Each cell entry is an array of short, concise labels (a few words each). Do NOT repeat context implied by the cell name (time period, category). No trailing periods.

**When to use "actions":** For operations that go beyond filling cells — moving notes, creating arrows, setting metadata, highlighting cells, etc. — include them in the "actions" array. Each action must have a "_type" field and conform to the action schemas below.

Example — filling cells:
\`\`\`json
{
  "message": "Looking at your situation, I can identify several key patterns...",
  "cells": {
    "past-events": ["Lost my job", "Moved to new city"],
    "past-thoughts": ["Felt overwhelmed", "Uncertainty about future"]
  }
}
\`\`\`

Example — moving a note:
\`\`\`json
{
  "message": "I'll move that note to the Want layer where it fits better.",
  "actions": [
    { "_type": "move_note", "intent": "relocate salary note", "mandalaId": "mandala-1", "noteId": "mandala-1-profissional-ter-0", "targetCellId": "profissional-querer" }
  ]
}
\`\`\`

You can combine "cells" and "actions" in the same response when needed.

Always return valid JSON. Only use cell IDs that are valid for the current framework.`
}

/** Action types that are handled by the streaming cells format and don't need explicit actions */
const CELL_FORMAT_BUILTIN_TYPES = new Set(['cell_fill', 'message'])

function buildStreamingCellsSchemaSection(modePart: ModePart): string {
	// Build actions schema for non-cell action types
	const nonCellActionTypes = modePart.actionTypes.filter(
		(type) => !CELL_FORMAT_BUILTIN_TYPES.has(type),
	)

	let actionsSchemaBlock = ''
	if (nonCellActionTypes.length > 0) {
		const actionsSchema = buildResponseSchema(nonCellActionTypes, modePart.modeType)
		actionsSchemaBlock = `\n\nAction schemas for the "actions" array:\n\n${JSON.stringify(actionsSchema)}`
	}

	return `## JSON schema

Respond with a JSON object matching this schema:

{
  "message": "string (required) — your response to the user",
  "cells": "object (optional) — mapping of cellId to array of short label strings. Example: { \\"past-events\\": [\\"Lost job\\", \\"Moved\\"] }",
  "actions": "array (optional) — list of structured action objects for non-cell operations (move_note, create_arrow, set_metadata, etc.)"
}

The "cells" field is for creating/filling content. The "actions" field is for everything else (moving notes, arrows, metadata, etc.). Both are optional — include whichever you need.${actionsSchemaBlock}
`
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
