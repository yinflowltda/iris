import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloraEmbeddingService } from '../../../client/lib/flora/embedding-service'
import type { FloraWorkerResponse } from '../../../client/lib/flora/types'

// Mock Worker
class MockWorker {
	onmessage: ((e: MessageEvent) => void) | null = null
	onerror: ((e: ErrorEvent) => void) | null = null
	postMessage = vi.fn()
	terminate = vi.fn()

	/** Simulate a message from the worker */
	simulateMessage(data: FloraWorkerResponse) {
		this.onmessage?.({ data } as MessageEvent)
	}

	simulateError(message: string) {
		this.onerror?.({ message } as ErrorEvent)
	}
}

let mockWorker: MockWorker

vi.stubGlobal(
	'Worker',
	new Proxy(MockWorker, {
		construct: () => mockWorker,
	}),
)

describe('FloraEmbeddingService', () => {
	beforeEach(() => {
		mockWorker = new MockWorker()
		FloraEmbeddingService._resetInstance()
	})

	afterEach(() => {
		FloraEmbeddingService._resetInstance()
	})

	it('returns the same singleton instance', () => {
		const a = FloraEmbeddingService.getInstance()
		const b = FloraEmbeddingService.getInstance()
		expect(a).toBe(b)
	})

	it('transitions idle → loading → ready on successful init', async () => {
		const service = FloraEmbeddingService.getInstance()
		const statuses: string[] = []
		service.on('status', (s) => statuses.push(s))

		expect(service.status).toBe('idle')

		const initPromise = service.init()

		// Worker should have received 'init' message
		expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'init' })
		expect(service.status).toBe('loading')

		// Simulate successful init
		mockWorker.simulateMessage({ type: 'init:complete' })
		await initPromise

		expect(service.status).toBe('ready')
		expect(statuses).toEqual(['loading', 'ready'])
	})

	it('transitions idle → loading → error on failed init', async () => {
		const service = FloraEmbeddingService.getInstance()
		const errors: string[] = []
		service.on('error', (e) => errors.push(e))

		const initPromise = service.init()

		mockWorker.simulateMessage({ type: 'init:error', error: 'WASM failed' })

		await expect(initPromise).rejects.toThrow('WASM failed')
		expect(service.status).toBe('error')
		expect(service.error).toBe('WASM failed')
		expect(errors).toEqual(['WASM failed'])
	})

	it('returns the same promise for concurrent init calls', () => {
		const service = FloraEmbeddingService.getInstance()
		const p1 = service.init()
		const p2 = service.init()
		expect(p1).toBe(p2)
	})

	it('forwards progress events', async () => {
		const service = FloraEmbeddingService.getInstance()
		const progressEvents: any[] = []
		service.on('progress', (p) => progressEvents.push(p))

		service.init()

		const progress = {
			status: 'progress',
			file: 'model.onnx',
			progress: 50,
			loaded: 12000000,
			total: 24000000,
		}
		mockWorker.simulateMessage({ type: 'init:progress', progress })

		expect(progressEvents).toHaveLength(1)
		expect(progressEvents[0]).toEqual(progress)
	})

	it('embed() auto-initializes if not ready', async () => {
		const service = FloraEmbeddingService.getInstance()

		const embedPromise = service.embed('hello world')

		// Should have posted init first
		expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'init' })

		// Complete init
		mockWorker.simulateMessage({ type: 'init:complete' })

		// Now the embed message should have been posted
		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'embed',
				id: '1',
				text: 'hello world',
			})
		})

		// Simulate embed result
		const embedding = new Float32Array(384).fill(0.1)
		mockWorker.simulateMessage({ type: 'embed:result', id: '1', embedding })

		const result = await embedPromise
		expect(result).toBeInstanceOf(Float32Array)
		expect(result.length).toBe(384)
	})

	it('embed() resolves with correct Float32Array when already ready', async () => {
		const service = FloraEmbeddingService.getInstance()

		// Init first
		const initPromise = service.init()
		mockWorker.simulateMessage({ type: 'init:complete' })
		await initPromise

		// Now embed
		const embedPromise = service.embed('test text')

		expect(mockWorker.postMessage).toHaveBeenCalledWith({
			type: 'embed',
			id: '1',
			text: 'test text',
		})

		const embedding = new Float32Array([0.1, 0.2, 0.3])
		mockWorker.simulateMessage({ type: 'embed:result', id: '1', embedding })

		const result = await embedPromise
		expect(result).toEqual(new Float32Array([0.1, 0.2, 0.3]))
	})

	it('embed() rejects on worker error', async () => {
		const service = FloraEmbeddingService.getInstance()

		const initPromise = service.init()
		mockWorker.simulateMessage({ type: 'init:complete' })
		await initPromise

		const embedPromise = service.embed('fail me')

		mockWorker.simulateMessage({ type: 'embed:error', id: '1', error: 'Inference failed' })

		await expect(embedPromise).rejects.toThrow('Inference failed')
	})

	it('isSupported() checks for Worker and WebAssembly', () => {
		expect(FloraEmbeddingService.isSupported()).toBe(true)
	})

	it('dispose() terminates worker and cleans up', async () => {
		const service = FloraEmbeddingService.getInstance()

		const initPromise = service.init()
		mockWorker.simulateMessage({ type: 'init:complete' })
		await initPromise

		service.dispose()

		expect(mockWorker.terminate).toHaveBeenCalled()
		expect(service.status).toBe('idle')
		expect(service.error).toBeNull()

		// Singleton should be cleared
		const newInstance = FloraEmbeddingService.getInstance()
		expect(newInstance).not.toBe(service)
	})

	it('dispose() rejects pending embed promises', async () => {
		const service = FloraEmbeddingService.getInstance()

		const initPromise = service.init()
		mockWorker.simulateMessage({ type: 'init:complete' })
		await initPromise

		const embedPromise = service.embed('will be disposed')
		service.dispose()

		await expect(embedPromise).rejects.toThrow('Service disposed')
	})

	it('unsubscribe callback removes listener', async () => {
		const service = FloraEmbeddingService.getInstance()
		const statuses: string[] = []
		const unsub = service.on('status', (s) => statuses.push(s))

		service.init()
		expect(statuses).toEqual(['loading'])

		unsub()

		mockWorker.simulateMessage({ type: 'init:complete' })
		// 'ready' should not appear since we unsubscribed
		expect(statuses).toEqual(['loading'])
	})
})
