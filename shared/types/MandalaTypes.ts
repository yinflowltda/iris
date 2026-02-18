import type { SimpleShapeId } from './ids-schema'

export type SliceId = 'past' | 'present' | 'future'

export type RingId = 'events' | 'behaviors' | 'thoughts' | 'emotions' | 'beliefs' | 'evidence'

export type CellId = `${SliceId}-${RingId}`

export const SLICE_IDS: readonly SliceId[] = ['past', 'present', 'future']

export const RING_IDS: readonly RingId[] = [
	'events',
	'behaviors',
	'thoughts',
	'emotions',
	'beliefs',
	'evidence',
]

export interface Point2d {
	x: number
	y: number
}

export interface CellInfo {
	sliceIndex: number
	ringIndex: number
	sliceId: SliceId
	ringId: RingId
	cellId: CellId
}

export interface MandalaConfig {
	center: Point2d
	radius: number
	slices: readonly SliceId[]
	rings: readonly RingId[]
	startAngle: number
}

export interface SliceDefinition {
	sliceId: SliceId
	sliceIndex: number
	startAngle: number
	endAngle: number
}

export interface RingDefinition {
	ringId: RingId
	ringIndex: number
	innerRadius: number
	outerRadius: number
}

export type CellStatus = 'empty' | 'active' | 'filled'

export interface CellState {
	status: CellStatus
	contentShapeIds: SimpleShapeId[]
}

export type MandalaState = Record<CellId, CellState>
