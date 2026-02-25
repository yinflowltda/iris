import { interpolate } from 'd3-interpolate'
import type { SunburstArc } from './sunburst-layout'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ArcAnimationState {
	x0: number
	x1: number
	y0: number
	y1: number
}

// ─── Zoom target computation ─────────────────────────────────────────────────

/**
 * Compute target arc params when zooming to a specific node.
 * The target node's subtree fills the full circle (0 to 2*PI in x).
 * Arcs outside the subtree are clamped to zero-width.
 */
export function computeZoomTargets(
	arcs: SunburstArc[],
	targetNodeId: string,
): Map<string, ArcAnimationState> {
	const target = arcs.find((a) => a.id === targetNodeId)
	if (!target) return new Map()

	const targets = new Map<string, ArcAnimationState>()

	// When zooming to the root node, expand it to fill the full radius
	// and collapse all other arcs
	if (target.depth === 0) {
		for (const arc of arcs) {
			if (arc.id === target.id) {
				targets.set(arc.id, { x0: 0, x1: 2 * Math.PI, y0: 0, y1: 1 })
			} else {
				// Collapse all non-root arcs to the root's outer edge
				targets.set(arc.id, { x0: arc.x0, x1: arc.x0, y0: 0, y1: 0 })
			}
		}
		return targets
	}

	const xRange = target.x1 - target.x0
	const xScale = xRange > 0 ? (2 * Math.PI) / xRange : 0
	const yShift = target.y0

	// Find max depth in the subtree to rescale y so arcs fill the full radius
	let maxY1 = target.y1
	for (const arc of arcs) {
		// Only consider arcs within the target's x-range (i.e., in the subtree)
		if (arc.x0 >= target.x0 && arc.x1 <= target.x1) {
			if (arc.y1 > maxY1) maxY1 = arc.y1
		}
	}
	const yRange = maxY1 - yShift
	const yScale = yRange > 0 ? 1 / yRange : 1

	for (const arc of arcs) {
		const newX0 = Math.max(0, Math.min(2 * Math.PI, (arc.x0 - target.x0) * xScale))
		const newX1 = Math.max(0, Math.min(2 * Math.PI, (arc.x1 - target.x0) * xScale))

		// Collapse y to zero for arcs with no angular width (outside the subtree)
		// to prevent phantom hits in hit-testing
		const collapsed = newX1 - newX0 < 0.001
		const newY0 = collapsed ? 0 : Math.max(0, (arc.y0 - yShift) * yScale)
		const newY1 = collapsed ? 0 : Math.max(0, (arc.y1 - yShift) * yScale)

		targets.set(arc.id, { x0: newX0, x1: newX1, y0: newY0, y1: newY1 })
	}

	return targets
}

// ─── Animation ───────────────────────────────────────────────────────────────

/**
 * Run a RAF animation interpolating arc params from current to target.
 * Calls onFrame with interpolated arcs on each frame.
 * Calls onComplete when done.
 * Returns a cancel function.
 */
export function animateSunburstZoom(opts: {
	current: Map<string, ArcAnimationState>
	target: Map<string, ArcAnimationState>
	durationMs: number
	onFrame: (arcs: Map<string, ArcAnimationState>) => void
	onComplete: () => void
}): () => void {
	const { current, target, durationMs, onFrame, onComplete } = opts
	const interpolators = new Map<string, (t: number) => ArcAnimationState>()

	for (const [id, cur] of current) {
		const tgt = target.get(id)
		if (tgt) {
			const i = interpolate(cur, tgt)
			interpolators.set(id, i)
		}
	}

	const start = performance.now()
	let cancelled = false

	function frame(now: number) {
		if (cancelled) return
		const elapsed = now - start
		const t = Math.min(1, elapsed / durationMs)
		const eased = easeOutCubic(t)

		const interpolated = new Map<string, ArcAnimationState>()
		for (const [id, interp] of interpolators) {
			interpolated.set(id, interp(eased))
		}

		onFrame(interpolated)

		if (t < 1) {
			requestAnimationFrame(frame)
		} else {
			onComplete()
		}
	}

	requestAnimationFrame(frame)
	return () => {
		cancelled = true
	}
}

// ─── Easing ──────────────────────────────────────────────────────────────────

export function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3
}
