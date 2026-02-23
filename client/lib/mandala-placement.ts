interface Rect {
	x: number
	y: number
	w: number
	h: number
}

const MANDALA_GAP = 80

/**
 * Find a non-overlapping position for a new mandala.
 * Places to the right of the rightmost existing mandala, or centers in viewport if none exist.
 */
export function findNonOverlappingPosition(
	existingMandalas: Rect[],
	viewport: Rect,
	newSize: number,
): { x: number; y: number } {
	const centerY = viewport.y + viewport.h / 2 - newSize / 2

	if (existingMandalas.length === 0) {
		return {
			x: viewport.x + viewport.w / 2 - newSize / 2,
			y: centerY,
		}
	}

	let rightEdge = -Infinity
	for (const m of existingMandalas) {
		const edge = m.x + m.w
		if (edge > rightEdge) rightEdge = edge
	}

	return {
		x: rightEdge + MANDALA_GAP,
		y: centerY,
	}
}
