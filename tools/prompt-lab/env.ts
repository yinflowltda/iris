import type { ApiClientConfig } from './core/types'

export function loadEnvConfig(): {
	agent: ApiClientConfig
	judge: ApiClientConfig
	user: ApiClientConfig
} {
	const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL
	const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY
	const agentModel = process.env.PROMPT_LAB_AGENT_MODEL ?? 'claude-3-5-haiku-20241022'
	const judgeModel = process.env.PROMPT_LAB_JUDGE_MODEL ?? 'claude-3-5-haiku-20241022'
	const userModel = process.env.PROMPT_LAB_USER_MODEL ?? 'claude-3-5-haiku-20241022'

	if (!baseUrl) {
		console.error('Error: OPENAI_COMPATIBLE_BASE_URL is required.')
		console.error('Set it in your environment or .env file.')
		process.exit(1)
	}
	if (!apiKey) {
		console.error('Error: OPENAI_COMPATIBLE_API_KEY is required.')
		console.error('Set it in your environment or .env file.')
		process.exit(1)
	}

	return {
		agent: { baseUrl, apiKey, model: agentModel },
		judge: { baseUrl, apiKey, model: judgeModel },
		user: { baseUrl, apiKey, model: userModel },
	}
}
