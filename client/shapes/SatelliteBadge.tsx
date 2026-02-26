import { type PointerEvent, useCallback, useRef, useState } from 'react'
import type { NoteMetadataOption } from '../../shared/types/MandalaTypes'
import type { SatellitePosition } from './satellite-utils'
import { computeSubSatellitePositions } from './satellite-utils'

interface SatelliteBadgeProps {
	position: SatellitePosition
	display: string
	noteCenter: { x: number; y: number }
	size: number
	options: NoteMetadataOption[]
	showRemove: boolean
	onSelect: (key: string) => void
	onRemove: () => void
}

export function SatelliteBadge({
	position,
	display,
	noteCenter,
	size,
	options,
	showRemove,
	onSelect,
	onRemove,
}: SatelliteBadgeProps) {
	const [expanded, setExpanded] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	const allOptions = showRemove
		? [...options, { key: '__remove__', emoji: '✕', label: 'Remove' }]
		: options

	const subPositions = expanded
		? computeSubSatellitePositions(position, noteCenter, allOptions.length, size + 8)
		: []

	const handleBadgeClick = useCallback((e: PointerEvent) => {
		e.stopPropagation()
		e.preventDefault()
		setExpanded((prev) => !prev)
	}, [])

	const handleOptionClick = useCallback(
		(key: string) => (e: PointerEvent) => {
			e.stopPropagation()
			e.preventDefault()
			if (key === '__remove__') {
				onRemove()
			} else {
				onSelect(key)
			}
			setExpanded(false)
		},
		[onSelect, onRemove],
	)

	const half = size / 2

	return (
		<>
			{/* Main badge */}
			<div
				ref={containerRef}
				onPointerDown={handleBadgeClick}
				style={{
					position: 'absolute',
					left: position.x - half,
					top: position.y - half,
					width: size,
					height: size,
					borderRadius: '50%',
					background: 'white',
					border: '2px solid #e0e0e0',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: size * 0.6,
					cursor: 'pointer',
					pointerEvents: 'all',
					zIndex: 10,
					transition: 'transform 0.15s ease-out',
					transform: expanded ? 'scale(1.15)' : 'scale(1)',
					boxShadow: expanded ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)',
				}}
			>
				{display}
			</div>

			{/* Sub-satellites */}
			{subPositions.map((subPos, i) => {
				const option = allOptions[i]
				return (
					<div
						key={option.key}
						onPointerDown={handleOptionClick(option.key)}
						style={{
							position: 'absolute',
							left: subPos.x - half,
							top: subPos.y - half,
							width: size,
							height: size,
							borderRadius: '50%',
							background: option.key === '__remove__' ? '#fee' : 'white',
							border: `2px solid ${option.key === '__remove__' ? '#f88' : '#ccc'}`,
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
