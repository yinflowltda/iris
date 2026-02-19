import type { MapDefinition } from '../../../shared/types/MandalaTypes'

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
			startAngle: 150,
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
			endAngle: 30,
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
			startAngle: 30,
			endAngle: 150,
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
