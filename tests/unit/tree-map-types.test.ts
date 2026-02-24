import { describe, expect, it } from 'vitest'
import type { TreeMapDefinition, TreeNodeDef } from '../../shared/types/MandalaTypes'

describe('TreeMapDefinition types', () => {
	it('allows a simple tree with root and children', () => {
		const tree: TreeMapDefinition = {
			id: 'test',
			name: 'Test Map',
			description: 'A test map',
			root: {
				id: 'root',
				label: 'Root',
				question: 'Root question?',
				guidance: 'Root guidance',
				examples: ['Example 1'],
				children: [
					{
						id: 'child-1',
						label: 'Child 1',
						question: 'Q1?',
						guidance: 'G1',
						examples: [],
					},
					{
						id: 'child-2',
						label: 'Child 2',
						question: 'Q2?',
						guidance: 'G2',
						examples: [],
						weight: 2,
						children: [
							{
								id: 'grandchild',
								label: 'Grandchild',
								question: 'Q3?',
								guidance: 'G3',
								examples: [],
							},
						],
					},
				],
			},
		}
		expect(tree.root.id).toBe('root')
		expect(tree.root.children).toHaveLength(2)
		expect(tree.root.children![1].weight).toBe(2)
		expect(tree.root.children![1].children![0].id).toBe('grandchild')
	})

	it('supports transparent grouping nodes', () => {
		const group: TreeNodeDef = {
			id: 'group',
			label: 'Group',
			question: '',
			guidance: '',
			examples: [],
			transparent: true,
			children: [
				{
					id: 'member-a',
					label: 'Member A',
					question: 'Q?',
					guidance: '',
					examples: [],
				},
				{
					id: 'member-b',
					label: 'Member B',
					question: 'Q?',
					guidance: '',
					examples: [],
				},
			],
		}
		expect(group.transparent).toBe(true)
		expect(group.children).toHaveLength(2)
	})

	it('supports metadataSchema on nodes', () => {
		const node: TreeNodeDef = {
			id: 'with-meta',
			label: 'With Meta',
			question: 'Q?',
			guidance: '',
			examples: [],
			metadataSchema: {
				intensity: 'number',
				is_primary: 'boolean',
				kind: 'string',
			},
		}
		expect(node.metadataSchema).toEqual({
			intensity: 'number',
			is_primary: 'boolean',
			kind: 'string',
		})
	})
})
