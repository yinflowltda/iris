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
 * Returns a value in [1, baseFontSize].
 * If text overflows even at 1px, returns 1 (overflow: hidden is the
 * cosmetic safety net, but this should never happen within char limits).
 */
export function fitFontToBox({ baseFontSize, maxHeight, measure }: FitFontOptions): number {
	// Quick check: does it fit at full size?
	const full = measure(baseFontSize)
	if (full.h <= maxHeight) return baseFontSize

	let lo = 1
	let hi = baseFontSize - 1
	let best = 1

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
