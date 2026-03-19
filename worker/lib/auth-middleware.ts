import type { IRequest } from 'itty-router'
import { createRemoteJWKSet } from 'jose'
import type { Environment } from '../environment'
import { buildDevUser, extractJwt, verifyAccessJwt } from './auth'
import type { AuthUser } from './auth-types'
import { upsertUser } from './user-store'
import { ensureRoomSlug, backfillSub } from './room-store'

/**
 * Public routes that don't require authentication.
 * Format: "METHOD /path" — method matters (GET /fl/rounds/aggregate is public, POST is not).
 */
// Lazy singleton for JWKS — avoids creating a new cache per request
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let _jwksTeamDomain: string | null = null

function getJwks(teamDomain: string) {
	if (!_jwks || _jwksTeamDomain !== teamDomain) {
		_jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
		_jwksTeamDomain = teamDomain
	}
	return _jwks
}

const PUBLIC_ROUTES: Set<string> = new Set([
	'GET /fl/keys',
	'GET /fl/rounds/status',
	'GET /fl/rounds/aggregate',
	'GET /fl/rounds/metrics',
])

/**
 * Check if a route is public (no auth required).
 */
export function isPublicRoute(method: string, pathname: string): boolean {
	// Strip query params for matching
	const path = pathname.split('?')[0]
	return PUBLIC_ROUTES.has(`${method.toUpperCase()} ${path}`)
}

/**
 * itty-router middleware that authenticates requests.
 * - Public routes pass through
 * - Dev mode builds a mock user
 * - Production validates JWT and upserts user in D1
 *
 * On success, attaches `user: AuthUser` to the request object.
 * On failure, returns a 401 or 403 Response.
 */
export async function authMiddleware(
	request: IRequest,
	env: Environment,
): Promise<Response | void> {
	const url = new URL(request.url)

	// 1. Public routes skip auth
	if (isPublicRoute(request.method, url.pathname)) {
		return // continue to handler
	}

	// 2. Dev bypass
	if (env.DEV_MODE === 'true') {
		const devUserHeader = request.headers.get('X-Dev-User')
		const user = buildDevUser(devUserHeader)
		;(request as IRequest & { user: AuthUser }).user = user
		// Dev users also need slug + backfill
		await upsertUser(env.DB, user)
		await ensureRoomSlug(env.DB, user.sub)
		return // continue to handler
	}

	// 3. Extract JWT
	const token = extractJwt(request.headers)
	if (!token) {
		return new Response(JSON.stringify({ error: 'Authentication required' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	// 4. Verify JWT
	if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
		console.error('TEAM_DOMAIN or POLICY_AUD not configured')
		return new Response(JSON.stringify({ error: 'Server auth misconfigured' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	try {
		// Lazy singleton — reuses JWKS cache across requests
		const jwks = getJwks(env.TEAM_DOMAIN)

		const payload = await verifyAccessJwt(token, {
			audience: env.POLICY_AUD,
			issuer: env.TEAM_DOMAIN,
			jwks,
		})

		// 5. Upsert user in D1
		const user: AuthUser = {
			sub: payload.sub,
			email: payload.email,
			name: ((payload as Record<string, unknown>).name as string | null) ?? null,
			avatar_url: ((payload as Record<string, unknown>).picture as string | null) ?? null,
			isDev: false,
		}

		const { isNew } = await upsertUser(env.DB, user)

		// Generate room slug if needed (first login)
		await ensureRoomSlug(env.DB, user.sub)

		// Backfill shared_with_sub for any pending shares (only on first login)
		if (isNew) {
			await backfillSub(env.DB, user.sub, user.email)
		}

		// 6. Attach user to request
		;(request as IRequest & { user: AuthUser }).user = user
	} catch (err) {
		console.error('JWT verification failed:', err)
		return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' },
		})
	}
}
