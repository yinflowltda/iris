import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LabReport, TestCaseResult, TestRunIndex, TestRunMeta } from './types'

const RESULTS_DIR = join(import.meta.dirname, '..', 'results')
const INDEX_FILE = join(RESULTS_DIR, 'index.json')

// ============================================================================
// Run ID generation
// ============================================================================

/**
 * Generate a unique run ID: YYYYMMDD-HHMMSS-XXXX (timestamp + random suffix).
 */
export function generateRunId(): string {
	const now = new Date()
	const date = now.toISOString().slice(0, 10).replace(/-/g, '')
	const time = now.toISOString().slice(11, 19).replace(/:/g, '')
	const suffix = Math.random().toString(36).slice(2, 6)
	return `${date}-${time}-${suffix}`
}

/**
 * Generate a test case ID: {runId}/{scenarioId}/iter-{N}
 */
export function generateTestId(runId: string, scenarioId: string, iteration: number): string {
	return `${runId}/${scenarioId}/iter-${iteration}`
}

// ============================================================================
// Results directory management
// ============================================================================

function runDir(runId: string): string {
	return join(RESULTS_DIR, runId)
}

function testCaseDir(runId: string, scenarioId: string, iteration: number): string {
	return join(runDir(runId), `iter-${iteration}`, scenarioId)
}

/**
 * Create the results directory structure for a new run.
 */
export async function initRunDir(runId: string): Promise<string> {
	const dir = runDir(runId)
	await mkdir(dir, { recursive: true })
	return dir
}

// ============================================================================
// Test case persistence
// ============================================================================

/**
 * Save a single test case result (conversation + score + optional screenshot).
 */
export async function saveTestCase(result: TestCaseResult): Promise<void> {
	const dir = testCaseDir(result.runId, result.scenarioId, result.iteration)
	await mkdir(dir, { recursive: true })

	// Save conversation
	await writeFile(join(dir, 'conversation.json'), JSON.stringify(result.conversation, null, '\t'))

	// Save score
	await writeFile(join(dir, 'score.json'), JSON.stringify(result.score, null, '\t'))

	// Save a human-readable conversation log
	const log = result.conversation.turns
		.map((t) => {
			const prefix = t.role === 'user' ? 'USER' : 'AGENT'
			let text = `${prefix}: ${t.content}`
			if (t.actions && t.actions.length > 0) {
				const nonMsg = t.actions.filter((a) => a._type !== 'message')
				if (nonMsg.length > 0) {
					text += `\n  [ACTIONS: ${nonMsg.map((a) => a._type).join(', ')}]`
				}
			}
			return text
		})
		.join('\n\n')
	await writeFile(join(dir, 'conversation.txt'), log)
}

/**
 * Save a screenshot PNG for a test case.
 */
export async function saveScreenshot(
	runId: string,
	scenarioId: string,
	iteration: number,
	screenshot: Buffer | Uint8Array,
): Promise<string> {
	const dir = testCaseDir(runId, scenarioId, iteration)
	await mkdir(dir, { recursive: true })
	const path = join(dir, 'mandala-screenshot.png')
	await writeFile(path, screenshot)
	return path
}

// ============================================================================
// Run-level persistence
// ============================================================================

/**
 * Save the full lab report for a run.
 */
export async function saveRunReport(
	runId: string,
	report: LabReport,
	reportMarkdown: string,
): Promise<void> {
	const dir = runDir(runId)
	await mkdir(dir, { recursive: true })
	await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, '\t'))
	await writeFile(join(dir, 'report.md'), reportMarkdown)
}

// ============================================================================
// Index management
// ============================================================================

/**
 * Load the test run index, creating it if it doesn't exist.
 */
export async function loadIndex(): Promise<TestRunIndex> {
	try {
		const content = await readFile(INDEX_FILE, 'utf-8')
		return JSON.parse(content)
	} catch {
		return { runs: [] }
	}
}

/**
 * Save the test run index.
 */
export async function saveIndex(index: TestRunIndex): Promise<void> {
	await mkdir(RESULTS_DIR, { recursive: true })
	await writeFile(INDEX_FILE, JSON.stringify(index, null, '\t'))
}

/**
 * Register a new run in the index.
 */
export async function registerRun(meta: TestRunMeta): Promise<void> {
	const index = await loadIndex()
	// Replace if exists, otherwise append
	const existing = index.runs.findIndex((r) => r.runId === meta.runId)
	if (existing >= 0) {
		index.runs[existing] = meta
	} else {
		index.runs.push(meta)
	}
	await saveIndex(index)
}

/**
 * Update a run's status and final metrics in the index.
 */
export async function completeRun(runId: string, report: LabReport): Promise<void> {
	const index = await loadIndex()
	const run = index.runs.find((r) => r.runId === runId)
	if (run) {
		run.completedAt = report.completedAt
		run.baselineAverage = report.baselineAverage
		run.finalAverage = report.finalAverage
		run.improvement = report.improvement
		run.status = 'completed'
		await saveIndex(index)
	}
}

/**
 * List all runs, most recent first.
 */
export async function listRuns(): Promise<TestRunMeta[]> {
	const index = await loadIndex()
	return index.runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
