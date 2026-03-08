import { describe, expect, it } from 'vitest'
import { getAllFrameworks, getFramework } from '../../client/lib/frameworks/framework-registry'

import '../../client/lib/frameworks/emotions-map'
import '../../client/lib/frameworks/life-map'

describe('framework registry', () => {
	it('returns the emotions-map framework by id', () => {
		const entry = getFramework('emotions-map')
		expect(entry).toBeDefined()
		expect(entry.definition.id).toBe('emotions-map')
		expect(entry.definition.name).toBe('Emotions Map')
	})

	it('returns the life-map framework by id', () => {
		const entry = getFramework('life-map')
		expect(entry).toBeDefined()
		expect(entry.definition.id).toBe('life-map')
		expect(entry.definition.name).toBe('Life Map')
	})

	it('throws for unknown framework id', () => {
		expect(() => getFramework('nonexistent')).toThrow('Unknown framework: nonexistent')
	})

	it('getAllFrameworks returns all registered frameworks', () => {
		const all = getAllFrameworks()
		const ids = all.map((e) => e.definition.id)
		expect(ids).toContain('emotions-map')
		expect(ids).toContain('life-map')
		expect(all.length).toBeGreaterThanOrEqual(2)
	})

	describe('framework entries have required fields', () => {
		const allFrameworks = getAllFrameworks()

		for (const entry of allFrameworks) {
			describe(entry.definition.id, () => {
				it('has a valid definition with id, name, description', () => {
					expect(entry.definition.id).toBeTruthy()
					expect(entry.definition.name).toBeTruthy()
					expect(entry.definition.description).toBeTruthy()
				})

				it('has a center cell', () => {
					expect(entry.definition.center).toBeDefined()
					expect(entry.definition.center.id).toBeTruthy()
					expect(entry.definition.center.radiusRatio).toBeGreaterThan(0)
					expect(entry.definition.center.radiusRatio).toBeLessThan(1)
				})

				it('has at least one slice', () => {
					expect(entry.definition.slices.length).toBeGreaterThan(0)
				})

				it('has slices that cover a valid angular range', () => {
					let totalSweep = 0
					for (const slice of entry.definition.slices) {
						let sweep = slice.endAngle - slice.startAngle
						if (sweep <= 0) sweep += 360
						totalSweep += sweep
					}
					// Slices may cover full circle (360°) or a half (180°) for two-half layouts
					expect(totalSweep).toBeGreaterThan(0)
					expect(totalSweep).toBeLessThanOrEqual(360)
				})

				it('has visual config with colors', () => {
					expect(entry.visual).toBeDefined()
					expect(entry.visual.colors.stroke).toBeTruthy()
					expect(entry.visual.colors.text).toBeTruthy()
					expect(entry.visual.colors.cellFill).toBeTruthy()
					expect(entry.visual.colors.cellHoverFill).toBeTruthy()
				})

				it('has a template config', () => {
					expect(entry.template).toBeDefined()
					expect(entry.template.icon).toBeTruthy()
					expect(entry.template.description).toBeTruthy()
				})

				it('has a treeDefinition with matching id', () => {
					expect(entry.treeDefinition).toBeDefined()
					expect(entry.treeDefinition!.id).toBe(entry.definition.id)
					expect(entry.treeDefinition!.root).toBeDefined()
					expect(entry.treeDefinition!.root.id).toBeTruthy()
				})
			})
		}
	})
})
