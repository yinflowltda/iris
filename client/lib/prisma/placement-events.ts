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
