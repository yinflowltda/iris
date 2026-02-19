import type { Editor, TLShapeId } from 'tldraw'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { AgentHelpers } from '../AgentHelpers'

/**
 * Resolve a mandala id sent by the model.
 *
 * If the provided id is invalid, we gracefully fall back to the single mandala
 * on the current page (when there is exactly one) to avoid dropping useful
 * actions due to id formatting/model hallucinations.
 */
export function resolveMandalaId(
	editor: Editor,
	helpers: AgentHelpers,
	candidateId: SimpleShapeId,
): SimpleShapeId | null {
	const existingCandidate = helpers.ensureShapeIdExists(candidateId)
	if (existingCandidate) {
		const shape = editor.getShape(`shape:${existingCandidate}` as TLShapeId)
		if (shape?.type === 'mandala') {
			return existingCandidate
		}
	}

	const mandalas = editor.getCurrentPageShapes().filter((shape) => shape.type === 'mandala')
	if (mandalas.length !== 1) {
		return null
	}

	return mandalas[0].id.slice(6) as SimpleShapeId
}
