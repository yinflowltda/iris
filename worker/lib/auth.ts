import { type JWTPayload, type JWTVerifyGetKey, jwtVerify } from 'jose'
import type { AuthUser } from './auth-types'

export interface VerifyOptions {
	audience: string
	issuer: string
	jwks: JWTVerifyGetKey
}

/**
 * Verify a Cloudflare Access RS256 JWT and return the payload.
 * Throws on invalid/expired/wrong-audience tokens.
 */
export async function verifyAccessJwt(
	token: string,
	options: VerifyOptions,
): Promise<JWTPayload & { sub: string; email: string }> {
	const { payload } = await jwtVerify(token, options.jwks, {
		issuer: options.issuer,
		audience: options.audience,
	})

	if (!payload.sub || !payload.email) {
		throw new Error('JWT missing required claims: sub, email')
	}

	return payload as JWTPayload & { sub: string; email: string }
}

/**
 * Extract JWT from Cf-Access-Jwt-Assertion header or CF_Authorization cookie.
 * Returns null if neither is present.
 */
export function extractJwt(headers: Headers): string | null {
	// Prefer header (set by Cloudflare Access on all proxied requests)
	const headerToken = headers.get('Cf-Access-Jwt-Assertion')
	if (headerToken) return headerToken

	// Fallback to cookie (needed for WebSocket upgrades)
	const cookie = headers.get('Cookie')
	if (cookie) {
		const match = cookie.match(/CF_Authorization=([^;]+)/)
		if (match) return match[1]
	}

	return null
}

/**
 * Build a mock user for dev mode.
 * Uses X-Dev-User header value or defaults to 'dev-user-1'.
 */
export function buildDevUser(devUserHeader: string | null): AuthUser {
	const sub = devUserHeader || 'dev-user-1'
	return {
		sub,
		email: `${sub}@dev.local`,
		name: sub,
		avatar_url: null,
		isDev: true,
	}
}
