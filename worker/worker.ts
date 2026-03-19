import { WorkerEntrypoint } from 'cloudflare:workers'
import type { ExecutionContext } from '@cloudflare/workers-types'
import { AutoRouter, cors, error, type IRequest } from 'itty-router'
import type { Environment } from './environment'
import { authMiddleware } from './lib/auth-middleware'
import {
	aggregateNow,
	getAggregate,
	getPublicKey,
	openRound,
	roundMetrics,
	roundStatus,
	submitDelta,
	uploadAggregate,
} from './routes/fl-rounds'
import { me } from './routes/me'
import { syncRoom } from './routes/sync'
import {
	createShareRoute,
	deleteShareRoute,
	updateShareRoute,
	listSharesRoute,
	sharedWithMeRoute,
	resolveSlugRoute,
} from './routes/rooms'
import { uploadAsset, downloadAsset } from './routes/sync-assets'
import { getAvailableModels } from './routes/models'
import { stream } from './routes/stream'
import { voice } from './routes/voice'

const { preflight, corsify } = cors({
	origin: (origin) => {
		if (!origin) return undefined
		try {
			const { hostname } = new URL(origin)
			if (hostname === 'localhost' || hostname === '127.0.0.1') return origin
		} catch {}
		if (origin === 'https://iris.yinflow.life') return origin
		return undefined
	},
	credentials: true,
})

const router = AutoRouter<IRequest, [env: Environment, ctx: ExecutionContext]>({
	before: [preflight, authMiddleware],
	finally: [corsify],
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	.get('/me', me)
	.post('/stream', stream)
	.get('/voice', voice)
	.get('/models', (_req: IRequest, env: Environment) => {
		return Response.json(getAvailableModels(env))
	})
	.get('/fl/keys', getPublicKey)
	.post('/fl/rounds/open', openRound)
	.post('/fl/rounds/submit', submitDelta)
	.get('/fl/rounds/status', roundStatus)
	.get('/fl/rounds/metrics', roundMetrics)
	.get('/fl/rounds/aggregate', getAggregate)
	.post('/fl/rounds/aggregate', uploadAggregate)
	.post('/sync/assets/:assetId', uploadAsset)
	.get('/sync/assets/:assetId', downloadAsset)
	.get('/rooms/shared-with-me', sharedWithMeRoute)
	.get('/rooms/resolve/:slug', resolveSlugRoute)
	.get('/rooms/:roomId/shares', listSharesRoute)
	.post('/rooms/:roomId/shares', createShareRoute)
	.delete('/rooms/:roomId/shares', deleteShareRoute)
	.patch('/rooms/:roomId/shares', updateShareRoute)
	.get('/sync/:roomId', syncRoom)
	.post('/fl/rounds/aggregate-now', aggregateNow)

export default class extends WorkerEntrypoint<Environment> {
	override fetch(request: Request): Promise<Response> {
		return router.fetch(request, this.env, this.ctx)
	}
}

export { AgentDurableObject } from './do/AgentDurableObject'
export { AggregationDO } from './do/AggregationDO'
export { TldrawSyncDO } from './do/TldrawSyncDO'
export { VoiceAgentDurableObject } from './do/VoiceAgentDurableObject'
