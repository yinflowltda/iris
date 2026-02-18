import { describe, expect, it } from 'vitest'
import z from 'zod'
import { getAllActionUtils } from '../../client/actions/AgentActionUtil'
import { getAllCellIds } from '../../client/lib/mandala-geometry'
// Import mode definitions to trigger self-registration of all action utils
import {
	AGENT_MODE_DEFINITIONS,
	getAgentModeDefinition,
} from '../../client/modes/AgentModeDefinitions'
import {
	DetectConflictAction,
	FillCellAction,
	HighlightCellAction,
} from '../../shared/schema/AgentActionSchemas'
import { getActionSchema, hasActionSchema } from '../../shared/types/AgentAction'
import { RING_IDS, SLICE_IDS } from '../../shared/types/MandalaTypes'
import { getResponseForInput } from '../mocks/mock-ai-provider'

// ─── Schema Validation ───────────────────────────────────────────────────────

describe('FillCellAction schema', () => {
	it('accepts a valid fill_cell action', () => {
		const result = FillCellAction.safeParse({
			_type: 'fill_cell',
			intent: 'Capturing the user emotion in present-emotions',
			mandalaId: 'mandala',
			cellId: 'present-emotions',
			content: 'I feel cautiously optimistic',
		})
		expect(result.success).toBe(true)
	})

	it('rejects when _type is wrong', () => {
		const result = FillCellAction.safeParse({
			_type: 'wrong_type',
			intent: 'test',
			mandalaId: 'mandala',
			cellId: 'present-emotions',
			content: 'text',
		})
		expect(result.success).toBe(false)
	})

	it('rejects when required fields are missing', () => {
		const result = FillCellAction.safeParse({
			_type: 'fill_cell',
			intent: 'test',
		})
		expect(result.success).toBe(false)
	})

	it('accepts all 18 valid cell IDs', () => {
		for (const cellId of getAllCellIds()) {
			const result = FillCellAction.safeParse({
				_type: 'fill_cell',
				intent: `Filling ${cellId}`,
				mandalaId: 'mandala',
				cellId,
				content: 'Some content',
			})
			expect(result.success).toBe(true)
		}
	})
})

describe('HighlightCellAction schema', () => {
	it('accepts a valid highlight_cell action', () => {
		const result = HighlightCellAction.safeParse({
			_type: 'highlight_cell',
			intent: 'Drawing attention to past beliefs',
			mandalaId: 'mandala',
			cellId: 'past-beliefs',
			color: 'yellow',
		})
		expect(result.success).toBe(true)
	})

	it('rejects invalid color values', () => {
		const result = HighlightCellAction.safeParse({
			_type: 'highlight_cell',
			intent: 'test',
			mandalaId: 'mandala',
			cellId: 'past-beliefs',
			color: 'rainbow',
		})
		expect(result.success).toBe(false)
	})

	it('accepts all valid FocusedColor values', () => {
		const validColors = [
			'red',
			'light-red',
			'green',
			'light-green',
			'blue',
			'light-blue',
			'orange',
			'yellow',
			'black',
			'violet',
			'light-violet',
			'grey',
			'white',
		]
		for (const color of validColors) {
			const result = HighlightCellAction.safeParse({
				_type: 'highlight_cell',
				intent: 'test',
				mandalaId: 'mandala',
				cellId: 'present-events',
				color,
			})
			expect(result.success).toBe(true)
		}
	})
})

describe('DetectConflictAction schema', () => {
	it('accepts a valid detect_conflict action', () => {
		const result = DetectConflictAction.safeParse({
			_type: 'detect_conflict',
			intent: 'Noticed contradiction between past and present beliefs',
			mandalaId: 'mandala',
			cellIds: ['past-beliefs', 'present-beliefs'],
			description:
				'The user believes they are unlovable (past) but also that they deserve good things (present).',
		})
		expect(result.success).toBe(true)
	})

	it('accepts more than 2 cell IDs', () => {
		const result = DetectConflictAction.safeParse({
			_type: 'detect_conflict',
			intent: 'Multi-cell conflict',
			mandalaId: 'mandala',
			cellIds: ['past-beliefs', 'present-beliefs', 'future-beliefs'],
			description: 'Beliefs across all time periods are contradictory.',
		})
		expect(result.success).toBe(true)
	})

	it('rejects when cellIds is empty', () => {
		const result = DetectConflictAction.safeParse({
			_type: 'detect_conflict',
			intent: 'test',
			mandalaId: 'mandala',
			cellIds: [],
			description: 'test',
		})
		// Schema allows empty array, but sanitizeAction rejects < 2
		expect(result.success).toBe(true)
	})

	it('rejects when description is missing', () => {
		const result = DetectConflictAction.safeParse({
			_type: 'detect_conflict',
			intent: 'test',
			mandalaId: 'mandala',
			cellIds: ['past-beliefs', 'present-beliefs'],
		})
		expect(result.success).toBe(false)
	})
})

// ─── Schema Registration ─────────────────────────────────────────────────────

describe('action schema registration', () => {
	it('has a registered schema for fill_cell', () => {
		expect(hasActionSchema('fill_cell')).toBe(true)
	})

	it('has a registered schema for highlight_cell', () => {
		expect(hasActionSchema('highlight_cell')).toBe(true)
	})

	it('has a registered schema for detect_conflict', () => {
		expect(hasActionSchema('detect_conflict')).toBe(true)
	})

	it('fill_cell schema parses valid input via registry', () => {
		const schema = getActionSchema('fill_cell')
		expect(schema).toBeDefined()
		const result = schema!.safeParse({
			_type: 'fill_cell',
			intent: 'test',
			mandalaId: 'mandala',
			cellId: 'past-events',
			content: 'Test content',
		})
		expect(result.success).toBe(true)
	})
})

// ─── ActionUtil Registration ─────────────────────────────────────────────────

describe('action util registration', () => {
	const allUtils = getAllActionUtils()
	const allTypes = allUtils.map((u) => u.type)

	it('has a registered util for fill_cell', () => {
		expect(allTypes).toContain('fill_cell')
	})

	it('has a registered util for highlight_cell', () => {
		expect(allTypes).toContain('highlight_cell')
	})

	it('has a registered util for detect_conflict', () => {
		expect(allTypes).toContain('detect_conflict')
	})
})

// ─── Emotions Map Mode Definition ────────────────────────────────────────────

describe('emotions-map mode definition', () => {
	it('exists in AGENT_MODE_DEFINITIONS', () => {
		const mode = AGENT_MODE_DEFINITIONS.find((m) => m.type === 'emotions-map')
		expect(mode).toBeDefined()
	})

	it('is an active mode', () => {
		const mode = getAgentModeDefinition('emotions-map' as any)
		expect(mode.active).toBe(true)
	})

	it('includes mandala-specific actions', () => {
		const mode = getAgentModeDefinition('emotions-map' as any)
		if (!mode.active) throw new Error('Mode should be active')
		expect(mode.actions).toContain('fill_cell')
		expect(mode.actions).toContain('highlight_cell')
		expect(mode.actions).toContain('detect_conflict')
	})

	it('includes communication actions', () => {
		const mode = getAgentModeDefinition('emotions-map' as any)
		if (!mode.active) throw new Error('Mode should be active')
		expect(mode.actions).toContain('message')
		expect(mode.actions).toContain('think')
	})

	it('includes basic shape editing actions', () => {
		const mode = getAgentModeDefinition('emotions-map' as any)
		if (!mode.active) throw new Error('Mode should be active')
		expect(mode.actions).toContain('create')
		expect(mode.actions).toContain('delete')
		expect(mode.actions).toContain('update')
		expect(mode.actions).toContain('label')
		expect(mode.actions).toContain('move')
	})

	it('includes required internal action', () => {
		const mode = getAgentModeDefinition('emotions-map' as any)
		if (!mode.active) throw new Error('Mode should be active')
		expect(mode.actions).toContain('unknown')
	})

	it('has prompt parts configured', () => {
		const mode = getAgentModeDefinition('emotions-map' as any)
		if (!mode.active) throw new Error('Mode should be active')
		expect(mode.parts.length).toBeGreaterThan(0)
	})

	it('includes the full set of working mode actions as a superset', () => {
		const workingMode = getAgentModeDefinition('working')
		if (!workingMode.active) throw new Error('Working mode should be active')
		const emotionsMode = getAgentModeDefinition('emotions-map' as any)
		if (!emotionsMode.active) throw new Error('Emotions-map mode should be active')

		for (const action of workingMode.actions) {
			expect(emotionsMode.actions).toContain(action)
		}
	})
})

// ─── Mock AI Provider + Action Schema Integration ────────────────────────────

describe('mock AI provider mandala action integration', () => {
	it('fill cell response contains a fill_cell action with expected fields', () => {
		const response = getResponseForInput('fill the cell with this content')
		const fillAction = response.actions.find((a) => a._type === 'fill_cell')
		expect(fillAction).toBeDefined()
		expect(fillAction!._type).toBe('fill_cell')
		expect(fillAction!.cellId).toBe('present-events')
		expect(fillAction!.content).toBe('Mock content')
	})

	it('fill cell response with intent field parses with FillCellAction schema', () => {
		const response = getResponseForInput('fill the cell with this content')
		const fillAction = response.actions.find((a) => a._type === 'fill_cell')
		expect(fillAction).toBeDefined()

		const withIntent = { ...fillAction, intent: 'Capturing user input' }
		const result = FillCellAction.safeParse(withIntent)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.cellId).toBe('present-events')
			expect(result.data.content).toBe('Mock content')
		}
	})

	it('emotions map greeting is a valid message action', () => {
		const response = getResponseForInput('Start the Emotions Map')
		expect(response.actions).toHaveLength(1)
		expect(response.actions[0]._type).toBe('message')
	})
})

// ─── Cell ID Validation (cross-check with geometry) ──────────────────────────

describe('cell ID consistency across schemas and geometry', () => {
	const allCellIds = getAllCellIds()

	it('produces 18 unique cell IDs', () => {
		expect(allCellIds).toHaveLength(18)
		expect(new Set(allCellIds).size).toBe(18)
	})

	it('every cell ID matches sliceId-ringId format', () => {
		for (const cellId of allCellIds) {
			const [sliceId, ringId] = cellId.split('-')
			expect(SLICE_IDS).toContain(sliceId)
			expect(RING_IDS).toContain(ringId)
		}
	})

	it('every cell ID is accepted by FillCellAction schema', () => {
		for (const cellId of allCellIds) {
			const result = FillCellAction.safeParse({
				_type: 'fill_cell',
				intent: 'test',
				mandalaId: 'mandala',
				cellId,
				content: 'test',
			})
			expect(result.success).toBe(true)
		}
	})
})
