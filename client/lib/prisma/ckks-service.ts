// ─── CKKS Encryption Service ────────────────────────────────────────────────
//
// Async API for CKKS homomorphic encryption via Web Worker.
// Follows the PrismaEmbeddingService singleton + Worker pattern.

import type { CkksStatus, CkksBlob, CkksKeyPair, CkksWorkerResponse } from './ckks-types'

const CKKS_IDB_STORE = 'ckks-keys'
const CKKS_IDB_KEY = 'ckks-keys'

export interface CkksServiceEvents {
	status: CkksStatus
	error: string
}

type EventCallback<K extends keyof CkksServiceEvents> = (data: CkksServiceEvents[K]) => void

let instance: CkksService | null = null

export class CkksService {
	private worker: Worker | null = null
	private listeners = new Map<string, Set<(...args: any[]) => void>>()
	private pendingOps = new Map<
		string,
		{ resolve: (v: any) => void; reject: (e: Error) => void }
	>()

	private _status: CkksStatus = 'idle'
	private _error: string | null = null
	private _slotCount = 0
	private _keys: CkksKeyPair | null = null
	private initPromise: Promise<void> | null = null
	private requestCounter = 0

	static getInstance(): CkksService {
		if (!instance) {
			instance = new CkksService()
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

	get status(): CkksStatus {
		return this._status
	}

	get error(): string | null {
		return this._error
	}

	get slotCount(): number {
		return this._slotCount
	}

	get keys(): CkksKeyPair | null {
		return this._keys
	}

	on<K extends keyof CkksServiceEvents>(event: K, callback: EventCallback<K>): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set())
		}
		const set = this.listeners.get(event)!
		set.add(callback)
		return () => set.delete(callback)
	}

	private emit<K extends keyof CkksServiceEvents>(event: K, data: CkksServiceEvents[K]): void {
		const set = this.listeners.get(event)
		if (set) {
			for (const cb of set) cb(data)
		}
	}

	private setStatus(status: CkksStatus): void {
		this._status = status
		this.emit('status', status)
	}

	// ─── Init ─────────────────────────────────────────────────────────────────

	init(): Promise<void> {
		if (this.initPromise) return this.initPromise

		this.initPromise = new Promise<void>((resolve, reject) => {
			this.setStatus('loading')
			this._error = null

			this.worker = new Worker(new URL('./ckks-worker.ts', import.meta.url), {
				type: 'module',
			})

			this.worker.onmessage = (e: MessageEvent<CkksWorkerResponse>) => {
				this.handleMessage(e.data, resolve, reject)
			}

			this.worker.onerror = (e) => {
				const msg = e.message || 'CKKS Worker error'
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
		msg: CkksWorkerResponse,
		initResolve?: () => void,
		initReject?: (e: Error) => void,
	): void {
		switch (msg.type) {
			case 'init:complete':
				this._slotCount = msg.slotCount
				this.setStatus('ready')
				console.debug(`[CKKS] WASM initialized (${msg.slotCount} slots per ciphertext)`)
				initResolve?.()
				break
			case 'init:error':
				console.warn('[CKKS] Init failed:', msg.error)
				this._error = msg.error
				this.setStatus('error')
				this.emit('error', msg.error)
				initReject?.(new Error(msg.error))
				break

			case 'generateKeys:result':
				this._keys = msg.keys
				this.resolvePending('generateKeys', msg.keys)
				break
			case 'generateKeys:error':
				this.rejectPending('generateKeys', msg.error)
				break

			case 'encrypt:result':
				this.resolvePending(msg.id, msg.blob)
				break
			case 'encrypt:error':
				this.rejectPending(msg.id, msg.error)
				break

			case 'decrypt:result':
				this.resolvePending(msg.id, msg.values)
				break
			case 'decrypt:error':
				this.rejectPending(msg.id, msg.error)
				break

			case 'add:result':
				this.resolvePending(msg.id, msg.blob)
				break
			case 'add:error':
				this.rejectPending(msg.id, msg.error)
				break

			case 'loadKeys:result':
				this.resolvePending(msg.id, undefined)
				break
			case 'loadKeys:error':
				this.rejectPending(msg.id, msg.error)
				break
		}
	}

	private resolvePending(id: string, value: any): void {
		const pending = this.pendingOps.get(id)
		if (pending) {
			this.pendingOps.delete(id)
			pending.resolve(value)
		}
	}

	private rejectPending(id: string, error: string): void {
		const pending = this.pendingOps.get(id)
		if (pending) {
			this.pendingOps.delete(id)
			pending.reject(new Error(error))
		}
	}

	private nextId(): string {
		return String(++this.requestCounter)
	}

	private async ensureReady(): Promise<void> {
		if (this._status !== 'ready') {
			await this.init()
		}
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	/** Generate a new CKKS key pair. Must be called before encrypt/decrypt. */
	async generateKeys(): Promise<CkksKeyPair> {
		await this.ensureReady()
		return new Promise<CkksKeyPair>((resolve, reject) => {
			this.pendingOps.set('generateKeys', { resolve, reject })
			this.worker!.postMessage({ type: 'generateKeys' })
		})
	}

	/** Load an existing key pair (e.g., from storage). */
	async loadKeys(keys: CkksKeyPair): Promise<void> {
		await this.ensureReady()
		const id = this.nextId()
		return new Promise<void>((resolve, reject) => {
			this.pendingOps.set(id, { resolve, reject })
			this.worker!.postMessage({ type: 'loadKeys', id, keys })
		})
	}

	/** Save CKKS keys to IndexedDB for cross-session persistence. */
	async saveKeysToIDB(keys: CkksKeyPair): Promise<void> {
		const db = await this.openKeyDB()
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(CKKS_IDB_STORE, 'readwrite')
			tx.objectStore(CKKS_IDB_STORE).put(keys, CKKS_IDB_KEY)
			tx.oncomplete = () => { db.close(); resolve() }
			tx.onerror = () => { db.close(); reject(tx.error) }
		})
	}

	/** Load CKKS keys from IndexedDB. Returns null if not found. */
	async loadKeysFromIDB(): Promise<CkksKeyPair | null> {
		const db = await this.openKeyDB()
		return new Promise<CkksKeyPair | null>((resolve, reject) => {
			const tx = db.transaction(CKKS_IDB_STORE, 'readonly')
			const req = tx.objectStore(CKKS_IDB_STORE).get(CKKS_IDB_KEY)
			req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
			req.onerror = () => { db.close(); reject(req.error) }
		})
	}

	private openKeyDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open('ckks-key-store', 1)
			req.onupgradeneeded = () => {
				const db = req.result
				if (!db.objectStoreNames.contains(CKKS_IDB_STORE)) {
					db.createObjectStore(CKKS_IDB_STORE)
				}
			}
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => reject(req.error)
		})
	}

	/** Encrypt a Float32Array or number[] into a CKKS ciphertext blob. */
	async encrypt(values: Float32Array | number[]): Promise<CkksBlob> {
		await this.ensureReady()
		const id = this.nextId()
		const arr = values instanceof Float32Array ? Array.from(values) : values
		return new Promise<CkksBlob>((resolve, reject) => {
			this.pendingOps.set(id, { resolve, reject })
			this.worker!.postMessage({ type: 'encrypt', id, values: arr })
		})
	}

	/** Decrypt a CKKS blob back to a number array. */
	async decrypt(blob: CkksBlob): Promise<number[]> {
		await this.ensureReady()
		const id = this.nextId()
		return new Promise<number[]>((resolve, reject) => {
			this.pendingOps.set(id, { resolve, reject })
			this.worker!.postMessage({ type: 'decrypt', id, blob })
		})
	}

	/** Homomorphic addition of two encrypted blobs. */
	async add(blobA: CkksBlob, blobB: CkksBlob): Promise<CkksBlob> {
		await this.ensureReady()
		const id = this.nextId()
		return new Promise<CkksBlob>((resolve, reject) => {
			this.pendingOps.set(id, { resolve, reject })
			this.worker!.postMessage({ type: 'add', id, blobA, blobB })
		})
	}

	/** Encrypt a large Float32Array, splitting into multiple blobs if needed. */
	async encryptVector(values: Float32Array): Promise<CkksBlob[]> {
		await this.ensureReady()
		const slotCount = this._slotCount
		const blobs: CkksBlob[] = []
		for (let offset = 0; offset < values.length; offset += slotCount) {
			const chunk = Array.from(values.slice(offset, offset + slotCount))
			const blob = await this.encrypt(chunk)
			blobs.push(blob)
		}
		return blobs
	}

	/** Decrypt multiple blobs back into a single Float32Array. */
	async decryptVector(blobs: CkksBlob[]): Promise<Float32Array> {
		const results: number[][] = []
		for (const blob of blobs) {
			results.push(await this.decrypt(blob))
		}
		const totalLength = results.reduce((sum, r) => sum + r.length, 0)
		const output = new Float32Array(totalLength)
		let offset = 0
		for (const r of results) {
			output.set(r, offset)
			offset += r.length
		}
		return output
	}

	/** Homomorphic addition of two encrypted vectors (blob arrays). */
	async addVectors(blobsA: CkksBlob[], blobsB: CkksBlob[]): Promise<CkksBlob[]> {
		if (blobsA.length !== blobsB.length) {
			throw new Error(
				`Vector length mismatch: ${blobsA.length} blobs vs ${blobsB.length} blobs`,
			)
		}
		const results: CkksBlob[] = []
		for (let i = 0; i < blobsA.length; i++) {
			results.push(await this.add(blobsA[i], blobsB[i]))
		}
		return results
	}

	// ─── Cleanup ──────────────────────────────────────────────────────────────

	dispose(): void {
		if (this.worker) {
			this.worker.terminate()
			this.worker = null
		}
		for (const [, pending] of this.pendingOps) {
			pending.reject(new Error('Service disposed'))
		}
		this.pendingOps.clear()
		this.listeners.clear()
		this._status = 'idle'
		this._error = null
		this._keys = null
		this._slotCount = 0
		this.initPromise = null
		if (instance === this) {
			instance = null
		}
	}
}
