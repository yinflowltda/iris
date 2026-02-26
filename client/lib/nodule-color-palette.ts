import type { TLDefaultColorTheme } from 'tldraw'

export type NoduleColorStyle = 'black' | 'blue' | 'grey'

export const NODULE_COLOR_SEQUENCE: readonly {
	style: NoduleColorStyle
	hex: string
	labelColor: 'white' | 'black'
}[] = [
	{ style: 'black', hex: '#002432', labelColor: 'white' },
	{ style: 'blue', hex: '#114459', labelColor: 'white' },
	{ style: 'grey', hex: '#598391', labelColor: 'white' },
] as const

function applyPaletteToTheme(theme: TLDefaultColorTheme) {
	for (const entry of NODULE_COLOR_SEQUENCE) {
		theme[entry.style].noteFill = entry.hex
		theme[entry.style].noteText = entry.labelColor === 'white' ? '#FFFFFF' : '#000000'
	}
}

export function applyNodulePaletteToThemes(
	lightTheme: TLDefaultColorTheme,
	darkTheme: TLDefaultColorTheme,
) {
	applyPaletteToTheme(lightTheme)
	applyPaletteToTheme(darkTheme)
}
