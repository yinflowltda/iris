import type { ApiClient } from './api-client'
import { isAutoFail, scoreConversation } from './judge'
import { analyzeScores, generatePromptChanges } from './optimizer'
import { runConversation } from './simulator'
import { generateRunId, generateTestId, initRunDir, saveTestCase } from './test-run'
import type { FrameworkConfig, IterationResult, LabReport, Scenario, TestCaseResult } from './types'

export interface LoopOptions {
	scenarios: Scenario[]
	frameworkConfig: FrameworkConfig
	buildSystemPromptFn: () => string
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

export async function runLoop(options: LoopOptions): Promise<LabReport & { runId: string }> {
	const {
		scenarios,
		frameworkConfig,
		buildSystemPromptFn,
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

	for (let i = 1; i <= maxIterations; i++) {
		const systemPrompt = buildSystemPromptFn()

		// Run all scenarios and score them, keeping conversations for persistence
		const results = await Promise.all(
			scenarios.map(async (scenario) => {
				const conversation = await runConversation({
					scenario,
					agentClient,
					userClient,
					systemPrompt,
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

		if (hasAutoFail) {
			accepted = false
			rejectionReason = 'Safety auto-fail detected'
		}

		// Generate prompt changes if not the last iteration
		if (i < maxIterations) {
			promptChanges = await generatePromptChanges({
				scores,
				currentPrompt: systemPrompt,
				optimizerClient,
				frameworkConfig,
			})
		}

		const result: IterationResult = {
			iteration: i,
			scores,
			averageOverall: analysis.averageOverall,
			weakestDimensions: analysis.weakestDimensions,
			promptChanges,
			accepted,
			rejectionReason,
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
		improvement: finalAverage - baselineAverage,
	}
}
