import type { Editor, TLShape, TLShapeId } from 'tldraw'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'

/**
 * Find which cell an element belongs to by searching mandala state.
 * Returns the cellId or null if not found.
 */
export function findElementCell(state: MandalaState, elementId: SimpleShapeId): string | null {
	for (const [cellId, cellState] of Object.entries(state)) {
		if (cellState?.contentShapeIds?.includes(elementId)) {
			return cellId
		}
	}
	return null
}

/**
 * Validate that an element exists as a TLDraw shape and belongs to a mandala cell.
 * Returns the shape or null.
 */
export function validateElementExists(
	editor: Editor,
	mandala: MandalaShape,
	elementId: SimpleShapeId,
): TLShape | null {
	const fullId = `shape:${elementId}` as TLShapeId
	const shape = editor.getShape(fullId)
	if (!shape) return null

	const cellId = findElementCell(mandala.props.state, elementId)
	if (!cellId) return null

	return shape
}

const ALLOWED_KEYS_BY_CELL: Record<string, Record<string, 'string' | 'number' | 'boolean'>> = {
	'past-events': {
		trigger_type: 'string',
		is_primary: 'boolean',
	},
	'past-thoughts-emotions': {
		kind: 'string',
		intensity_before: 'number',
		intensity_after: 'number',
		linked_event_id: 'string',
		distortion: 'string',
	},
	'present-behaviors': {
		behavior_type: 'string',
	},
	'present-beliefs': {
		belief_level: 'string',
		strength_before: 'number',
		strength_after: 'number',
		associated_emotion: 'string',
		associated_emotion_intensity: 'number',
		distortion: 'string',
	},
	evidence: {
		direction: 'string',
		linked_belief_id: 'string',
	},
	'future-beliefs': {
		strength: 'number',
		linked_old_belief_id: 'string',
	},
	'future-events': {
		action_type: 'string',
		linked_belief_id: 'string',
	},
}

const ENUM_VALUES: Record<string, string[]> = {
	trigger_type: ['external', 'internal'],
	kind: ['automatic-thought', 'emotion', 'meaning', 'image'],
	behavior_type: ['reaction', 'coping-pattern', 'maintains', 'physiological'],
	belief_level: ['core', 'rule', 'assumption'],
	direction: ['supports', 'contradicts'],
	action_type: [
		'behavioral-experiment',
		'skill-practice',
		'self-monitoring',
		'new-behavior',
		'other',
	],
}

/**
 * Get the allowed metadata schema for a given cell ID.
 * Returns a map of key → expected type, or null if the cell ID is unknown.
 */
export function getMetadataSchemaForCell(
	cellId: string,
): Record<string, 'string' | 'number' | 'boolean'> | null {
	return ALLOWED_KEYS_BY_CELL[cellId] ?? null
}

/**
 * Validate and filter metadata for a given cell.
 * Rejects unknown keys, validates types, clamps numbers to 0–100,
 * and validates enum values.
 *
 * Returns the validated (possibly filtered) metadata object.
 */
export function validateMetadataForCell(
	cellId: string,
	metadata: Record<string, unknown>,
): Record<string, unknown> {
	const schema = getMetadataSchemaForCell(cellId)
	if (!schema) return {}

	const result: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(metadata)) {
		const expectedType = schema[key]
		if (!expectedType) continue

		if (value === null) {
			result[key] = null
			continue
		}

		if (expectedType === 'number') {
			const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
			if (Number.isNaN(num)) continue
			result[key] = Math.max(0, Math.min(100, num))
		} else if (expectedType === 'boolean') {
			if (typeof value !== 'boolean') continue
			result[key] = value
		} else if (expectedType === 'string') {
			if (typeof value !== 'string') continue
			const allowed = ENUM_VALUES[key]
			if (allowed && !allowed.includes(value)) continue
			result[key] = value
		}
	}

	return result
}

/** Fields that are write-once (set at creation, never overwritten). */
const WRITE_ONCE_FIELDS = new Set(['intensity_before', 'strength_before'])

/**
 * Merge new metadata into existing metadata, respecting write-once semantics
 * for _before fields.
 */
export function mergeMetadata(
	existing: Record<string, unknown>,
	incoming: Record<string, unknown>,
): Record<string, unknown> {
	const merged = { ...existing }
	for (const [key, value] of Object.entries(incoming)) {
		if (WRITE_ONCE_FIELDS.has(key) && existing[key] != null) {
			continue
		}
		merged[key] = value
	}
	return merged
}
