import type { NoteMetadataFieldName, NoteMetadataOption } from '../../shared/types/MandalaTypes'

export const ALL_METADATA_FIELDS: NoteMetadataFieldName[] = [
	'status',
	'priority',
	'assignee',
	'tags',
	'dueDate',
	'progress',
]

/** Fields that are hidden from the "add field" menu (managed by AI only) */
export const HIDDEN_FIELDS: NoteMetadataFieldName[] = []

export const DEFAULT_STATUS_OPTIONS: NoteMetadataOption[] = [
	{ key: 'todo', emoji: '⭕', label: 'To Do' },
	{ key: 'in_progress', emoji: '🔵', label: 'In Progress' },
	{ key: 'done', emoji: '✅', label: 'Done' },
	{ key: 'blocked', emoji: '🔴', label: 'Blocked' },
]

export const DEFAULT_PRIORITY_OPTIONS: NoteMetadataOption[] = [
	{ key: 'low', emoji: '⬇️', label: 'Low' },
	{ key: 'medium', emoji: '➡️', label: 'Medium' },
	{ key: 'high', emoji: '⬆️', label: 'High' },
	{ key: 'critical', emoji: '🔥', label: 'Critical' },
]

/** Returns the list of metadata fields currently enabled for the user. */
export function getEnabledFields(): NoteMetadataFieldName[] {
	return ALL_METADATA_FIELDS
}
