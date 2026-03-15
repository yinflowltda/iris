import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CkksKeyPair } from '../../../client/lib/flora/ckks-types'

// Mock IndexedDB with a simple in-memory store
const idbStore = new Map<string, any>()

function createMockIDB() {
	return {
		open: vi.fn((_name: string, _version?: number) => {
			const req: any = {
				result: null,
				error: null,
				onsuccess: null as any,
				onerror: null as any,
				onupgradeneeded: null as any,
			}

			queueMicrotask(() => {
				const db = {
					objectStoreNames: {
						contains: (_name: string) => true,
					},
					createObjectStore: vi.fn(),
					transaction: (storeName: string, mode: string) => {
						const tx: any = {
							oncomplete: null as any,
							onerror: null as any,
							error: null,
							objectStore: (_name: string) => ({
								put: (value: any, key: string) => {
									idbStore.set(key, structuredClone(value))
									queueMicrotask(() => tx.oncomplete?.())
									return {}
								},
								get: (key: string) => {
									const getReq: any = {
										result: idbStore.get(key),
										onsuccess: null as any,
										onerror: null as any,
									}
									queueMicrotask(() => getReq.onsuccess?.())
									return getReq
								},
							}),
						}
						return tx
					},
					close: vi.fn(),
				}
				req.result = db
				// Call onupgradeneeded if provided
				req.onupgradeneeded?.()
				req.onsuccess?.(req)
			})

			return req
		}),
	}
}

vi.stubGlobal('indexedDB', createMockIDB())

// Import after mocking indexedDB
import { CkksService } from '../../../client/lib/flora/ckks-service'

describe('CkksService key persistence', () => {
	beforeEach(() => {
		CkksService._resetInstance()
		idbStore.clear()
		vi.stubGlobal('indexedDB', createMockIDB())
	})

	it('should save keys to IndexedDB', async () => {
		const service = CkksService.getInstance()
		const mockKeys: CkksKeyPair = { publicKey: 'pk-base64-data', secretKey: 'sk-base64-data' }

		await service.saveKeysToIDB(mockKeys)
		expect(idbStore.has('ckks-keys')).toBe(true)
		expect(idbStore.get('ckks-keys')).toEqual(mockKeys)
	})

	it('should load keys from IndexedDB', async () => {
		const service = CkksService.getInstance()
		const mockKeys: CkksKeyPair = { publicKey: 'pk-data', secretKey: 'sk-data' }

		await service.saveKeysToIDB(mockKeys)
		const loaded = await service.loadKeysFromIDB()
		expect(loaded).toEqual(mockKeys)
	})

	it('should return null when no keys stored', async () => {
		const service = CkksService.getInstance()
		const loaded = await service.loadKeysFromIDB()
		expect(loaded).toBeNull()
	})
})
