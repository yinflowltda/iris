import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthUser } from '../lib/auth-types'
import { getUserBySub } from '../lib/user-store'

/**
 * GET /me — returns the authenticated user's profile.
 * User is already attached to request by auth middleware.
 */
export async function me(request: IRequest, env: Environment): Promise<Response> {
	const user = (request as IRequest & { user: AuthUser }).user
	const dbUser = await getUserBySub(env.DB, user.sub)
	return Response.json({
		sub: user.sub,
		email: user.email,
		name: user.name,
		avatar_url: user.avatar_url,
		room_slug: dbUser?.room_slug ?? null,
	})
}
