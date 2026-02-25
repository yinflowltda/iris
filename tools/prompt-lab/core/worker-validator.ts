import type { LatencyMetrics } from './types'

export interface WorkerValidationResult {
	success: boolean
	actions: Record<string, unknown>[]
	latency: LatencyMetrics
	errors: string[]
	/** Raw response body for debugging */
	rawResponse?: string
}

/**
 * Send a prompt through the real Worker /stream endpoint and measure latency.
 * Requires `wrangler dev` running locally.
 */
export async function validateThroughWorker(options: {
	workerUrl: string
	prompt: Record<string, unknown>
}): Promise<WorkerValidationResult> {
	const { workerUrl, prompt } = options
	const startTime = Date.now()
	let firstTokenTime: number | null = null
	const actions: Record<string, unknown>[] = []
	const errors: string[] = []
	let rawResponse = ''

	try {
		const response = await fetch(`${workerUrl}/stream`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(prompt),
		})

		if (!response.ok) {
			const body = await response.text()
			errors.push(`HTTP ${response.status}: ${body}`)
			return {
				success: false,
				actions: [],
				latency: { timeToFirstTokenMs: 0, totalStreamDurationMs: 0, tokensPerSecond: 0 },
				errors,
			}
		}

		const reader = response.body?.getReader()
		if (!reader) {
			errors.push('No response body')
			return {
				success: false,
				actions: [],
				latency: { timeToFirstTokenMs: 0, totalStreamDurationMs: 0, tokensPerSecond: 0 },
				errors,
			}
		}

		const decoder = new TextDecoder()
		let buffer = ''

		while (true) {
			const { done, value } = await reader.read()
			if (done) break

			if (firstTokenTime === null) {
				firstTokenTime = Date.now()
			}

			const chunk = decoder.decode(value, { stream: true })
			buffer += chunk
			rawResponse += chunk

			// Parse SSE events
			const lines = buffer.split('\n')
			buffer = lines.pop() ?? ''

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue
				const data = line.slice(6).trim()
				if (!data) continue
				try {
					const parsed = JSON.parse(data)
					if (parsed.complete) {
						actions.push(parsed)
					}
				} catch {
					// Partial JSON — skip
				}
			}
		}
	} catch (error) {
		errors.push(`Fetch error: ${error}`)
	}

	const endTime = Date.now()
	const totalDuration = endTime - startTime
	const timeToFirstToken = firstTokenTime ? firstTokenTime - startTime : totalDuration

	// Rough token estimate from response text
	const totalText = actions.map((a) => JSON.stringify(a)).join('')
	const estimatedTokens = Math.ceil(totalText.length / 4)
	const tokensPerSecond = totalDuration > 0 ? (estimatedTokens / totalDuration) * 1000 : 0

	return {
		success: errors.length === 0,
		actions,
		latency: {
			timeToFirstTokenMs: timeToFirstToken,
			totalStreamDurationMs: totalDuration,
			tokensPerSecond,
		},
		errors,
		rawResponse,
	}
}

/**
 * Capture a screenshot of the mandala by calling a screenshot endpoint on the local dev server.
 * This assumes the client app exposes a screenshot API (or we use Playwright).
 *
 * For Phase 2, this function is a placeholder that can be implemented with:
 * 1. Playwright headless browser navigating to the app
 * 2. A custom /api/screenshot endpoint on the dev server
 * 3. TLDraw's built-in exportAs() API via a client-side route
 */
export async function captureMandalaScreenshot(options: {
	appUrl: string
	/** Mandala shape ID to focus on */
	mandalaId?: string
}): Promise<Buffer | null> {
	const { appUrl } = options

	try {
		// Try a screenshot endpoint if available
		const response = await fetch(`${appUrl}/api/screenshot`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mandalaId: options.mandalaId }),
		})

		if (response.ok) {
			const arrayBuffer = await response.arrayBuffer()
			return Buffer.from(arrayBuffer)
		}

		// If no endpoint, return null (screenshot will be skipped)
		return null
	} catch {
		// Screenshot capture not available — Phase 2 enhancement
		return null
	}
}
