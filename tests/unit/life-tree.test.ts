import { describe, expect, it } from 'vitest'
import { LIFE_TREE } from '../../client/lib/frameworks/life-map'
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

	it('has 6 children at depth 1 (one per domain)', () => {
		expect(LIFE_TREE.root.children).toHaveLength(6)
	})

	it('contains 25 total IDs (1 root + 6 domains × 4 rings)', () => {
		const ids = collectIds(LIFE_TREE.root)
		expect(ids).toHaveLength(25)
	})

	it('has all expected domain-ring cell IDs', () => {
		const ids = new Set(collectIds(LIFE_TREE.root))
		const domains = ['espiritual', 'emocional', 'fisico', 'material', 'profissional', 'relacional']
		const rings = ['querer', 'ser', 'ter', 'saber']

		expect(ids.has('essencia')).toBe(true)
		for (const domain of domains) {
			for (const ring of rings) {
				expect(ids.has(`${domain}-${ring}`)).toBe(true)
			}
		}
	})

	it('has equal weights for all domain children (default/undefined)', () => {
		const children = LIFE_TREE.root.children!
		// All children should have the same weight (or all undefined = equal)
		const weights = children.map((c) => c.weight)
		const allSame = weights.every((w) => w === weights[0])
		expect(allSame).toBe(true)
	})

	it('each domain forms a chain of 4 rings: querer → ser → ter → saber', () => {
		for (const domain of LIFE_TREE.root.children!) {
			// domain child is querer
			expect(domain.id).toMatch(/-querer$/)
			expect(domain.children).toHaveLength(1)

			const ser = domain.children![0]
			expect(ser.id).toMatch(/-ser$/)
			expect(ser.children).toHaveLength(1)

			const ter = ser.children![0]
			expect(ter.id).toMatch(/-ter$/)
			expect(ter.children).toHaveLength(1)

			const saber = ter.children![0]
			expect(saber.id).toMatch(/-saber$/)
			expect(saber.children).toBeUndefined()
		}
	})

	it('reuses question/guidance/examples from RING_CONTENT', () => {
		// Spot-check: root should have content from LIFE_MAP center
		expect(LIFE_TREE.root.question).toBeTruthy()
		expect(LIFE_TREE.root.guidance).toBeTruthy()
		expect(LIFE_TREE.root.examples.length).toBeGreaterThan(0)

		// Spot-check a ring node
		const querer = LIFE_TREE.root.children![0]
		expect(querer.question).toContain('want')
	})
})
