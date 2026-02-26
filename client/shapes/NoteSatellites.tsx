import { useCallback, useState } from 'react'
import type { JsonObject, TLNoteShape } from 'tldraw'
import { useEditor } from 'tldraw'
import type { NoteMetadata, NoteMetadataFieldName } from '../../shared/types/MandalaTypes'
import { AddFieldSatellite } from './AddFieldSatellite'
import {
	DEFAULT_PRIORITY_OPTIONS,
	DEFAULT_STATUS_OPTIONS,
	getEnabledFields,
	HIDDEN_FIELDS,
} from './note-metadata-constants'
import './note-satellites.css'
import { SatelliteBadge } from './SatelliteBadge'
import { computeSatellitePositions } from './satellite-utils'

const NOTE_BASE_SIZE = 200
const BADGE_SIZE = 24
const BADGE_OFFSET = 8

interface NoteSatellitesProps {
	shape: TLNoteShape
}

function getFieldDisplay(field: NoteMetadataFieldName, metadata: NoteMetadata): string {
	switch (field) {
		case 'status': {
			const opt = DEFAULT_STATUS_OPTIONS.find((o) => o.key === metadata.status)
			return opt?.emoji ?? '⭕'
		}
		case 'priority': {
			const opt = DEFAULT_PRIORITY_OPTIONS.find((o) => o.key === metadata.priority)
			return opt?.emoji ?? '🔴'
		}
		case 'assignee':
			return '👤'
		case 'tags':
			return '🏷️'
		case 'dueDate':
			return '📅'
		case 'progress': {
			const p = metadata.progress
			return p ? `${p.done}/${p.total}` : '📊'
		}
		default:
			return '?'
	}
}

function getActiveFields(metadata: NoteMetadata): NoteMetadataFieldName[] {
	const active: NoteMetadataFieldName[] = []
	if (metadata.status !== undefined) active.push('status')
	if (metadata.priority !== undefined) active.push('priority')
	if (metadata.assignee !== undefined) active.push('assignee')
	if (metadata.tags !== undefined && metadata.tags.length > 0) active.push('tags')
	if (metadata.dueDate !== undefined) active.push('dueDate')
	if (metadata.progress !== undefined) active.push('progress')
	return active
}

export function NoteSatellites({ shape }: NoteSatellitesProps) {
	const editor = useEditor()
	const [hovered, setHovered] = useState(false)

	const metadata = ((shape.meta as Record<string, unknown>)?.noteMetadata as NoteMetadata) ?? {}
	const enabledFields = getEnabledFields()
	const activeFields = getActiveFields(metadata)

	const availableToAdd = enabledFields.filter(
		(f) => !activeFields.includes(f) && !HIDDEN_FIELDS.includes(f),
	)
	const showAddButton = availableToAdd.length > 0

	const radius = (NOTE_BASE_SIZE * shape.props.scale) / 2
	const badgeSize = BADGE_SIZE * shape.props.scale
	const offset = BADGE_OFFSET * shape.props.scale

	const totalCount = activeFields.length + (showAddButton ? 1 : 0)
	const positions = computeSatellitePositions(totalCount, radius, offset + badgeSize / 2)

	const noteCenter = { x: radius, y: radius }

	const updateMetadata = useCallback(
		(update: Partial<NoteMetadata>) => {
			const existingMeta = (shape.meta as Record<string, unknown>) ?? {}
			const existingNoteMetadata = (existingMeta.noteMetadata as NoteMetadata) ?? {}
			editor.updateShape({
				id: shape.id,
				type: shape.type,
				meta: {
					...existingMeta,
					noteMetadata: { ...existingNoteMetadata, ...update } as unknown,
				} as Partial<JsonObject>,
			})
		},
		[editor, shape.id, shape.type, shape.meta],
	)

	const removeField = useCallback(
		(field: NoteMetadataFieldName) => {
			const existingMeta = (shape.meta as Record<string, unknown>) ?? {}
			const existingNoteMetadata = {
				...((existingMeta.noteMetadata as NoteMetadata) ?? {}),
			}
			delete existingNoteMetadata[field]
			editor.updateShape({
				id: shape.id,
				type: shape.type,
				meta: {
					...existingMeta,
					noteMetadata: existingNoteMetadata as unknown,
				} as Partial<JsonObject>,
			})
		},
		[editor, shape.id, shape.type, shape.meta],
	)

	const handleAddField = useCallback(
		(field: NoteMetadataFieldName) => {
			switch (field) {
				case 'status':
					updateMetadata({ status: 'todo' })
					break
				case 'priority':
					updateMetadata({ priority: 'medium' })
					break
				case 'tags':
					updateMetadata({ tags: [] })
					break
				case 'dueDate':
					updateMetadata({ dueDate: new Date().toISOString().split('T')[0] })
					break
				case 'progress':
					updateMetadata({ progress: { done: 0, total: 1 } })
					break
				case 'assignee':
					updateMetadata({ assignee: '' })
					break
			}
		},
		[updateMetadata],
	)

	const handleSelectValue = useCallback(
		(field: NoteMetadataFieldName, key: string) => {
			switch (field) {
				case 'status':
					updateMetadata({ status: key })
					break
				case 'priority':
					updateMetadata({ priority: key as NoteMetadata['priority'] })
					break
			}
		},
		[updateMetadata],
	)

	const getOptionsForField = (field: NoteMetadataFieldName) => {
		switch (field) {
			case 'status':
				return DEFAULT_STATUS_OPTIONS
			case 'priority':
				return DEFAULT_PRIORITY_OPTIONS
			default:
				return []
		}
	}

	return (
		<div
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: radius * 2,
				height: radius * 2,
				pointerEvents: 'none',
			}}
		>
			{activeFields.map((field, i) => (
				<SatelliteBadge
					key={field}
					position={positions[i]}
					display={getFieldDisplay(field, metadata)}
					noteCenter={noteCenter}
					size={badgeSize}
					options={getOptionsForField(field)}
					showRemove={true}
					onSelect={(key) => handleSelectValue(field, key)}
					onRemove={() => removeField(field)}
				/>
			))}

			{showAddButton && positions[activeFields.length] && (
				<AddFieldSatellite
					position={positions[activeFields.length]}
					noteCenter={noteCenter}
					size={badgeSize}
					availableFields={availableToAdd}
					onAddField={handleAddField}
					visible={hovered}
				/>
			)}
		</div>
	)
}
