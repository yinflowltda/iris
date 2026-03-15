import { describe, expect, it } from 'vitest'
import { EMOTIONS_TREE } from '../../../client/lib/frameworks/emotions-map'
import { LIFE_TREE } from '../../../client/lib/frameworks/life-map'
import {
	analyzeCoverage,
	analyzeGaps,
	analyzeKnowledgeGraph,
	detectChains,
} from '../../../client/lib/flora/symbolic-reasoning'
import type {
	EdgeTypeDef,
	MandalaArrowRecord,
	MandalaState,
} from '../../../shared/types/MandalaTypes'

// ─── Test data ──────────────────────────────────────────────────────────────

const EDGE_TYPES: EdgeTypeDef[] = [
	{
		id: 'triggers',
		label: 'triggers',
		fromCells: ['past-events'],
		toCells: ['past-thoughts-emotions'],
		empiricalBasis: 'CBT',
	},
	{
		id: 'shapes',
		label: 'shapes',
		fromCells: ['past-thoughts-emotions'],
		toCells: ['present-beliefs'],
		empiricalBasis: 'CBT',
	},
	{
		id: 'drives',
		label: 'drives',
		fromCells: ['present-beliefs'],
		toCells: ['present-behaviors'],
		empiricalBasis: 'CBT',
	},
	{
		id: 'supports',
		label: 'supports',
		fromCells: ['evidence'],
		toCells: ['present-beliefs', 'future-beliefs'],
		empiricalBasis: 'CBT',
		color: 'green',
	},
]

const STATE: MandalaState = {
	'past-events': { status: 'filled', contentShapeIds: ['note-1' as any] },
	'past-thoughts-emotions': { status: 'filled', contentShapeIds: ['note-2' as any] },
	'present-beliefs': { status: 'filled', contentShapeIds: ['note-3' as any] },
	'present-behaviors': { status: 'filled', contentShapeIds: ['note-4' as any] },
	evidence: { status: 'filled', contentShapeIds: ['note-5' as any] },
	'future-beliefs': { status: 'empty', contentShapeIds: [] },
	'future-events': { status: 'empty', contentShapeIds: [] },
}

// ─── detectChains ───────────────────────────────────────────────────────────

describe('detectChains', () => {
	it('detects a 3-node chain: events → thoughts → beliefs', () => {
		const arrows: MandalaArrowRecord[] = [
			{
				arrowId: 'a1' as any,
				sourceElementId: 'note-1' as any,
				targetElementId: 'note-2' as any,
				color: 'black',
				edgeTypeId: 'triggers',
			},
			{
				arrowId: 'a2' as any,
				sourceElementId: 'note-2' as any,
				targetElementId: 'note-3' as any,
				color: 'black',
				edgeTypeId: 'shapes',
			},
		]

		const chains = detectChains(arrows, STATE, EDGE_TYPES)
		expect(chains.length).toBeGreaterThanOrEqual(1)

		const longest = chains.reduce((a, b) => (a.noteIds.length > b.noteIds.length ? a : b))
		expect(longest.noteIds).toEqual(['note-1', 'note-2', 'note-3'])
		expect(longest.edgeTypeIds).toEqual(['triggers', 'shapes'])
		expect(longest.isComplete).toBe(true)
	})

	it('detects a 4-node chain: events → thoughts → beliefs → behaviors', () => {
		const arrows: MandalaArrowRecord[] = [
			{
				arrowId: 'a1' as any,
				sourceElementId: 'note-1' as any,
				targetElementId: 'note-2' as any,
				color: 'black',
				edgeTypeId: 'triggers',
			},
			{
				arrowId: 'a2' as any,
				sourceElementId: 'note-2' as any,
				targetElementId: 'note-3' as any,
				color: 'black',
				edgeTypeId: 'shapes',
			},
			{
				arrowId: 'a3' as any,
				sourceElementId: 'note-3' as any,
				targetElementId: 'note-4' as any,
				color: 'black',
				edgeTypeId: 'drives',
			},
		]

		const chains = detectChains(arrows, STATE, EDGE_TYPES)
		const longest = chains.reduce((a, b) => (a.noteIds.length > b.noteIds.length ? a : b))
		expect(longest.noteIds).toHaveLength(4)
		expect(longest.isComplete).toBe(true)
	})

	it('returns empty for no arrows', () => {
		expect(detectChains([], STATE, EDGE_TYPES)).toEqual([])
	})

	it('returns empty for arrows without edgeTypeId', () => {
		const arrows: MandalaArrowRecord[] = [
			{
				arrowId: 'a1' as any,
				sourceElementId: 'note-1' as any,
				targetElementId: 'note-2' as any,
				color: 'black',
			},
		]
		expect(detectChains(arrows, STATE, EDGE_TYPES)).toEqual([])
	})

	it('handles disconnected arrows as separate chains', () => {
		const arrows: MandalaArrowRecord[] = [
			{
				arrowId: 'a1' as any,
				sourceElementId: 'note-1' as any,
				targetElementId: 'note-2' as any,
				color: 'black',
				edgeTypeId: 'triggers',
			},
			{
				arrowId: 'a2' as any,
				sourceElementId: 'note-3' as any,
				targetElementId: 'note-4' as any,
				color: 'black',
				edgeTypeId: 'drives',
			},
		]

		const chains = detectChains(arrows, STATE, EDGE_TYPES)
		expect(chains.length).toBe(2)
	})
})

// ─── analyzeGaps ────────────────────────────────────────────────────────────

describe('analyzeGaps', () => {
	const cellLabelMap = new Map([
		['past-events', 'Events'],
		['past-thoughts-emotions', 'Thoughts & Emotions'],
		['present-beliefs', 'Beliefs'],
		['present-behaviors', 'Behaviors'],
		['evidence', 'Evidence'],
		['future-beliefs', 'Future Beliefs'],
		['future-events', 'Future Events'],
	])

	it('reports all gaps when no arrows exist', () => {
		const gaps = analyzeGaps([], STATE, EDGE_TYPES, cellLabelMap)
		// With the test state (5 filled cells), all edge types with both endpoints filled should be gaps
		// triggers: past-events → past-thoughts-emotions (both filled) ✓
		// shapes: past-thoughts-emotions → present-beliefs (both filled) ✓
		// drives: present-beliefs → present-behaviors (both filled) ✓
		// supports: evidence → present-beliefs (both filled) ✓
		// supports: evidence → future-beliefs (future-beliefs empty) ✗
		expect(gaps).toHaveLength(4)
	})

	it('removes gap when arrow exists', () => {
		const arrows: MandalaArrowRecord[] = [
			{
				arrowId: 'a1' as any,
				sourceElementId: 'note-1' as any,
				targetElementId: 'note-2' as any,
				color: 'black',
				edgeTypeId: 'triggers',
			},
		]

		const gaps = analyzeGaps(arrows, STATE, EDGE_TYPES, cellLabelMap)
		expect(gaps.find((g) => g.edgeTypeId === 'triggers')).toBeUndefined()
		expect(gaps).toHaveLength(3)
	})

	it('does not report gaps for empty target cells', () => {
		const gaps = analyzeGaps([], STATE, EDGE_TYPES, cellLabelMap)
		// supports: evidence → future-beliefs should NOT be reported (future-beliefs is empty)
		const futureGap = gaps.find((g) => g.toCellId === 'future-beliefs')
		expect(futureGap).toBeUndefined()
	})

	it('includes labels and suggestWhen', () => {
		const gaps = analyzeGaps([], STATE, EDGE_TYPES, cellLabelMap)
		const triggersGap = gaps.find((g) => g.edgeTypeId === 'triggers')
		expect(triggersGap?.fromCellLabel).toBe('Events')
		expect(triggersGap?.toCellLabel).toBe('Thoughts & Emotions')
	})

	it('returns empty when no edge types defined', () => {
		expect(analyzeGaps([], STATE, [], cellLabelMap)).toEqual([])
	})
})

// ─── analyzeCoverage ────────────────────────────────────────────────────────

describe('analyzeCoverage', () => {
	it('correctly counts filled and empty cells from Emotions Map', () => {
		const coverage = analyzeCoverage(STATE, EMOTIONS_TREE)
		expect(coverage.totalCells).toBe(7)
		expect(coverage.filledCells).toBe(5)
		expect(coverage.emptyCells).toHaveLength(2)
		const emptyIds = coverage.emptyCells.map((c) => c.cellId)
		expect(emptyIds).toContain('future-beliefs')
		expect(emptyIds).toContain('future-events')
	})

	it('identifies thin cells (1 note)', () => {
		const coverage = analyzeCoverage(STATE, EMOTIONS_TREE)
		// All filled cells in STATE have exactly 1 note
		expect(coverage.thinCells).toHaveLength(5)
	})

	it('handles empty state', () => {
		const coverage = analyzeCoverage({}, EMOTIONS_TREE)
		expect(coverage.filledCells).toBe(0)
		expect(coverage.emptyCells).toHaveLength(7)
		expect(coverage.thinCells).toHaveLength(0)
	})
})

// ─── analyzeKnowledgeGraph ──────────────────────────────────────────────────

describe('analyzeKnowledgeGraph', () => {
	it('returns full analysis with chains, gaps, and coverage', () => {
		const arrows: MandalaArrowRecord[] = [
			{
				arrowId: 'a1' as any,
				sourceElementId: 'note-1' as any,
				targetElementId: 'note-2' as any,
				color: 'black',
				edgeTypeId: 'triggers',
			},
			{
				arrowId: 'a2' as any,
				sourceElementId: 'note-2' as any,
				targetElementId: 'note-3' as any,
				color: 'black',
				edgeTypeId: 'shapes',
			},
		]

		const result = analyzeKnowledgeGraph(arrows, STATE, EMOTIONS_TREE)

		expect(result.chains.length).toBeGreaterThanOrEqual(1)
		expect(result.gaps.length).toBeGreaterThan(0)
		expect(result.coverage.totalCells).toBe(7)
		expect(result.stats.chainCount).toBeGreaterThanOrEqual(1)
		expect(result.stats.filledCellRatio).toBe('5/7')
	})

	it('handles tree without edgeTypes', () => {
		const treeDef = { ...EMOTIONS_TREE, edgeTypes: undefined }
		const result = analyzeKnowledgeGraph([], STATE, treeDef)

		expect(result.chains).toEqual([])
		expect(result.gaps).toEqual([])
		expect(result.coverage.totalCells).toBe(7)
	})

	it('uses real Emotions Map edge types', () => {
		// Verify EMOTIONS_TREE has edge types defined
		expect(EMOTIONS_TREE.edgeTypes).toBeDefined()
		expect(EMOTIONS_TREE.edgeTypes!.length).toBe(9)

		const result = analyzeKnowledgeGraph([], STATE, EMOTIONS_TREE)
		// With 5 filled cells and 0 arrows, there should be several gaps
		expect(result.gaps.length).toBeGreaterThan(0)
	})

	it('uses real Life Map edge types', () => {
		expect(LIFE_TREE.edgeTypes).toBeDefined()
		expect(LIFE_TREE.edgeTypes!.length).toBe(8)

		// Verify ring progression chain: shapes, determines, enables, informs
		const ids = LIFE_TREE.edgeTypes!.map((e) => e.id)
		expect(ids).toContain('shapes')
		expect(ids).toContain('determines')
		expect(ids).toContain('enables')
		expect(ids).toContain('informs')
		expect(ids).toContain('grounds')
		expect(ids).toContain('depends-on')
		expect(ids).toContain('conflicts-with')
		expect(ids).toContain('planned-in')
	})

	it('detects Life Map gaps with filled ring cells', () => {
		const lifeState: MandalaState = {
			'espiritual-querer': { status: 'filled', contentShapeIds: ['n1' as any] },
			'espiritual-ser': { status: 'filled', contentShapeIds: ['n2' as any] },
			'mental-querer': { status: 'filled', contentShapeIds: ['n3' as any] },
		}

		const result = analyzeKnowledgeGraph([], lifeState, LIFE_TREE)
		// shapes: querer→ser should show gaps for espiritual (filled→filled)
		const shapesGaps = result.gaps.filter((g) => g.edgeTypeId === 'shapes')
		expect(shapesGaps.some((g) => g.fromCellId === 'espiritual-querer')).toBe(true)
		// depends-on: cross-domain gaps between all filled cells
		const dependsGaps = result.gaps.filter((g) => g.edgeTypeId === 'depends-on')
		expect(dependsGaps.length).toBeGreaterThan(0)
	})
})
