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

export interface OptimizeResult {
	/** Human-readable description of what changed */
	changes: string
	/** The full modified system prompt to use in the next iteration */
	modifiedPrompt: string
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

export async function generateModifiedPrompt(options: OptimizeOptions): Promise<OptimizeResult> {
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
		'Your task is to improve a system prompt based on performance analysis.',
		`The system is built for the "${frameworkConfig.frameworkId}" framework.`,
		'',
		'You must output your response in EXACTLY this format:',
		'',
		'## Changes',
		'<Brief description of what you changed and why — 3-5 bullet points>',
		'',
		'## Modified Prompt',
		'```',
		'<The complete modified system prompt>',
		'```',
		'',
		'Rules:',
		'- Make targeted modifications to fix the weakest dimensions.',
		'- Do NOT remove or weaken content that scores well — protect high-scoring dimensions.',
		'- The modified prompt must be complete and self-contained.',
		'- Keep the overall structure and length similar. Do not bloat the prompt.',
		'- Focus on the 2-3 weakest dimensions. Do not try to fix everything at once.',
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
		'Output the modified prompt now.',
	].join('\n')

	const result = await optimizerClient.generate({
		systemPrompt,
		messages: [{ role: 'user', content: userMessage }],
		temperature: 0.7,
		maxTokens: 16384,
	})

	return parseOptimizerResponse(result.text, currentPrompt)
}

function parseOptimizerResponse(text: string, fallbackPrompt: string): OptimizeResult {
	// Extract the changes section
	const changesMatch = text.match(/## Changes\s*([\s\S]*?)(?=## Modified Prompt)/i)
	const changes = changesMatch ? changesMatch[1].trim() : text.split('```')[0].trim()

	// Extract the modified prompt from the code block after "## Modified Prompt"
	const promptSectionMatch = text.match(/## Modified Prompt\s*```[\w]*\n([\s\S]*?)```/i)
	if (promptSectionMatch) {
		return { changes, modifiedPrompt: promptSectionMatch[1].trim() }
	}

	// Fallback: try to find any large code block (the prompt is likely the longest one)
	const codeBlocks = [...text.matchAll(/```(?:\w*)\n([\s\S]*?)```/g)]
	if (codeBlocks.length > 0) {
		const longest = codeBlocks.reduce((a, b) => (a[1].length > b[1].length ? a : b))
		return { changes, modifiedPrompt: longest[1].trim() }
	}

	// Last resort: return original prompt unchanged
	return {
		changes: 'Failed to parse optimizer output — keeping current prompt.',
		modifiedPrompt: fallbackPrompt,
	}
}
