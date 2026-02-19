import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'

export async function voice(request: IRequest, env: Environment): Promise<Response> {
	const upgradeHeader = request.headers.get('Upgrade')
	if (upgradeHeader !== 'websocket') {
		return new Response('Expected WebSocket upgrade', { status: 426 })
	}

	const id = env.VOICE_AGENT_DO.idFromName('anonymous')
	const stub = env.VOICE_AGENT_DO.get(id)

	return stub.fetch(request.url, {
		headers: request.headers,
	})
}
