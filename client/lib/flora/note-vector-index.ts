// ─── Note Vector Index ───────────────────────────────────────────────────────
//
// In-memory vector index for semantic search over mandala notes.
// Caches embeddings so subsequent queries only need to embed the query text.
// All computation happens locally in the browser.

import type { MandalaState } from '../../../shared/types/MandalaTypes'
import type { Editor, TLShapeId } from 'tldraw'

const EMBED_DIM = 384

export interface IndexedNote {
	shapeId: string
	cellId: string
	text: string
	embedding: Float32Array
}

export interface SearchResult {
	shapeId: string
	cellId: string
	text: string
	similarity: number
}

/** Cosine similarity between two L2-normalized vectors. */
function cosineSim(a: Float32Array, b: Float32Array): number {
	let dot = 0
	for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
	return dot
}

export class NoteVectorIndex {
	private notes: IndexedNote[] = []
	private _mapId: string

	constructor(mapId: string) {
		this._mapId = mapId
	}

	get mapId(): string {
		return this._mapId
	}

	get size(): number {
		return this.notes.length
	}

	/**
	 * Build or refresh the index from the current mandala state.
	 * Only re-embeds notes that are new or changed.
	 */
	async rebuild(
		editor: Editor,
		state: MandalaState,
		embedFn: (text: string) => Promise<Float32Array>,
	): Promise<void> {
		const existingByShapeId = new Map<string, IndexedNote>()
		for (const note of this.notes) {
			existingByShapeId.set(note.shapeId, note)
		}

		const newNotes: IndexedNote[] = []

		for (const [cellId, cellState] of Object.entries(state)) {
			for (const shapeId of cellState.contentShapeIds) {
				const fullId = `shape:${shapeId}` as TLShapeId
				const shape = editor.getShape(fullId)
				if (!shape) continue

				const util = editor.getShapeUtil(shape)
				const text = (util as any).getText?.(shape) ?? ''
				if (!text.trim()) continue

				// Reuse existing embedding if text hasn't changed
				const existing = existingByShapeId.get(shapeId)
				if (existing && existing.text === text && existing.cellId === cellId) {
					newNotes.push(existing)
					continue
				}

				// Embed new/changed note
				const embedding = await embedFn(text)
				newNotes.push({ shapeId, cellId, text, embedding })
			}
		}

		this.notes = newNotes
	}

	/**
	 * Search for notes most similar to a query embedding.
	 * Returns top-K results sorted by similarity (highest first).
	 */
	search(queryEmbedding: Float32Array, topK = 5): SearchResult[] {
		if (this.notes.length === 0) return []

		const results: SearchResult[] = this.notes.map((note) => ({
			shapeId: note.shapeId,
			cellId: note.cellId,
			text: note.text,
			similarity: cosineSim(queryEmbedding, note.embedding),
		}))

		results.sort((a, b) => b.similarity - a.similarity)
		return results.slice(0, topK)
	}

	/** Clear the index. */
	clear(): void {
		this.notes = []
	}
}
