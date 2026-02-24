import type {
	MapDefinition,
	TreeMapDefinition,
	TreeNodeDef,
} from '../../../shared/types/MandalaTypes'
import { registerFramework } from './framework-registry'

/**
 * Life Map (Mapa da Vida) — based on the Yinflow reference SVG.
 *
 * Structure: 6 life domains × 4 rings + center = 25 cells
 *
 * Domains: Espiritual, Emocional, Físico, Material, Profissional, Relacional
 * Rings (center → outer): Querer, Ser, Ter, Saber
 * Center: Essência (Essence/Self)
 */

const RING_DEFS = [
	{ id: 'querer', label: 'Querer', innerRatio: 0.1, outerRatio: 0.325 },
	{ id: 'ser', label: 'Ser', innerRatio: 0.325, outerRatio: 0.55 },
	{ id: 'ter', label: 'Ter', innerRatio: 0.55, outerRatio: 0.775 },
	{ id: 'saber', label: 'Saber', innerRatio: 0.775, outerRatio: 1.0 },
] as const

const RING_CONTENT: Record<string, { question: string; guidance: string; examples: string[] }> = {
	querer: {
		question: 'What do you truly want in this area of your life?',
		guidance:
			'Explore desires and aspirations without judgment. Help the user distinguish between surface wants and deeper longings.',
		examples: ['Inner peace and clarity', 'More meaningful connections', 'Financial freedom'],
	},
	ser: {
		question: 'Who are you being in this area? What identity do you embody?',
		guidance:
			'Explore self-perception, roles, and identity. Focus on how the user shows up, not what they do.',
		examples: [
			'A present and attentive partner',
			'Someone who prioritizes health',
			'A creative risk-taker',
		],
	},
	ter: {
		question: 'What do you currently have or possess in this area?',
		guidance:
			'Take inventory of resources, relationships, skills, and assets. Celebrate what already exists.',
		examples: [
			'A supportive family network',
			'5 years of professional experience',
			'A daily meditation practice',
		],
	},
	saber: {
		question: 'What do you know or need to learn in this area?',
		guidance:
			'Explore knowledge, wisdom, and learning gaps. Include both intellectual knowledge and experiential wisdom.',
		examples: [
			'I know my values clearly',
			'Need to learn about investing',
			'Understanding my emotional patterns',
		],
	},
}

function buildSliceCells(sliceId: string) {
	return RING_DEFS.map((ring) => ({
		id: `${sliceId}-${ring.id}`,
		label: ring.label,
		innerRatio: ring.innerRatio,
		outerRatio: ring.outerRatio,
		...RING_CONTENT[ring.id],
	}))
}

export const LIFE_MAP: MapDefinition = {
	id: 'life-map',
	name: 'Life Map',
	description:
		'A holistic mandala for exploring six key life dimensions through four lenses of self-awareness — Querer (desire), Ser (being), Ter (having), and Saber (knowing).',
	center: {
		id: 'essencia',
		label: 'Essência',
		radiusRatio: 0.1,
		question: 'What is your essence — the core of who you are beyond roles and titles?',
		guidance:
			'Help the user connect with their deepest sense of self. This is the anchor that holds all life dimensions together.',
		examples: [
			'Curiosity and compassion',
			'A seeker of truth and beauty',
			'Someone who values growth above comfort',
		],
	},
	slices: [
		{
			id: 'espiritual',
			label: 'Espiritual',
			startAngle: 330,
			endAngle: 30,
			cells: buildSliceCells('espiritual'),
		},
		{
			id: 'emocional',
			label: 'Emocional',
			startAngle: 30,
			endAngle: 90,
			cells: buildSliceCells('emocional'),
		},
		{
			id: 'fisico',
			label: 'Físico',
			startAngle: 90,
			endAngle: 150,
			cells: buildSliceCells('fisico'),
		},
		{
			id: 'material',
			label: 'Material',
			startAngle: 150,
			endAngle: 210,
			cells: buildSliceCells('material'),
		},
		{
			id: 'profissional',
			label: 'Profissional',
			startAngle: 210,
			endAngle: 270,
			cells: buildSliceCells('profissional'),
		},
		{
			id: 'relacional',
			label: 'Relacional',
			startAngle: 270,
			endAngle: 330,
			cells: buildSliceCells('relacional'),
		},
	],
}

// ─── Tree-based definition (sunburst renderer) ──────────────────────────────

const DOMAIN_SLICES = LIFE_MAP.slices

function buildDomainChain(sliceId: string): TreeNodeDef {
	const ringIds = ['querer', 'ser', 'ter', 'saber'] as const

	// Build from leaf (saber) inward to querer
	let current: TreeNodeDef | undefined
	for (let i = ringIds.length - 1; i >= 0; i--) {
		const ringId = ringIds[i]
		const content = RING_CONTENT[ringId]
		const ringDef = RING_DEFS[i]
		const node: TreeNodeDef = {
			id: `${sliceId}-${ringId}`,
			label: ringDef.label,
			question: content.question,
			guidance: content.guidance,
			examples: content.examples,
			...(current ? { children: [current] } : {}),
		}
		current = node
	}
	return current!
}

export const LIFE_TREE: TreeMapDefinition = {
	id: 'life-map',
	name: LIFE_MAP.name,
	description: LIFE_MAP.description,
	root: {
		id: LIFE_MAP.center.id,
		label: LIFE_MAP.center.label,
		question: LIFE_MAP.center.question,
		guidance: LIFE_MAP.center.guidance,
		examples: LIFE_MAP.center.examples,
		children: DOMAIN_SLICES.map((slice) => buildDomainChain(slice.id)),
	},
}

registerFramework({
	definition: LIFE_MAP,
	treeDefinition: LIFE_TREE,
	visual: {
		colors: {
			stroke: '#1B6B5A',
			text: '#1B6B5A',
			cellFill: '#F7FDFB',
			cellHoverFill: '#D0E8E0',
		},
		labelFont: 'Quicksand, sans-serif',
		defaultSize: 700,
	},
	template: {
		icon: '◐',
		description: 'See how different areas of your life are doing at a glance.',
		active: true,
	},
})
