import { describe, expect, it } from 'vitest'
import type { NoteMetadata, NoteMetadataConfig } from '../../shared/types/MandalaTypes'
import {
	ALL_METADATA_FIELDS,
	DEFAULT_PRIORITY_OPTIONS,
	DEFAULT_STATUS_OPTIONS,
	getEnabledFields,
	getStatusOptions,
} from '../../client/shapes/note-metadata-constants'

describe('NoteMetadata types', () => {
	it('allows empty metadata', () => {
		const meta: NoteMetadata = {}
		expect(meta).toEqual({})
	})

	it('allows all fields populated', () => {
		const meta: NoteMetadata = {
			status: 'done',
			priority: 'high',
			assignee: 'Alice',
			tags: ['urgent', 'bug'],
			dueDate: '2026-03-01',
			progress: { done: 3, total: 5 },
		}
		expect(meta.status).toBe('done')
		expect(meta.priority).toBe('high')
		expect(meta.tags).toHaveLength(2)
		expect(meta.progress?.done).toBe(3)
	})
})

describe('note-metadata-constants', () => {
	it('has 6 metadata fields', () => {
		expect(ALL_METADATA_FIELDS).toHaveLength(6)
		expect(ALL_METADATA_FIELDS).toContain('status')
		expect(ALL_METADATA_FIELDS).toContain('priority')
		expect(ALL_METADATA_FIELDS).toContain('assignee')
		expect(ALL_METADATA_FIELDS).toContain('tags')
		expect(ALL_METADATA_FIELDS).toContain('dueDate')
		expect(ALL_METADATA_FIELDS).toContain('progress')
	})

	it('has 4 default status options', () => {
		expect(DEFAULT_STATUS_OPTIONS).toHaveLength(4)
		expect(DEFAULT_STATUS_OPTIONS[0]).toEqual({ key: 'todo', emoji: '⭕', label: 'To Do' })
	})

	it('has 3 default priority options', () => {
		expect(DEFAULT_PRIORITY_OPTIONS).toHaveLength(3)
		expect(DEFAULT_PRIORITY_OPTIONS[0]).toEqual({ key: 'high', emoji: '🔴', label: 'High' })
	})

	it('returns all fields when no config', () => {
		expect(getEnabledFields()).toEqual(ALL_METADATA_FIELDS)
		expect(getEnabledFields(undefined)).toEqual(ALL_METADATA_FIELDS)
	})

	it('respects disabledFields', () => {
		const config: NoteMetadataConfig = { disabledFields: ['assignee', 'dueDate'] }
		const enabled = getEnabledFields(config)
		expect(enabled).not.toContain('assignee')
		expect(enabled).not.toContain('dueDate')
		expect(enabled).toContain('status')
		expect(enabled).toContain('priority')
		expect(enabled).toContain('tags')
		expect(enabled).toContain('progress')
	})

	it('returns custom status options when configured', () => {
		const custom = [{ key: 'wip', emoji: '🔧', label: 'WIP' }]
		const config: NoteMetadataConfig = { statusOptions: custom }
		expect(getStatusOptions(config)).toEqual(custom)
	})

	it('returns default status options when not configured', () => {
		expect(getStatusOptions()).toEqual(DEFAULT_STATUS_OPTIONS)
		expect(getStatusOptions(undefined)).toEqual(DEFAULT_STATUS_OPTIONS)
	})
})
