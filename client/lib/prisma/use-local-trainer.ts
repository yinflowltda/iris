// ─── React hook for local Prisma training ────────────────────────────────────
//
// Manages the LocalPrismaTrainer lifecycle: initializes anchors from the active
// mandala's tree definition, subscribes to placement events, and triggers
// training when enough examples accumulate.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { MandalaShape } from '../../shapes/MandalaShapeUtil'
import { getFramework } from '../frameworks/framework-registry'
import { PrismaEmbeddingService } from './embedding-service'
import { LocalPrismaTrainer } from './local-trainer'
import { onPlacement } from './placement-events'

const TRAIN_AFTER_PLACEMENTS = 5
const TRAIN_STEPS = 10
const DEBOUNCE_MS = 3000

export interface UseLocalTrainerState {
	trainer: LocalPrismaTrainer | null
	isTraining: boolean
	trainStepCount: number
	exampleCount: number
	lastLoss: number | null
}

export function useLocalTrainer(): UseLocalTrainerState {
	const editor = useEditor()
	const [state, setState] = useState<UseLocalTrainerState>({
		trainer: null,
		isTraining: false,
		trainStepCount: 0,
		exampleCount: 0,
		lastLoss: null,
	})

	const trainerRef = useRef<LocalPrismaTrainer | null>(null)
	const placementsSinceTrainRef = useRef(0)
	const trainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
			let trainer = await LocalPrismaTrainer.load(mapId!).catch(() => null)

			if (!trainer) {
				trainer = new LocalPrismaTrainer(mapId!)

				// Initialize anchors from tree definition if Prisma is ready
				const service = PrismaEmbeddingService.getInstance()
				if (service.status === 'ready') {
					const framework = getFramework(mapId!)
					const treeDef = framework.treeDefinition
					if (treeDef) {
						await trainer.initAnchorsFromTree(treeDef)
					}
				}
			}

			if (!cancelled) {
				trainerRef.current = trainer
				setState((prev) => ({
					...prev,
					trainer,
					exampleCount: trainer!.exampleCount,
					trainStepCount: trainer!.trainStepCount,
				}))
			}
		}

		init()
		return () => {
			cancelled = true
		}
	}, [mapId])

	// Trigger training (debounced)
	const triggerTrain = useCallback(async () => {
		const trainer = trainerRef.current
		if (!trainer || !trainer.canTrain()) return

		setState((prev) => ({ ...prev, isTraining: true }))

		try {
			const result = await trainer.train(TRAIN_STEPS)
			placementsSinceTrainRef.current = 0

			// Persist to IndexedDB
			await trainer.save().catch(() => {})

			setState((prev) => ({
				...prev,
				isTraining: false,
				trainStepCount: trainer.trainStepCount,
				lastLoss: result.loss,
			}))
		} catch {
			setState((prev) => ({ ...prev, isTraining: false }))
		}
	}, [])

	// Subscribe to placement events
	useEffect(() => {
		const unsub = onPlacement((event) => {
			const trainer = trainerRef.current
			if (!trainer || event.mapId !== mapId) return

			// Lazy-init anchors if the trainer wasn't initialized yet
			if (!trainer.isInitialized) {
				const service = PrismaEmbeddingService.getInstance()
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

			// Debounced training trigger
			if (placementsSinceTrainRef.current >= TRAIN_AFTER_PLACEMENTS) {
				if (trainTimerRef.current) clearTimeout(trainTimerRef.current)
				trainTimerRef.current = setTimeout(triggerTrain, DEBOUNCE_MS)
			}
		})

		return () => {
			unsub()
			if (trainTimerRef.current) clearTimeout(trainTimerRef.current)
		}
	}, [mapId, triggerTrain])

	return state
}
