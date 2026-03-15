// ─── Placement Event Bus ─────────────────────────────────────────────────────
//
// Simple pub/sub for note-to-cell placement events. The snap system fires events
// when a note is placed into a cell, and the trainer subscribes to collect them.

export interface PlacementEvent {
	noteText: string
	cellId: string
	mapId: string
}

type PlacementListener = (event: PlacementEvent) => void

const listeners = new Set<PlacementListener>()

/** Emit a placement event (called by snap system when a note lands in a cell). */
export function emitPlacement(event: PlacementEvent): void {
	for (const listener of listeners) {
		listener(event)
	}
}

/** Subscribe to placement events. Returns an unsubscribe function. */
export function onPlacement(listener: PlacementListener): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/** Clear all listeners (for testing). */
export function clearPlacementListeners(): void {
	listeners.clear()
}

// ─── Arrow Event Bus ────────────────────────────────────────────────────────

export interface ArrowEvent {
	srcNoteText: string
	tgtNoteText: string
	srcCellId: string
	tgtCellId: string
	edgeTypeId: string
	mapId: string
}

type ArrowListener = (event: ArrowEvent) => void

const arrowListeners = new Set<ArrowListener>()

/** Emit an arrow event (called when user creates a typed arrow). */
export function emitArrowCreated(event: ArrowEvent): void {
	for (const listener of arrowListeners) {
		listener(event)
	}
}

/** Subscribe to arrow creation events. Returns an unsubscribe function. */
export function onArrowCreated(listener: ArrowListener): () => void {
	arrowListeners.add(listener)
	return () => arrowListeners.delete(listener)
}

/** Clear all arrow listeners (for testing). */
export function clearArrowListeners(): void {
	arrowListeners.clear()
}
