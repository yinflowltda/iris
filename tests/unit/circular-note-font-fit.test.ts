import { describe, expect, it } from 'vitest'
import { fitFontToBox } from '../../client/lib/circular-note-font-fit'

describe('fitFontToBox', () => {
	it('returns base font size when text fits at full size', () => {
		const measure = (fontSize: number) => ({ w: 100, h: 50 })
		const result = fitFontToBox({ baseFontSize: 18, maxHeight: 125, measure })
		expect(result).toBe(18)
	})

	it('shrinks font when text overflows at base size', () => {
		// Simulate: at 18px -> h=198, at 12px -> h=132, at 11px -> h=121
		const measure = (fontSize: number) => ({ w: 100, h: fontSize * 11 })
		const result = fitFontToBox({ baseFontSize: 18, maxHeight: 125, measure })
		expect(result).toBeLessThanOrEqual(11) // 11 * 11 = 121 <= 125
		expect(result).toBeGreaterThanOrEqual(1)
	})

	it('returns 1 when text cannot fit even at minimum', () => {
		const measure = (fontSize: number) => ({ w: 100, h: 9999 })
		const result = fitFontToBox({ baseFontSize: 18, maxHeight: 125, measure })
		expect(result).toBe(1)
	})

	it('uses binary search - calls measure O(log n) times', () => {
		let calls = 0
		const measure = (fontSize: number) => {
			calls++
			return { w: 100, h: fontSize > 10 ? 200 : 80 }
		}
		fitFontToBox({ baseFontSize: 18, maxHeight: 125, measure })
		expect(calls).toBeLessThanOrEqual(6) // log2(18) ~ 4.2, plus verification
	})
})
