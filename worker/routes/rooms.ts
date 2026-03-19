import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthenticatedRequest } from '../lib/auth-types'
import {
	createShare,
	deleteShare,
	updateSharePermission,
	getSharesForRoom,
	getSharedWithMe,
	getUserBySlug,
} from '../lib/room-store'
import { getUserBySub } from '../lib/user-store'
import { sendInviteEmail } from '../lib/email'

function jsonError(message: string, status: number): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

/** POST /rooms/:roomId/shares */
export async function createShareRoute(request: IRequest, env: Environment): Promise<Response> {
	const user = (request as AuthenticatedRequest).user
	const roomId = request.params?.roomId
	if (user.sub !== roomId) return jsonError('Not authorized', 403)

	const body = (await request.json()) as { email?: string; permission?: string }
	if (!body.email || !body.permission) return jsonError('email and permission required', 400)
	if (!['view', 'edit'].includes(body.permission)) return jsonError('permission must be view or edit', 400)
	if (body.email === user.email) return jsonError('Cannot share with yourself', 400)

	const existingUser = await env.DB.prepare('SELECT sub FROM users WHERE email = ?')
		.bind(body.email)
		.first<{ sub: string }>()

	await createShare(env.DB, {
		roomOwnerSub: roomId,
		sharedWithEmail: body.email,
		sharedWithSub: existingUser?.sub ?? null,
		permission: body.permission,
	})

	const owner = await getUserBySub(env.DB, user.sub)
	if (env.RESEND_API_KEY) {
		try {
			await sendInviteEmail(env, {
				ownerName: owner?.name ?? user.email,
				ownerEmail: user.email,
				recipientEmail: body.email,
				permission: body.permission as 'view' | 'edit',
				roomSlug: owner?.room_slug ?? '',
			})
		} catch (err) {
			console.error('Failed to send invite email:', err)
		}
	}

	return Response.json({
		room_owner_sub: roomId,
		shared_with_email: body.email,
		permission: body.permission,
	})
}

/** DELETE /rooms/:roomId/shares */
export async function deleteShareRoute(request: IRequest, env: Environment): Promise<Response> {
	const user = (request as AuthenticatedRequest).user
	const roomId = request.params?.roomId
	if (user.sub !== roomId) return jsonError('Not authorized', 403)

	const body = (await request.json()) as { email?: string }
	if (!body.email) return jsonError('email required', 400)

	await deleteShare(env.DB, roomId, body.email)
	return new Response(null, { status: 204 })
}

/** PATCH /rooms/:roomId/shares */
export async function updateShareRoute(request: IRequest, env: Environment): Promise<Response> {
	const user = (request as AuthenticatedRequest).user
	const roomId = request.params?.roomId
	if (user.sub !== roomId) return jsonError('Not authorized', 403)

	const body = (await request.json()) as { email?: string; permission?: string }
	if (!body.email || !body.permission) return jsonError('email and permission required', 400)
	if (!['view', 'edit'].includes(body.permission)) return jsonError('permission must be view or edit', 400)

	await updateSharePermission(env.DB, roomId, body.email, body.permission)
	return Response.json({
		room_owner_sub: roomId,
		shared_with_email: body.email,
		permission: body.permission,
	})
}

/** GET /rooms/:roomId/shares */
export async function listSharesRoute(request: IRequest, env: Environment): Promise<Response> {
	const user = (request as AuthenticatedRequest).user
	const roomId = request.params?.roomId
	if (user.sub !== roomId) return jsonError('Not authorized', 403)

	const shares = await getSharesForRoom(env.DB, roomId)
	return Response.json({ shares })
}

/** GET /rooms/shared-with-me */
export async function sharedWithMeRoute(request: IRequest, env: Environment): Promise<Response> {
	const user = (request as AuthenticatedRequest).user
	const rooms = await getSharedWithMe(env.DB, user.sub, user.email)
	return Response.json({ rooms })
}

/** GET /rooms/resolve/:slug */
export async function resolveSlugRoute(request: IRequest, env: Environment): Promise<Response> {
	const slug = request.params?.slug
	if (!slug) return jsonError('Slug required', 400)

	const owner = await getUserBySlug(env.DB, slug)
	if (!owner) return jsonError('Room not found', 404)

	return Response.json({ owner_sub: owner.sub, owner_name: owner.name })
}
