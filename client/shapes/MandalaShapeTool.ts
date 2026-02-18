import { BaseBoxShapeTool } from 'tldraw'

export class MandalaShapeTool extends BaseBoxShapeTool {
	static override id = 'mandala'
	static override initial = 'idle'
	override shapeType = 'mandala' as const
}
