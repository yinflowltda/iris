import type {
	NoteMetadataConfig,
	NoteMetadataFieldName,
	NoteMetadataOption,
} from '../../shared/types/MandalaTypes'

export const ALL_METADATA_FIELDS: NoteMetadataFieldName[] = [
	'status',
	'priority',
	'assignee',
	'tags',
	'dueDate',
	'progress',
]

export const DEFAULT_STATUS_OPTIONS: NoteMetadataOption[] = [
	{ key: 'todo', emoji: '⭕', label: 'To Do' },
	{ key: 'in-progress', emoji: '🟡', label: 'In Progress' },
	{ key: 'done', emoji: '✅', label: 'Done' },
	{ key: 'blocked', emoji: '⛔', label: 'Blocked' },
]

export const DEFAULT_PRIORITY_OPTIONS: NoteMetadataOption[] = [
	{ key: 'high', emoji: '🔴', label: 'High' },
	{ key: 'medium', emoji: '🟠', label: 'Medium' },
	{ key: 'low', emoji: '🟢', label: 'Low' },
]

export const HIDDEN_FIELDS: NoteMetadataFieldName[] = ['assignee']

export function getEnabledFields(config?: NoteMetadataConfig): NoteMetadataFieldName[] {
	if (!config?.disabledFields) return ALL_METADATA_FIELDS
	return ALL_METADATA_FIELDS.filter((f) => !config.disabledFields!.includes(f))
}

export function getStatusOptions(config?: NoteMetadataConfig): NoteMetadataOption[] {
	return config?.statusOptions ?? DEFAULT_STATUS_OPTIONS
}
