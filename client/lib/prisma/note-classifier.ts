import type { MandalaState, TreeMapDefinition } from '../../../shared/types/MandalaTypes'
import {
	collectAnchorCells,
	findNearestCell,
	generateCellAnchors,
	type NearestCellResult,
} from './cell-anchors'
import type { LocalPrismaTrainer } from './local-trainer'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Injectable embedding function for testability. */
export type EmbedFn = (text: string) => Promise<Float32Array>

/** Classification result for a single note. */
export interface NoteClassification {
	text: string
	matches: NearestCellResult[]
}

/** Input descriptor for batch classification. */
export interface NoteDescriptor {
	shapeId: string
	text: string
}

/** Batch entry with cell context. */
export interface NoteClassificationEntry {
	shapeId: string
	text: string
	currentCellId: string | null
	matches: NearestCellResult[]
}

/** Batch classification result. */
export interface BatchClassificationResult {
	entries: NoteClassificationEntry[]
	misplaced: NoteClassificationEntry[]
	skippedEmpty: string[]
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Reverse lookup: find which cell contains a given shape ID. */
export function findCurrentCell(shapeId: string, state: MandalaState): string | null {
	for (const [cellId, cellState] of Object.entries(state)) {
		if (cellState.contentShapeIds.includes(shapeId as any)) {
			return cellId
		}
	}
	return null
}

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Classify a single note's text against a map's cell anchors.
 * If a trained LocalPrismaTrainer is provided, uses the projection head for better accuracy.
 */
export async function classifyNote(
	text: string,
	treeDef: TreeMapDefinition,
	embedFn: EmbedFn,
	topK = 3,
	trainer?: LocalPrismaTrainer | null,
): Promise<NoteClassification> {
	const embedding = await embedFn(text)

	if (trainer?.isInitialized) {
		// Use trained projection head + trained anchors
		const results = trainer.classify(embedding, topK)
		const cells = collectAnchorCells(treeDef.root)
		const labelMap = new Map(cells.map((c) => [c.id, c.label]))
		const matches: NearestCellResult[] = results.map((r) => ({
			cellId: r.cellId,
			label: labelMap.get(r.cellId) ?? r.cellId,
			similarity: r.similarity,
		}))
		return { text, matches }
	}

	// Cold-start: use multi-anchor embeddings
	const anchors = await generateCellAnchors(treeDef)
	const matches = findNearestCell(embedding, anchors, topK)
	return { text, matches }
}

/** Classify all notes in a batch, identifying misplaced ones. */
export async function classifyNoteBatch(
	notes: NoteDescriptor[],
	state: MandalaState,
	treeDef: TreeMapDefinition,
	embedFn: EmbedFn,
	topK = 3,
	trainer?: LocalPrismaTrainer | null,
): Promise<BatchClassificationResult> {
	const skippedEmpty: string[] = []
	const entries: NoteClassificationEntry[] = []

	for (const note of notes) {
		if (!note.text.trim()) {
			skippedEmpty.push(note.shapeId)
			continue
		}

		const classification = await classifyNote(note.text, treeDef, embedFn, topK, trainer)
		const currentCellId = findCurrentCell(note.shapeId, state)

		entries.push({
			shapeId: note.shapeId,
			text: note.text,
			currentCellId,
			matches: classification.matches,
		})
	}

	const misplaced = entries.filter(
		(e) =>
			e.currentCellId !== null && e.matches.length > 0 && e.currentCellId !== e.matches[0].cellId,
	)

	return { entries, misplaced, skippedEmpty }
}
