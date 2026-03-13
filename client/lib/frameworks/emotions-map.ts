import type { MapDefinition, TreeMapDefinition } from '../../../shared/types/MandalaTypes'
import { registerFramework } from './framework-registry'

export const EMOTIONS_MAP: MapDefinition = {
	id: 'emotions-map',
	name: 'Emotions Map',
	description:
		'A therapeutic mandala for exploring emotions across time — past, present, and future — through events, thoughts, emotions, behaviors, beliefs, and evidence.',
	center: {
		id: 'evidence',
		label: 'Evidence',
		radiusRatio: 0.2,
		question: 'What evidence supports or contradicts the beliefs you have explored?',
		guidance:
			'Encourage objective evaluation. Look for both confirming and disconfirming evidence across all time periods.',
		examples: [
			'My friend stayed by my side through it all',
			'I did succeed at some things without suffering',
			'My colleagues gave me positive feedback recently',
		],
	},
	slices: [
		{
			id: 'past',
			label: 'Past',
			startAngle: 130,
			endAngle: 270,
			cells: [
				{
					id: 'past-events',
					label: 'Events',
					outerRatio: 1.0,
					innerRatio: 0.467,
					question: 'What significant events happened in your past related to this topic?',
					guidance:
						'Help the user recall concrete events without judgment. Focus on observable facts.',
					examples: [
						'I lost my job last year',
						'My parents divorced when I was 10',
						'I moved to a new city',
					],
				},
				{
					id: 'past-thoughts-emotions',
					label: 'Thoughts & Emotions',
					outerRatio: 0.467,
					innerRatio: 0.2,
					question: 'What thoughts and emotions did you experience during those past events?',
					guidance:
						'Explore both cognitive patterns and feelings together. Help name specific emotions and identify recurring thought themes.',
					examples: [
						'I felt deep sadness and thought I was not good enough',
						'I was overwhelmed with anxiety and believed things would never change',
						'I kept thinking it was my fault and felt relieved when it was over',
					],
				},
			],
		},
		{
			id: 'future',
			label: 'Future',
			startAngle: 270,
			endAngle: 50,
			cells: [
				{
					id: 'future-events',
					label: 'Events',
					outerRatio: 1.0,
					innerRatio: 0.467,
					question: 'What events or changes do you anticipate or hope for in the future?',
					guidance: 'Explore aspirations and fears about the future. Keep it concrete.',
					examples: [
						'I want to build a stable career',
						'I hope to have a family',
						'I plan to travel and explore',
					],
				},
				{
					id: 'future-beliefs',
					label: 'Beliefs',
					outerRatio: 0.467,
					innerRatio: 0.2,
					question: 'What beliefs would you like to hold about yourself and your future?',
					guidance: 'Help formulate empowering but authentic beliefs. Build on present evidence.',
					examples: [
						'I want to believe I am resilient',
						'I would like to trust that I am enough',
						'I want to believe in my capacity to grow',
					],
				},
			],
		},
		{
			id: 'present',
			label: 'Present',
			startAngle: 50,
			endAngle: 130,
			cells: [
				{
					id: 'present-behaviors',
					label: 'Behaviors',
					outerRatio: 1.0,
					innerRatio: 0.467,
					question: 'How are you currently behaving or responding to what is happening now?',
					guidance: 'Identify current patterns. Notice if past patterns are repeating.',
					examples: [
						'I am being more open with people',
						'I tend to overwork to prove myself',
						'I am seeking help for the first time',
					],
				},
				{
					id: 'present-beliefs',
					label: 'Beliefs',
					outerRatio: 0.467,
					innerRatio: 0.2,
					question: 'What do you currently believe about yourself and this situation?',
					guidance: 'Explore how beliefs may have evolved. Notice any cognitive dissonance.',
					examples: [
						'I am starting to believe I deserve good things',
						'I still struggle with feeling worthy',
						'I believe change is possible',
					],
				},
			],
		},
	],
}

// ─── Tree-based definition (sunburst renderer) ──────────────────────────────

const center = EMOTIONS_MAP.center
const pastSlice = EMOTIONS_MAP.slices[0]
const futureSlice = EMOTIONS_MAP.slices[1]
const presentSlice = EMOTIONS_MAP.slices[2]
const pastInner = pastSlice.cells[1] // past-thoughts-emotions
const pastOuter = pastSlice.cells[0] // past-events
const futureInner = futureSlice.cells[1] // future-beliefs
const futureOuter = futureSlice.cells[0] // future-events
const presentInner = presentSlice.cells[1] // present-beliefs
const presentOuter = presentSlice.cells[0] // present-behaviors

export const EMOTIONS_TREE: TreeMapDefinition = {
	id: 'emotions-map',
	name: EMOTIONS_MAP.name,
	description: EMOTIONS_MAP.description,
	// Center present at 12 o'clock: offset by half of present's sweep (120° = 2π/3)
	startAngle: -Math.PI / 3,
	edgeTypes: [
		{
			id: 'triggers',
			label: 'triggers',
			fromCells: ['past-events'],
			toCells: ['past-thoughts-emotions'],
			empiricalBasis:
				'CBT: Activating events trigger automatic thoughts and emotional responses (Beck, 1979)',
			suggestWhen: 'User describes a situation and its emotional impact',
			color: 'black',
		},
		{
			id: 'shapes',
			label: 'shapes',
			fromCells: ['past-thoughts-emotions'],
			toCells: ['present-beliefs'],
			empiricalBasis:
				'CBT: Repeated automatic thoughts crystallize into core beliefs (Beck, 1979; Young, 1990)',
			suggestWhen: 'User connects past thought patterns to current beliefs',
			color: 'black',
		},
		{
			id: 'drives',
			label: 'drives',
			fromCells: ['present-beliefs'],
			toCells: ['present-behaviors'],
			empiricalBasis: 'CBT: Core beliefs activate compensatory behavioral strategies (Beck, 2011)',
			suggestWhen: 'User describes how a belief leads to specific behaviors',
			color: 'black',
		},
		{
			id: 'supports',
			label: 'supports',
			fromCells: ['evidence'],
			toCells: ['present-beliefs', 'future-beliefs'],
			empiricalBasis:
				'CBT: Evidence evaluation is central to cognitive restructuring (Burns, 1980)',
			suggestWhen: 'User finds evidence that confirms a belief',
			color: 'green',
		},
		{
			id: 'contradicts',
			label: 'contradicts',
			fromCells: ['evidence'],
			toCells: ['present-beliefs', 'future-beliefs'],
			empiricalBasis: 'CBT: Disconfirming evidence challenges maladaptive beliefs (Padesky, 1994)',
			suggestWhen: 'User finds evidence that challenges a belief',
			color: 'red',
		},
		{
			id: 'evolves-into',
			label: 'evolves into',
			fromCells: ['present-beliefs'],
			toCells: ['future-beliefs'],
			empiricalBasis:
				'CBT: Cognitive restructuring transforms maladaptive beliefs into adaptive alternatives (Beck, 2011)',
			suggestWhen: 'User is reframing a negative belief into a healthier one',
			color: 'green',
		},
		{
			id: 'motivates',
			label: 'motivates',
			fromCells: ['future-beliefs'],
			toCells: ['future-events'],
			empiricalBasis:
				'CBT: Behavioral experiments and action plans flow from restructured beliefs (Bennett-Levy et al., 2004)',
			suggestWhen: 'User plans actions based on new beliefs',
			color: 'green',
		},
		{
			id: 'echoes',
			label: 'echoes',
			fromCells: ['past-events'],
			toCells: ['future-events'],
			empiricalBasis:
				'CBT: Past experiences inform future expectations, goals, and avoidance patterns (Ehlers & Clark, 2000)',
			suggestWhen: 'User connects a past experience to future plans or fears',
			color: 'black',
		},
		{
			id: 'reinforces',
			label: 'reinforces',
			fromCells: ['present-behaviors'],
			toCells: ['present-beliefs'],
			empiricalBasis:
				'CBT: Behavioral patterns maintain or modify belief systems through feedback loops (Salkovskis, 1991)',
			suggestWhen: 'User notices their behavior strengthening or weakening a belief',
			color: 'black',
		},
	],
	root: {
		id: center.id,
		label: center.label,
		question: center.question,
		guidance: center.guidance,
		examples: center.examples,
		metadataSchema: { direction: 'string', linked_belief_id: 'string' },
		children: [
			{
				id: 'present',
				label: 'Present',
				question: '',
				guidance: '',
				examples: [],
				weight: 1.0,
				transparent: true,
				children: [
					{
						id: presentInner.id,
						label: presentInner.label,
						question: presentInner.question,
						guidance: presentInner.guidance,
						examples: presentInner.examples,
						metadataSchema: {
							belief_level: 'string',
							strength_before: 'number',
							strength_after: 'number',
							associated_emotion: 'string',
							associated_emotion_intensity: 'number',
							distortion: 'string',
						},
						children: [
							{
								id: presentOuter.id,
								label: presentOuter.label,
								question: presentOuter.question,
								guidance: presentOuter.guidance,
								examples: presentOuter.examples,
								metadataSchema: { behavior_type: 'string' },
							},
						],
					},
				],
			},
			{
				id: 'future',
				label: 'Future',
				question: '',
				guidance: '',
				examples: [],
				weight: 1.75,
				transparent: true,
				children: [
					{
						id: futureInner.id,
						label: futureInner.label,
						question: futureInner.question,
						guidance: futureInner.guidance,
						examples: futureInner.examples,
						metadataSchema: {
							strength: 'number',
							linked_old_belief_id: 'string',
						},
						children: [
							{
								id: futureOuter.id,
								label: futureOuter.label,
								question: futureOuter.question,
								guidance: futureOuter.guidance,
								examples: futureOuter.examples,
								metadataSchema: {
									action_type: 'string',
									linked_belief_id: 'string',
								},
							},
						],
					},
				],
			},
			{
				id: 'past',
				label: 'Past',
				question: '',
				guidance: '',
				examples: [],
				weight: 1.75,
				transparent: true,
				children: [
					{
						id: pastInner.id,
						label: pastInner.label,
						question: pastInner.question,
						guidance: pastInner.guidance,
						examples: pastInner.examples,
						metadataSchema: {
							kind: 'string',
							intensity_before: 'number',
							intensity_after: 'number',
							linked_event_id: 'string',
							distortion: 'string',
						},
						children: [
							{
								id: pastOuter.id,
								label: pastOuter.label,
								question: pastOuter.question,
								guidance: pastOuter.guidance,
								examples: pastOuter.examples,
								metadataSchema: {
									trigger_type: 'string',
									is_primary: 'boolean',
								},
							},
						],
					},
				],
			},
		],
	},
}

registerFramework({
	definition: EMOTIONS_MAP,
	treeDefinition: EMOTIONS_TREE,
	visual: {
		colors: {
			stroke: '#114559',
			text: '#114559',
			cellFill: '#FFFFFF',
			cellHoverFill: '#D9E2EA',
		},
		labelFont: 'Quicksand, sans-serif',
		defaultSize: 600,
	},
	template: {
		icon: '◎',
		description: 'Explore and map your emotions through a guided mandala-based framework.',
		active: true,
		longDescription:
			'A therapeutic mandala for exploring emotions across time. Map past events, present behaviors, and future aspirations through a structured CBT-inspired framework that helps you identify patterns, challenge beliefs, and find evidence for change.',
		useCases: ['Therapeutic', 'CBT-Inspired', 'Past–Present–Future', '6 Cells'],
		keyQuestions: [
			'What\u2019s really behind this feeling?',
			'How do my past events shape my present beliefs?',
			'What evidence supports or contradicts what I believe?',
		],
	},
	initialCover: {
		type: 'text-carousel',
		slides: [
			'How do I resolve these emotions?',
			'What\u2019s really behind this feeling?',
			'How can I stop ruminating about this?',
			'Why is this concerning me so much?',
			'What am I not seeing about this situation?',
		],
		intervalMs: 5000,
	},
})
