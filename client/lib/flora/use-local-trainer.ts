// ─── React hook for local Flora training ────────────────────────────────────
//
// Manages the LocalFloraTrainer lifecycle: initializes anchors from the active
// mandala's tree definition, subscribes to placement events, and triggers
// training when enough examples accumulate.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { MandalaShape } from '../../shapes/MandalaShapeUtil'
import { getFramework } from '../frameworks/framework-registry'
import { FloraEmbeddingService } from './embedding-service'
import { getFLConsent } from './fl-consent'
import type { LoraAdapter } from './lora-adapter'
import { LocalFloraTrainer, type TrainStepResult } from './local-trainer'
import { onArrowCreated, onPlacement } from './placement-events'

const TRAIN_AFTER_PLACEMENTS = 5
const TRAIN_STEPS = 10
const DEBOUNCE_MS = 3000

export interface UseLocalTrainerState {
	trainer: LocalFloraTrainer | null
	isTraining: boolean
	trainStepCount: number
	exampleCount: number
	lastLoss: number | null
	loraEnabled: boolean
}

export function useLocalTrainer(options?: {
	onAfterTrain?: (result: TrainStepResult, adapter: LoraAdapter | null, preSnapshot: Float32Array | null) => void
}): UseLocalTrainerState {
	const editor = useEditor()
	const [state, setState] = useState<UseLocalTrainerState>({
		trainer: null,
		isTraining: false,
		trainStepCount: 0,
		exampleCount: 0,
		lastLoss: null,
		loraEnabled: false,
	})

	const trainerRef = useRef<LocalFloraTrainer | null>(null)
	const placementsSinceTrainRef = useRef(0)
	const trainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const onAfterTrainRef = useRef(options?.onAfterTrain)
	onAfterTrainRef.current = options?.onAfterTrain

	const mandala = useValue(
		'trainer-mandala',
		() =>
			editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as MandalaShape | undefined,
		[editor],
	)

	const mapId = mandala?.props.frameworkId

	// Initialize or restore trainer when mandala changes
	useEffect(() => {
		if (!mapId) {
			trainerRef.current = null
			setState((prev) => ({ ...prev, trainer: null, exampleCount: 0, trainStepCount: 0 }))
			return
		}

		let cancelled = false

		async function init() {
			// Try to restore from IndexedDB first
			let trainer = await LocalFloraTrainer.load(mapId!).catch(() => null)

			if (!trainer) {
				trainer = new LocalFloraTrainer(mapId!)

				// Initialize anchors from tree definition if Flora is ready
				const service = FloraEmbeddingService.getInstance()
				if (service.status === 'ready') {
					const framework = getFramework(mapId!)
					const treeDef = framework.treeDefinition
					if (treeDef) {
						await trainer.initAnchorsFromTree(treeDef)
					}
				}
			}

			// Enable LoRA if FL consent is active
			if (getFLConsent().isOptedIn && !trainer.lora) {
				trainer.enableLora()
				console.debug('[FL] LoRA enabled (FL consent active)')
			}

			if (!cancelled) {
				trainerRef.current = trainer
				setState((prev) => ({
					...prev,
					trainer,
					exampleCount: trainer!.exampleCount,
					trainStepCount: trainer!.trainStepCount,
					loraEnabled: trainer!.lora !== null,
				}))
			}
		}

		init()
		return () => {
			cancelled = true
		}
	}, [mapId])

	// React to FL consent changes
	useEffect(() => {
		const consent = getFLConsent()
		const unsub = consent.onChange(() => {
			const trainer = trainerRef.current
			if (!trainer) return

			if (consent.isOptedIn && !trainer.lora) {
				trainer.enableLora()
				console.debug('[FL] LoRA enabled (user opted in)')
				setState((prev) => ({ ...prev, loraEnabled: true }))
			} else if (!consent.isOptedIn && trainer.lora) {
				trainer.disableLora({ mergeWeights: true })
				console.debug('[FL] LoRA disabled + weights merged (user opted out)')
				trainer.save().catch(() => {})
				setState((prev) => ({ ...prev, loraEnabled: false }))
			}
		})
		return unsub
	}, [])

	// Trigger training (debounced)
	const triggerTrain = useCallback(async () => {
		const trainer = trainerRef.current
		if (!trainer || !trainer.canTrain()) return

		setState((prev) => ({ ...prev, isTraining: true }))

		try {
			// Snapshot params BEFORE training for accurate FL delta computation
			const preSnapshot = trainer.lora?.getTrainableParams() ?? null

			console.debug(`[Training] Starting ${TRAIN_STEPS} steps (${trainer.exampleCount} examples, LoRA=${!!trainer.lora})`)
			const result = await trainer.train(TRAIN_STEPS)
			placementsSinceTrainRef.current = 0
			console.debug(`[Training] Complete: loss=${result.loss.toFixed(6)}, steps=${trainer.trainStepCount}`)

			// Persist to IndexedDB
			await trainer.save().catch(() => {})

			setState((prev) => ({
				...prev,
				isTraining: false,
				trainStepCount: trainer.trainStepCount,
				lastLoss: result.loss,
			}))

			onAfterTrainRef.current?.(result, trainer.lora, preSnapshot)
		} catch (e) {
			console.warn('[Training] Failed:', e)
			setState((prev) => ({ ...prev, isTraining: false }))
		}
	}, []) // stable — reads from refs

	// Subscribe to placement events
	useEffect(() => {
		const unsubPlacement = onPlacement((event) => {
			const trainer = trainerRef.current
			if (!trainer || event.mapId !== mapId) return

			// Lazy-init anchors if the trainer wasn't initialized yet
			if (!trainer.isInitialized) {
				const service = FloraEmbeddingService.getInstance()
				if (service.status !== 'ready') return
				const framework = getFramework(event.mapId)
				const treeDef = framework.treeDefinition
				if (!treeDef) return
				trainer.initAnchorsFromTree(treeDef).then(() => {
					trainer.addPlacement(event.noteText, event.cellId)
					setState((prev) => ({ ...prev, exampleCount: trainer.exampleCount }))
				})
				return
			}

			trainer.addPlacement(event.noteText, event.cellId)
			setState((prev) => ({ ...prev, exampleCount: trainer.exampleCount }))
			placementsSinceTrainRef.current++
			console.debug(`[Training] Placement ${placementsSinceTrainRef.current}/${TRAIN_AFTER_PLACEMENTS}: "${event.noteText.slice(0, 30)}" → ${event.cellId}`)

			// Debounced training trigger
			if (placementsSinceTrainRef.current >= TRAIN_AFTER_PLACEMENTS) {
				console.debug(`[Training] Threshold reached — training in ${DEBOUNCE_MS / 1000}s...`)
				if (trainTimerRef.current) clearTimeout(trainTimerRef.current)
				trainTimerRef.current = setTimeout(triggerTrain, DEBOUNCE_MS)
			}
		})

		// Subscribe to arrow creation events for edge predictor training
		const unsubArrow = onArrowCreated((event) => {
			const trainer = trainerRef.current
			if (!trainer || event.mapId !== mapId || !trainer.isInitialized) return

			trainer.addArrow(
				event.srcNoteText,
				event.tgtNoteText,
				event.srcCellId,
				event.tgtCellId,
				event.edgeTypeId,
			)
			placementsSinceTrainRef.current++

			// Debounced training trigger (same counter as placements)
			if (placementsSinceTrainRef.current >= TRAIN_AFTER_PLACEMENTS) {
				if (trainTimerRef.current) clearTimeout(trainTimerRef.current)
				trainTimerRef.current = setTimeout(triggerTrain, DEBOUNCE_MS)
			}
		})

		return () => {
			unsubPlacement()
			unsubArrow()
			if (trainTimerRef.current) clearTimeout(trainTimerRef.current)
		}
	}, [mapId, triggerTrain])

	return state
}
