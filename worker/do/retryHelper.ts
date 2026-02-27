const MAX_SAME_MODEL_RETRIES = 1

export function isInferenceUpstreamError(error: unknown): boolean {
	const text = getErrorText(error).toLowerCase()
	return text.includes('inferenceupstreamerror')
}

export function getErrorText(error: unknown): string {
	if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
		return error.message
	}
	if (typeof error === 'string' && error.length > 0) {
		return error
	}
	try {
		return JSON.stringify(error) || 'Unknown error'
	} catch {
		return 'Unknown error'
	}
}

export async function runWithRetries<T>(
	candidates: string[],
	fn: (model: string, attemptIndex: number) => Promise<T>,
): Promise<T> {
	let lastError: unknown = null

	for (const [modelIndex, model] of candidates.entries()) {
		const maxAttempts = modelIndex === 0 ? MAX_SAME_MODEL_RETRIES + 1 : 1

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				return await fn(model, attempt)
			} catch (error) {
				lastError = error
				if (isInferenceUpstreamError(error)) {
					break
				}
				const hasMoreAttempts = attempt < maxAttempts - 1
				if (hasMoreAttempts) {
					console.warn(`Error on model ${model} (attempt ${attempt + 1}). Retrying same model.`)
					continue
				}
			}
		}
	}

	throw lastError
}
