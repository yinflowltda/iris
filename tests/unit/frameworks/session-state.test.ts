import { describe, expect, it } from 'vitest'
import type { MandalaState } from '../../../shared/types/MandalaTypes'
import { inferSessionState } from '../../../client/lib/frameworks/session-state'

function makeState(overrides: Record<string, 'empty' | 'active' | 'filled'>): MandalaState {
	const base: MandalaState = {
		'past-events': { status: 'empty', contentShapeIds: [] },
		'past-thoughts-emotions': { status: 'empty', contentShapeIds: [] },
		'present-behaviors': { status: 'empty', contentShapeIds: [] },
		'present-beliefs': { status: 'empty', contentShapeIds: [] },
		evidence: { status: 'empty', contentShapeIds: [] },
		'future-beliefs': { status: 'empty', contentShapeIds: [] },
		'future-events': { status: 'empty', contentShapeIds: [] },
	}
	for (const [id, status] of Object.entries(overrides)) {
		if (base[id]) {
			base[id] = { status, contentShapeIds: status === 'filled' ? ['shape:1' as any] : [] }
		}
	}
	return base
}

describe('inferSessionState', () => {
	it('returns step 0 when no cells are filled', () => {
		const result = inferSessionState(makeState({}))
		expect(result.currentStep).toBe(0)
		expect(result.mode).toBe('guided')
		expect(result.filledCells).toEqual([])
		expect(result.frameworkId).toBe('emotions-map')
	})

	it('returns step 2 when only past-events is filled', () => {
		const result = inferSessionState(makeState({ 'past-events': 'filled' }))
		expect(result.currentStep).toBe(2)
		expect(result.mode).toBe('guided')
		expect(result.filledCells).toEqual(['past-events'])
	})

	it('returns step 3 when past-events and past-thoughts-emotions are filled', () => {
		const result = inferSessionState(
			makeState({
				'past-events': 'filled',
				'past-thoughts-emotions': 'filled',
			}),
		)
		expect(result.currentStep).toBe(3)
		expect(result.mode).toBe('guided')
	})

	it('returns step 9 when all cells are filled', () => {
		const result = inferSessionState(
			makeState({
				'past-events': 'filled',
				'past-thoughts-emotions': 'filled',
				'present-behaviors': 'filled',
				'present-beliefs': 'filled',
				evidence: 'filled',
				'future-beliefs': 'filled',
				'future-events': 'filled',
			}),
		)
		expect(result.currentStep).toBe(9)
		expect(result.mode).toBe('guided')
		expect(result.filledCells).toHaveLength(7)
	})

	it('detects free mode with non-contiguous fills (3+ cells, gap in sequence)', () => {
		const result = inferSessionState(
			makeState({
				'past-events': 'filled',
				'present-beliefs': 'filled',
				evidence: 'filled',
			}),
		)
		expect(result.mode).toBe('free')
	})

	it('stays guided with 2 non-contiguous fills (below threshold)', () => {
		const result = inferSessionState(
			makeState({
				'past-events': 'filled',
				evidence: 'filled',
			}),
		)
		expect(result.mode).toBe('guided')
	})

	it('stays guided with 3 contiguous fills', () => {
		const result = inferSessionState(
			makeState({
				'past-events': 'filled',
				'past-thoughts-emotions': 'filled',
				'present-behaviors': 'filled',
			}),
		)
		expect(result.mode).toBe('guided')
		expect(result.currentStep).toBe(4)
	})

	it('reports active cells correctly', () => {
		const result = inferSessionState(
			makeState({
				'past-events': 'filled',
				'past-thoughts-emotions': 'active',
			}),
		)
		expect(result.activeCells).toEqual(['past-thoughts-emotions'])
		expect(result.filledCells).toEqual(['past-events'])
	})

	it('handles empty MandalaState', () => {
		const result = inferSessionState({})
		expect(result.currentStep).toBe(0)
		expect(result.mode).toBe('guided')
		expect(result.filledCells).toEqual([])
		expect(result.activeCells).toEqual([])
	})
})
