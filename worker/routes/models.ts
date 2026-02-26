import { AGENT_MODEL_DEFINITIONS } from '../../shared/models'
import type { Environment } from '../environment'

export function getAvailableModels(env: Environment) {
	const hasOpenAI = !!env.OPENAI_COMPATIBLE_BASE_URL
	return Object.values(AGENT_MODEL_DEFINITIONS).filter(
		(model) => model.provider === 'workersai' || hasOpenAI,
	)
}
