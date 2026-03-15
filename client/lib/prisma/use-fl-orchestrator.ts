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

		// Fetch the server's public key for this map.
		// All clients encrypt with the same key → homomorphic addition works.
		console.debug('[FL] Fetching CKKS public key from server...')
		const resp = await fetch(
			`${config.apiBase}/fl/keys?mapId=${encodeURIComponent(config.mapId)}`,
		)
		if (!resp.ok) {
			throw new Error(`Failed to fetch FL public key: ${resp.status}`)
		}
		const { publicKey } = (await resp.json()) as { publicKey: string }
		await ckks.loadPublicKey(publicKey)
		console.debug('[FL] Public key loaded (encrypt-only, server decrypts aggregate)')
		_keysReady = true
	}

	async function onTrainingComplete(
		adapter: LoraAdapter,
		numExamples: number,
		preSnapshot: Float32Array | null,
	): Promise<void> {
		// 1. Check consent
		if (!getFLConsent().isOptedIn) {
			console.debug('[FL] Skipping — not opted in')
			return
		}

		// Concurrency guard
		if (_submitting) {
			console.debug('[FL] Skipping — submission already in progress')
			return
		}
		_submitting = true
		_error = null

		console.debug(`[FL] Training complete (${numExamples} examples). Starting FL round participation...`)

		try {
			await ensureKeys()
			console.debug('[FL] CKKS keys ready')

			// Use pre-training snapshot for accurate delta computation.
			// Falls back to current params if no snapshot provided (delta = 0, safe no-op).
			if (!_snapshot) {
				_snapshot = preSnapshot ?? flClient.snapshotParams(adapter)
			}

			// 2. Check round status
			const status = await flClient.getRoundStatus()
			console.debug(`[FL] Round status: ${status?.status ?? 'none'}`)

			if (!status) {
				// No round → open one
				console.debug('[FL] No round exists — opening new round...')
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
					console.warn('[FL]', _error)
					return
				}
				const openData = (await openResp.json()) as { roundId: string }
				console.debug(`[FL] Round opened: ${openData.roundId}`)
				// Submit to the newly opened round
				await flClient.submitDelta(adapter, _snapshot, numExamples)
				console.debug('[FL] Delta submitted successfully')
			} else if (status.status === 'collecting') {
				console.debug('[FL] Round collecting — submitting delta...')
				await flClient.submitDelta(adapter, _snapshot, numExamples)
				console.debug('[FL] Delta submitted successfully')
			} else if (status.status === 'published') {
				// Apply aggregate first
				console.debug('[FL] Round published — applying aggregate...')
				const applied = await flClient.applyAggregate(adapter)
				console.debug(`[FL] Aggregate applied: ${applied}`)

				// Open new round and submit
				console.debug('[FL] Opening new round...')
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
				console.debug('[FL] Delta submitted to new round')
			} else {
				console.debug(`[FL] Round is ${status.status} — skipping`)
			}

			_snapshot = null
		} catch (e) {
			_error = e instanceof Error ? e.message : 'FL submission failed'
			console.warn('[FL] Error:', _error)
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
		(adapter: LoraAdapter | null, numExamples: number, preSnapshot: Float32Array | null) => {
			const orch = orchestratorRef.current
			if (!orch || !adapter) return
			orch.onTrainingComplete(adapter, numExamples, preSnapshot).catch(() => {})
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
