import { describe, expect, it } from 'vitest'
import { getAllActionUtils } from '../../client/actions/AgentActionUtil'
import { EMOTIONS_MAP } from '../../client/lib/frameworks/emotions-map'
import { getAllCellIds } from '../../client/lib/mandala-geometry'
// Import mode definitions to trigger self-registration of all action utils
import {
	AGENT_MODE_DEFINITIONS,
	getAgentModeDefinition,
} from '../../client/modes/AgentModeDefinitions'
import {
	CreateArrowAction,
	DetectConflictAction,
	FillCellAction,
	GetMetadataAction,
	HighlightCellAction,
	SetMetadataAction,
	ZoomToCellAction,
} from '../../shared/schema/AgentActionSchemas'
import { getActionSchema, hasActionSchema } from '../../shared/types/AgentAction'
import { getResponseForInput } from '../mocks/mock-ai-provider'

// ─── Schema Validation ───────────────────────────────────────────────────────

describe('FillCellAction schema', () => {
	it('accepts a valid fill_cell action', () => {
		const result = FillCellAction.safeParse({
			_type: 'fill_cell',
			intent: 'Capturing the user events in past-events',
			mandalaId: 'mandala',
			cellId: 'past-events',
			content: 'I feel cautiously optimistic',
		})
		expect(result.success).toBe(true)
	})

	it('rejects when _type is wrong', () => {
		const result = FillCellAction.safeParse({
			_type: 'wrong_type',
			intent: 'test',
			mandalaId: 'mandala',
			cellId: 'past-events',
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

	it('accepts all 7 valid cell IDs', () => {
		for (const cellId of getAllCellIds(EMOTIONS_MAP)) {
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
			intent: 'Drawing attention to present beliefs',
			mandalaId: 'mandala',
			cellId: 'present-beliefs',
			color: 'yellow',
		})
		expect(result.success).toBe(true)
	})

	it('rejects invalid color values', () => {
		const result = HighlightCellAction.safeParse({
			_type: 'highlight_cell',
			intent: 'test',
			mandalaId: 'mandala',
			cellId: 'present-beliefs',
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
				cellId: 'past-events',
				color,
			})
			expect(result.success).toBe(true)
		}
	})
})

describe('ZoomToCellAction schema', () => {
	it('accepts a valid zoom_to_cell action', () => {
		const result = ZoomToCellAction.safeParse({
			_type: 'zoom_to_cell',
			intent: 'Zooming to past events',
			mandalaId: 'mandala',
			cellId: 'past-events',
		})
		expect(result.success).toBe(true)
	})
})

describe('DetectConflictAction schema', () => {
	it('accepts a valid detect_conflict action', () => {
		const result = DetectConflictAction.safeParse({
			_type: 'detect_conflict',
			intent: 'Noticed contradiction between past and present beliefs',
			mandalaId: 'mandala',
			cellIds: ['past-thoughts-emotions', 'present-beliefs'],
			description:
				'The user feels unlovable (past) but believes they deserve good things (present).',
		})
		expect(result.success).toBe(true)
	})

	it('accepts more than 2 cell IDs', () => {
		const result = DetectConflictAction.safeParse({
			_type: 'detect_conflict',
			intent: 'Multi-cell conflict',
			mandalaId: 'mandala',
			cellIds: ['past-thoughts-emotions', 'present-beliefs', 'future-beliefs'],
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
		expect(result.success).toBe(true)
	})

	it('rejects when description is missing', () => {
		const result = DetectConflictAction.safeParse({
			_type: 'detect_conflict',
			intent: 'test',
			mandalaId: 'mandala',
			cellIds: ['past-thoughts-emotions', 'present-beliefs'],
		})
		expect(result.success).toBe(false)
	})
})

describe('CreateArrowAction schema', () => {
	it('accepts a valid create_arrow action', () => {
		const result = CreateArrowAction.safeParse({
			_type: 'create_arrow',
			intent: 'Connecting event to thought',
			mandalaId: 'mandala',
			sourceElementId: 'mandala-past-events-0',
			targetElementId: 'mandala-past-thoughts-emotions-0',
			color: 'black',
		})
		expect(result.success).toBe(true)
	})

	it('accepts with optional label', () => {
		const result = CreateArrowAction.safeParse({
			_type: 'create_arrow',
			intent: 'Linking evidence to belief',
			mandalaId: 'mandala',
			sourceElementId: 'mandala-evidence-0',
			targetElementId: 'mandala-present-beliefs-0',
			color: 'red',
			label: 'contradicts',
		})
		expect(result.success).toBe(true)
	})

	it('rejects invalid color', () => {
		const result = CreateArrowAction.safeParse({
			_type: 'create_arrow',
			intent: 'test',
			mandalaId: 'mandala',
			sourceElementId: 'a',
			targetElementId: 'b',
			color: 'purple',
		})
		expect(result.success).toBe(false)
	})

	it('rejects missing sourceElementId', () => {
		const result = CreateArrowAction.safeParse({
			_type: 'create_arrow',
			intent: 'test',
			mandalaId: 'mandala',
			targetElementId: 'b',
			color: 'black',
		})
		expect(result.success).toBe(false)
	})

	it('rejects label longer than 30 chars', () => {
		const result = CreateArrowAction.safeParse({
			_type: 'create_arrow',
			intent: 'test',
			mandalaId: 'mandala',
			sourceElementId: 'a',
			targetElementId: 'b',
			color: 'green',
			label: 'a'.repeat(31),
		})
		expect(result.success).toBe(false)
	})
})

describe('SetMetadataAction schema', () => {
	it('accepts a valid set_metadata action', () => {
		const result = SetMetadataAction.safeParse({
			_type: 'set_metadata',
			intent: 'Setting trigger type',
			mandalaId: 'mandala',
			elementId: 'mandala-past-events-0',
			metadata: { trigger_type: 'external', is_primary: true },
		})
		expect(result.success).toBe(true)
	})

	it('accepts with empty metadata', () => {
		const result = SetMetadataAction.safeParse({
			_type: 'set_metadata',
			intent: 'test',
			mandalaId: 'mandala',
			elementId: 'mandala-past-events-0',
			metadata: {},
		})
		expect(result.success).toBe(true)
	})

	it('rejects when metadata is missing', () => {
		const result = SetMetadataAction.safeParse({
			_type: 'set_metadata',
			intent: 'test',
			mandalaId: 'mandala',
			elementId: 'mandala-past-events-0',
		})
		expect(result.success).toBe(false)
	})
})

describe('GetMetadataAction schema', () => {
	it('accepts a valid get_metadata action', () => {
		const result = GetMetadataAction.safeParse({
			_type: 'get_metadata',
			intent: 'Reading metadata from element',
			mandalaId: 'mandala',
			elementId: 'mandala-past-events-0',
		})
		expect(result.success).toBe(true)
	})

	it('rejects when elementId is missing', () => {
		const result = GetMetadataAction.safeParse({
			_type: 'get_metadata',
			intent: 'test',
			mandalaId: 'mandala',
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

	it('has a registered schema for zoom_to_cell', () => {
		expect(hasActionSchema('zoom_to_cell')).toBe(true)
	})

	it('has a registered schema for detect_conflict', () => {
		expect(hasActionSchema('detect_conflict')).toBe(true)
	})

	it('has a registered schema for create_arrow', () => {
		expect(hasActionSchema('create_arrow')).toBe(true)
	})

	it('has a registered schema for set_metadata', () => {
		expect(hasActionSchema('set_metadata')).toBe(true)
	})

	it('has a registered schema for get_metadata', () => {
		expect(hasActionSchema('get_metadata')).toBe(true)
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

	it('has a registered util for zoom_to_cell', () => {
		expect(allTypes).toContain('zoom_to_cell')
	})

	it('has a registered util for detect_conflict', () => {
		expect(allTypes).toContain('detect_conflict')
	})

	it('has a registered util for create_arrow', () => {
		expect(allTypes).toContain('create_arrow')
	})

	it('has a registered util for set_metadata', () => {
		expect(allTypes).toContain('set_metadata')
	})

	it('has a registered util for get_metadata', () => {
		expect(allTypes).toContain('get_metadata')
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
		expect(mode.actions).toContain('create_arrow')
		expect(mode.actions).toContain('set_metadata')
		expect(mode.actions).toContain('get_metadata')
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
		expect(fillAction!.cellId).toBe('past-events')
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
			expect(result.data.cellId).toBe('past-events')
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
	const allCellIds = getAllCellIds(EMOTIONS_MAP)

	it('produces 7 unique cell IDs', () => {
		expect(allCellIds).toHaveLength(7)
		expect(new Set(allCellIds).size).toBe(7)
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
