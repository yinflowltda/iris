// ─── FL Orchestrator ────────────────────────────────────────────────────────
//
// Bridges local training completion to FL round participation.
// On each training completion:
//   1. Check consent → bail if not opted in
//   2. Check round status → open new round if needed
//   3. Submit encrypted delta
//   4. Apply aggregate if a published round is found

import { useCallback, useEffect, useRef } from 'react'
import type { LoraAdapter } from './lora-adapter'
import { FLClient } from './fl-client'
import { CkksService } from './ckks-service'
import { getFLConsent } from './fl-consent'

// ─── Config ────────────────────────────────────────────────────────────────

export interface FLOrchestratorConfig {
	apiBase: string
	mapId: string
}

// ─── Orchestrator (non-React, for testing) ─────────────────────────────────

export function createFLOrchestrator(config: FLOrchestratorConfig) {
	const clientId = getOrCreateClientId()
	const flClient = new FLClient({
		apiBase: config.apiBase,
		mapId: config.mapId,
		clientId,
	})

	let _submitting = false
	let _error: string | null = null
	let _snapshot: Float32Array | null = null
	let _keysReady = false

	async function ensureKeys(): Promise<void> {
		if (_keysReady) return
		const ckks = CkksService.getInstance()
		await ckks.init()

		// Try to load persisted keys
		const stored = await ckks.loadKeysFromIDB()
		if (stored) {
			await ckks.loadKeys(stored)
		} else {
			const keys = await ckks.generateKeys()
			await ckks.saveKeysToIDB(keys)
		}
		_keysReady = true
	}

	async function onTrainingComplete(
		adapter: LoraAdapter,
		numExamples: number,
	): Promise<void> {
		// 1. Check consent
		if (!getFLConsent().isOptedIn) return

		// Concurrency guard
		if (_submitting) return
		_submitting = true
		_error = null

		try {
			await ensureKeys()

			// Take snapshot if not already taken
			if (!_snapshot) {
				_snapshot = flClient.snapshotParams(adapter)
			}

			// 2. Check round status
			const status = await flClient.getRoundStatus()

			if (!status) {
				// No round → open one
				const openResp = await fetch(
					`${config.apiBase}/fl/rounds/open?mapId=${encodeURIComponent(config.mapId)}`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({}),
					},
				)
				if (!openResp.ok) {
					_error = 'Failed to open round'
					return
				}
				// Submit to the newly opened round
				await flClient.submitDelta(adapter, _snapshot, numExamples)
			} else if (status.status === 'collecting') {
				await flClient.submitDelta(adapter, _snapshot, numExamples)
			} else if (status.status === 'published') {
				// Apply aggregate first
				await flClient.applyAggregate(adapter)

				// Open new round and submit
				await fetch(
					`${config.apiBase}/fl/rounds/open?mapId=${encodeURIComponent(config.mapId)}`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({}),
					},
				)
				_snapshot = flClient.snapshotParams(adapter)
				await flClient.submitDelta(adapter, _snapshot, numExamples)
			}
			// aggregating or timed_out → skip

			_snapshot = null
		} catch (e) {
			_error = e instanceof Error ? e.message : 'FL submission failed'
			console.warn('[FL Orchestrator]', _error)
		} finally {
			_submitting = false
		}
	}

	return {
		onTrainingComplete,
		get error() { return _error },
		get isSubmitting() { return _submitting },
		get flClient() { return flClient },
	}
}

// ─── React Hook ────────────────────────────────────────────────────────────

export function useFLOrchestrator(config: FLOrchestratorConfig | null) {
	const orchestratorRef = useRef<ReturnType<typeof createFLOrchestrator> | null>(null)

	useEffect(() => {
		if (!config) {
			orchestratorRef.current = null
			return
		}
		orchestratorRef.current = createFLOrchestrator(config)
	}, [config?.apiBase, config?.mapId])

	const onAfterTrain = useCallback(
		(adapter: LoraAdapter | null, numExamples: number) => {
			const orch = orchestratorRef.current
			if (!orch || !adapter) return
			orch.onTrainingComplete(adapter, numExamples).catch(() => {})
		},
		[],
	)

	return { onAfterTrain, orchestratorRef }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getOrCreateClientId(): string {
	const key = 'iris-fl-client-id'
	let id = localStorage.getItem(key)
	if (!id) {
		id = crypto.randomUUID()
		localStorage.setItem(key, id)
	}
	return id
}
