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
