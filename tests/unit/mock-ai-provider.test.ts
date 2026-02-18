import { describe, expect, it } from 'vitest'
import { createMockModel, getResponseForInput } from '../mocks/mock-ai-provider'

describe('mock AI provider', () => {
	describe('getResponseForInput', () => {
		it('returns default response for unmatched input', () => {
			const response = getResponseForInput('hello')
			expect(response.actions).toHaveLength(1)
			expect(response.actions[0]._type).toBe('message')
		})

		it('matches emotions map pattern', () => {
			const response = getResponseForInput('Start the Emotions Map')
			expect(response.actions[0]._type).toBe('message')
			expect(response.actions[0].message).toContain('Emotions Map')
		})

		it('matches stuck/unsure pattern', () => {
			const response = getResponseForInput("I don't know what to say")
			expect(response.actions[0].message).toContain('resonate')
		})

		it('matches fill cell pattern', () => {
			const response = getResponseForInput('fill the cell with this')
			expect(response.actions).toHaveLength(2)
			expect(response.actions[1]._type).toBe('fill_cell')
		})
	})

	describe('createMockModel', () => {
		it('creates a valid MockLanguageModelV3 instance', () => {
			const model = createMockModel()
			expect(model.specificationVersion).toBe('v3')
			expect(model.provider).toBe('mock')
			expect(model.modelId).toBe('mock-model')
		})

		it('doGenerate returns valid response with default content', async () => {
			const model = createMockModel()
			const result = await model.doGenerate({ prompt: [] })
			const textContent = result.content.find(
				(c): c is Extract<(typeof result.content)[number], { type: 'text' }> => c.type === 'text',
			)
			expect(textContent).toBeDefined()
			expect(textContent!.text).toContain('message')
			expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' })
		})

		it('creates model with emotions map content when input matches', () => {
			const model = createMockModel('Start the Emotions Map')
			expect(model.modelId).toBe('mock-model')
		})
	})
})
