type MeasureResult = { w: number; h: number }

interface FitFontOptions {
	baseFontSize: number
	maxHeight: number
	measure: (fontSize: number) => MeasureResult
}

/**
 * Binary-search for the largest integer font size (px) where
 * measured text height <= maxHeight.
 *
 * Returns a value in [MIN_FONT_SIZE, baseFontSize].
 * If text overflows even at minimum, returns MIN_FONT_SIZE (overflow: hidden
 * is the cosmetic safety net, but this should never happen within char limits).
 */
const MIN_FONT_SIZE = 3

export function fitFontToBox({ baseFontSize, maxHeight, measure }: FitFontOptions): number {
	// Quick check: does it fit at full size?
	const full = measure(baseFontSize)
	if (full.h <= maxHeight) return baseFontSize

	let lo = MIN_FONT_SIZE
	let hi = baseFontSize - 1
	let best = MIN_FONT_SIZE

	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2)
		const result = measure(mid)
		if (result.h <= maxHeight) {
			best = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}

	return best
}
