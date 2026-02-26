import { type PointerEvent, useCallback, useState } from 'react'
import type { NoteMetadataFieldName, NoteMetadataOption } from '../../shared/types/MandalaTypes'
import type { SatellitePosition } from './satellite-utils'
import { computeSubSatellitePositions } from './satellite-utils'

const FIELD_OPTIONS: Record<NoteMetadataFieldName, NoteMetadataOption> = {
	status: { key: 'status', emoji: '⭕', label: 'Status' },
	priority: { key: 'priority', emoji: '🔴', label: 'Priority' },
	assignee: { key: 'assignee', emoji: '👤', label: 'Assignee' },
	tags: { key: 'tags', emoji: '🏷️', label: 'Tags' },
	dueDate: { key: 'dueDate', emoji: '📅', label: 'Due Date' },
	progress: { key: 'progress', emoji: '📊', label: 'Progress' },
}

interface AddFieldSatelliteProps {
	position: SatellitePosition
	noteCenter: { x: number; y: number }
	size: number
	availableFields: NoteMetadataFieldName[]
	onAddField: (field: NoteMetadataFieldName) => void
	visible: boolean
}

export function AddFieldSatellite({
	position,
	noteCenter,
	size,
	availableFields,
	onAddField,
	visible,
}: AddFieldSatelliteProps) {
	const [expanded, setExpanded] = useState(false)

	const options = availableFields.map((f) => FIELD_OPTIONS[f])
	const subPositions = expanded
		? computeSubSatellitePositions(position, noteCenter, options.length, size + 8)
		: []

	const handleClick = useCallback((e: PointerEvent) => {
		e.stopPropagation()
		e.preventDefault()
		setExpanded((prev) => !prev)
	}, [])

	const handleFieldClick = useCallback(
		(field: NoteMetadataFieldName) => (e: PointerEvent) => {
			e.stopPropagation()
			e.preventDefault()
			onAddField(field)
			setExpanded(false)
		},
		[onAddField],
	)

	const half = size / 2

	if (!visible && !expanded) return null

	return (
		<>
			<div
				onPointerDown={handleClick}
				style={{
					position: 'absolute',
					left: position.x - half,
					top: position.y - half,
					width: size,
					height: size,
					borderRadius: '50%',
					background: 'white',
					border: '2px dashed #bbb',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: size * 0.7,
					cursor: 'pointer',
					pointerEvents: 'all',
					zIndex: 10,
					opacity: expanded ? 1 : 0.8,
					transition: 'opacity 0.2s ease-out, transform 0.15s ease-out',
					transform: expanded ? 'scale(1.15)' : 'scale(1)',
				}}
			>
				+
			</div>

			{subPositions.map((subPos, i) => {
				const option = options[i]
				return (
					<div
						key={option.key}
						onPointerDown={handleFieldClick(option.key as NoteMetadataFieldName)}
						style={{
							position: 'absolute',
							left: subPos.x - half,
							top: subPos.y - half,
							width: size,
							height: size,
							borderRadius: '50%',
							background: 'white',
							border: '2px solid #ccc',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: size * 0.6,
							cursor: 'pointer',
							pointerEvents: 'all',
							zIndex: 20,
							animation: `satellite-bloom-in 0.2s ease-out ${i * 0.03}s both`,
						}}
						title={option.label}
					>
						{option.emoji}
					</div>
				)
			})}
		</>
	)
}
