import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthenticatedRequest } from '../lib/auth-types'

/**
 * GET /sync/:roomId — WebSocket upgrade for tldraw-sync.
 *
 * Auth: JWT validated by auth middleware (from CF_Authorization cookie).
 * Authorization: user.sub must match roomId (owner-only).
 * Forward: passes the raw request to TldrawSyncDO.fetch() which handles
 *          the WebSocket upgrade internally.
 */
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

	// Owner check: Phase 1 — single room per user
	if (user.sub !== roomId) {
		return new Response(JSON.stringify({ error: 'Not authorized for this room' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	const id = env.TLDRAW_SYNC_DO.idFromName(roomId)
	const stub = env.TLDRAW_SYNC_DO.get(id)

	// Build a clean Request — itty-router's IRequest is not a valid RequestInit
	return stub.fetch(new Request(request.url, {
		headers: request.headers as unknown as Headers,
		method: request.method,
	}))
}
