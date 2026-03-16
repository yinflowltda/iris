import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthUser } from '../lib/auth-types'

export async function voice(request: IRequest, env: Environment): Promise<Response> {
	const upgradeHeader = request.headers.get('Upgrade')
	if (upgradeHeader !== 'websocket') {
		return new Response('Expected WebSocket upgrade', { status: 426 })
	}

	const user = (request as IRequest & { user: AuthUser }).user
	const id = env.VOICE_AGENT_DO.idFromName(user.sub)
	const stub = env.VOICE_AGENT_DO.get(id)

	return stub.fetch(request.url, {
		headers: request.headers,
	})
}
