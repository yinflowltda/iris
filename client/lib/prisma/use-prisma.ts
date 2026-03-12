import { useCallback, useEffect, useRef, useState } from 'react'
import { PrismaEmbeddingService } from './embedding-service'
import type { PrismaLoadProgress, PrismaStatus } from './types'

export function usePrisma() {
	const [status, setStatus] = useState<PrismaStatus>('idle')
	const [progress, setProgress] = useState<PrismaLoadProgress | null>(null)
	const [error, setError] = useState<string | null>(null)
	const serviceRef = useRef<PrismaEmbeddingService | null>(null)

	useEffect(() => {
		const service = PrismaEmbeddingService.getInstance()
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
		const service = serviceRef.current ?? PrismaEmbeddingService.getInstance()
		await service.init()
	}, [])

	const embed = useCallback(async (text: string) => {
		const service = serviceRef.current ?? PrismaEmbeddingService.getInstance()
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
