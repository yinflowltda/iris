export interface SatellitePosition {
	x: number
	y: number
	angleDeg: number
}

/**
 * Compute positions for N satellites orbiting a circle.
 * The circle has its center at (radius, radius) — matching TLDraw note geometry
 * where the shape origin is top-left.
 *
 * @param count Number of satellites
 * @param radius Note circle radius
 * @param offset Distance from circle edge to satellite center
 * @returns Array of {x, y, angleDeg} positions in shape-local coordinates
 */
export function computeSatellitePositions(
	count: number,
	radius: number,
	offset: number,
): SatellitePosition[] {
	if (count === 0) return []

	const cx = radius
	const cy = radius
	const orbitRadius = radius + offset
	const startAngleDeg = 270 // 12 o'clock

	return Array.from({ length: count }, (_, i) => {
		const angleDeg = (startAngleDeg + (360 / count) * i) % 360
		const angleRad = (angleDeg * Math.PI) / 180
		return {
			x: cx + orbitRadius * Math.cos(angleRad),
			y: cy + orbitRadius * Math.sin(angleRad),
			angleDeg,
		}
	})
}

/**
 * Compute positions for sub-satellites that bloom outward from a parent satellite.
 * Sub-satellites are arranged in an arc centered on the parent's angle away from the note center.
 *
 * @param parent Parent satellite position (shape-local)
 * @param noteCenter Note center position (shape-local)
 * @param count Number of sub-satellites
 * @param subOffset Distance from parent to sub-satellite center
 * @param spreadDeg Total arc spread in degrees (default 120)
 * @returns Array of {x, y, angleDeg} positions in shape-local coordinates
 */
export function computeSubSatellitePositions(
	parent: { x: number; y: number },
	noteCenter: { x: number; y: number },
	count: number,
	subOffset: number,
	spreadDeg = 120,
): SatellitePosition[] {
	if (count === 0) return []

	// Direction from note center to parent
	const dx = parent.x - noteCenter.x
	const dy = parent.y - noteCenter.y
	const baseAngleRad = Math.atan2(dy, dx)
	const baseAngleDeg = (baseAngleRad * 180) / Math.PI

	// Spread sub-satellites in an arc centered on baseAngle
	const halfSpread = spreadDeg / 2
	const step = count > 1 ? spreadDeg / (count - 1) : 0

	return Array.from({ length: count }, (_, i) => {
		const offsetDeg = count > 1 ? -halfSpread + step * i : 0
		const angleDeg = baseAngleDeg + offsetDeg
		const angleRad = (angleDeg * Math.PI) / 180
		return {
			x: parent.x + subOffset * Math.cos(angleRad),
			y: parent.y + subOffset * Math.sin(angleRad),
			angleDeg,
		}
	})
}
