// ─── FL Rounds HTTP Routes ──────────────────────────────────────────────────
//
// Thin HTTP layer that routes FL requests to the AggregationDO.
// Each map has its own DO instance (keyed by mapId).

import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'

/**
 * Get or create the AggregationDO stub for a given map.
 * Each mandala map gets its own FL round coordinator.
 */
function getAggregationDO(env: Environment, mapId: string): DurableObjectStub {
	const id = env.AGGREGATION_DO.idFromName(mapId)
	return env.AGGREGATION_DO.get(id)
}

/**
 * Forward a request to the DO and clone the response so CORS middleware
 * can modify headers (DO responses have immutable headers in workerd).
 */
async function forwardToDO(
	stub: DurableObjectStub,
	url: string,
	init?: RequestInit,
): Promise<Response> {
	const doResponse = await stub.fetch(new Request(url, init))
	return new Response(doResponse.body, {
		status: doResponse.status,
		statusText: doResponse.statusText,
		headers: new Headers(doResponse.headers),
	})
}

/** GET /fl/keys — Get the CKKS public key for encrypting submissions */
export async function getPublicKey(request: IRequest, env: Environment): Promise<Response> {
	const mapId = request.query.mapId as string
	if (!mapId) {
		return Response.json({ error: 'mapId query parameter required' }, { status: 400 })
	}

	const stub = getAggregationDO(env, mapId)
	return forwardToDO(stub, 'https://do/keys', { method: 'GET' })
}

/** POST /fl/rounds/open — Open a new FL round for a map */
export async function openRound(request: IRequest, env: Environment): Promise<Response> {
	const mapId = request.query.mapId as string
	if (!mapId) {
		return Response.json({ error: 'mapId query parameter required' }, { status: 400 })
	}

	const stub = getAggregationDO(env, mapId)
	return forwardToDO(stub, 'https://do/open', {
		method: 'POST',
		body: request.body,
		headers: { 'Content-Type': 'application/json' },
	})
}

/** POST /fl/rounds/submit — Submit encrypted weight deltas */
export async function submitDelta(request: IRequest, env: Environment): Promise<Response> {
	const mapId = request.query.mapId as string
	if (!mapId) {
		return Response.json({ error: 'mapId query parameter required' }, { status: 400 })
	}

	const stub = getAggregationDO(env, mapId)
	return forwardToDO(stub, 'https://do/submit', {
		method: 'POST',
		body: request.body,
		headers: { 'Content-Type': 'application/json' },
	})
}

/** GET /fl/rounds/status — Get current round status for a map */
export async function roundStatus(request: IRequest, env: Environment): Promise<Response> {
	const mapId = request.query.mapId as string
	if (!mapId) {
		return Response.json({ error: 'mapId query parameter required' }, { status: 400 })
	}

	const stub = getAggregationDO(env, mapId)
	return forwardToDO(stub, 'https://do/status', { method: 'GET' })
}

/** GET /fl/rounds/aggregate — Download the aggregated result */
export async function getAggregate(request: IRequest, env: Environment): Promise<Response> {
	const mapId = request.query.mapId as string
	if (!mapId) {
		return Response.json({ error: 'mapId query parameter required' }, { status: 400 })
	}

	const stub = getAggregationDO(env, mapId)
	return forwardToDO(stub, 'https://do/aggregate', { method: 'GET' })
}

/** GET /fl/rounds/metrics — Admin metrics for a map's FL rounds */
export async function roundMetrics(request: IRequest, env: Environment): Promise<Response> {
	const mapId = request.query.mapId as string
	if (!mapId) {
		return Response.json({ error: 'mapId query parameter required' }, { status: 400 })
	}

	const stub = getAggregationDO(env, mapId)
	return forwardToDO(stub, 'https://do/metrics', { method: 'GET' })
}

/** POST /fl/rounds/aggregate-now — Manual trigger for aggregation */
export async function aggregateNow(request: IRequest, env: Environment): Promise<Response> {
	const mapId = request.query.mapId as string
	if (!mapId) {
		return Response.json({ error: 'mapId query parameter required' }, { status: 400 })
	}

	const stub = getAggregationDO(env, mapId)
	return forwardToDO(stub, 'https://do/aggregate-now', { method: 'POST' })
}

/** POST /fl/rounds/aggregate — Upload the aggregated ciphertext (from aggregator) */
export async function uploadAggregate(request: IRequest, env: Environment): Promise<Response> {
	const mapId = request.query.mapId as string
	if (!mapId) {
		return Response.json({ error: 'mapId query parameter required' }, { status: 400 })
	}

	const stub = getAggregationDO(env, mapId)
	return forwardToDO(stub, 'https://do/aggregate', {
		method: 'POST',
		body: request.body,
		headers: { 'Content-Type': 'application/json' },
	})
}
