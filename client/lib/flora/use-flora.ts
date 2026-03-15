import { useCallback, useEffect, useRef, useState } from 'react'
import { FloraEmbeddingService } from './embedding-service'
import type { FloraLoadProgress, FloraStatus } from './types'

export function useFlora() {
	const [status, setStatus] = useState<FloraStatus>('idle')
	const [progress, setProgress] = useState<FloraLoadProgress | null>(null)
	const [error, setError] = useState<string | null>(null)
	const serviceRef = useRef<FloraEmbeddingService | null>(null)

	useEffect(() => {
		const service = FloraEmbeddingService.getInstance()
		serviceRef.current = service

		// Sync initial state
		setStatus(service.status)
		if (service.error) setError(service.error)

		const unsubStatus = service.on('status', setStatus)
		const unsubProgress = service.on('progress', setProgress)
		const unsubError = service.on('error', setError)

		return () => {
			unsubStatus()
			unsubProgress()
			unsubError()
		}
	}, [])

	const init = useCallback(async () => {
		const service = serviceRef.current ?? FloraEmbeddingService.getInstance()
		await service.init()
	}, [])

	const embed = useCallback(async (text: string) => {
		const service = serviceRef.current ?? FloraEmbeddingService.getInstance()
		return service.embed(text)
	}, [])

	return {
		status,
		progress,
		error,
		isReady: status === 'ready',
		init,
		embed,
	}
}
