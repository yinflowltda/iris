import type { ApiClient } from './api-client'
import type { ConversationScore, FrameworkConfig } from './types'

export interface ScoreAnalysis {
	averageOverall: number
	weakestDimensions: { name: string; avgScore: number }[]
	allSuggestions: string[]
}

export interface OptimizeOptions {
	scores: ConversationScore[]
	currentPrompt: string
	optimizerClient: ApiClient
	frameworkConfig: FrameworkConfig
}

export function analyzeScores(scores: ConversationScore[]): ScoreAnalysis {
	// Average overall across all scores
	const averageOverall = scores.reduce((sum, s) => sum + s.overall, 0) / scores.length

	// Per-dimension averages
	const dimTotals = new Map<string, { sum: number; count: number }>()
	for (const score of scores) {
		for (const dim of score.dimensions) {
			const entry = dimTotals.get(dim.name) ?? { sum: 0, count: 0 }
			entry.sum += dim.score
			entry.count++
			dimTotals.set(dim.name, entry)
		}
	}

	const weakestDimensions = [...dimTotals.entries()]
		.map(([name, { sum, count }]) => ({ name, avgScore: sum / count }))
		.sort((a, b) => a.avgScore - b.avgScore)

	// Collect all suggestions, deduped
	const suggestionSet = new Set<string>()
	for (const score of scores) {
		for (const suggestion of score.suggestedPromptChanges) {
			suggestionSet.add(suggestion)
		}
	}

	return {
		averageOverall,
		weakestDimensions,
		allSuggestions: [...suggestionSet],
	}
}

export async function generatePromptChanges(options: OptimizeOptions): Promise<string> {
	const { scores, currentPrompt, optimizerClient, frameworkConfig } = options
	const analysis = analyzeScores(scores)

	// Collect detailed weakness notes from low-scoring dimensions (<=6)
	const weaknessNotes: string[] = []
	for (const score of scores) {
		for (const dim of score.dimensions) {
			if (dim.score <= 6 && dim.notes) {
				weaknessNotes.push(`[${dim.name}] (score: ${dim.score}) ${dim.notes}`)
			}
		}
	}

	const systemPrompt = [
		'You are an expert prompt engineer specializing in therapeutic AI systems.',
		'Your task is to analyze the performance of a system prompt and suggest specific improvements.',
		`The system is built for the "${frameworkConfig.frameworkId}" framework.`,
		'Focus on actionable, specific changes to the prompt text.',
		'Do not rewrite the entire prompt — suggest targeted modifications.',
	].join('\n')

	const dimSummary = analysis.weakestDimensions
		.map((d) => `- ${d.name}: ${d.avgScore.toFixed(1)}`)
		.join('\n')

	const userMessage = [
		'## Current System Prompt',
		'```',
		currentPrompt,
		'```',
		'',
		`## Performance Analysis (average overall: ${analysis.averageOverall.toFixed(1)})`,
		'',
		'### Dimension Scores (weakest first)',
		dimSummary,
		'',
		...(weaknessNotes.length > 0
			? ['### Detailed Weakness Notes', ...weaknessNotes.map((n) => `- ${n}`), '']
			: []),
		...(analysis.allSuggestions.length > 0
			? ['### Judge Suggestions', ...analysis.allSuggestions.map((s) => `- ${s}`), '']
			: []),
		'Please propose specific prompt changes to improve the weakest dimensions.',
	].join('\n')

	const result = await optimizerClient.generate({
		systemPrompt,
		messages: [{ role: 'user', content: userMessage }],
		temperature: 0.7,
	})

	return result.text
}
