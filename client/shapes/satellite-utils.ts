// ─── Satellite position math ────────────────────────────────────────────────

export interface SatellitePosition {
	x: number
	y: number
	angle: number
}

/**
 * Compute evenly spaced positions around a circle (note edge).
 * Starts from the top (12 o'clock) and distributes clockwise.
 */
export function computeSatellitePositions(
	count: number,
	radius: number,
	offset: number,
): SatellitePosition[] {
	if (count === 0) return []
	const orbitRadius = radius + offset
	const centerX = radius
	const centerY = radius
	const startAngle = -Math.PI / 2 // 12 o'clock
	const positions: SatellitePosition[] = []

	for (let i = 0; i < count; i++) {
		const angle = startAngle + (2 * Math.PI * i) / count
		positions.push({
			x: centerX + orbitRadius * Math.cos(angle),
			y: centerY + orbitRadius * Math.sin(angle),
			angle,
		})
	}
	return positions
}

/**
 * Compute sub-satellite positions fanning outward from a parent satellite.
 * Positions arc away from the note center so they don't overlap the note.
 */
export function computeSubSatellitePositions(
	parent: SatellitePosition,
	noteCenter: { x: number; y: number },
	count: number,
	spacing: number,
): SatellitePosition[] {
	if (count === 0) return []

	// Direction from note center to parent badge
	const dx = parent.x - noteCenter.x
	const dy = parent.y - noteCenter.y
	const baseAngle = Math.atan2(dy, dx)

	// Fan sub-satellites in an arc centered on the outward direction
	const fanSpread = Math.PI * 0.6
	const startAngle = baseAngle - fanSpread / 2
	const positions: SatellitePosition[] = []

	for (let i = 0; i < count; i++) {
		const angle = count === 1 ? baseAngle : startAngle + (fanSpread * i) / (count - 1)
		positions.push({
			x: parent.x + spacing * Math.cos(angle),
			y: parent.y + spacing * Math.sin(angle),
			angle,
		})
	}
	return positions
}
