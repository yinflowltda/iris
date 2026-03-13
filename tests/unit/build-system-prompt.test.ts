import { describe, expect, it } from 'vitest'
import '../../client/lib/frameworks/emotions-map'
import '../../client/lib/frameworks/life-map'
import '../../client/modes/AgentModeDefinitions'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'
import { buildSystemPrompt } from '../../worker/prompt/buildSystemPrompt'

function makeMinimalPrompt(
	frameworkId: string | null,
	opts?: { useStreamingCells?: boolean },
): AgentPrompt {
	const fillAction = opts?.useStreamingCells ? 'cell_fill' : 'fill_cell'
	return {
		mode: {
			type: 'mode',
			modeType: 'mandala',
			frameworkId,
			partTypes: ['mode', 'messages', 'screenshot'],
			actionTypes: [
				'message',
				'think',
				fillAction,
				'highlight_cell',
				'zoom_to_cell',
				'create_arrow',
				'set_metadata',
				'get_metadata',
				'unknown',
			],
		},
	} as unknown as AgentPrompt
}

describe('buildSystemPrompt framework injection', () => {
	it('includes Emotions Map section when frameworkId is emotions-map', () => {
		const prompt = makeMinimalPrompt('emotions-map')
		const systemPrompt = buildSystemPrompt(prompt, { withSchema: false })
		expect(systemPrompt).toContain('Emotions Map')
		expect(systemPrompt).toContain('CBT')
		expect(systemPrompt).not.toContain('Life Map')
	})

	it('includes Life Map section when frameworkId is life-map', () => {
		const prompt = makeMinimalPrompt('life-map')
		const systemPrompt = buildSystemPrompt(prompt, { withSchema: false })
		expect(systemPrompt).toContain('Life Map')
		expect(systemPrompt).toContain('life domains')
		expect(systemPrompt).not.toContain('CBT')
	})

	it('includes no framework section when frameworkId is null', () => {
		const prompt = makeMinimalPrompt(null)
		const systemPrompt = buildSystemPrompt(prompt, { withSchema: false })
		expect(systemPrompt).not.toContain('Emotions Map — CBT')
		expect(systemPrompt).not.toContain('Life Map — Holistic')
	})
})

describe('buildSystemPrompt streaming cells format', () => {
	it('uses streaming cells intro when cell_fill is in action types', () => {
		const prompt = makeMinimalPrompt('life-map', { useStreamingCells: true })
		const systemPrompt = buildSystemPrompt(prompt, { withSchema: false })
		expect(systemPrompt).toContain('"message"')
		expect(systemPrompt).toContain('"cells"')
		expect(systemPrompt).not.toContain('list of actions')
	})

	it('uses streaming cells schema when cell_fill is in action types', () => {
		const prompt = makeMinimalPrompt('life-map', { useStreamingCells: true })
		const systemPrompt = buildSystemPrompt(prompt)
		expect(systemPrompt).toContain('mapping of cellId')
		expect(systemPrompt).not.toContain('JSON schema for the events')
	})

	it('uses legacy actions format when fill_cell is in action types', () => {
		const prompt = makeMinimalPrompt('life-map')
		const systemPrompt = buildSystemPrompt(prompt)
		expect(systemPrompt).toContain('JSON schema')
		expect(systemPrompt).not.toContain('mapping of cellId')
	})
})
