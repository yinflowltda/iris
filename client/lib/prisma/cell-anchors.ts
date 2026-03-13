import type { TreeMapDefinition, TreeNodeDef } from '../../../shared/types/MandalaTypes'
import { PrismaEmbeddingService } from './embedding-service'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CellAnchor {
	cellId: string
	label: string
	embedding: Float32Array
}

export type CellAnchors = Map<string, CellAnchor>

export interface NearestCellResult {
	cellId: string
	label: string
	similarity: number
}

// ─── Anchor text composition ─────────────────────────────────────────────────

/** Join label + question + guidance + examples into a single text for embedding. */
export function composeAnchorText(node: TreeNodeDef): string {
	const parts: string[] = [node.label]
	if (node.question) parts.push(node.question)
	if (node.guidance) parts.push(node.guidance)
	if (node.examples.length > 0) parts.push(node.examples.join('. '))
	return parts.join('. ')
}

// ─── Tree traversal ──────────────────────────────────────────────────────────

/** Collect all cells with non-empty question (skips transparent groups and temporal cells). */
export function collectAnchorCells(root: TreeNodeDef): TreeNodeDef[] {
	const result: TreeNodeDef[] = []
	function walk(node: TreeNodeDef) {
		if (node.question) {
			result.push(node)
		}
		if (node.children) {
			for (const child of node.children) {
				walk(child)
			}
		}
	}
	walk(root)
	return result
}

// ─── Cache & generation ──────────────────────────────────────────────────────

const anchorCache = new Map<string, CellAnchors>()

/** Generate anchor embeddings for all meaningful cells in a map definition. */
export async function generateCellAnchors(treeDef: TreeMapDefinition): Promise<CellAnchors> {
	const cached = anchorCache.get(treeDef.id)
	if (cached) return cached

	const service = PrismaEmbeddingService.getInstance()
	const cells = collectAnchorCells(treeDef.root)
	const anchors: CellAnchors = new Map()

	for (const cell of cells) {
		const text = composeAnchorText(cell)
		const embedding = await service.embed(text)
		anchors.set(cell.id, { cellId: cell.id, label: cell.label, embedding })
	}

	anchorCache.set(treeDef.id, anchors)
	return anchors
}

/** Clear the anchor cache. */
export function clearAnchorCache(): void {
	anchorCache.clear()
}

// ─── Similarity ──────────────────────────────────────────────────────────────

/** Cosine similarity via dot product (vectors are already L2-normalized). */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
	}
	return dot
}

/** Find the nearest cell(s) by cosine similarity. */
export function findNearestCell(
	noteEmbedding: Float32Array,
	anchors: CellAnchors,
	topK = 1,
): NearestCellResult[] {
	const results: NearestCellResult[] = []
	for (const anchor of anchors.values()) {
		results.push({
			cellId: anchor.cellId,
			label: anchor.label,
			similarity: cosineSimilarity(noteEmbedding, anchor.embedding),
		})
	}
	results.sort((a, b) => b.similarity - a.similarity)
	return results.slice(0, topK)
}
