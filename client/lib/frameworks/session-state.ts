import type { MandalaState } from '../../../shared/types/MandalaTypes'
import type { SessionStatePart } from '../../../shared/schema/PromptPartDefinitions'

/**
 * Step sequence for the emotions-map framework.
 * Each step maps to the cell(s) that should be filled during that step.
 * Steps with no cells are framing/wrap-up steps.
 */
const EMOTIONS_MAP_STEP_SEQUENCE: { step: number; cells: string[] }[] = [
	{ step: 0, cells: [] }, // framing, no cell yet
	{ step: 1, cells: ['past-events'] },
	{ step: 2, cells: ['past-thoughts-emotions'] }, // covers 2 + 2b
	{ step: 3, cells: ['present-behaviors'] },
	{ step: 4, cells: ['present-beliefs'] },
	{ step: 5, cells: ['evidence'] },
	{ step: 6, cells: ['future-beliefs'] }, // covers 6 + 6b
	{ step: 8, cells: ['future-events'] },
	{ step: 9, cells: [] }, // wrap-up
]

/** All cell IDs that participate in the guided sequence */
const GUIDED_CELL_IDS = EMOTIONS_MAP_STEP_SEQUENCE.flatMap((s) => s.cells)

/**
 * Infer the current session state from MandalaState for the emotions-map framework.
 *
 * Step inference: walk the step sequence — current step = first step whose target cell is NOT filled.
 * If all 7 cells are filled → step 9. If no cells filled → step 0.
 *
 * Free mode detection: if 3+ cells are filled AND they skip a step in the sequence
 * (e.g., past-events + present-beliefs filled but past-thoughts-emotions empty), set mode = 'free'.
 */
export function inferSessionState(state: MandalaState): SessionStatePart {
	const filledCells: string[] = []
	const activeCells: string[] = []

	for (const [cellId, cellState] of Object.entries(state)) {
		if (cellState.status === 'filled') filledCells.push(cellId)
		if (cellState.status === 'active') activeCells.push(cellId)
	}

	const filledSet = new Set(filledCells)

	// Find current step: first step whose target cell is NOT filled
	let currentStep = 9 // default: all done
	for (const entry of EMOTIONS_MAP_STEP_SEQUENCE) {
		if (entry.cells.length === 0) continue // skip framing/wrap-up for step detection
		const allCellsFilled = entry.cells.every((c) => filledSet.has(c))
		if (!allCellsFilled) {
			currentStep = entry.step
			break
		}
	}

	// If no cells filled at all, we're at step 0
	if (filledCells.length === 0) {
		currentStep = 0
	}

	// Free mode detection: 3+ guided cells filled AND they skip a step
	const mode = detectMode(filledSet)

	return {
		type: 'sessionState',
		currentStep,
		filledCells,
		activeCells,
		mode,
		frameworkId: 'emotions-map',
	}
}

function detectMode(filledSet: Set<string>): 'guided' | 'free' {
	const filledGuidedCells = GUIDED_CELL_IDS.filter((c) => filledSet.has(c))
	if (filledGuidedCells.length < 3) return 'guided'

	// Check for non-contiguous fills: is there a gap in the sequence?
	let foundFirstFilled = false
	let foundGapAfterFill = false
	for (const entry of EMOTIONS_MAP_STEP_SEQUENCE) {
		if (entry.cells.length === 0) continue
		const isFilled = entry.cells.every((c) => filledSet.has(c))
		if (isFilled) {
			if (foundGapAfterFill) return 'free' // gap detected
			foundFirstFilled = true
		} else if (foundFirstFilled) {
			foundGapAfterFill = true
		}
	}

	return 'guided'
}
