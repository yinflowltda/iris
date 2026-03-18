import type { IRequest } from 'itty-router'
import type { AuthUser } from '../lib/auth-types'

/**
 * GET /me — returns the authenticated user's profile.
 * User is already attached to request by auth middleware.
 */
export function me(request: IRequest): Response {
	const user = (request as IRequest & { user: AuthUser }).user
	return Response.json({
		sub: user.sub,
		email: user.email,
		name: user.name,
		avatar_url: user.avatar_url,
	})
}
