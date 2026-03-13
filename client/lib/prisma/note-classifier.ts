import type { MandalaState, TreeMapDefinition } from '../../../shared/types/MandalaTypes'
import { findNearestCell, generateCellAnchors, type NearestCellResult } from './cell-anchors'

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

/** Classify a single note's text against a map's cell anchors. */
export async function classifyNote(
	text: string,
	treeDef: TreeMapDefinition,
	embedFn: EmbedFn,
	topK = 3,
): Promise<NoteClassification> {
	const anchors = await generateCellAnchors(treeDef)
	const embedding = await embedFn(text)
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
): Promise<BatchClassificationResult> {
	const skippedEmpty: string[] = []
	const entries: NoteClassificationEntry[] = []

	for (const note of notes) {
		if (!note.text.trim()) {
			skippedEmpty.push(note.shapeId)
			continue
		}

		const classification = await classifyNote(note.text, treeDef, embedFn, topK)
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
