import { describe, expect, it } from 'vitest'
import { LIFE_TREE } from '../../client/lib/frameworks/life-map'
import { getCellBoundsFromTree } from '../../client/lib/mandala-geometry'
import { computeSunburstLayout } from '../../client/lib/sunburst-layout'
import type { TreeNodeDef } from '../../shared/types/MandalaTypes'

function collectIds(node: TreeNodeDef): string[] {
	const ids = [node.id]
	for (const child of node.children ?? []) {
		ids.push(...collectIds(child))
	}
	return ids
}

describe('LIFE_TREE', () => {
	it('has root id "essencia"', () => {
		expect(LIFE_TREE.root.id).toBe('essencia')
	})

	it('has 10 children at depth 1 (6 domains + 4 week groups)', () => {
		expect(LIFE_TREE.root.children).toHaveLength(10)
	})

	it('contains 75 total IDs', () => {
		// root(1) + 6 transparent domains(6) + 6×4 rings(24) + 4 transparent week-groups(4) + 8 days(8) + 8 week-slots(8) + 24 months(24) = 75
		// (blocks are overlay arcs, not in the tree)
		const ids = collectIds(LIFE_TREE.root)
		expect(ids).toHaveLength(75)
	})

	it('has all expected domain-ring cell IDs', () => {
		const ids = new Set(collectIds(LIFE_TREE.root))
		const domains = ['espiritual', 'mental', 'fisico', 'material', 'profissional', 'pessoal']
		const rings = ['querer', 'ser', 'ter', 'saber']

		expect(ids.has('essencia')).toBe(true)
		for (const domain of domains) {
			expect(ids.has(domain)).toBe(true) // transparent wrapper
			for (const ring of rings) {
				expect(ids.has(`${domain}-${ring}`)).toBe(true)
			}
		}
	})

	it('bottom half: 6 domain transparent wrappers each contain querer→ser→ter→saber chain', () => {
		const domainNodes = LIFE_TREE.root.children!.slice(0, 6)
		for (const domain of domainNodes) {
			// Domain is a transparent wrapper
			expect(domain.transparent).toBe(true)
			expect(domain.children).toHaveLength(1)

			// Its single child is querer
			const querer = domain.children![0]
			expect(querer.id).toMatch(/-querer$/)
			expect(querer.children).toHaveLength(1)

			const ser = querer.children![0]
			expect(ser.id).toMatch(/-ser$/)
			expect(ser.children).toHaveLength(1)

			const ter = ser.children![0]
			expect(ter.id).toMatch(/-ter$/)
			expect(ter.children).toHaveLength(1)

			const saber = ter.children![0]
			expect(saber.id).toMatch(/-saber$/)
			expect(saber.children).toBeUndefined()
			// Leaf saber has weight:4
			expect(saber.weight).toBe(4)
		}
	})

	it('top half: 4 transparent week groups each containing 2 day chains', () => {
		const weekGroups = LIFE_TREE.root.children!.slice(6)
		expect(weekGroups).toHaveLength(4)

		for (const weekGroup of weekGroups) {
			expect(weekGroup.transparent).toBe(true)
			expect(weekGroup.children).toHaveLength(2)

			for (const day of weekGroup.children!) {
				// day (ring 1)
				expect(day.children).toHaveLength(1)

				// week-slot (ring 2) with groupId
				const weekSlot = day.children![0]
				expect(weekSlot.id).toContain('week')
				expect(weekSlot.groupId).toBeTruthy()

				// 3 months (ring 3, leaves with hideLabel — blocks are overlay)
				expect(weekSlot.children).toHaveLength(3)
				for (const month of weekSlot.children!) {
					expect(month.hideLabel).toBe(true)
					// months are leaves (blocks rendered as overlay ring)
					expect(month.children).toBeUndefined()
				}
			}
		}
	})

	it('getCellBoundsFromTree returns bounds for month cells', () => {
		const center = { x: 400, y: 400 }
		const outerRadius = 350
		const bounds = getCellBoundsFromTree(LIFE_TREE, center, outerRadius, 'flow-january')
		expect(bounds).not.toBeNull()
		expect(bounds!.type).toBe('sector')
	})

	it('getCellBoundsFromTree returns bounds for overlay block cells', () => {
		const center = { x: 400, y: 400 }
		const outerRadius = 350
		const bounds = getCellBoundsFromTree(LIFE_TREE, center, outerRadius, 'phase-0-7')
		expect(bounds).not.toBeNull()
		expect(bounds!.type).toBe('sector')
	})

	it('reuses question/guidance/examples from RING_CONTENT', () => {
		// Spot-check: root should have content from LIFE_MAP center
		expect(LIFE_TREE.root.question).toBeTruthy()
		expect(LIFE_TREE.root.guidance).toBeTruthy()
		expect(LIFE_TREE.root.examples.length).toBeGreaterThan(0)

		// Spot-check a ring node (first domain's querer, inside transparent wrapper)
		const firstDomain = LIFE_TREE.root.children![0]
		const querer = firstDomain.children![0]
		expect(querer.question).toContain('want')
	})

	it('week ring outer aligns with Ter ring outer', () => {
		const arcs = computeSunburstLayout(LIFE_TREE)
		const terArc = arcs.find((a) => a.id === 'espiritual-ter')!
		const weekArc = arcs.find((a) => a.id === 'flow-week1')!

		// Week outer boundary matches Ter outer boundary
		expect(weekArc.y1).toBeCloseTo(terArc.y1, 5)
	})

	it('day ring outer is at midpoint of Ter band', () => {
		const arcs = computeSunburstLayout(LIFE_TREE)
		const terArc = arcs.find((a) => a.id === 'espiritual-ter')!
		const dayArc = arcs.find((a) => a.id === 'flow')!

		const terMidpoint = (terArc.y0 + terArc.y1) / 2
		expect(dayArc.y1).toBeCloseTo(terMidpoint, 5)
	})

	it('month and overlay blocks split remaining space evenly', () => {
		const arcs = computeSunburstLayout(LIFE_TREE)
		const saberArc = arcs.find((a) => a.id === 'espiritual-saber')!
		const monthArc = arcs.find((a) => a.id === 'flow-january')!

		// Month starts at Saber start, ends at midpoint of Saber band
		expect(monthArc.y0).toBeCloseTo(saberArc.y0, 5)
		const saberMidpoint = (saberArc.y0 + saberArc.y1) / 2
		expect(monthArc.y1).toBeCloseTo(saberMidpoint, 5)
	})

	it('day ring is wider than a single bottom-half ring', () => {
		const arcs = computeSunburstLayout(LIFE_TREE)
		const quererArc = arcs.find((a) => a.id === 'espiritual-querer')!
		const dayArc = arcs.find((a) => a.id === 'flow')!

		const quererWidth = quererArc.y1 - quererArc.y0
		const dayWidth = dayArc.y1 - dayArc.y0
		expect(dayWidth).toBeGreaterThan(quererWidth)
	})
})
