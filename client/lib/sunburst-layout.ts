import { hierarchy, partition } from 'd3-hierarchy'
import type { TreeMapDefinition, TreeNodeDef } from '../../shared/types/MandalaTypes'
import { mergeGroupArcs } from './sunburst-groups'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SunburstArc {
	id: string
	label: string
	depth: number
	x0: number
	x1: number
	y0: number
	y1: number
	transparent: boolean
	parentId: string | null
	hasChildren: boolean
	groupId?: string
	hideLabel?: boolean
	labelScale?: number
}

// ─── Main layout function ────────────────────────────────────────────────────

export function computeSunburstLayout(treeDef: TreeMapDefinition): SunburstArc[] {
	const root = hierarchy(treeDef.root, (d) => d.children).sum((d) =>
		d.children && d.children.length > 0 ? 0 : (d.weight ?? 1),
	)

	// Count maximum visual depth to determine band size
	const maxDepth = computeMaxVisualDepth(treeDef.root)
	const partitionLayout = partition<TreeNodeDef>().size([2 * Math.PI, maxDepth])

	const partitioned = partitionLayout(root)

	// Build a map of transparent-ancestor depth offsets
	// For each node, compute how many transparent ancestors it has
	const transparentOffsets = new Map<string, number>()
	computeTransparentOffsets(partitioned.data, 0, transparentOffsets)

	const PI2 = 2 * Math.PI
	const angleOffset = treeDef.startAngle ?? 0

	const arcs: SunburstArc[] = []

	for (const node of partitioned.descendants()) {
		const offset = transparentOffsets.get(node.data.id) ?? 0
		const isTransparent = node.data.transparent === true

		// Normalize y values to 0-1 range
		const rawY0 = node.y0 / maxDepth
		const rawY1 = node.y1 / maxDepth

		// Adjust for transparent nodes: shift up by offset bands
		const bandSize = 1 / maxDepth
		const adjustedY0 = rawY0 - offset * bandSize
		const adjustedY1 = rawY1 - offset * bandSize

		// Apply angular offset and wrap to [0, 2π]
		const x0 = (((node.x0 + angleOffset) % PI2) + PI2) % PI2
		const x1 = x0 + (node.x1 - node.x0)

		arcs.push({
			id: node.data.id,
			label: node.data.label,
			depth: node.depth - offset,
			x0,
			x1,
			y0: adjustedY0,
			y1: adjustedY1,
			transparent: isTransparent,
			parentId: node.parent?.data.id ?? null,
			hasChildren: (node.data.children?.length ?? 0) > 0,
			groupId: node.data.groupId,
		hideLabel: node.data.hideLabel,
		labelScale: node.data.labelScale,
		})
	}

	return arcs
}

// ─── Transparent depth offset computation ────────────────────────────────────

function computeTransparentOffsets(
	node: TreeNodeDef,
	currentOffset: number,
	offsets: Map<string, number>,
): void {
	offsets.set(node.id, currentOffset)
	const childOffset = node.transparent ? currentOffset + 1 : currentOffset
	for (const child of node.children ?? []) {
		computeTransparentOffsets(child, childOffset, offsets)
	}
}

function computeMaxVisualDepth(root: TreeNodeDef): number {
	let maxDepth = 0

	function walk(node: TreeNodeDef, depth: number, transparentCount: number): void {
		const visualDepth = depth - transparentCount
		if (visualDepth > maxDepth) maxDepth = visualDepth
		const childTransparent = node.transparent ? transparentCount + 1 : transparentCount
		for (const child of node.children ?? []) {
			walk(child, depth + 1, childTransparent)
		}
	}

	walk(root, 0, 0)
	// We need the partition to allocate enough depth bands
	// The partition size should be the actual tree depth (not visual)
	// We adjust visually after. So just return actual max depth.
	return getMaxTreeDepth(root)
}

function getMaxTreeDepth(node: TreeNodeDef): number {
	if (!node.children || node.children.length === 0) return 1
	return 1 + Math.max(...node.children.map(getMaxTreeDepth))
}

// ─── Full arc set (includes computed month positions + overlay arcs) ─────────

/**
 * Produce a complete arc array where every visual cell is at its correct position.
 * - hideLabel month arcs are repositioned to their visual locations (1/3 of merged week width)
 * - Overlay ring arcs (e.g., life phase blocks) are included
 *
 * This is the single source of truth for cell positions. All hit-testing, bounds,
 * and snap logic should use this instead of raw computeSunburstLayout().
 */
export function computeFullArcSet(treeDef: TreeMapDefinition): SunburstArc[] {
	const baseArcs = computeSunburstLayout(treeDef)
	const merged = mergeGroupArcs(baseArcs)

	// Build result: start with all non-hideLabel arcs unchanged
	const result: SunburstArc[] = []
	const hideLabelsById = new Map<string, SunburstArc>()

	for (const arc of baseArcs) {
		if (arc.hideLabel) {
			hideLabelsById.set(arc.id, arc)
		} else {
			result.push(arc)
		}
	}

	// Reposition hideLabel arcs (months) to their visual positions
	const weekArcs = merged.filter((a) => a.groupId && a.memberIds.length > 1)
	for (const weekArc of weekArcs) {
		const firstMemberId = weekArc.memberIds[0]
		const monthArcs = baseArcs.filter((a) => a.parentId === firstMemberId && a.hideLabel)
		if (monthArcs.length === 0) continue

		const weekSweep = weekArc.x1 - weekArc.x0
		const monthSweep = weekSweep / monthArcs.length
		monthArcs.sort((a, b) => a.x0 - b.x0)

		for (let m = 0; m < monthArcs.length; m++) {
			const base = monthArcs[m]
			hideLabelsById.delete(base.id) // mark as handled
			result.push({
				...base,
				x0: weekArc.x0 + m * monthSweep,
				x1: weekArc.x0 + (m + 1) * monthSweep,
			})
		}
	}

	// Any remaining hideLabel arcs that weren't month children — pass through
	for (const arc of hideLabelsById.values()) {
		result.push(arc)
	}

	// Add overlay ring arcs
	if (treeDef.overlayRing) {
		const overlay = treeDef.overlayRing
		const startArc = baseArcs.find((a) => a.id === overlay.startNodeId)
		const endArc = baseArcs.find((a) => a.id === overlay.endNodeId)
		if (startArc && endArc) {
			const regionX0 = startArc.x0
			const regionX1 = endArc.x1
			const regionSweep =
				regionX1 >= regionX0 ? regionX1 - regionX0 : regionX1 + 2 * Math.PI - regionX0

			// Compute overlay y band
			const leafArcs = baseArcs.filter((a) => !a.hasChildren && !a.transparent)
			const regionLeaves = leafArcs.filter((a) => {
				if (regionX0 <= regionX1) return a.x0 >= regionX0 && a.x1 <= regionX1
				return a.x0 >= regionX0 || a.x1 <= regionX1
			})
			const nonRegionLeaves = leafArcs.filter((a) => {
				if (regionX0 <= regionX1) return a.x0 < regionX0 || a.x1 > regionX1
				return a.x0 < regionX0 && a.x1 > regionX1
			})
			const overlayY0 = regionLeaves.length > 0 ? Math.max(...regionLeaves.map((a) => a.y1)) : 0.667
			const overlayY1 = nonRegionLeaves.length > 0 ? Math.max(...nonRegionLeaves.map((a) => a.y1)) : 0.833

			let cursor = regionX0
			for (const oArc of overlay.arcs) {
				const arcSweep = oArc.fraction * regionSweep
				result.push({
					id: oArc.id,
					label: oArc.label,
					depth: Math.max(...baseArcs.map((a) => a.depth)) + 1,
					x0: cursor,
					x1: cursor + arcSweep,
					y0: overlayY0,
					y1: overlayY1,
					transparent: false,
					parentId: null,
					hasChildren: false,
				})
				cursor += arcSweep
			}
		}
	}

	return result
}

// ─── Helper functions ────────────────────────────────────────────────────────

export function getAllTreeNodeIds(treeDef: TreeMapDefinition): string[] {
	const ids: string[] = []
	function dfs(node: TreeNodeDef): void {
		ids.push(node.id)
		for (const child of node.children ?? []) {
			dfs(child)
		}
	}
	dfs(treeDef.root)
	return ids
}

export function isNodeInSubtree(root: TreeNodeDef, subtreeRootId: string, nodeId: string): boolean {
	const subtreeRoot = findTreeNode(root, subtreeRootId)
	if (!subtreeRoot) return false
	return findTreeNode(subtreeRoot, nodeId) !== null
}

export function findTreeNode(root: TreeNodeDef, nodeId: string): TreeNodeDef | null {
	if (root.id === nodeId) return root
	for (const child of root.children ?? []) {
		const found = findTreeNode(child, nodeId)
		if (found) return found
	}
	return null
}
