// Scenario types
export type ScenarioCategory = 'therapeutic-journey' | 'edge-case' | 'safety' | 'creative'
export type ScenarioDifficulty = 'easy' | 'medium' | 'hard'

export interface Scenario {
	id: string
	name: string
	framework: string
	category: ScenarioCategory
	difficulty: ScenarioDifficulty
	persona: {
		description: string
		language: 'en' | 'pt'
		emotionalState: number
		traits: string[]
	}
	openingMessages: string[]
	userGoals: string[]
	expectedBehaviors: string[]
	antiPatterns: string[]
	maxTurns?: number
}

// Conversation types
export interface ConversationTurn {
	role: 'user' | 'assistant'
	content: string
	actions?: Record<string, unknown>[]
	latencyMs?: number
}

export interface ConversationResult {
	scenarioId: string
	turns: ConversationTurn[]
	totalDurationMs: number
}

// Scoring types
export interface ScoreDimension {
	name: string
	score: number
	weight: number
	notes: string
}

export interface LatencyMetrics {
	timeToFirstTokenMs: number
	totalStreamDurationMs: number
	tokensPerSecond: number
}

export interface ConversationScore {
	scenarioId: string
	dimensions: ScoreDimension[]
	overall: number
	strengths: string[]
	weaknesses: string[]
	suggestedPromptChanges: string[]
	latency?: LatencyMetrics
}

// Framework config
export interface RubricDimension {
	name: string
	description: string
	weight: number
}

export interface FrameworkConfig {
	frameworkId: string
	promptSectionPath: string
	rubric: RubricDimension[]
	safetyDimensions: string[]
	userSimPrompt: string
}

// Iteration types
export interface IterationResult {
	iteration: number
	scores: ConversationScore[]
	averageOverall: number
	weakestDimensions: { name: string; avgScore: number }[]
	promptChanges: string | null
	accepted: boolean
	rejectionReason?: string
	/** Whether this iteration's prompt was rolled back to the best-known prompt */
	rolledBack?: boolean
}

export interface LabReport {
	startedAt: string
	completedAt: string
	framework: string
	iterations: IterationResult[]
	baselineAverage: number
	finalAverage: number
	bestAverage: number
	improvement: number
}

// API client config
export interface ApiClientConfig {
	baseUrl: string
	apiKey: string
	model: string
}

// ============================================================================
// Test Run ID & Results Organization
// ============================================================================

export interface TestRunMeta {
	runId: string
	framework: string
	startedAt: string
	completedAt?: string
	scenarioCount: number
	iterations: number
	baselineAverage?: number
	finalAverage?: number
	improvement?: number
	status: 'running' | 'completed' | 'failed'
}

export interface TestCaseResult {
	testId: string
	runId: string
	scenarioId: string
	iteration: number
	conversation: ConversationResult
	score: ConversationScore
	screenshotPath?: string
}

export interface TestRunIndex {
	runs: TestRunMeta[]
}
