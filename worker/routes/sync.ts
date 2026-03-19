import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthenticatedRequest } from '../lib/auth-types'
import { getShare } from '../lib/room-store'

export async function syncRoom(request: IRequest, env: Environment): Promise<Response> {
	if (request.headers.get('Upgrade') !== 'websocket') {
		return new Response('Expected WebSocket upgrade', { status: 426 })
	}

	const user = (request as AuthenticatedRequest).user
	const roomId = request.params?.roomId

	if (!roomId) {
		return new Response(JSON.stringify({ error: 'Room ID required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	let isReadonly = false

	if (user.sub === roomId) {
		isReadonly = false
	} else {
		const share = await getShare(env.DB, roomId, user.sub, user.email)
		if (!share) {
			return new Response(JSON.stringify({ error: 'Not authorized for this room' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' },
			})
		}
		isReadonly = share.permission === 'view'
	}

	const id = env.TLDRAW_SYNC_DO.idFromName(roomId)
	const stub = env.TLDRAW_SYNC_DO.get(id)

	const url = new URL(request.url)
	if (isReadonly) url.searchParams.set('readonly', 'true')

	return stub.fetch(
		new Request(url.toString(), {
			headers: request.headers as unknown as Headers,
			method: request.method,
		}),
	)
}
