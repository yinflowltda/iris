import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'

/**
 * POST /sync/assets/:assetId — Upload an asset to R2.
 * Auth required (handled by middleware).
 */
export async function uploadAsset(request: IRequest, env: Environment): Promise<Response> {
	const assetId = request.params?.assetId
	if (!assetId) {
		return new Response(JSON.stringify({ error: 'Asset ID required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	const body = await request.arrayBuffer()
	if (!body || body.byteLength === 0) {
		return new Response(JSON.stringify({ error: 'Empty body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	const contentType = request.headers.get('Content-Type') || 'application/octet-stream'

	await env.TLDRAW_BUCKET.put(assetId, body, {
		httpMetadata: { contentType },
	})

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

/**
 * GET /sync/assets/:assetId — Download an asset from R2.
 * Auth required (handled by middleware).
 */
export async function downloadAsset(request: IRequest, env: Environment): Promise<Response> {
	const assetId = request.params?.assetId
	if (!assetId) {
		return new Response(JSON.stringify({ error: 'Asset ID required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	const object = await env.TLDRAW_BUCKET.get(assetId)
	if (!object) {
		return new Response(JSON.stringify({ error: 'Asset not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	return new Response(object.body, {
		headers: {
			'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	})
}
