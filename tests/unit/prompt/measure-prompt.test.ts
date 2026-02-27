import { describe, it } from 'vitest'
import '../../../client/lib/frameworks/emotions-map'
import '../../../client/lib/frameworks/life-map'
import '../../../client/modes/AgentModeDefinitions'
import type { AgentPrompt } from '../../../shared/types/AgentPrompt'
import { buildSystemPrompt } from '../../../worker/prompt/buildSystemPrompt'

describe('prompt size measurement', () => {
	it('measures', () => {
		const actionTypes = [
			'message',
			'think',
			'fill_cell',
			'highlight_cell',
			'zoom_to_cell',
			'create_arrow',
			'set_metadata',
			'get_metadata',
			'unknown',
		] as any

		const scoped = {
			mode: {
				type: 'mode',
				modeType: 'mandala',
				frameworkId: 'emotions-map',
				partTypes: ['mode', 'messages', 'screenshot', 'sessionState'],
				actionTypes,
			},
			sessionState: {
				type: 'sessionState',
				currentStep: 0,
				filledCells: [],
				activeCells: [],
				mode: 'guided',
				frameworkId: 'emotions-map',
			},
		} as unknown as AgentPrompt

		const full = {
			mode: {
				type: 'mode',
				modeType: 'mandala',
				frameworkId: 'emotions-map',
				partTypes: ['mode', 'messages', 'screenshot'],
				actionTypes,
			},
		} as unknown as AgentPrompt

		const scopedWithSchema = buildSystemPrompt(scoped, { withSchema: true })
		const scopedNoSchema = buildSystemPrompt(scoped, { withSchema: false })
		const fullWithSchema = buildSystemPrompt(full, { withSchema: true })
		const fullNoSchema = buildSystemPrompt(full, { withSchema: false })

		const schemaSize = scopedWithSchema.length - scopedNoSchema.length

		const frameworkStart = scopedNoSchema.indexOf('## Emotions Map')
		const introSection = scopedNoSchema.slice(0, frameworkStart)
		const frameworkSection = scopedNoSchema.slice(frameworkStart)

		console.log('\n=== PROMPT SIZE BREAKDOWN ===')
		console.log(
			`Intro/rules:        ${introSection.length} chars (~${Math.round(introSection.length / 4)} tokens)`,
		)
		console.log(
			`Framework (scoped): ${frameworkSection.length} chars (~${Math.round(frameworkSection.length / 4)} tokens)`,
		)
		console.log(
			`JSON schema:        ${schemaSize} chars (~${Math.round(schemaSize / 4)} tokens)`,
		)
		console.log(`---`)
		console.log(
			`Total (scoped+schema): ${scopedWithSchema.length} chars (~${Math.round(scopedWithSchema.length / 4)} tokens)`,
		)
		console.log(
			`Total (full+schema):   ${fullWithSchema.length} chars (~${Math.round(fullWithSchema.length / 4)} tokens)`,
		)
		console.log(
			`\nSchema = ${Math.round((schemaSize / scopedWithSchema.length) * 100)}% of scoped prompt`,
		)

		const fullFramework = fullNoSchema.slice(fullNoSchema.indexOf('## Emotions Map'))
		console.log(
			`\nFramework scoped: ${frameworkSection.length} chars vs full: ${fullFramework.length} chars (${Math.round((1 - frameworkSection.length / fullFramework.length) * 100)}% reduction)`,
		)
	})
})
