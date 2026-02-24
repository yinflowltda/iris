import type { Editor, TLShapeId } from 'tldraw'
import type { MandalaShape } from '../../shapes/MandalaShapeUtil'

let activeMandalaId: TLShapeId | null = null

export function getActiveMandalaId(): TLShapeId | null {
	return activeMandalaId
}

export function setActiveMandalaId(id: TLShapeId | null): void {
	activeMandalaId = id
}

export function getActiveMandala(editor: Editor): MandalaShape | null {
	if (activeMandalaId) {
		const shape = editor.getShape(activeMandalaId) as MandalaShape | undefined
		if (shape?.type === 'mandala') return shape
	}

	const mandala = editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as
		| MandalaShape
		| undefined
	if (mandala) {
		activeMandalaId = mandala.id
		return mandala
	}

	return null
}
