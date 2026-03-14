import { WorkerEntrypoint } from 'cloudflare:workers'
import type { ExecutionContext } from '@cloudflare/workers-types'
import { AutoRouter, cors, error, type IRequest } from 'itty-router'
import type { Environment } from './environment'
import { getAvailableModels } from './routes/models'
import {
	openRound,
	submitDelta,
	roundStatus,
	roundMetrics,
	getAggregate,
	uploadAggregate,
} from './routes/fl-rounds'
import { stream } from './routes/stream'
import { voice } from './routes/voice'

const { preflight, corsify } = cors({ origin: '*' })

const router = AutoRouter<IRequest, [env: Environment, ctx: ExecutionContext]>({
	before: [preflight],
	finally: [corsify],
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	.post('/stream', stream)
	.get('/voice', voice)
	.get('/models', (_req: IRequest, env: Environment) => {
		return Response.json(getAvailableModels(env))
	})
	.post('/fl/rounds/open', openRound)
	.post('/fl/rounds/submit', submitDelta)
	.get('/fl/rounds/status', roundStatus)
	.get('/fl/rounds/metrics', roundMetrics)
	.get('/fl/rounds/aggregate', getAggregate)
	.post('/fl/rounds/aggregate', uploadAggregate)

export default class extends WorkerEntrypoint<Environment> {
	override fetch(request: Request): Promise<Response> {
		return router.fetch(request, this.env, this.ctx)
	}
}

export { AgentDurableObject } from './do/AgentDurableObject'
export { AggregationDO } from './do/AggregationDO'
export { VoiceAgentDurableObject } from './do/VoiceAgentDurableObject'
