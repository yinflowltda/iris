// ─── Symbolic Reasoning Layer (Layer 4) ─────────────────────────────────────
//
// Pure TypeScript analysis of the mandala's knowledge graph. No neural network.
// Detects chains, gaps, patterns, and coverage based on the map's edge schema.

import type {
	EdgeTypeDef,
	MandalaArrowRecord,
	MandalaState,
	TreeMapDefinition,
} from '../../../shared/types/MandalaTypes'
import { collectAnchorCells } from './cell-anchors'

// ─── Types ──────────────────────────────────────────────────────────────────

/** A chain of connected notes following edges in the schema. */
export interface Chain {
	/** The edge types traversed in order. */
	edgeTypeIds: string[]
	/** The note shape IDs in order (source → ... → target). */
	noteIds: string[]
	/** The cell IDs the chain passes through. */
	cellIds: string[]
	/** Whether the chain is complete (reaches a terminal cell). */
	isComplete: boolean
}

/** A missing edge that the schema expects but the user hasn't created. */
export interface GapAnalysisEntry {
	edgeTypeId: string
	edgeLabel: string
	fromCellId: string
	fromCellLabel: string
	toCellId: string
	toCellLabel: string
	/** Hint for when to suggest this edge. */
	suggestWhen?: string
}

/** Coverage summary for cells. */
export interface CoverageSummary {
	totalCells: number
	filledCells: number
	emptyCells: { cellId: string; label: string }[]
	/** Cells with only 1 note (may need more exploration). */
	thinCells: { cellId: string; label: string; noteCount: number }[]
}

/** Full symbolic analysis result. */
export interface SymbolicContext {
	chains: Chain[]
	gaps: GapAnalysisEntry[]
	coverage: CoverageSummary
	/** Summary stats for prompt injection. */
	stats: {
		chainCount: number
		completeChainCount: number
		gapCount: number
		filledCellRatio: string
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a lookup from shapeId → cellId using MandalaState. */
function buildShapeToCellMap(state: MandalaState): Map<string, string> {
	const map = new Map<string, string>()
	for (const [cellId, cellState] of Object.entries(state)) {
		for (const shapeId of cellState.contentShapeIds) {
			map.set(shapeId, cellId)
		}
	}
	return map
}

/** Build a lookup from cellId → label using the tree. */
function buildCellLabelMap(treeDef: TreeMapDefinition): Map<string, string> {
	const cells = collectAnchorCells(treeDef.root)
	const map = new Map<string, string>()
	// Also walk all nodes (including non-anchor ones like root)
	function walk(node: { id: string; label: string; children?: any[] }) {
		map.set(node.id, node.label)
		if (node.children) for (const child of node.children) walk(child)
	}
	walk(treeDef.root)
	return map
}

// ─── Chain Detection ────────────────────────────────────────────────────────

/**
 * Detect chains of connected notes following the edge schema.
 * A chain is a path through notes connected by arrows whose types match
 * the schema's fromCells → toCells constraints.
 */
export function detectChains(
	arrows: MandalaArrowRecord[],
	state: MandalaState,
	edgeTypes: EdgeTypeDef[],
): Chain[] {
	if (arrows.length === 0 || edgeTypes.length === 0) return []

	const shapeToCellMap = buildShapeToCellMap(state)

	// Build adjacency: sourceShapeId → [{ targetShapeId, edgeTypeId }]
	const adjacency = new Map<string, { targetId: string; edgeTypeId: string }[]>()

	for (const arrow of arrows) {
		if (!arrow.edgeTypeId) continue
		const edges = adjacency.get(arrow.sourceElementId) ?? []
		edges.push({ targetId: arrow.targetElementId, edgeTypeId: arrow.edgeTypeId })
		adjacency.set(arrow.sourceElementId, edges)
	}

	// Find chain starts: notes whose cell is a fromCell but never a toCell in any edge,
	// OR notes that have outgoing edges but no incoming typed edges.
	const hasIncoming = new Set<string>()
	for (const arrow of arrows) {
		if (arrow.edgeTypeId) hasIncoming.add(arrow.targetElementId)
	}

	const chainStarts = new Set<string>()
	for (const [sourceId] of adjacency) {
		if (!hasIncoming.has(sourceId)) {
			chainStarts.add(sourceId)
		}
	}

	// DFS from each start to find chains
	const chains: Chain[] = []

	for (const startId of chainStarts) {
		const startCell = shapeToCellMap.get(startId)
		if (!startCell) continue

		// DFS with path tracking
		function dfs(
			noteId: string,
			path: string[],
			edgePath: string[],
			cellPath: string[],
			visited: Set<string>,
		) {
			const neighbors = adjacency.get(noteId)
			if (!neighbors || neighbors.length === 0) {
				// Terminal node — emit chain if it has at least 2 nodes
				if (path.length >= 2) {
					chains.push({
						noteIds: [...path],
						edgeTypeIds: [...edgePath],
						cellIds: [...cellPath],
						isComplete: path.length >= 3, // At least 3 nodes = meaningful chain
					})
				}
				return
			}

			let extended = false
			for (const { targetId, edgeTypeId } of neighbors) {
				if (visited.has(targetId)) continue
				const targetCell = shapeToCellMap.get(targetId)
				if (!targetCell) continue

				visited.add(targetId)
				path.push(targetId)
				edgePath.push(edgeTypeId)
				cellPath.push(targetCell)

				dfs(targetId, path, edgePath, cellPath, visited)

				path.pop()
				edgePath.pop()
				cellPath.pop()
				visited.delete(targetId)
				extended = true
			}

			if (!extended && path.length >= 2) {
				chains.push({
					noteIds: [...path],
					edgeTypeIds: [...edgePath],
					cellIds: [...cellPath],
					isComplete: path.length >= 3,
				})
			}
		}

		const visited = new Set([startId])
		dfs(startId, [startId], [], [startCell], visited)
	}

	return chains
}

// ─── Gap Analysis ───────────────────────────────────────────────────────────

/**
 * Identify edges that the schema expects but haven't been created.
 * Only reports gaps where both the source and target cells have notes.
 */
export function analyzeGaps(
	arrows: MandalaArrowRecord[],
	state: MandalaState,
	edgeTypes: EdgeTypeDef[],
	cellLabelMap: Map<string, string>,
): GapAnalysisEntry[] {
	if (edgeTypes.length === 0) return []

	// Build set of existing edge types between cell pairs
	const shapeToCellMap = buildShapeToCellMap(state)
	const existingEdges = new Set<string>()
	for (const arrow of arrows) {
		if (!arrow.edgeTypeId) continue
		const fromCell = shapeToCellMap.get(arrow.sourceElementId)
		const toCell = shapeToCellMap.get(arrow.targetElementId)
		if (fromCell && toCell) {
			existingEdges.add(`${arrow.edgeTypeId}:${fromCell}:${toCell}`)
		}
	}

	// Find filled cells
	const filledCells = new Set<string>()
	for (const [cellId, cellState] of Object.entries(state)) {
		if (cellState.contentShapeIds.length > 0) filledCells.add(cellId)
	}

	const gaps: GapAnalysisEntry[] = []

	for (const edgeType of edgeTypes) {
		for (const fromCellId of edgeType.fromCells) {
			if (!filledCells.has(fromCellId)) continue

			for (const toCellId of edgeType.toCells) {
				if (!filledCells.has(toCellId)) continue

				const key = `${edgeType.id}:${fromCellId}:${toCellId}`
				if (!existingEdges.has(key)) {
					gaps.push({
						edgeTypeId: edgeType.id,
						edgeLabel: edgeType.label,
						fromCellId,
						fromCellLabel: cellLabelMap.get(fromCellId) ?? fromCellId,
						toCellId,
						toCellLabel: cellLabelMap.get(toCellId) ?? toCellId,
						suggestWhen: edgeType.suggestWhen,
					})
				}
			}
		}
	}

	return gaps
}

// ─── Coverage Analysis ──────────────────────────────────────────────────────

/** Analyze cell coverage: empty, thin, and filled cells. */
export function analyzeCoverage(state: MandalaState, treeDef: TreeMapDefinition): CoverageSummary {
	const cells = collectAnchorCells(treeDef.root)
	const emptyCells: CoverageSummary['emptyCells'] = []
	const thinCells: CoverageSummary['thinCells'] = []
	let filledCount = 0

	for (const cell of cells) {
		const cellState = state[cell.id]
		const noteCount = cellState?.contentShapeIds.length ?? 0

		if (noteCount === 0) {
			emptyCells.push({ cellId: cell.id, label: cell.label })
		} else {
			filledCount++
			if (noteCount === 1) {
				thinCells.push({ cellId: cell.id, label: cell.label, noteCount })
			}
		}
	}

	return {
		totalCells: cells.length,
		filledCells: filledCount,
		emptyCells,
		thinCells,
	}
}

// ─── Full Analysis ──────────────────────────────────────────────────────────

/** Run full symbolic analysis on a mandala's knowledge graph. */
export function analyzeKnowledgeGraph(
	arrows: MandalaArrowRecord[],
	state: MandalaState,
	treeDef: TreeMapDefinition,
): SymbolicContext {
	const edgeTypes = treeDef.edgeTypes ?? []
	const cellLabelMap = buildCellLabelMap(treeDef)

	const chains = detectChains(arrows, state, edgeTypes)
	const gaps = analyzeGaps(arrows, state, edgeTypes, cellLabelMap)
	const coverage = analyzeCoverage(state, treeDef)

	const completeChains = chains.filter((c) => c.isComplete)

	return {
		chains,
		gaps,
		coverage,
		stats: {
			chainCount: chains.length,
			completeChainCount: completeChains.length,
			gapCount: gaps.length,
			filledCellRatio: `${coverage.filledCells}/${coverage.totalCells}`,
		},
	}
}
