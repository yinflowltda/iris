import type { SimpleShapeId } from './ids-schema'

export interface Point2d {
	x: number
	y: number
}

export interface MapCellDef {
	id: string
	label: string
	innerRatio: number
	outerRatio: number
	question: string
	guidance: string
	examples: string[]
}

export interface MapSliceDef {
	id: string
	label: string
	startAngle: number
	endAngle: number
	cells: MapCellDef[]
}

export interface MapCenterDef {
	id: string
	label: string
	radiusRatio: number
	question: string
	guidance: string
	examples: string[]
}

export interface MapDefinition {
	id: string
	name: string
	description: string
	center: MapCenterDef
	slices: MapSliceDef[]
}

export type CellStatus = 'empty' | 'active' | 'filled'

export interface CellState {
	status: CellStatus
	contentShapeIds: SimpleShapeId[]
}

export type MandalaState = Record<string, CellState>

// ─── Arrow tracking (stored in MandalaShapeProps.arrows) ─────────────────────

export type MandalaArrowColor = 'black' | 'green' | 'red'

export interface MandalaArrowRecord {
	arrowId: SimpleShapeId
	sourceElementId: SimpleShapeId
	targetElementId: SimpleShapeId
	color: MandalaArrowColor
}

// ─── Per-cell element metadata (stored in note shape.meta.elementMetadata) ───

export interface PastEventsMetadata {
	trigger_type?: 'external' | 'internal'
	is_primary?: boolean
}

export interface PastThoughtsEmotionsMetadata {
	kind?: 'automatic-thought' | 'emotion' | 'meaning' | 'image'
	intensity_before?: number | null
	intensity_after?: number | null
	linked_event_id?: string | null
	distortion?: string | null
}

export interface PresentBehaviorsMetadata {
	behavior_type?: 'reaction' | 'coping-pattern' | 'maintains' | 'physiological'
}

export interface PresentBeliefsMetadata {
	belief_level?: 'core' | 'rule' | 'assumption'
	strength_before?: number | null
	strength_after?: number | null
	associated_emotion?: string | null
	associated_emotion_intensity?: number | null
	distortion?: string | null
}

export interface EvidenceMetadata {
	direction?: 'supports' | 'contradicts'
	linked_belief_id?: string | null
}

export interface FutureBeliefsMetadata {
	strength?: number | null
	linked_old_belief_id?: string | null
}

export interface FutureEventsMetadata {
	action_type?:
		| 'behavioral-experiment'
		| 'skill-practice'
		| 'self-monitoring'
		| 'new-behavior'
		| 'other'
	linked_belief_id?: string | null
}

export type ElementMetadata =
	| PastEventsMetadata
	| PastThoughtsEmotionsMetadata
	| PresentBehaviorsMetadata
	| PresentBeliefsMetadata
	| EvidenceMetadata
	| FutureBeliefsMetadata
	| FutureEventsMetadata
