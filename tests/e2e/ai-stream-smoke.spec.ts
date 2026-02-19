import { expect, test } from '@playwright/test'

test.describe('AI stream smoke', () => {
	test('POST /stream returns at least one message action', async ({ request }) => {
		const prompt = {
			mode: {
				type: 'mode',
				modeType: 'working',
				partTypes: ['mode', 'messages'],
				actionTypes: ['message'],
			},
			messages: {
				type: 'messages',
				requestSource: 'user',
				agentMessages: [
					'Respond with exactly one action: {"_type":"message","text":"pong"} and nothing else.',
				],
			},
		}

		const res = await request.post('/stream', {
			data: prompt,
		})

		expect(res.ok()).toBe(true)

		const raw = await res.text()
		const dataLines = raw
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l.startsWith('data: '))

		expect(dataLines.length).toBeGreaterThan(0)

		const payloads = dataLines.map((l) => JSON.parse(l.slice('data: '.length)))
		const errorPayload = payloads.find((p) => p && typeof p === 'object' && 'error' in p)
		if (errorPayload) {
			throw new Error(`Worker returned error: ${errorPayload.error}`)
		}

		const messageActions = payloads.filter(
			(p) => p && p._type === 'message' && typeof p.text === 'string',
		)
		expect(messageActions.length).toBeGreaterThan(0)
	})
})
