/** Status of the Flora embedding model */
export type FloraStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Progress info during model download */
export interface FloraLoadProgress {
	status: string
	file: string
	progress: number
	loaded: number
	total: number
}

// --- Worker message protocol ---

export type FloraWorkerRequest = { type: 'init' } | { type: 'embed'; id: string; text: string }

export type FloraWorkerResponse =
	| { type: 'init:progress'; progress: FloraLoadProgress }
	| { type: 'init:complete' }
	| { type: 'init:error'; error: string }
	| { type: 'embed:result'; id: string; embedding: Float32Array }
	| { type: 'embed:error'; id: string; error: string }
