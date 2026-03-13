/** Status of the Prisma embedding model */
export type PrismaStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Progress info during model download */
export interface PrismaLoadProgress {
	status: string
	file: string
	progress: number
	loaded: number
	total: number
}

// --- Worker message protocol ---

export type PrismaWorkerRequest = { type: 'init' } | { type: 'embed'; id: string; text: string }

export type PrismaWorkerResponse =
	| { type: 'init:progress'; progress: PrismaLoadProgress }
	| { type: 'init:complete' }
	| { type: 'init:error'; error: string }
	| { type: 'embed:result'; id: string; embedding: Float32Array }
	| { type: 'embed:error'; id: string; error: string }
