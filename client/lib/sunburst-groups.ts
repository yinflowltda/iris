import type { SunburstArc } from './sunburst-layout'

export interface MergedArc extends SunburstArc {
	memberIds: string[]
}

/**
 * Merge adjacent arcs at the same radial band with matching groupId into single visual arcs.
 * Uses y-band position (not tree depth) so arcs at different tree depths but the same
 * radial band merge correctly (e.g., Flow's week-slot at depth 2 with Monday's at depth 5).
 * Non-grouped arcs pass through with memberIds = [own id].
 */
export function mergeGroupArcs(arcs: SunburstArc[]): MergedArc[] {
	const groups = new Map<string, SunburstArc[]>()
	const ungrouped: SunburstArc[] = []

	for (const arc of arcs) {
		if (arc.groupId) {
			const key = `${arc.y0.toFixed(4)}:${arc.groupId}`
			const group = groups.get(key)
			if (group) group.push(arc)
			else groups.set(key, [arc])
		} else {
			ungrouped.push(arc)
		}
	}

	const merged: MergedArc[] = ungrouped.map((a) => ({ ...a, memberIds: [a.id] }))

	for (const [, group] of groups) {
		const sorted = group.sort((a, b) => a.x0 - b.x0)

		// Split into contiguous runs (arcs touching each other)
		const runs: SunburstArc[][] = [[sorted[0]]]
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1]
			const curr = sorted[i]
			// Check if contiguous (allowing small floating-point gaps)
			if (Math.abs(curr.x0 - prev.x1) < 0.001) {
				runs[runs.length - 1].push(curr)
			} else {
				runs.push([curr])
			}
		}

		for (let r = 0; r < runs.length; r++) {
			const run = runs[r]
			const first = run[0]
			const last = run[run.length - 1]
			merged.push({
				...first,
				id: runs.length === 1 ? first.groupId! : `${first.groupId!}-${r}`,
				label: first.label,
				x0: first.x0,
				x1: last.x1,
				memberIds: run.map((a) => a.id),
			})
		}
	}

	return merged.sort((a, b) => a.depth - b.depth || a.x0 - b.x0)
}
