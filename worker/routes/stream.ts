import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthUser } from '../lib/auth-types'

export async function stream(request: IRequest, env: Environment) {
	const user = (request as IRequest & { user: AuthUser }).user
	const id = env.AGENT_DURABLE_OBJECT.idFromName(user.sub)
	const DO = env.AGENT_DURABLE_OBJECT.get(id)
	const response = await DO.fetch(request.url, {
		method: 'POST',
		body: request.body as any,
	})

	return new Response(response.body as BodyInit, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
			'Transfer-Encoding': 'chunked',
		},
	})
}
