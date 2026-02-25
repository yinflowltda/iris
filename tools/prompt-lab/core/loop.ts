import type { ApiClient } from './api-client'
import { isAutoFail, scoreConversation } from './judge'
import { analyzeScores, generatePromptChanges } from './optimizer'
import { runConversation } from './simulator'
import type { FrameworkConfig, IterationResult, LabReport, Scenario } from './types'

export interface LoopOptions {
	scenarios: Scenario[]
	frameworkConfig: FrameworkConfig
	buildSystemPromptFn: () => string
	agentClient: ApiClient
	userClient: ApiClient
	judgeClient: ApiClient
	optimizerClient: ApiClient
	maxIterations: number
	onProgress?: (iteration: number, total: number, result: IterationResult) => void
}

export async function runLoop(options: LoopOptions): Promise<LabReport> {
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

	const startedAt = new Date().toISOString()
	const iterations: IterationResult[] = []
	let baselineAverage = 0

	for (let i = 1; i <= maxIterations; i++) {
		const systemPrompt = buildSystemPromptFn()

		// Run all scenarios and score them
		const scores = await Promise.all(
			scenarios.map(async (scenario) => {
				const conversation = await runConversation({
					scenario,
					agentClient,
					userClient,
					systemPrompt,
				})
				return scoreConversation({
					conversation,
					frameworkConfig,
					judgeClient,
				})
			}),
		)

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
		startedAt,
		completedAt: new Date().toISOString(),
		framework: frameworkConfig.frameworkId,
		iterations,
		baselineAverage,
		finalAverage,
		improvement: finalAverage - baselineAverage,
	}
}
