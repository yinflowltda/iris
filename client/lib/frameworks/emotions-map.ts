import type { CellId, RingId, SliceId } from '../../../shared/types/MandalaTypes'
import { RING_IDS, SLICE_IDS } from '../../../shared/types/MandalaTypes'

export interface CellDefinition {
	cellId: CellId
	sliceId: SliceId
	ringId: RingId
	label: string
	question: string
	guidance: string
	examples: string[]
}

export interface FrameworkConfig {
	id: string
	name: string
	description: string
	slices: readonly SliceId[]
	rings: readonly RingId[]
	startAngle: number
	cells: Record<CellId, CellDefinition>
}

const CELL_DEFS: Record<CellId, Omit<CellDefinition, 'cellId' | 'sliceId' | 'ringId'>> = {
	'past-events': {
		label: 'Past Events',
		question: 'What significant events happened in your past related to this topic?',
		guidance: 'Help the user recall concrete events without judgment. Focus on observable facts.',
		examples: [
			'I lost my job last year',
			'My parents divorced when I was 10',
			'I moved to a new city',
		],
	},
	'past-behaviors': {
		label: 'Past Behaviors',
		question: 'How did you behave or react when those past events occurred?',
		guidance:
			'Explore actions and reactions. Distinguish between what happened and what the user did.',
		examples: [
			'I withdrew from friends',
			'I started exercising more',
			'I avoided talking about it',
		],
	},
	'past-thoughts': {
		label: 'Past Thoughts',
		question: 'What thoughts went through your mind during those past experiences?',
		guidance: 'Identify cognitive patterns. Look for recurring thought themes or self-talk.',
		examples: [
			'I thought I was not good enough',
			'I believed things would never change',
			'I kept thinking it was my fault',
		],
	},
	'past-emotions': {
		label: 'Past Emotions',
		question: 'What emotions did you feel during those past experiences?',
		guidance: 'Help name specific emotions. Encourage nuance beyond "good" or "bad".',
		examples: ['I felt deep sadness', 'I was overwhelmed with anxiety', 'I felt relieved'],
	},
	'past-beliefs': {
		label: 'Past Beliefs',
		question: 'What beliefs about yourself or the world formed from those past experiences?',
		guidance:
			'Identify core beliefs. These often start with "I am...", "People are...", "The world is...".',
		examples: [
			'I believed I was unlovable',
			'I thought success required suffering',
			'I felt the world was unsafe',
		],
	},
	'past-evidence': {
		label: 'Past Evidence',
		question: 'What evidence supported or contradicted those past beliefs?',
		guidance:
			'Encourage objective evaluation. Look for both confirming and disconfirming evidence.',
		examples: [
			'My friend stayed by my side through it all',
			'I did succeed at some things without suffering',
			'Some people showed me kindness',
		],
	},
	'present-events': {
		label: 'Present Events',
		question: 'What is currently happening in your life related to this topic?',
		guidance: 'Ground the user in the present moment. Focus on current circumstances.',
		examples: [
			'I am starting a new relationship',
			'I just got promoted at work',
			'I am dealing with a health issue',
		],
	},
	'present-behaviors': {
		label: 'Present Behaviors',
		question: 'How are you currently behaving or responding to what is happening now?',
		guidance: 'Identify current patterns. Notice if past patterns are repeating.',
		examples: [
			'I am being more open with people',
			'I tend to overwork to prove myself',
			'I am seeking help for the first time',
		],
	},
	'present-thoughts': {
		label: 'Present Thoughts',
		question: 'What thoughts are you having about your current situation?',
		guidance: 'Capture present-moment thinking. Compare with past thought patterns.',
		examples: [
			'I think I can handle this',
			'I worry it will happen again',
			'I notice I am more hopeful now',
		],
	},
	'present-emotions': {
		label: 'Present Emotions',
		question: 'What emotions are you experiencing right now about this?',
		guidance: 'Encourage present-moment emotional awareness. Note shifts from past emotions.',
		examples: [
			'I feel cautiously optimistic',
			'I notice some residual fear',
			'I feel more at peace than before',
		],
	},
	'present-beliefs': {
		label: 'Present Beliefs',
		question: 'What do you currently believe about yourself and this situation?',
		guidance: 'Explore how beliefs may have evolved. Notice any cognitive dissonance.',
		examples: [
			'I am starting to believe I deserve good things',
			'I still struggle with feeling worthy',
			'I believe change is possible',
		],
	},
	'present-evidence': {
		label: 'Present Evidence',
		question: 'What current evidence supports or challenges your present beliefs?',
		guidance: 'Help gather real evidence. Encourage looking at recent experiences.',
		examples: [
			'My partner consistently shows up for me',
			'I handled a difficult situation well last week',
			'My colleagues gave me positive feedback',
		],
	},
	'future-events': {
		label: 'Future Events',
		question: 'What events or changes do you anticipate or hope for in the future?',
		guidance: 'Explore aspirations and fears about the future. Keep it concrete.',
		examples: [
			'I want to build a stable career',
			'I hope to have a family',
			'I plan to travel and explore',
		],
	},
	'future-behaviors': {
		label: 'Future Behaviors',
		question: 'How would you like to behave differently in the future?',
		guidance: 'Focus on actionable changes. Connect desired behaviors to current patterns.',
		examples: [
			'I want to communicate more openly',
			'I would like to set better boundaries',
			'I plan to practice self-care regularly',
		],
	},
	'future-thoughts': {
		label: 'Future Thoughts',
		question: 'What thoughts would you like to cultivate going forward?',
		guidance: 'Help envision healthier thought patterns. Keep it realistic, not idealized.',
		examples: [
			'I want to think of challenges as growth opportunities',
			'I would like to be less self-critical',
			'I want to focus on what I can control',
		],
	},
	'future-emotions': {
		label: 'Future Emotions',
		question: 'What emotions would you like to feel more of in the future?',
		guidance:
			'Explore emotional aspirations. Help distinguish between avoiding negative and cultivating positive.',
		examples: [
			'I want to feel more confident',
			'I hope to experience more joy and gratitude',
			'I want to feel safe in relationships',
		],
	},
	'future-beliefs': {
		label: 'Future Beliefs',
		question: 'What beliefs would you like to hold about yourself and your future?',
		guidance: 'Help formulate empowering but authentic beliefs. Build on present evidence.',
		examples: [
			'I want to believe I am resilient',
			'I would like to trust that I am enough',
			'I want to believe in my capacity to grow',
		],
	},
	'future-evidence': {
		label: 'Future Evidence',
		question: 'What steps or experiences could serve as evidence for these new beliefs?',
		guidance: 'Create actionable paths to reinforce new beliefs. Make evidence gathering concrete.',
		examples: [
			'Completing a challenging project at work',
			'Having an honest conversation with someone I trust',
			'Keeping a daily gratitude journal for a month',
		],
	},
}

function buildCells(): Record<CellId, CellDefinition> {
	const cells = {} as Record<CellId, CellDefinition>
	for (const sliceId of SLICE_IDS) {
		for (const ringId of RING_IDS) {
			const cellId: CellId = `${sliceId}-${ringId}`
			const def = CELL_DEFS[cellId]
			cells[cellId] = { cellId, sliceId, ringId, ...def }
		}
	}
	return cells
}

export const EMOTIONS_MAP_FRAMEWORK: FrameworkConfig = {
	id: 'emotions-map',
	name: 'Emotions Map',
	description:
		'A therapeutic mandala for exploring emotions across time — past, present, and future — through events, behaviors, thoughts, emotions, beliefs, and evidence.',
	slices: SLICE_IDS,
	rings: RING_IDS,
	startAngle: 150,
	cells: buildCells(),
}
