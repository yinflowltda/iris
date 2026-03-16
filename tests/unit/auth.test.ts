import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as jose from 'jose'

// We'll test the pure functions from auth.ts
// Need to generate real RS256 keys for testing

let privateKey: CryptoKey
let publicKey: CryptoKey

beforeEach(async () => {
	const keyPair = await jose.generateKeyPair('RS256')
	privateKey = keyPair.privateKey
	publicKey = keyPair.publicKey
})

async function signTestJwt(
	payload: Record<string, unknown>,
	key: CryptoKey,
	options?: { kid?: string },
): Promise<string> {
	return new jose.SignJWT(payload as jose.JWTPayload)
		.setProtectedHeader({ alg: 'RS256', kid: options?.kid ?? 'test-kid' })
		.setIssuedAt()
		.setExpirationTime('1h')
		.sign(key)
}

describe('verifyAccessJwt', () => {
	it('returns payload for a valid JWT', async () => {
		const { verifyAccessJwt } = await import('../../worker/lib/auth')
		const token = await signTestJwt(
			{ sub: 'user-123', email: 'test@example.com', aud: 'test-aud', iss: 'https://test.cloudflareaccess.com' },
			privateKey,
		)

		const jwks = jose.createLocalJWKSet({
			keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' }],
		})

		const payload = await verifyAccessJwt(token, {
			audience: 'test-aud',
			issuer: 'https://test.cloudflareaccess.com',
			jwks,
		})

		expect(payload.sub).toBe('user-123')
		expect(payload.email).toBe('test@example.com')
	})

	it('throws for expired JWT', async () => {
		const { verifyAccessJwt } = await import('../../worker/lib/auth')
		const token = await new jose.SignJWT({ sub: 'user-123', email: 'test@example.com' })
			.setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
			.setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
			.setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
			.setAudience('test-aud')
			.setIssuer('https://test.cloudflareaccess.com')
			.sign(privateKey)

		const jwks = jose.createLocalJWKSet({
			keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' }],
		})

		await expect(
			verifyAccessJwt(token, { audience: 'test-aud', issuer: 'https://test.cloudflareaccess.com', jwks }),
		).rejects.toThrow()
	})

	it('throws for wrong audience', async () => {
		const { verifyAccessJwt } = await import('../../worker/lib/auth')
		const token = await signTestJwt(
			{ sub: 'user-123', email: 'test@example.com', aud: 'wrong-aud', iss: 'https://test.cloudflareaccess.com' },
			privateKey,
		)

		const jwks = jose.createLocalJWKSet({
			keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' }],
		})

		await expect(
			verifyAccessJwt(token, { audience: 'test-aud', issuer: 'https://test.cloudflareaccess.com', jwks }),
		).rejects.toThrow()
	})
})

describe('buildDevUser', () => {
	it('builds user from X-Dev-User header', async () => {
		const { buildDevUser } = await import('../../worker/lib/auth')
		const user = buildDevUser('test-user-42')

		expect(user.sub).toBe('test-user-42')
		expect(user.email).toBe('test-user-42@dev.local')
		expect(user.isDev).toBe(true)
	})

	it('defaults to dev-user-1 when header is empty', async () => {
		const { buildDevUser } = await import('../../worker/lib/auth')
		const user = buildDevUser(null)

		expect(user.sub).toBe('dev-user-1')
		expect(user.email).toBe('dev-user-1@dev.local')
	})
})

describe('extractJwt', () => {
	it('extracts from Cf-Access-Jwt-Assertion header', async () => {
		const { extractJwt } = await import('../../worker/lib/auth')
		const headers = new Headers({ 'Cf-Access-Jwt-Assertion': 'token-abc' })
		expect(extractJwt(headers)).toBe('token-abc')
	})

	it('falls back to CF_Authorization cookie', async () => {
		const { extractJwt } = await import('../../worker/lib/auth')
		const headers = new Headers({ Cookie: 'CF_Authorization=token-from-cookie; other=value' })
		expect(extractJwt(headers)).toBe('token-from-cookie')
	})

	it('returns null when neither present', async () => {
		const { extractJwt } = await import('../../worker/lib/auth')
		const headers = new Headers()
		expect(extractJwt(headers)).toBeNull()
	})
})
