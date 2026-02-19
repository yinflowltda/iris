import type { BoxModel, Editor, VecModel } from 'tldraw'
import type { FocusedShape } from '../format/FocusedShape'
import type { AgentIconType } from '../icons/AgentIcon'

export type ContextItem = ShapeContextItem | AreaContextItem | PointContextItem | ShapesContextItem

export interface ShapeContextItem {
	type: 'shape'
	shape: FocusedShape
	source: 'agent' | 'user'
}

export interface ShapesContextItem {
	type: 'shapes'
	shapes: FocusedShape[]
	source: 'agent' | 'user'
}

export interface AreaContextItem {
	type: 'area'
	bounds: BoxModel
	source: 'agent' | 'user'
}

export interface PointContextItem {
	type: 'point'
	point: VecModel
	source: 'agent' | 'user'
}

export const CONTEXT_TYPE_DEFINITIONS: Record<
	ContextItem['type'],
	{
		icon: AgentIconType
		name(item: ContextItem, editor: Editor): string
	}
> = {
	shape: {
		icon: 'target',
		name: (item: ShapeContextItem) => {
			let name = item.shape.note
			if (!name) {
				name = item.shape._type
				if (item.shape._type === 'draw') {
					name = 'drawing'
				} else if (item.shape._type === 'unknown') {
					name = item.shape.subType
				}
			}

			return name[0].toUpperCase() + name.slice(1)
		},
	},
	area: {
		icon: 'target',
		name: () => 'Area',
	},
	point: {
		icon: 'target',
		name: () => 'Point',
	},
	shapes: {
		icon: 'target',
		name: (item: ShapesContextItem, editor: Editor) => {
			const count = item.shapes.length
			if (count === 1) return CONTEXT_TYPE_DEFINITIONS.shape.name(item, editor)
			return `${count} shapes`
		},
	},
}

export function getContextItemKey(item: ContextItem): string {
	switch (item.type) {
		case 'shape':
			return `shape:${item.source}:${item.shape.shapeId}`
		case 'shapes':
			return `shapes:${item.source}:${item.shapes.map((s) => s.shapeId).join(',')}`
		case 'area':
			return `area:${item.source}:${item.bounds.x},${item.bounds.y},${item.bounds.w},${item.bounds.h}`
		case 'point':
			return `point:${item.source}:${item.point.x},${item.point.y}`
	}
}
