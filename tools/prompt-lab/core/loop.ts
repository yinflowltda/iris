import type { ApiClient } from './api-client'
import { isAutoFail, scoreConversation } from './judge'
import { analyzeScores, generateModifiedPrompt } from './optimizer'
import { runConversation } from './simulator'
import { generateRunId, generateTestId, initRunDir, saveTestCase } from './test-run'
import type { FrameworkConfig, IterationResult, LabReport, Scenario, TestCaseResult } from './types'

export interface LoopOptions {
	scenarios: Scenario[]
	frameworkConfig: FrameworkConfig
	/** The initial system prompt to optimize */
	initialPrompt: string
	agentClient: ApiClient
	userClient: ApiClient
	judgeClient: ApiClient
	optimizerClient: ApiClient
	maxIterations: number
	/** Optional run ID (auto-generated if not provided) */
	runId?: string
	/** Whether to persist test cases to disk (default: true) */
	persistResults?: boolean
	onProgress?: (iteration: number, total: number, result: IterationResult) => void
}

export async function runLoop(options: LoopOptions): Promise<LabReport & { runId: string; bestPrompt: string }> {
	const {
		scenarios,
		frameworkConfig,
		initialPrompt,
		agentClient,
		userClient,
		judgeClient,
		optimizerClient,
		maxIterations,
		onProgress,
	} = options

	const runId = options.runId ?? generateRunId()
	const persist = options.persistResults !== false

	if (persist) {
		await initRunDir(runId)
	}

	const startedAt = new Date().toISOString()
	const iterations: IterationResult[] = []
	let baselineAverage = 0

	// Mutable prompt state
	let currentPrompt = initialPrompt
	let bestPrompt = initialPrompt
	let bestAverage = -1

	for (let i = 1; i <= maxIterations; i++) {
		// Run all scenarios with the current prompt and score them
		const results = await Promise.all(
			scenarios.map(async (scenario) => {
				const conversation = await runConversation({
					scenario,
					agentClient,
					userClient,
					systemPrompt: currentPrompt,
				})
				const score = await scoreConversation({
					conversation,
					frameworkConfig,
					judgeClient,
				})
				return { conversation, score }
			}),
		)

		const scores = results.map((r) => r.score)

		// Persist each test case
		if (persist) {
			await Promise.all(
				results.map(async ({ conversation, score }) => {
					const testCase: TestCaseResult = {
						testId: generateTestId(runId, score.scenarioId, i),
						runId,
						scenarioId: score.scenarioId,
						iteration: i,
						conversation,
						score,
					}
					await saveTestCase(testCase)
				}),
			)
		}

		const analysis = analyzeScores(scores)

		if (i === 1) {
			baselineAverage = analysis.averageOverall
		}

		// Check for safety auto-fails
		const hasAutoFail = scores.some((score) => isAutoFail(score, frameworkConfig))

		let promptChanges: string | null = null
		let accepted = true
		let rejectionReason: string | undefined
		let rolledBack = false

		if (hasAutoFail) {
			accepted = false
			rejectionReason = 'Safety auto-fail detected'
		}

		// Track best prompt (only from accepted iterations)
		if (accepted && analysis.averageOverall > bestAverage) {
			bestAverage = analysis.averageOverall
			bestPrompt = currentPrompt
		} else if (i > 1) {
			// Score regressed or safety failure — rollback to best prompt
			rolledBack = true
			currentPrompt = bestPrompt
		}

		// Generate modified prompt for next iteration (skip on last iteration)
		if (i < maxIterations) {
			const optimizeResult = await generateModifiedPrompt({
				scores,
				currentPrompt,
				optimizerClient,
				frameworkConfig,
			})
			promptChanges = optimizeResult.changes
			// Apply the modified prompt for the next iteration
			currentPrompt = optimizeResult.modifiedPrompt
		}

		const result: IterationResult = {
			iteration: i,
			scores,
			averageOverall: analysis.averageOverall,
			weakestDimensions: analysis.weakestDimensions,
			promptChanges,
			accepted,
			rejectionReason,
			rolledBack,
		}

		iterations.push(result)
		onProgress?.(i, maxIterations, result)
	}

	const finalAverage = iterations[iterations.length - 1].averageOverall

	return {
		runId,
		startedAt,
		completedAt: new Date().toISOString(),
		framework: frameworkConfig.frameworkId,
		iterations,
		baselineAverage,
		finalAverage,
		bestAverage,
		improvement: bestAverage - baselineAverage,
		bestPrompt,
	}
}
