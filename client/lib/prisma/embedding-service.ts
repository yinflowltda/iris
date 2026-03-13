import type { PrismaLoadProgress, PrismaStatus, PrismaWorkerResponse } from './types'

export interface PrismaServiceEvents {
	status: PrismaStatus
	progress: PrismaLoadProgress
	error: string
}

type EventCallback<K extends keyof PrismaServiceEvents> = (data: PrismaServiceEvents[K]) => void

let instance: PrismaEmbeddingService | null = null

export class PrismaEmbeddingService {
	private worker: Worker | null = null
	private listeners = new Map<string, Set<(...args: any[]) => void>>()
	private pendingEmbeds = new Map<
		string,
		{ resolve: (v: Float32Array) => void; reject: (e: Error) => void }
	>()

	private _status: PrismaStatus = 'idle'
	private _error: string | null = null
	private initPromise: Promise<void> | null = null
	private requestCounter = 0

	static getInstance(): PrismaEmbeddingService {
		if (!instance) {
			instance = new PrismaEmbeddingService()
		}
		return instance
	}

	static isSupported(): boolean {
		return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
	}

	/** Reset singleton — only for tests */
	static _resetInstance(): void {
		if (instance) {
			instance.dispose()
		}
		instance = null
	}

	get status(): PrismaStatus {
		return this._status
	}

	get error(): string | null {
		return this._error
	}

	on<K extends keyof PrismaServiceEvents>(event: K, callback: EventCallback<K>): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set())
		}
		const set = this.listeners.get(event)!
		set.add(callback)
		return () => set.delete(callback)
	}

	private emit<K extends keyof PrismaServiceEvents>(event: K, data: PrismaServiceEvents[K]): void {
		const set = this.listeners.get(event)
		if (set) {
			for (const cb of set) cb(data)
		}
	}

	private setStatus(status: PrismaStatus): void {
		this._status = status
		this.emit('status', status)
	}

	init(): Promise<void> {
		if (this.initPromise) return this.initPromise

		this.initPromise = new Promise<void>((resolve, reject) => {
			this.setStatus('loading')
			this._error = null

			this.worker = new Worker(new URL('./embedding-worker.ts', import.meta.url), {
				type: 'module',
			})

			this.worker.onmessage = (e: MessageEvent<PrismaWorkerResponse>) => {
				this.handleMessage(e.data, resolve, reject)
			}

			this.worker.onerror = (e) => {
				const msg = e.message || 'Worker error'
				this._error = msg
				this.setStatus('error')
				this.emit('error', msg)
				reject(new Error(msg))
			}

			this.worker.postMessage({ type: 'init' })
		})

		return this.initPromise
	}

	private handleMessage(
		msg: PrismaWorkerResponse,
		initResolve?: () => void,
		initReject?: (e: Error) => void,
	): void {
		switch (msg.type) {
			case 'init:progress':
				this.emit('progress', msg.progress)
				break
			case 'init:complete':
				this.setStatus('ready')
				initResolve?.()
				break
			case 'init:error':
				this._error = msg.error
				this.setStatus('error')
				this.emit('error', msg.error)
				initReject?.(new Error(msg.error))
				break
			case 'embed:result': {
				const pending = this.pendingEmbeds.get(msg.id)
				if (pending) {
					this.pendingEmbeds.delete(msg.id)
					pending.resolve(msg.embedding)
				}
				break
			}
			case 'embed:error': {
				const pending = this.pendingEmbeds.get(msg.id)
				if (pending) {
					this.pendingEmbeds.delete(msg.id)
					pending.reject(new Error(msg.error))
				}
				break
			}
		}
	}

	async embed(text: string): Promise<Float32Array> {
		if (this._status !== 'ready') {
			await this.init()
		}

		const id = String(++this.requestCounter)
		return new Promise<Float32Array>((resolve, reject) => {
			this.pendingEmbeds.set(id, { resolve, reject })
			this.worker!.postMessage({ type: 'embed', id, text })
		})
	}

	dispose(): void {
		if (this.worker) {
			this.worker.terminate()
			this.worker = null
		}
		for (const [, pending] of this.pendingEmbeds) {
			pending.reject(new Error('Service disposed'))
		}
		this.pendingEmbeds.clear()
		this.listeners.clear()
		this._status = 'idle'
		this._error = null
		this.initPromise = null
		if (instance === this) {
			instance = null
		}
	}
}
