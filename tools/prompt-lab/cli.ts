#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createApiClient } from './core/api-client'
import { runLoop } from './core/loop'
import { generateReport } from './core/report'
import { listRuns, registerRun, saveRunReport } from './core/test-run'
import type { Scenario, TestRunMeta } from './core/types'
import { loadEnvConfig } from './env'
import { emotionsMapConfig } from './frameworks/emotions-map/config'

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
	iterations: number
	category: string | null
	framework: string
	listHistory: boolean
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2)
	let iterations = 5
	let category: string | null = null
	const framework = 'emotions-map'
	let listHistory = false

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--iterations' && args[i + 1]) {
			iterations = Number.parseInt(args[i + 1], 10)
			i++
		} else if (args[i] === '--category' && args[i + 1]) {
			category = args[i + 1]
			i++
		} else if (args[i] === '--history') {
			listHistory = true
		}
	}

	return { iterations, category, framework, listHistory }
}

// ============================================================================
// Scenario Loader
// ============================================================================

async function loadScenarios(frameworkDir: string, category: string | null): Promise<Scenario[]> {
	const scenariosDir = join(frameworkDir, 'scenarios')
	const scenarios: Scenario[] = []

	let categories: string[]
	if (category) {
		categories = [category]
	} else {
		try {
			categories = await readdir(scenariosDir)
		} catch {
			return []
		}
	}

	for (const cat of categories) {
		const catDir = join(scenariosDir, cat)
		try {
			const files = await readdir(catDir)
			for (const file of files) {
				if (!file.endsWith('.json')) continue
				const content = await readFile(join(catDir, file), 'utf-8')
				scenarios.push(JSON.parse(content))
			}
		} catch {
			// Category directory doesn't exist, skip
		}
	}

	return scenarios
}

// ============================================================================
// System Prompt Builder (standalone — avoids importing client-side modules)
// ============================================================================

/**
 * Build the Emotions Map system prompt by importing only worker-side code.
 * This avoids pulling in TLDraw, React, and other client-side dependencies.
 */
async function buildSystemPromptForFramework(framework: string): Promise<string> {
	// Dynamic import to avoid top-level side effects from client modules
	const { buildEmotionsMapSection } = await import(
		'../../worker/prompt/sections/emotions-map-section'
	)
	const { buildIntroPromptSection } = await import('../../worker/prompt/sections/intro-section')
	const { buildRulesPromptSection } = await import('../../worker/prompt/sections/rules-section')
	const { getSystemPromptFlags } = await import('../../worker/prompt/getSystemPromptFlags')

	const actionTypes = [
		'message',
		'think',
		'fill_cell',
		'highlight_cell',
		'zoom_to_cell',
		'create_arrow',
		'set_metadata',
		'get_metadata',
		'detect_conflict',
	]
	const partTypes = ['mode', 'messages', 'screenshot', 'chatHistory']

	const flags = getSystemPromptFlags(actionTypes as any[], partTypes as any[])

	const sections = [buildIntroPromptSection(flags), buildRulesPromptSection(flags)]

	if (framework === 'emotions-map') {
		sections.push(buildEmotionsMapSection(flags))
	}

	return sections.join('\n').replace(/\n{3,}/g, '\n\n')
}

// ============================================================================
// History Display
// ============================================================================

async function showHistory(): Promise<void> {
	const runs = await listRuns()

	if (runs.length === 0) {
		console.log('No test runs found.')
		return
	}

	console.log('\n  Test Run History')
	console.log('  ================\n')
	console.log(
		'  ' +
			'Run ID'.padEnd(24) +
			'Framework'.padEnd(16) +
			'Status'.padEnd(12) +
			'Baseline'.padEnd(10) +
			'Final'.padEnd(10) +
			'Change',
	)
	console.log(`  ${'-'.repeat(82)}`)

	for (const run of runs) {
		const baseline = run.baselineAverage != null ? `${run.baselineAverage.toFixed(1)}` : '-'
		const final = run.finalAverage != null ? `${run.finalAverage.toFixed(1)}` : '-'
		const change =
			run.improvement != null
				? `${run.improvement >= 0 ? '+' : ''}${run.improvement.toFixed(1)}`
				: '-'
		const status = run.status === 'completed' ? 'done' : run.status

		console.log(
			'  ' +
				run.runId.padEnd(24) +
				run.framework.padEnd(16) +
				status.padEnd(12) +
				baseline.padEnd(10) +
				final.padEnd(10) +
				change,
		)
	}
	console.log('')
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	const { iterations, category, framework, listHistory } = parseArgs()

	if (listHistory) {
		await showHistory()
		return
	}

	console.log(`\n  Prompt Lab - ${framework}`)
	console.log(`  Iterations: ${iterations}`)
	console.log(`  Category: ${category ?? 'all'}`)
	console.log('')

	// Load env
	const envConfig = loadEnvConfig()

	// Create API clients
	const agentClient = createApiClient(envConfig.agent)
	const userClient = createApiClient(envConfig.user)
	const judgeClient = createApiClient(envConfig.judge)
	const optimizerClient = createApiClient(envConfig.judge)

	// Load scenarios
	const frameworkDir = join(import.meta.dirname, 'frameworks', framework)
	const scenarios = await loadScenarios(frameworkDir, category)

	if (scenarios.length === 0) {
		console.error('  No scenarios found. Check the frameworks directory.')
		process.exit(1)
	}

	console.log(`  Scenarios: ${scenarios.length}`)
	console.log('')

	// Build system prompt
	const systemPrompt = await buildSystemPromptForFramework(framework)

	// Run the loop
	const report = await runLoop({
		scenarios,
		frameworkConfig: emotionsMapConfig,
		buildSystemPromptFn: () => systemPrompt,
		agentClient,
		userClient,
		judgeClient,
		optimizerClient,
		maxIterations: iterations,
		onProgress: async (iter, total, result) => {
			const status = result.accepted ? '+' : 'x'
			console.log(`  [${iter}/${total}] ${status} avg=${result.averageOverall.toFixed(1)}/10`)
		},
	})

	// Register run in index
	const meta: TestRunMeta = {
		runId: report.runId,
		framework,
		startedAt: report.startedAt,
		completedAt: report.completedAt,
		scenarioCount: scenarios.length,
		iterations,
		baselineAverage: report.baselineAverage,
		finalAverage: report.finalAverage,
		improvement: report.improvement,
		status: 'completed',
	}
	await registerRun(meta)

	// Generate and save report
	const markdown = generateReport(report)
	await saveRunReport(report.runId, report, markdown)

	// Print summary
	console.log('')
	console.log(`  Run ID:    ${report.runId}`)
	console.log(`  Baseline:  ${report.baselineAverage.toFixed(1)}/10`)
	console.log(`  Final:     ${report.finalAverage.toFixed(1)}/10`)
	console.log(`  Change:    ${report.improvement >= 0 ? '+' : ''}${report.improvement.toFixed(1)}`)
	console.log('')
	console.log(`  Results:   tools/prompt-lab/results/${report.runId}/`)
	console.log(`  Report:    tools/prompt-lab/results/${report.runId}/report.md`)
	console.log('')
}

main().catch((error) => {
	console.error('Prompt Lab error:', error)
	process.exit(1)
})
