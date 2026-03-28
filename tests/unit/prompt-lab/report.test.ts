import { describe, expect, it } from 'vitest'
import { generateReport } from '../../../tools/prompt-lab/core/report'
import type { LabReport } from '../../../tools/prompt-lab/core/types'

function makeReport(overrides: Partial<LabReport> = {}): LabReport {
	return {
		startedAt: '2026-02-25T10:00:00Z',
		completedAt: '2026-02-25T10:30:00Z',
		framework: 'emotions-map',
		baselineAverage: 6.5,
		finalAverage: 7.8,
		bestAverage: 7.8,
		improvement: 1.3,
		iterations: [
			{
				iteration: 1,
				averageOverall: 6.5,
				accepted: true,
				promptChanges: 'Added empathy guidelines',
				weakestDimensions: [
					{ name: 'socraticMethod', avgScore: 5.0 },
					{ name: 'validation', avgScore: 4.0 },
				],
				scores: [
					{
						scenarioId: 'scenario-1',
						overall: 7.0,
						dimensions: [
							{ name: 'empathy', score: 8.0, weight: 0.3, notes: 'Good' },
							{ name: 'socraticMethod', score: 5.0, weight: 0.3, notes: 'Needs work' },
							{ name: 'validation', score: 4.0, weight: 0.4, notes: 'Weak' },
						],
						strengths: ['Good empathy'],
						weaknesses: ['Lacks Socratic questioning'],
						suggestedPromptChanges: ['Add more open questions'],
					},
					{
						scenarioId: 'scenario-2',
						overall: 6.0,
						dimensions: [
							{ name: 'empathy', score: 7.0, weight: 0.3, notes: 'OK' },
							{ name: 'socraticMethod', score: 5.0, weight: 0.3, notes: 'Meh' },
							{ name: 'validation', score: 4.0, weight: 0.4, notes: 'Bad' },
						],
						strengths: ['Decent empathy'],
						weaknesses: ['Poor validation'],
						suggestedPromptChanges: ['Improve validation'],
					},
				],
			},
		],
		...overrides,
	}
}

describe('generateReport', () => {
	it('generates markdown report from lab results', () => {
		const report = makeReport()
		const md = generateReport(report)

		expect(md).toContain('# Prompt Lab Report')
		expect(md).toContain('**Framework**: emotions-map')
		expect(md).toContain('**Started**: 2026-02-25T10:00:00Z')
		expect(md).toContain('**Completed**: 2026-02-25T10:30:00Z')
		expect(md).toContain('**Iterations**: 1')

		// Summary table
		expect(md).toContain('Baseline average')
		expect(md).toContain('6.5')
		expect(md).toContain('Best average')
		expect(md).toContain('Final average')
		expect(md).toContain('7.8')
		expect(md).toContain('+1.3')

		// Iteration section
		expect(md).toContain('## Iteration 1')
		expect(md).toContain('**Average overall**: 6.5/10')
		expect(md).toContain('**Accepted**: Yes')

		// Weakest dimensions
		expect(md).toContain('### Weakest Dimensions')
		expect(md).toContain('socraticMethod')
		expect(md).toContain('validation')

		// Scores table
		expect(md).toContain('### Scores')
		expect(md).toContain('scenario-1')
		expect(md).toContain('scenario-2')

		// Prompt changes
		expect(md).toContain('### Prompt Changes')
		expect(md).toContain('Added empathy guidelines')
	})

	it('includes visual bar charts for dimensions', () => {
		const report = makeReport()
		const md = generateReport(report)

		expect(md).toContain('█')
		expect(md).toContain('░')
		// 5.0/10 → 5 filled, 5 empty
		expect(md).toContain('█████░░░░░')
		// 4.0/10 → 4 filled, 6 empty
		expect(md).toContain('████░░░░░░')
	})

	it('shows improvement correctly for positive values', () => {
		const report = makeReport({ improvement: 1.3 })
		const md = generateReport(report)

		expect(md).toContain('+1.3')
	})

	it('shows improvement correctly for negative values', () => {
		const report = makeReport({
			baselineAverage: 7.0,
			finalAverage: 5.5,
			improvement: -1.5,
		})
		const md = generateReport(report)

		expect(md).toContain('-1.5')
		expect(md).not.toContain('+-')
	})

	it('shows rolled back status when iteration regressed', () => {
		const report = makeReport({
			iterations: [
				{
					iteration: 1,
					averageOverall: 7.0,
					accepted: true,
					rolledBack: true,
					promptChanges: null,
					weakestDimensions: [],
					scores: [],
				},
			],
		})
		const md = generateReport(report)

		expect(md).toContain('rolled back')
	})

	it('shows Rejected with reason when iteration not accepted', () => {
		const report = makeReport({
			iterations: [
				{
					iteration: 1,
					averageOverall: 5.0,
					accepted: false,
					rejectionReason: 'Score decreased',
					promptChanges: null,
					weakestDimensions: [],
					scores: [],
				},
			],
		})
		const md = generateReport(report)

		expect(md).toContain('**Accepted**: No (Score decreased)')
	})
})
