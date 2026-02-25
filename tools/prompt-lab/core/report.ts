import type { ConversationScore, IterationResult, LabReport } from './types'

const BAR_LENGTH = 10

function bar(score: number): string {
	const filled = Math.round(score)
	const empty = BAR_LENGTH - filled
	return '█'.repeat(filled) + '░'.repeat(empty)
}

function num(n: number): string {
	return n.toFixed(1)
}

function sign(n: number): string {
	return n >= 0 ? `+${num(n)}` : num(n)
}

function formatAccepted(iter: IterationResult): string {
	if (iter.accepted) return 'Yes'
	const reason = iter.rejectionReason ? ` (${iter.rejectionReason})` : ''
	return `No${reason}`
}

function formatWeakestDimensions(dims: { name: string; avgScore: number }[]): string {
	if (dims.length === 0) return ''
	const lines = dims.map((d) => {
		const padded = d.name.padEnd(22)
		return `  ${padded} ${bar(d.avgScore)} ${num(d.avgScore)}/10`
	})
	return `### Weakest Dimensions\n${lines.join('\n')}\n`
}

function formatScoresTable(scores: ConversationScore[]): string {
	if (scores.length === 0) return ''
	const header = '| Scenario | Overall | Strengths | Weaknesses |'
	const sep = '|---|---|---|---|'
	const rows = scores.map((s) => {
		const strengths = s.strengths.join(', ')
		const weaknesses = s.weaknesses.join(', ')
		return `| ${s.scenarioId} | ${num(s.overall)}/10 | ${strengths} | ${weaknesses} |`
	})
	return `### Scores\n${header}\n${sep}\n${rows.join('\n')}\n`
}

function formatPromptChanges(changes: string | null): string {
	if (!changes) return ''
	return `### Prompt Changes\n\`\`\`\n${changes}\n\`\`\`\n`
}

function formatIteration(iter: IterationResult): string {
	const parts: string[] = [
		`## Iteration ${iter.iteration}`,
		'',
		`**Average overall**: ${num(iter.averageOverall)}/10`,
		`**Accepted**: ${formatAccepted(iter)}`,
		'',
	]

	const weakest = formatWeakestDimensions(iter.weakestDimensions)
	if (weakest) parts.push(weakest)

	const scores = formatScoresTable(iter.scores)
	if (scores) parts.push(scores)

	const changes = formatPromptChanges(iter.promptChanges)
	if (changes) parts.push(changes)

	return parts.join('\n')
}

export function generateReport(report: LabReport): string {
	const parts: string[] = [
		'# Prompt Lab Report',
		'',
		`**Framework**: ${report.framework}`,
		`**Started**: ${report.startedAt}`,
		`**Completed**: ${report.completedAt}`,
		`**Iterations**: ${report.iterations.length}`,
		'',
		'## Summary',
		'',
		'| Metric | Value |',
		'|---|---|',
		`| Baseline average | ${num(report.baselineAverage)}/10 |`,
		`| Final average | ${num(report.finalAverage)}/10 |`,
		`| Improvement | ${sign(report.improvement)} |`,
		'',
	]

	for (const iter of report.iterations) {
		parts.push(formatIteration(iter))
	}

	return parts.join('\n')
}
