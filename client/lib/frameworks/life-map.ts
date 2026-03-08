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

const EMPTY_CONTENT = { question: '', guidance: '', examples: [] as string[] }

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
] as const

const WEEK_GROUPS = [
	{ id: 'week1', label: 'Week 1' },
	{ id: 'week2', label: 'Week 2' },
	{ id: 'week3', label: 'Week 3' },
	{ id: 'week4', label: 'Week 4' },
] as const

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
] as const

/** 10 seven-year life phase blocks rendered as an overlay at ring 4 */
const LIFE_PHASE_BLOCKS = [
	{ id: 'phase-0-7', label: '0–7', fraction: 0.1 },
	{ id: 'phase-7-14', label: '7–14', fraction: 0.1 },
	{ id: 'phase-14-21', label: '14–21', fraction: 0.1 },
	{ id: 'phase-21-28', label: '21–28', fraction: 0.1 },
	{ id: 'phase-28-35', label: '28–35', fraction: 0.1 },
	{ id: 'phase-35-42', label: '35–42', fraction: 0.1 },
	{ id: 'phase-42-49', label: '42–49', fraction: 0.1 },
	{ id: 'phase-49-56', label: '49–56', fraction: 0.1 },
	{ id: 'phase-56-63', label: '56–63', fraction: 0.1 },
	{ id: 'phase-63-70+', label: '63–70+', fraction: 0.1 },
]

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
			startAngle: 90,
			endAngle: 120,
			cells: buildSliceCells('espiritual'),
		},
		{
			id: 'mental',
			label: 'Mental',
			startAngle: 120,
			endAngle: 150,
			cells: buildSliceCells('mental'),
		},
		{
			id: 'fisico',
			label: 'Físico',
			startAngle: 150,
			endAngle: 180,
			cells: buildSliceCells('fisico'),
		},
		{
			id: 'material',
			label: 'Material',
			startAngle: 180,
			endAngle: 210,
			cells: buildSliceCells('material'),
		},
		{
			id: 'profissional',
			label: 'Profissional',
			startAngle: 210,
			endAngle: 240,
			cells: buildSliceCells('profissional'),
		},
		{
			id: 'pessoal',
			label: 'Pessoal',
			startAngle: 240,
			endAngle: 270,
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
	const ringIds = RING_DEFS.map((r) => r.id)

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
		...EMPTY_CONTENT,
		transparent: true,
		children: [buildDomainChain(slice.id)],
	}
}

const DAY_SEGMENTS = [
	{ id: 'dawn', label: 'Madrugada' },
	{ id: 'morning', label: 'Manhã' },
	{ id: 'afternoon', label: 'Tarde' },
	{ id: 'night', label: 'Noite' },
] as const

/**
 * Build a temporal day node within a week group:
 * day (transparent+hideLabel) → dawn → morning → afternoon → night → week-slot (groupId) → months (hideLabel)
 *
 * Non-Flow days: morning segment carries the day name label; other segments are hideLabel.
 * Flow: all 4 segments are hideLabel (no visible time subdivisions).
 */
function buildTemporalDayNode(dayIndex: number, weekIndex: number): TreeNodeDef {
	const day = DAYS[dayIndex]
	const week = WEEK_GROUPS[weekIndex]
	const monthOffset = weekIndex * 3
	const isFlow = dayIndex === 0

	const monthChildren: TreeNodeDef[] = []
	for (let m = 0; m < 3; m++) {
		const monthIdx = monthOffset + m
		const monthName = MONTHS[monthIdx]
		monthChildren.push({
			id: `${day.id}-${monthName.toLowerCase()}`,
			label: monthName,
			...EMPTY_CONTENT,
			hideLabel: true,
		})
	}

	const weekSlot: TreeNodeDef = {
		id: `${day.id}-${week.id}`,
		label: week.label,
		...EMPTY_CONTENT,
		groupId: week.id,
		children: monthChildren,
	}

	if (isFlow) {
		// Flow: single visible cell (no day segments), directly contains week → months
		// Uses dedicated radial band region so band 1 spans the full segment area
		return {
			id: day.id,
			label: day.label,
			...EMPTY_CONTENT,
			children: [weekSlot],
		}
	}

	// Build segment chain from night (outermost) inward to dawn (innermost)
	// dawn(vis1) → morning(vis2) → afternoon(vis3) → night(vis4) → week(vis5) → month(vis6)
	let current: TreeNodeDef = weekSlot
	for (let i = DAY_SEGMENTS.length - 1; i >= 0; i--) {
		const seg = DAY_SEGMENTS[i]
		const isNight = i === 3
		current = {
			id: `${day.id}-${seg.id}`,
			// Night segment carries the day name; others have segment label but are hidden
			label: isNight ? day.label : seg.label,
			...EMPTY_CONTENT,
			hideLabel: !isNight,
			children: [current],
		}
	}

	// Non-Flow: transparent + hideLabel wrapper (no visual cell, no group label)
	return {
		id: day.id,
		label: day.label,
		...EMPTY_CONTENT,
		transparent: true,
		hideLabel: true,
		children: [current],
	}
}

/**
 * Build a transparent week group containing its 2 day children.
 * Structure: week-group (transparent) → day nodes
 */
function buildWeekGroup(weekIndex: number): TreeNodeDef {
	const week = WEEK_GROUPS[weekIndex]
	const dayStart = weekIndex * 2
	const dayChildren: TreeNodeDef[] = []
	for (let d = 0; d < 2; d++) {
		dayChildren.push(buildTemporalDayNode(dayStart + d, weekIndex))
	}
	return {
		id: `${week.id}-group`,
		label: week.label,
		...EMPTY_CONTENT,
		transparent: true,
		hideLabel: true,
		children: dayChildren,
	}
}

// Domain nodes for the bottom half (6 domains)
const DOMAIN_NODES: TreeNodeDef[] = LIFE_MAP.slices.map((s) => buildDomainNode(s))

// Temporal week groups for the top half (4 weeks × 2 days each = 8 days)
const TEMPORAL_NODES: TreeNodeDef[] = Array.from({ length: 4 }, (_, i) =>
	buildWeekGroup(i),
)

export const LIFE_TREE: TreeMapDefinition = {
	id: 'life-map',
	name: LIFE_MAP.name,
	description: LIFE_MAP.description,
	// First child at 3 o'clock (bottom half starts at 3 o'clock going clockwise)
	startAngle: Math.PI / 2,
	radialBands: {
		centerRadius: 0.1,
		regions: [
			{
				// Bottom half: 6 domains (3 o'clock → 9 o'clock, clockwise)
				angularRange: [Math.PI / 2, (3 * Math.PI) / 2],
				bands: {
					1: [0.1, 0.325], // Querer
					2: [0.325, 0.55], // Ser
					3: [0.55, 0.775], // Ter
					4: [0.775, 1.0], // Saber
				},
			},
			{
				// Flow slice: single cell spanning all day-segment bands, then week + month
				// Flow's day wrapper is visible (not transparent), segments are transparent
				// → visualDepth 1 = Flow cell, 2 = Week, 3 = Month
				angularRange: [(3 * Math.PI) / 2, (3 * Math.PI) / 2 + Math.PI / 8],
				bands: {
					1: [0.1, 0.6625], // Flow cell (spans dawn→night range)
					2: [0.6625, 0.775], // Week
					3: [0.775, 0.8875], // Month
				},
			},
			{
				// Top half (non-Flow): temporal days with 4 segments each
				angularRange: [(3 * Math.PI) / 2 + Math.PI / 8, (5 * Math.PI) / 2],
				bands: {
					1: [0.1, 0.2406], // Dawn
					2: [0.2406, 0.3813], // Morning
					3: [0.3813, 0.5219], // Afternoon
					4: [0.5219, 0.6625], // Night (day label here)
					5: [0.6625, 0.775], // Week (outer aligned with Ter outer)
					6: [0.775, 0.8875], // Month (half of Saber band)
				},
			},
		],
	},
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
	// 10 seven-year life phase blocks as an overlay at ring 4
	overlayRing: {
		startNodeId: TEMPORAL_NODES[0].children![0].id, // first day (flow)
		endNodeId: TEMPORAL_NODES[TEMPORAL_NODES.length - 1].children![1].id, // last day (sunday)
		arcs: LIFE_PHASE_BLOCKS,
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
