import { describe, expect, it } from 'vitest'
import { runWithRetries } from '../../worker/do/retryHelper'

describe('runWithRetries', () => {
	it('retries the same model once on non-upstream error before moving to fallbacks', async () => {
		const attempts: string[] = []
		const result = await runWithRetries(['modelA', 'modelB'], async (model, attemptIndex) => {
			attempts.push(`${model}:${attemptIndex}`)
			if (attempts.length <= 2) throw new Error('timeout')
			return 'success'
		})
		expect(result).toBe('success')
		expect(attempts).toEqual(['modelA:0', 'modelA:1', 'modelB:0'])
	})

	it('does not retry same model on upstream error, goes straight to fallback', async () => {
		const attempts: string[] = []
		const result = await runWithRetries(['modelA', 'modelB'], async (model, attemptIndex) => {
			attempts.push(`${model}:${attemptIndex}`)
			if (model === 'modelA') throw new Error('InferenceUpstreamError: model down')
			return 'success'
		})
		expect(result).toBe('success')
		expect(attempts).toEqual(['modelA:0', 'modelB:0'])
	})

	it('throws if all models and retries exhausted', async () => {
		await expect(
			runWithRetries(['modelA'], async () => {
				throw new Error('always fails')
			}),
		).rejects.toThrow('always fails')
	})
})
