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

// ─── Tree-based map definition (sunburst renderer) ──────────────────────────

export interface TreeNodeDef {
	id: string
	label: string
	question: string
	guidance: string
	examples: string[]
	weight?: number
	groupId?: string
	metadataSchema?: Record<string, 'string' | 'number' | 'boolean'>
	children?: TreeNodeDef[]
	transparent?: boolean
	hideLabel?: boolean
	/** Scale factor for the label font size (default 1.0). Use 0.5 for half-size labels. */
	labelScale?: number
}

/** An overlay arc rendered at the outermost ring, independent of the tree structure */
export interface OverlayArc {
	id: string
	label: string
	/** Angular fraction of the overlay region (0-1). Arcs are laid out sequentially. */
	fraction: number
}

/** Defines custom radial band sizes for an angular region of the mandala */
export interface RadialBandRegion {
	/** Angular range [start, end] in radians (post-startAngle offset, may exceed 2π) */
	angularRange: [number, number]
	/** Map from visual depth (post-transparent-offset) → [y0, y1] ratios */
	bands: Record<number, [number, number]>
}

/** Configuration for per-region radial band overrides */
export interface RadialBandsConfig {
	/** Radius ratio for the center circle (root y1). All depth-1 bands should start at this value. */
	centerRadius: number
	/** Per-region band definitions. Arcs not matching any region keep partition-computed values. */
	regions: RadialBandRegion[]
}

export interface TreeMapDefinition {
	id: string
	name: string
	description: string
	root: TreeNodeDef
	/** Angular offset (radians) applied to all arcs to rotate the layout */
	startAngle?: number
	/** Overlay arcs rendered at the outermost empty ring band.
	 *  startNodeId identifies the first tree node whose angular position marks
	 *  the start of the overlay region. */
	overlayRing?: { startNodeId: string; endNodeId: string; arcs: OverlayArc[] }
	/** Per-region radial band overrides. When set, y0/y1 values from d3 partition
	 *  are replaced with explicit values based on visual depth and angular position. */
	radialBands?: RadialBandsConfig
}

// ─── Shared state types ─────────────────────────────────────────────────────

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

// ─── Note metadata (satellite badges on notes) ─────────────────────────────

export type NoteMetadataFieldName =
	| 'status'
	| 'priority'
	| 'assignee'
	| 'tags'
	| 'dueDate'
	| 'progress'

export interface NoteMetadataOption {
	key: string
	emoji: string
	label: string
}

export interface NoteMetadata {
	status?: string
	priority?: 'low' | 'medium' | 'high' | 'critical'
	assignee?: string
	tags?: string[]
	dueDate?: string
	progress?: { done: number; total: number }
}

// ─── Cover system (initial state overlay) ────────────────────────────────────

export interface CoverContent {
	type: 'text-carousel'
	slides: string[]
	intervalMs: number
}

export interface CoverConfig {
	active: boolean
	content: CoverContent
}
