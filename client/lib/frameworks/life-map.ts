import type {
	MapDefinition,
	TreeMapDefinition,
	TreeNodeDef,
} from '../../../shared/types/MandalaTypes'
import { registerFramework } from './framework-registry'

/**
 * Life Map (Mapa da Vida)
 *
 * Two-half structure:
 * - Bottom half (3→9 o'clock): 6 life domains × 4 rings (Querer/Ser/Ter/Saber)
 * - Top half (9→3 o'clock): Temporal calendar — 8 days → week-slots → months → 7-year blocks
 *
 * Domains: Espiritual, Mental, Físico, Material, Profissional, Pessoal
 * Rings (center → outer): Querer, Ser, Ter, Saber
 * Center: Essência (Essence/Self)
 */

// ─── Ring definitions (bottom half: life domains) ────────────────────────────

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

// ─── Temporal constants (top half) ───────────────────────────────────────────

const DAYS = [
	{ id: 'flow', label: 'Flow' },
	{ id: 'monday', label: 'Monday' },
	{ id: 'tuesday', label: 'Tuesday' },
	{ id: 'wednesday', label: 'Wednesday' },
	{ id: 'thursday', label: 'Thursday' },
	{ id: 'friday', label: 'Friday' },
	{ id: 'saturday', label: 'Saturday' },
	{ id: 'sunday', label: 'Sunday' },
]

const WEEK_GROUPS = [
	{ id: 'week1', label: 'Week 1' },
	{ id: 'week2', label: 'Week 2' },
	{ id: 'week3', label: 'Week 3' },
	{ id: 'week4', label: 'Week 4' },
]

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
]

const MONTH_TO_BLOCK: Record<number, { id: string; label: string }> = {
	0: { id: '0-6', label: '0-6' },
	1: { id: '0-6', label: '0-6' },
	2: { id: '7-13', label: '7-13' },
	3: { id: '14-20', label: '14-20' },
	4: { id: '21-27', label: '21-27' },
	5: { id: '28-34', label: '28-34' },
	6: { id: '35-41', label: '35-41' },
	7: { id: '35-41', label: '35-41' },
	8: { id: '35-41', label: '35-41' },
	9: { id: '42-48', label: '42-48' },
	10: { id: '42-48', label: '42-48' },
	11: { id: '42-48', label: '42-48' },
}

// ─── MapDefinition (legacy flat format) ──────────────────────────────────────

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
			id: 'mental',
			label: 'Mental',
			startAngle: 30,
			endAngle: 90,
			cells: buildSliceCells('mental'),
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
			id: 'pessoal',
			label: 'Pessoal',
			startAngle: 270,
			endAngle: 330,
			cells: buildSliceCells('pessoal'),
		},
	],
}

// ─── Tree-based definition (sunburst renderer) ──────────────────────────────

/**
 * Build a domain's ring chain: querer → ser → ter → saber (leaf with weight:4).
 * Wrapped in a transparent group node for the domain label.
 */
function buildDomainChain(sliceId: string): TreeNodeDef {
	const ringIds = ['querer', 'ser', 'ter', 'saber'] as const

	// Build from leaf (saber) inward to querer
	let current: TreeNodeDef | undefined
	for (let i = ringIds.length - 1; i >= 0; i--) {
		const ringId = ringIds[i]
		const content = RING_CONTENT[ringId]
		const ringDef = RING_DEFS[i]
		const isLeaf = i === ringIds.length - 1
		const node: TreeNodeDef = {
			id: `${sliceId}-${ringId}`,
			label: ringDef.label,
			question: content.question,
			guidance: content.guidance,
			examples: content.examples,
			// Leaf gets weight:4 so 6 domains × 4 = 24 units (matches top half)
			...(isLeaf ? { weight: 4 } : {}),
			...(current ? { children: [current] } : {}),
		}
		current = node
	}
	return current!
}

/** Wrap a domain's ring chain in a transparent group node so the domain label renders. */
function buildDomainNode(slice: { id: string; label: string }): TreeNodeDef {
	return {
		id: slice.id,
		label: slice.label,
		question: '',
		guidance: '',
		examples: [],
		transparent: true,
		children: [buildDomainChain(slice.id)],
	}
}

/**
 * Build a temporal day chain:
 * day (ring 1) → week-slot (ring 2) → 3 month branches (ring 3) → block leaf (ring 4)
 */
function buildTemporalDayNode(dayIndex: number): TreeNodeDef {
	const day = DAYS[dayIndex]
	const weekIndex = Math.floor(dayIndex / 2)
	const week = WEEK_GROUPS[weekIndex]
	const monthOffset = weekIndex * 3

	const monthChildren: TreeNodeDef[] = []
	for (let m = 0; m < 3; m++) {
		const monthIdx = monthOffset + m
		const monthName = MONTHS[monthIdx]
		const block = MONTH_TO_BLOCK[monthIdx]
		monthChildren.push({
			id: `${day.id}-${monthName.toLowerCase()}`,
			label: monthName,
			question: '',
			guidance: '',
			examples: [],
			children: [
				{
					id: `${day.id}-${monthName.toLowerCase()}-block`,
					label: block.label,
					question: '',
					guidance: '',
					examples: [],
				},
			],
		})
	}

	return {
		id: day.id,
		label: day.label,
		question: '',
		guidance: '',
		examples: [],
		children: [
			{
				id: `${day.id}-${week.id}`,
				label: week.label,
				question: '',
				guidance: '',
				examples: [],
				children: monthChildren,
			},
		],
	}
}

// Domain nodes for the bottom half (6 domains)
const DOMAIN_NODES: TreeNodeDef[] = [
	{ id: 'espiritual', label: 'Espiritual' },
	{ id: 'mental', label: 'Mental' },
	{ id: 'fisico', label: 'Físico' },
	{ id: 'material', label: 'Material' },
	{ id: 'profissional', label: 'Profissional' },
	{ id: 'pessoal', label: 'Pessoal' },
].map((d) => buildDomainNode(d))

// Temporal day nodes for the top half (8 days)
const TEMPORAL_NODES: TreeNodeDef[] = Array.from({ length: 8 }, (_, i) =>
	buildTemporalDayNode(i),
)

export const LIFE_TREE: TreeMapDefinition = {
	id: 'life-map',
	name: LIFE_MAP.name,
	description: LIFE_MAP.description,
	// First child at 3 o'clock (bottom half starts at 3 o'clock going clockwise)
	startAngle: Math.PI / 2,
	root: {
		id: LIFE_MAP.center.id,
		label: LIFE_MAP.center.label,
		question: LIFE_MAP.center.question,
		guidance: LIFE_MAP.center.guidance,
		examples: LIFE_MAP.center.examples,
		children: [
			...DOMAIN_NODES,
			...TEMPORAL_NODES,
		],
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
	initialCover: {
		type: 'text-carousel',
		slides: [
			'How balanced is my life right now?',
			'Which area of my life needs the most attention?',
			'What does a fulfilling life look like for me?',
			'Where am I thriving and where am I stuck?',
			'What would change if I lived more intentionally?',
		],
		intervalMs: 5000,
	},
})
