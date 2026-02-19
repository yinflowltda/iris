import { WorkerEntrypoint } from 'cloudflare:workers'
import type { ExecutionContext } from '@cloudflare/workers-types'
import { AutoRouter, cors, error, type IRequest } from 'itty-router'
import type { Environment } from './environment'
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

export default class extends WorkerEntrypoint<Environment> {
	override fetch(request: Request): Promise<Response> {
		return router.fetch(request, this.env, this.ctx)
	}
}

export { AgentDurableObject } from './do/AgentDurableObject'
export { VoiceAgentDurableObject } from './do/VoiceAgentDurableObject'
