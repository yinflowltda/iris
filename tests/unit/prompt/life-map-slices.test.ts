import { describe, expect, it } from 'vitest'
import '../../../client/lib/frameworks/emotions-map'
import '../../../client/lib/frameworks/life-map'
import '../../../client/modes/AgentModeDefinitions'
import type { SessionStatePart } from '../../../shared/schema/PromptPartDefinitions'
import type { AgentPrompt } from '../../../shared/types/AgentPrompt'
import { buildSystemPrompt } from '../../../worker/prompt/buildSystemPrompt'

const ALL_ACTION_TYPES = [
	'message',
	'think',
	'fill_cell',
	'highlight_cell',
	'zoom_to_cell',
	'create_arrow',
	'set_metadata',
	'get_metadata',
	'unknown',
] as const

function makePrompt(sessionState?: SessionStatePart): AgentPrompt {
	const prompt: Record<string, unknown> = {
		mode: {
			type: 'mode',
			modeType: 'mandala',
			frameworkId: 'life-map',
			partTypes: ['mode', 'messages', 'screenshot', 'sessionState'],
			actionTypes: [...ALL_ACTION_TYPES],
		},
	}
	if (sessionState) {
		prompt.sessionState = sessionState
	}
	return prompt as unknown as AgentPrompt
}

function makeSessionState(overrides: Partial<SessionStatePart> = {}): SessionStatePart {
	return {
		type: 'sessionState',
		currentStep: 0,
		filledCells: [],
		activeCells: [],
		mode: 'guided',
		frameworkId: 'life-map',
		region: null,
		activeConditions: [],
		...overrides,
	}
}

function buildPromptText(sessionState?: SessionStatePart): string {
	return buildSystemPrompt(makePrompt(sessionState), { withSchema: false })
}

describe('life-map region-based loading', () => {
	describe('base layer always present', () => {
		it('includes role and core principles in all modes', () => {
			const text = buildPromptText(makeSessionState({ region: 'intentional' }))
			expect(text).toContain('life design companion')
			expect(text).toContain('Core Principles')
			expect(text).toContain('highlight_cell')
			expect(text).toContain('Propósito')
		})
	})

	describe('no session state — full prompt', () => {
		it('includes all layers when no session state', () => {
			const text = buildPromptText(undefined)
			expect(text).toContain('life design companion')
			expect(text).toContain('Want / Querer')
			expect(text).toContain('Do (Fazer)')
			expect(text).toContain('Anxiety')
			expect(text).toContain('Free Exploration')
		})
	})

	describe('guided mode — region-based loading', () => {
		it('region null: loads base layer only', () => {
			const text = buildPromptText(makeSessionState({ region: null }))
			expect(text).toContain('life design companion')
			expect(text).not.toContain('Want / Querer (Purpose/Desire)')
			expect(text).not.toContain('Do (Fazer)')
		})

		it('region intentional: loads base + intentional', () => {
			const text = buildPromptText(makeSessionState({ region: 'intentional' }))
			expect(text).toContain('Want / Querer (Purpose/Desire)')
			expect(text).toContain('espiritual-querer')
			expect(text).not.toContain('monday-dawn')
			expect(text).not.toContain('Do (Fazer)')
		})

		it('region temporal: loads base + temporal', () => {
			const text = buildPromptText(makeSessionState({ region: 'temporal' }))
			expect(text).toContain('Do (Fazer)')
			expect(text).toContain('monday-dawn')
			expect(text).not.toContain('Want / Querer (Purpose/Desire)')
		})
	})

	describe('condition overlays', () => {
		it('loads anxiety overlay when active', () => {
			const text = buildPromptText(
				makeSessionState({
					region: 'intentional',
					activeConditions: ['anxiety'],
				}),
			)
			expect(text).toContain('Anxiety')
			expect(text).not.toContain('Burnout')
			expect(text).not.toContain('ADHD')
		})

		it('loads multiple conditions', () => {
			const text = buildPromptText(
				makeSessionState({
					region: 'temporal',
					activeConditions: ['insomnia', 'adhd'],
				}),
			)
			expect(text).toContain('Insomnia')
			expect(text).toContain('ADHD')
			expect(text).not.toContain('Burnout')
		})

		it('no conditions loaded when array empty', () => {
			const text = buildPromptText(
				makeSessionState({ region: 'intentional', activeConditions: [] }),
			)
			expect(text).not.toContain('Overlay: Anxiety')
			expect(text).not.toContain('Overlay: Burnout')
		})
	})

	describe('free mode', () => {
		it('loads base + free mode rules + conditions', () => {
			const text = buildPromptText(
				makeSessionState({
					mode: 'free',
					activeConditions: ['depression'],
				}),
			)
			expect(text).toContain('Free Exploration')
			expect(text).toContain('Content routing')
			expect(text).toContain('Depression')
			expect(text).not.toContain('Want / Querer (Purpose/Desire)')
			expect(text).not.toContain('Do (Fazer)')
		})
	})

	describe('self-contained — no generic intro/rules', () => {
		it('uses compact intro, not generic intro', () => {
			const text = buildPromptText(undefined)
			expect(text).toContain('structured JSON containing a list of actions')
			expect(text).not.toContain('You are a helpful assistant')
		})
	})

	describe('token reduction', () => {
		it('intentional region is significantly smaller than full prompt', () => {
			const full = buildPromptText(undefined)
			const scoped = buildPromptText(
				makeSessionState({ region: 'intentional' }),
			)
			const reduction = 1 - scoped.length / full.length
			expect(reduction).toBeGreaterThan(0.15)
		})
	})
})
