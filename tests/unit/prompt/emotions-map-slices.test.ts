import { describe, expect, it } from 'vitest'
import '../.././../client/lib/frameworks/emotions-map'
import '../.././../client/lib/frameworks/life-map'
import '../.././../client/modes/AgentModeDefinitions'
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
			frameworkId: 'emotions-map',
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
		frameworkId: 'emotions-map',
		...overrides,
	}
}

function buildPromptText(sessionState?: SessionStatePart): string {
	return buildSystemPrompt(makePrompt(sessionState), { withSchema: false })
}

describe('emotions-map step-scoped slices', () => {
	describe('guided mode — loads current + adjacent steps', () => {
		it('step 0: loads step 0 + step 1', () => {
			const text = buildPromptText(makeSessionState({ currentStep: 0 }))
			expect(text).toContain('Readiness Assessment')
			expect(text).toContain('Step 1 — Capture the target situation')
			expect(text).not.toContain('Step 2 — Elicit automatic thoughts')
		})

		it('step 1: loads step 0 + step 1 + step 2', () => {
			const text = buildPromptText(makeSessionState({ currentStep: 1 }))
			expect(text).toContain('Readiness Assessment')
			expect(text).toContain('Step 1 — Capture the target situation')
			expect(text).toContain('Step 2 — Elicit automatic thoughts')
			expect(text).not.toContain('Step 3 — Elicit reactions')
		})

		it('step 5: loads step 4 + step 5 + step 6', () => {
			const text = buildPromptText(makeSessionState({ currentStep: 5 }))
			expect(text).toContain('Step 4 — Identify beliefs')
			expect(text).toContain('Step 5 — Evidence')
			expect(text).toContain('Socratic Thought-Testing Toolkit')
			expect(text).toContain('Step 6 — Re-evaluate beliefs')
			expect(text).not.toContain('Step 3 — Elicit reactions')
		})

		it('step 9: loads step 8 + step 9', () => {
			const text = buildPromptText(makeSessionState({ currentStep: 9 }))
			expect(text).toContain('Step 8 — Action plan')
			expect(text).toContain('Step 9 — Wrap up')
			expect(text).not.toContain('Step 5 — Evidence')
		})
	})

	describe('free mode — loads base + free mode rules', () => {
		it('includes free exploration mode content', () => {
			const text = buildPromptText(makeSessionState({ mode: 'free', currentStep: 3 }))
			expect(text).toContain('Free Exploration Mode')
			expect(text).toContain('Content routing')
			// Should NOT include individual step instructions
			expect(text).not.toContain('Step 3 — Elicit reactions')
			expect(text).not.toContain('Readiness Assessment')
		})
	})

	describe('fallback — no session state loads full prompt', () => {
		it('includes all steps when no session state', () => {
			const text = buildPromptText(undefined)
			expect(text).toContain('Readiness Assessment')
			expect(text).toContain('Step 1 — Capture the target situation')
			expect(text).toContain('Step 2 — Elicit automatic thoughts')
			expect(text).toContain('Step 3 — Elicit reactions')
			expect(text).toContain('Step 4 — Identify beliefs')
			expect(text).toContain('Step 5 — Evidence')
			expect(text).toContain('Step 6 — Re-evaluate beliefs')
			expect(text).toContain('Step 7 — Deepen')
			expect(text).toContain('Step 8 — Action plan')
			expect(text).toContain('Step 9 — Wrap up')
		})
	})

	describe('cognitive distortions removed', () => {
		it('full prompt does not contain distortion list', () => {
			const text = buildPromptText(undefined)
			expect(text).not.toContain('All-or-nothing thinking')
			expect(text).not.toContain('Fortune-telling')
			expect(text).not.toContain('Cognitive Distortions Reference')
		})

		it('base layer says not to label distortions', () => {
			const text = buildPromptText(makeSessionState({ currentStep: 0 }))
			expect(text).toContain('Do not attempt to identify or label cognitive distortions')
		})
	})

	describe('JSON schema minified', () => {
		it('schema has no indentation', () => {
			const text = buildSystemPrompt(makePrompt(), { withSchema: true })
			// The schema section should exist but not have pretty-printed JSON
			expect(text).toContain('JSON schema')
			// Pretty-printed JSON would have lines like "  \"type\":"
			// Minified JSON has no leading spaces before keys
			const schemaStart = text.indexOf('JSON schema')
			const schemaSection = text.slice(schemaStart)
			expect(schemaSection).not.toMatch(/\n {2,}"/)
		})
	})

	describe('token reduction', () => {
		it('guided step 3 is significantly smaller than full prompt', () => {
			const full = buildPromptText(undefined)
			const guided = buildPromptText(makeSessionState({ currentStep: 3 }))
			const reduction = 1 - guided.length / full.length
			// Guided mode with adjacent steps should be at least 15% smaller than full
			expect(reduction).toBeGreaterThan(0.15)
			// And the guided prompt should be strictly smaller
			expect(guided.length).toBeLessThan(full.length)
		})
	})

	describe('base layer always present', () => {
		it('includes core principles in guided mode', () => {
			const text = buildPromptText(makeSessionState({ currentStep: 5 }))
			expect(text).toContain('Core Principles')
			expect(text).toContain('Emotions Map — CBT-Informed Reflective Guide')
			expect(text).toContain('Valid Cell IDs')
		})

		it('includes core principles in free mode', () => {
			const text = buildPromptText(makeSessionState({ mode: 'free' }))
			expect(text).toContain('Core Principles')
			expect(text).toContain('Valid Cell IDs')
		})
	})
})
